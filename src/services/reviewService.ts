import { createProject, updateProject, type Project, type ProjectFormInput } from "../domain/project";
import { buildReviewRequest } from "../domain/prompt";
import {
  ARCHIVE_CANDIDATES,
  archivedResultFileName,
  createReviewSession,
  currentRound,
  type ReviewFormInput,
  type ReviewSession,
} from "../domain/review";
import { err, ok, type FieldErrors, type Result } from "../domain/result";
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
import { resultFileName, reviewTarget, type StorageBackend } from "./storage";

/**
 * Use cases combining pure domain rules with persistence. The in-memory state is only
 * replaced by the caller after these functions resolve, i.e. after the write succeeded.
 * Storage failures are thrown (`StorageError`); validation failures are returned.
 */

export interface SaveOutcome {
  session: ReviewSession;
  warning: string | null;
}

function projectsLocked(health: FileHealth): FieldErrors | null {
  if (isWritable(health)) return null;
  return { _form: `projects.json cannot be modified: ${describeHealthProblem(health) ?? health.status}` };
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
  if (!existing) return err({ _form: `Unknown project: ${projectId}` });
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
): Promise<Result<SaveOutcome & { text: string }>> {
  const guard = guardAction(session, "recordRequestSaved");
  if (guard !== null) return err(guard);
  const text = buildReviewRequest(project, session);
  await ensureSessionUnchanged(backend, session.reviewSessionId);
  await writeRoundArtifact(backend, session.reviewSessionId, "request", session.reviewRound, text);
  const saved = await performReviewAction(backend, session, { type: "recordRequestSaved" }, now);
  return saved.ok ? ok({ ...saved.value, text }) : saved;
}

function withTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

/**
 * Chooses where the result about to be replaced is kept (E-2). Candidate names are tried in order;
 * an unrecorded candidate that already holds exactly `previousText` is reused (an earlier attempt
 * archived it but did not finish), an unrecorded candidate holding other text is recorded as well
 * (it is the result an earlier interrupted capture replaced), and the first free name is used.
 */
async function planArchive(
  backend: StorageBackend,
  session: ReviewSession,
  previousText: string,
  capturedAt: string,
): Promise<Result<{ recover: string[]; archivedAs: string; exists: boolean }>> {
  const round = currentRound(session);
  const recover: string[] = [];
  for (let attempt = 0; attempt < ARCHIVE_CANDIDATES; attempt += 1) {
    const name = archivedResultFileName(round.round, capturedAt, attempt);
    if (round.archivedResults.includes(name)) continue;
    const existing = await backend.read(reviewTarget(session.reviewSessionId, name));
    if (existing === null) return ok({ recover, archivedAs: name, exists: false });
    if (existing === previousText) return ok({ recover, archivedAs: name, exists: true });
    recover.push(name);
  }
  return err(`R${round.round} has no free archive name left for the previous result`);
}

/**
 * Saves the Human-pasted result as `result-r<N>.md` (AC-13), the canonical latest result of the
 * round. Does not change the Review State; a verdict needs a separate Human confirmation (AC-14).
 *
 * F-6: an existing result is never silently lost. Replacing a recorded result requires
 * `replaceConfirmed` (explicit Human confirmation); the previous text is first written to
 * `result-r<N>-previous-<ms>[-<n>].md` (write-if-absent, see `planArchive`), then the new result
 * replaces the old one only if it is still exactly the text that was archived, then the session
 * records the archives. Every step can be retried after an interruption (E-2).
 */
export async function captureReviewResult(
  backend: StorageBackend,
  session: ReviewSession,
  resultText: string,
  reviewedHead: string | null,
  replaceConfirmed: boolean,
  now: string,
): Promise<Result<SaveOutcome & { archivedAs: string | null }>> {
  const guard = guardAction(session, "captureResult");
  if (guard !== null) return err(guard);
  if (resultText.trim() === "") return err("Paste the review result before saving");
  if (resultText.length > TEXT_MAX * 10) return err("Review result is too long");

  const round = currentRound(session);
  const target = reviewTarget(session.reviewSessionId, resultFileName(round.round));
  const previousText = await backend.read(target);
  // Confirmation and HEAD are checked before any read of archive candidates or any write.
  const unconfirmed: ReviewAction = {
    type: "captureResult",
    reviewedHead,
    ...(replaceConfirmed ? { replaceConfirmedByHuman: true as const } : {}),
  };
  const precheck = applyReviewAction(session, unconfirmed, now);
  if (!precheck.ok) return precheck;

  let plan: { recover: string[]; archivedAs: string; exists: boolean } | null = null;
  if (previousText !== null) {
    const planned = await planArchive(backend, session, previousText, round.resultCapturedAt ?? now);
    if (!planned.ok) return planned;
    plan = planned.value;
  }
  const action: ReviewAction = {
    ...unconfirmed,
    archivedResultFiles: plan === null ? [] : [...plan.recover, plan.archivedAs],
  };
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
    withTrailingNewline(resultText),
    previousText === null ? { kind: "absent" } : { kind: "matches", content: previousText },
  );
  const saved = await performReviewAction(backend, session, action, now);
  const archivedAs = plan === null ? null : plan.archivedAs;
  return saved.ok ? ok({ ...saved.value, archivedAs }) : saved;
}
