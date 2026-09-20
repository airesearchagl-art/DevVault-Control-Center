import { message, type Message } from "../domain/message";
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

/** Which files a Human "set aside" action renames (never deletes) for an unreadable JSON file. */
export type SetAsidePart = "primary" | "backup";

/**
 * Health of one persisted JSON file after loading.
 * - ok / missing / restored_from_backup: writable
 * - unreadable: content is corrupt / invalid and no valid backup exists; read-only until a
 *   Human acts. `setAside` lists the files a safe Human set-aside would rename.
 * - io_error: the file could not be accessed (permission, device, lock, unknown). The content
 *   may be fine, so no set-aside / recovery action is offered (F-8).
 * - unsupported_version: newer schema; read-only, never overwritten.
 */
export type FileHealth =
  | { status: "ok" }
  | { status: "missing" }
  | { status: "restored_from_backup"; cause: "corrupt_primary" | "missing_primary"; quarantinedAs: string | null }
  | { status: "unreadable"; reason: string; setAside: SetAsidePart[] }
  | { status: "io_error"; reason: string; code: string }
  | { status: "unsupported_version"; version: number };

export function isWritable(health: FileHealth): boolean {
  return health.status === "ok" || health.status === "missing" || health.status === "restored_from_backup";
}

/**
 * What is wrong with a file, as a message the interface renders. The reason and the error code are
 * technical detail (a schema field, a storage code) and stay as they are inside the sentence.
 */
export function describeHealthProblem(health: FileHealth): Message | null {
  switch (health.status) {
    case "unreadable":
      return message("health.unreadable", { reason: health.reason });
    case "io_error":
      return message("health.ioError", { reason: health.reason, code: health.code });
    case "unsupported_version":
      return message("health.unsupportedVersion", { version: health.version });
    default:
      return null;
  }
}

/** Codes that mean "the content itself is unusable" rather than "the file could not be accessed". */
const CONTENT_ERROR_CODES = new Set(["INVALID_UTF8"]);

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

type ReadOutcome =
  | { kind: "text"; text: string }
  | { kind: "absent" }
  | { kind: "content_error"; reason: string }
  | { kind: "io_error"; error: StorageError };

async function readFile(backend: StorageBackend, target: StorageTarget, backup: boolean): Promise<ReadOutcome> {
  try {
    const text = await backend.read(target, backup ? { backup: true } : undefined);
    return text === null ? { kind: "absent" } : { kind: "text", text };
  } catch (error) {
    const storageError = toStorageError(error);
    return CONTENT_ERROR_CODES.has(storageError.code)
      ? { kind: "content_error", reason: storageError.message }
      : { kind: "io_error", error: storageError };
  }
}

function ioHealth(error: StorageError, context?: string): FileHealth {
  return { status: "io_error", reason: context ? `${context}: ${error.message}` : error.message, code: error.code };
}

type Loaded<T> = { value: T | null; health: FileHealth };

/**
 * Recovery contract (Task Packet rev 2 §4, AC-17, R-F2, R-F8). Nothing is ever deleted.
 *
 * | primary              | backup      | result                                                          |
 * |----------------------|-------------|-----------------------------------------------------------------|
 * | valid                | —           | use                                                             |
 * | newer schema         | —           | unsupported_version (read-only)                                 |
 * | I/O error            | —           | io_error (no recovery offered)                                  |
 * | missing              | missing     | missing (empty, writable)                                       |
 * | missing              | valid       | restore backup → restored_from_backup (RECOVERY REQUIRED)       |
 * | missing              | invalid     | unreadable, set-aside = [backup]                                |
 * | invalid / not UTF-8  | valid       | set primary aside, restore backup → restored_from_backup        |
 * | invalid / not UTF-8  | missing     | unreadable, set-aside = [primary]                               |
 * | invalid / not UTF-8  | invalid     | unreadable, set-aside = [primary, backup]                       |
 * | any                  | newer schema| unsupported_version (read-only)                                 |
 * | any                  | I/O error   | io_error                                                        |
 */
async function loadJsonWithRecovery<T>(
  backend: StorageBackend,
  target: StorageTarget,
  parse: (text: string) => ParseResult<T>,
): Promise<Loaded<T>> {
  const primary = await readFile(backend, target, false);
  let primaryProblem: string | null = null;
  switch (primary.kind) {
    case "io_error":
      return { value: null, health: ioHealth(primary.error) };
    case "content_error":
      primaryProblem = primary.reason;
      break;
    case "text": {
      const parsed = parse(primary.text);
      if (parsed.status === "ok") return { value: parsed.value, health: { status: "ok" } };
      if (parsed.status === "unsupported_version") {
        return { value: null, health: { status: "unsupported_version", version: parsed.version } };
      }
      primaryProblem = parsed.reason;
      break;
    }
    case "absent":
      break;
  }

  const backup = await readFile(backend, target, true);
  if (backup.kind === "io_error") return { value: null, health: ioHealth(backup.error, "backup") };
  const primaryParts: SetAsidePart[] = primaryProblem === null ? [] : ["primary"];

  if (backup.kind === "absent") {
    return primaryProblem === null
      ? { value: null, health: { status: "missing" } }
      : { value: null, health: { status: "unreadable", reason: primaryProblem, setAside: primaryParts } };
  }

  const parsedBackup: ParseResult<T> =
    backup.kind === "text" ? parse(backup.text) : { status: "malformed", reason: backup.reason };
  if (parsedBackup.status === "unsupported_version") {
    return { value: null, health: { status: "unsupported_version", version: parsedBackup.version } };
  }
  if (parsedBackup.status === "malformed") {
    const reason =
      primaryProblem === null
        ? `file is missing and its backup is unreadable: ${parsedBackup.reason}`
        : `${primaryProblem}; backup is also unreadable: ${parsedBackup.reason}`;
    return { value: null, health: { status: "unreadable", reason, setAside: [...primaryParts, "backup"] } };
  }

  // A valid backup is the recoverable copy: restore it before anything can be written.
  let quarantinedAs: string | null = null;
  try {
    if (primaryProblem !== null) quarantinedAs = await backend.quarantine(target);
    await backend.restoreBackup(target);
  } catch (error) {
    // The backup is untouched (restore never modifies it); the next load retries recovery.
    return { value: null, health: ioHealth(toStorageError(error), "backup restore failed") };
  }
  return {
    value: parsedBackup.value,
    health: {
      status: "restored_from_backup",
      cause: primaryProblem === null ? "missing_primary" : "corrupt_primary",
      quarantinedAs,
    },
  };
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
      loaded.health.status === "missing" ? { status: "unreadable", reason: "session.json is missing", setAside: [] } : loaded.health;
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
  options?: { create?: boolean },
): Promise<Message | null> {
  const id = session.reviewSessionId;
  // A new review must not replace an existing session.json (e.g. an id collision).
  await backend.write(reviewTarget(id, "session.json"), serializeSession(session), options?.create ? { kind: "absent" } : undefined);
  try {
    await backend.appendLine(reviewTarget(id, "events.jsonl"), serializeEvent(event));
    return null;
  } catch (error) {
    return message("service.eventAppendFailed", { error: toStorageError(error).message });
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

/**
 * Human action for an unreadable `projects.json`: rename the unusable files aside (never
 * deleted) so an empty project list can start. Only allowed for `unreadable` health; I/O
 * errors and newer schema versions offer no set-aside (F-8).
 */
export async function setAsideProjectsFile(backend: StorageBackend, health: FileHealth): Promise<string[]> {
  if (health.status !== "unreadable") {
    throw new StorageError("NOT_RECOVERABLE", `projects.json is ${health.status}; set-aside is only available for unreadable content`);
  }
  const kept: string[] = [];
  for (const part of health.setAside) {
    kept.push(await backend.quarantine(PROJECTS_TARGET, part === "backup" ? { backup: true } : undefined));
  }
  return kept;
}
