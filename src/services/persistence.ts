import type { ReviewEvent } from "../domain/events";
import type { Project } from "../domain/project";
import { latestCapturedRound, type ReviewSession } from "../domain/review";
import {
  parseEventsFile,
  parseProjectsFile,
  parseSessionFile,
  serializeEvent,
  serializeProjectsFile,
  serializeSession,
  type ParseResult,
} from "../domain/schema";
import {
  PROJECTS_TARGET,
  StorageError,
  requestFileName,
  resultFileName,
  reviewTarget,
  toStorageError,
  type StorageBackend,
  type StorageTarget,
} from "./storage";

/**
 * Health of one persisted JSON file after loading.
 * - ok / missing / restored_from_backup: writable
 * - unreadable / unsupported_version: read-only until a Human acts (writes are refused)
 */
export type FileHealth =
  | { status: "ok" }
  | { status: "missing" }
  | { status: "restored_from_backup"; quarantinedAs: string }
  | { status: "unreadable"; reason: string }
  | { status: "unsupported_version"; version: number };

export function isWritable(health: FileHealth): boolean {
  return health.status === "ok" || health.status === "missing" || health.status === "restored_from_backup";
}

export function describeHealthProblem(health: FileHealth): string | null {
  switch (health.status) {
    case "unreadable":
      return health.reason;
    case "unsupported_version":
      return `written by a newer DVCC version (schemaVersion ${health.version}); opened read-only`;
    default:
      return null;
  }
}

export interface LoadedReview {
  reviewId: string;
  session: ReviewSession | null;
  health: FileHealth;
}

export interface LoadedData {
  projects: Project[];
  projectsHealth: FileHealth;
  reviews: LoadedReview[];
}

async function readPrimary(backend: StorageBackend, target: StorageTarget): Promise<{ text: string | null; readError: StorageError | null }> {
  try {
    return { text: await backend.read(target), readError: null };
  } catch (error) {
    return { text: null, readError: toStorageError(error) };
  }
}

/**
 * Recovery contract (Task Packet §4 / AC-17):
 * valid primary → use; invalid primary + valid backup → set primary aside, restore backup,
 * warn; invalid primary without valid backup → unreadable (no writes); newer schema →
 * unsupported (read-only). Nothing is deleted.
 */
async function loadJsonWithRecovery<T>(
  backend: StorageBackend,
  target: StorageTarget,
  parse: (text: string) => ParseResult<T>,
): Promise<{ value: T | null; health: FileHealth }> {
  const { text, readError } = await readPrimary(backend, target);
  let reason: string;
  if (readError !== null) {
    if (readError.code !== "INVALID_UTF8") {
      // I/O problem: the file may be fine, so never quarantine or restore here.
      return { value: null, health: { status: "unreadable", reason: `${readError.message} (${readError.code})` } };
    }
    reason = readError.message;
  } else if (text === null) {
    return { value: null, health: { status: "missing" } };
  } else {
    const parsed = parse(text);
    if (parsed.status === "ok") return { value: parsed.value, health: { status: "ok" } };
    if (parsed.status === "unsupported_version") {
      return { value: null, health: { status: "unsupported_version", version: parsed.version } };
    }
    reason = parsed.reason;
  }

  let backupText: string | null = null;
  try {
    backupText = await backend.read(target, { backup: true });
  } catch {
    backupText = null;
  }
  const backup = backupText === null ? null : parse(backupText);
  if (backupText === null || backup === null || backup.status !== "ok") {
    return { value: null, health: { status: "unreadable", reason } };
  }

  try {
    const quarantinedAs = await backend.quarantine(target);
    await backend.write(target, backupText);
    return { value: backup.value, health: { status: "restored_from_backup", quarantinedAs } };
  } catch (error) {
    const storageError = toStorageError(error);
    return {
      value: null,
      health: { status: "unreadable", reason: `${reason}; backup restore failed: ${storageError.message}` },
    };
  }
}

export async function loadAll(backend: StorageBackend): Promise<LoadedData> {
  const projects = await loadJsonWithRecovery(backend, PROJECTS_TARGET, parseProjectsFile);
  const reviewIds = await backend.listReviews();
  const reviews: LoadedReview[] = [];
  for (const reviewId of reviewIds) {
    const loaded = await loadJsonWithRecovery(backend, reviewTarget(reviewId, "session.json"), (text) =>
      parseSessionFile(text, reviewId),
    );
    const health: FileHealth =
      loaded.health.status === "missing" ? { status: "unreadable", reason: "session.json is missing" } : loaded.health;
    reviews.push({ reviewId, session: loaded.value, health });
  }
  return { projects: projects.value ?? [], projectsHealth: projects.health, reviews };
}

export interface ReviewArtifacts {
  checkpoint: string | null;
  latestResult: { round: number; text: string | null } | null;
  events: ReviewEvent[];
  skippedEventLines: number;
  errors: string[];
}

async function readOptional(backend: StorageBackend, target: StorageTarget, errors: string[]): Promise<string | null> {
  try {
    return await backend.read(target);
  } catch (error) {
    const storageError = toStorageError(error);
    errors.push(`${target.kind === "review" ? target.file : "projects.json"}: ${storageError.message}`);
    return null;
  }
}

export async function loadReviewArtifacts(backend: StorageBackend, session: ReviewSession): Promise<ReviewArtifacts> {
  const errors: string[] = [];
  const id = session.reviewSessionId;
  const checkpoint = await readOptional(backend, reviewTarget(id, "checkpoint.md"), errors);
  const captured = latestCapturedRound(session);
  const latestResult =
    captured === null
      ? null
      : { round: captured.round, text: await readOptional(backend, reviewTarget(id, resultFileName(captured.round)), errors) };
  const eventsText = await readOptional(backend, reviewTarget(id, "events.jsonl"), errors);
  const { events, skippedLines } = eventsText === null ? { events: [], skippedLines: 0 } : parseEventsFile(eventsText);
  return { checkpoint, latestResult, events, skippedEventLines: skippedLines, errors };
}

export async function writeProjects(backend: StorageBackend, projects: readonly Project[]): Promise<void> {
  await backend.write(PROJECTS_TARGET, serializeProjectsFile(projects));
}

/**
 * Writes `session.json` (authoritative current state) and then appends the event. An event
 * append failure does not undo the state change; it is returned as a warning.
 */
export async function writeSessionAndEvent(
  backend: StorageBackend,
  session: ReviewSession,
  event: ReviewEvent,
): Promise<string | null> {
  const id = session.reviewSessionId;
  await backend.write(reviewTarget(id, "session.json"), serializeSession(session));
  try {
    await backend.appendLine(reviewTarget(id, "events.jsonl"), serializeEvent(event));
    return null;
  } catch (error) {
    return `State saved, but the event history could not be appended: ${toStorageError(error).message}`;
  }
}

export async function writeCheckpoint(backend: StorageBackend, reviewId: string, text: string): Promise<void> {
  await backend.write(reviewTarget(reviewId, "checkpoint.md"), text.endsWith("\n") ? text : `${text}\n`);
}

export async function writeRoundArtifact(
  backend: StorageBackend,
  reviewId: string,
  kind: "request" | "result",
  round: number,
  text: string,
): Promise<void> {
  const file = kind === "request" ? requestFileName(round) : resultFileName(round);
  await backend.write(reviewTarget(reviewId, file), text.endsWith("\n") ? text : `${text}\n`);
}

/** Human action for an unreadable `projects.json`: rename it aside (never deleted). */
export async function setAsideProjectsFile(backend: StorageBackend): Promise<string> {
  return backend.quarantine(PROJECTS_TARGET);
}
