import { createProject, updateProject, type Project, type ProjectFormInput } from "../domain/project";
import { buildResolutionFollowup, buildReviewRequest } from "../domain/prompt";
import { DEFAULT_LOCALE, type Locale } from "../i18n/locale";
import {
  ARCHIVE_CANDIDATES,
  archivedResponseFileName,
  createReviewSession,
  currentRound,
  type ResponseKind,
  type ReviewFormInput,
  type ReviewSession,
  type RoundRecord,
} from "../domain/review";
import { message, type Message } from "../domain/message";
import { err, invalid, ok, type FieldErrors, type Result } from "../domain/result";
import { applyReviewAction, guardAction, type ReviewAction } from "../domain/transitions";
import { TEXT_MAX } from "../domain/project";
import {
  describeHealthProblem,
  isWritable,
  writeCheckpoint,
  writeProjects,
  writeRoundArtifact,
  writeSessionAndEvent,
  type FileHealth,
} from "./persistence";
import { judgmentFileName, resultFileName, reviewTarget, type StorageBackend } from "./storage";

/**
 * Use cases combining pure domain rules with persistence. The in-memory state is only
 * replaced by the caller after these functions resolve, i.e. after the write succeeded.
 * Storage failures are thrown (`StorageError`); validation failures are returned.
 */

export interface SaveOutcome {
  session: ReviewSession;
  warning: Message | null;
}

function projectsLocked(health: FileHealth): FieldErrors | null {
  if (isWritable(health)) return null;
  const problem = describeHealthProblem(health);
  return { _form: message("service.projectsNotModifiable", { problem: problem ? problem.key : health.status }) };
}

export async function saveNewProject(
  backend: StorageBackend,
  projects: readonly Project[],
  health: FileHealth,
  input: ProjectFormInput,
  now: string,
): Promise<Result<Project[], FieldErrors>> {
  const locked = projectsLocked(health);
  if (locked) return err(locked);
  const created = createProject(input, new Set(projects.map((p) => p.projectId)), now);
  if (!created.ok) return created;
  const next = [...projects, created.value];
  await writeProjects(backend, next);
  return ok(next);
}

export async function saveEditedProject(
  backend: StorageBackend,
  projects: readonly Project[],
  health: FileHealth,
  projectId: string,
  input: ProjectFormInput,
  now: string,
): Promise<Result<Project[], FieldErrors>> {
  const locked = projectsLocked(health);
  if (locked) return err(locked);
  const existing = projects.find((p) => p.projectId === projectId);
  if (!existing) return err({ _form: message("service.unknownProject", { id: projectId }) });
  const updated = updateProject(existing, input, now);
  if (!updated.ok) return updated;
  const next = projects.map((p) => (p.projectId === projectId ? updated.value : p));
  await writeProjects(backend, next);
  return ok(next);
}

export async function saveNewReview(
  backend: StorageBackend,
  projects: readonly Project[],
  input: ReviewFormInput,
  reviewId: string,
  now: string,
): Promise<Result<SaveOutcome, FieldErrors>> {
  const created = createReviewSession(input, new Set(projects.map((p) => p.projectId)), reviewId, now);
  if (!created.ok) return created;
  const warning = await writeSessionAndEvent(backend, created.value.session, created.value.event, { create: true });
  return ok({ session: created.value.session, warning });
}

/**
 * Saves that write another file before `session.json` first make sure `session.json` still holds
 * what DVCC loaded, so a conflict is found before anything is replaced (E-3).
 */
async function ensureSessionUnchanged(backend: StorageBackend, reviewId: string): Promise<void> {
  await backend.assertUnchanged?.(reviewTarget(reviewId, "session.json"));
}

/**
 * Applies a transition and persists it. For `suspend`, `checkpoint.md` is written before the
 * state change so a SUSPENDED session always has its checkpoint (AC-09).
 */
export async function performReviewAction(
  backend: StorageBackend,
  session: ReviewSession,
  action: ReviewAction,
  now: string,
): Promise<Result<SaveOutcome>> {
  const applied = applyReviewAction(session, action, now);
  if (!applied.ok) return applied;
  if (action.type === "suspend") {
    await ensureSessionUnchanged(backend, session.reviewSessionId);
    await writeCheckpoint(backend, session.reviewSessionId, action.checkpoint.trim());
  }
  const warning = await writeSessionAndEvent(backend, applied.value.session, applied.value.event);
  return ok({ session: applied.value.session, warning });
}

/** Generates the request, saves `request-r<N>.md`, records it, and returns the text to copy (AC-12). */
export async function saveReviewRequest(
  backend: StorageBackend,
  project: Project,
  session: ReviewSession,
  now: string,
  /** The request is written in the language the Human is working in; saved requests never change. */
  locale: Locale = DEFAULT_LOCALE,
): Promise<Result<SaveOutcome & { text: string }>> {
  const guard = guardAction(session, "recordRequestSaved");
  if (guard !== null) return err(guard);
  const text = buildReviewRequest(project, session, locale);
  await ensureSessionUnchanged(backend, session.reviewSessionId);
  await writeRoundArtifact(backend, session.reviewSessionId, "request", session.reviewRound, text);
  const saved = await performReviewAction(backend, session, { type: "recordRequestSaved" }, now);
  return saved.ok ? ok({ ...saved.value, text }) : saved;
}

/**
 * Generates Turn 2, saves `followup-r<N>.md`, records it, and returns the text to copy.
 *
 * The protocol invariant is not restated here: `applyReviewAction` is asked first, so a follow-up
 * is never written for a round whose Fresh Assessment has not come back, whose Final Judgment is
 * already in, or whose verdict the Human has confirmed (Waves 2.5 / 2.6).
 */
export async function saveFollowupRequest(
  backend: StorageBackend,
  project: Project,
  session: ReviewSession,
  now: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<Result<SaveOutcome & { text: string }>> {
  const action: ReviewAction = { type: "recordFollowupSaved" };
  const precheck = applyReviewAction(session, action, now);
  if (!precheck.ok) return precheck;
  const text = buildResolutionFollowup(project, session, locale);
  await ensureSessionUnchanged(backend, session.reviewSessionId);
  await writeRoundArtifact(backend, session.reviewSessionId, "followup", session.reviewRound, text);
  const saved = await performReviewAction(backend, session, action, now);
  return saved.ok ? ok({ ...saved.value, text }) : saved;
}

function withTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

/**
 * What differs between the two reviewer responses. Everything else about capturing them — the
 * confirmation, the archive plan, the order of the writes — is the same, so it is written once.
 */
const RESPONSE_SHAPE = {
  result: {
    guard: "captureResult",
    file: resultFileName,
    empty: "service.resultRequired",
    tooLong: "service.resultTooLong",
    archivedOf: (round: RoundRecord) => round.archivedResults,
    capturedAtOf: (round: RoundRecord) => round.resultCapturedAt,
  },
  judgment: {
    guard: "captureJudgment",
    file: judgmentFileName,
    empty: "service.judgmentRequired",
    tooLong: "service.judgmentTooLong",
    archivedOf: (round: RoundRecord) => round.archivedJudgments,
    capturedAtOf: (round: RoundRecord) => round.judgmentCapturedAt,
  },
} as const satisfies Record<ResponseKind, unknown>;

/**
 * Chooses where the response about to be replaced is kept (E-2). Candidate names are tried in
 * order; an unrecorded candidate that already holds exactly `previousText` is reused (an earlier
 * attempt archived it but did not finish), an unrecorded candidate holding other text is recorded
 * as well (it is the response an earlier interrupted capture replaced), and the first free name is
 * used.
 */
async function planArchive(
  backend: StorageBackend,
  session: ReviewSession,
  kind: ResponseKind,
  previousText: string,
  capturedAt: string,
): Promise<Result<{ recover: string[]; archivedAs: string; exists: boolean }>> {
  const round = currentRound(session);
  const recover: string[] = [];
  for (let attempt = 0; attempt < ARCHIVE_CANDIDATES; attempt += 1) {
    const name = archivedResponseFileName(kind, round.round, capturedAt, attempt);
    if (RESPONSE_SHAPE[kind].archivedOf(round).includes(name)) continue;
    const existing = await backend.read(reviewTarget(session.reviewSessionId, name));
    if (existing === null) return ok({ recover, archivedAs: name, exists: false });
    if (existing === previousText) return ok({ recover, archivedAs: name, exists: true });
    recover.push(name);
  }
  return invalid("service.noArchiveName", { round: round.round });
}

/**
 * Saves a Human-pasted reviewer response as `<kind>-r<N>.md`, the canonical latest response of that
 * kind for the round. Does not change the Review State; a verdict needs a separate Human
 * confirmation (AC-14).
 *
 * F-6: an existing response is never silently lost. Replacing a recorded one requires an explicit
 * Human confirmation; the previous text is first written to `<kind>-r<N>-previous-<ms>[-<n>].md`
 * (write-if-absent, see `planArchive`), then the new response replaces the old one only if it is
 * still exactly the text that was archived, then the session records the archives. Every step can
 * be retried after an interruption (E-2).
 *
 * `buildAction` is asked twice: once with no archive names, to check the confirmation (and, for the
 * Fresh Assessment, the reviewed HEAD) before anything is read or written, and once with the plan.
 */
async function captureResponse(
  backend: StorageBackend,
  session: ReviewSession,
  kind: ResponseKind,
  text: string,
  buildAction: (archives: readonly string[]) => ReviewAction,
  now: string,
): Promise<Result<SaveOutcome & { archivedAs: string | null }>> {
  const shape = RESPONSE_SHAPE[kind];
  const guard = guardAction(session, shape.guard);
  if (guard !== null) return err(guard);
  if (text.trim() === "") return invalid(shape.empty);
  if (text.length > TEXT_MAX * 10) return invalid(shape.tooLong);

  const round = currentRound(session);
  const target = reviewTarget(session.reviewSessionId, shape.file(round.round));
  const previousText = await backend.read(target);
  const precheck = applyReviewAction(session, buildAction([]), now);
  if (!precheck.ok) return precheck;

  let plan: { recover: string[]; archivedAs: string; exists: boolean } | null = null;
  if (previousText !== null) {
    const planned = await planArchive(backend, session, kind, previousText, shape.capturedAtOf(round) ?? now);
    if (!planned.ok) return planned;
    plan = planned.value;
  }
  const action: ReviewAction = buildAction(plan === null ? [] : [...plan.recover, plan.archivedAs]);
  // Validate the archive names before any write.
  const preview = applyReviewAction(session, action, now);
  if (!preview.ok) return preview;

  await ensureSessionUnchanged(backend, session.reviewSessionId);
  if (previousText !== null && plan !== null) {
    if (plan.exists) {
      // Reused archive: it must still hold the replaced text when the result is replaced.
      await backend.write(reviewTarget(session.reviewSessionId, plan.archivedAs), previousText, {
        kind: "matches",
        content: previousText,
      });
    } else {
      await backend.write(reviewTarget(session.reviewSessionId, plan.archivedAs), previousText, { kind: "absent" });
    }
  }
  await backend.write(
    target,
    withTrailingNewline(text),
    previousText === null ? { kind: "absent" } : { kind: "matches", content: previousText },
  );
  const saved = await performReviewAction(backend, session, action, now);
  const archivedAs = plan === null ? null : plan.archivedAs;
  return saved.ok ? ok({ ...saved.value, archivedAs }) : saved;
}

/** The Fresh Assessment (Turn 1's answer), saved as `result-r<N>.md` (AC-13). */
export function captureReviewResult(
  backend: StorageBackend,
  session: ReviewSession,
  resultText: string,
  reviewedHead: string | null,
  replaceConfirmed: boolean,
  now: string,
): Promise<Result<SaveOutcome & { archivedAs: string | null }>> {
  return captureResponse(backend, session, "result", resultText, (archivedResultFiles) => ({
    type: "captureResult",
    reviewedHead,
    ...(replaceConfirmed ? { replaceConfirmedByHuman: true as const } : {}),
    archivedResultFiles,
  }), now);
}

/**
 * The Final Judgment (Turn 2's answer), saved as `judgment-r<N>.md`. It is kept beside the Fresh
 * Assessment, never over it: both responses of a round survive, which is what the two-turn protocol
 * is for.
 */
export function captureFinalJudgment(
  backend: StorageBackend,
  session: ReviewSession,
  judgmentText: string,
  replaceConfirmed: boolean,
  now: string,
): Promise<Result<SaveOutcome & { archivedAs: string | null }>> {
  return captureResponse(backend, session, "judgment", judgmentText, (archivedJudgmentFiles) => ({
    type: "captureJudgment",
    ...(replaceConfirmed ? { replaceConfirmedByHuman: true as const } : {}),
    archivedJudgmentFiles,
  }), now);
}
