/**
 * Machine-observed local Git facts (Phase 2 — Evidence / Freshness).
 *
 * Mirrors `GitObservation` / `GitStatus` in `src-tauri/src/git.rs`. These are observed facts, never
 * Human-recorded state: nothing here is persisted, and after a restart there is no observation at
 * all until the Human refreshes. Unknown fields stay `null` — they are never guessed.
 */

export const GIT_STATUSES = [
  "OK",
  "NO_LOCAL_ROOT",
  "NOT_A_GIT_REPOSITORY",
  "GIT_UNAVAILABLE",
  "TIMEOUT",
  "ERROR",
] as const;

export type GitStatus = (typeof GIT_STATUSES)[number];

export interface GitObservation {
  status: GitStatus;
  /** Full 40-character commit SHA, or `null` when unknown (e.g. a repository without a commit). */
  head: string | null;
  /** Current branch name, or `null` when detached or unknown. */
  branch: string | null;
  detached: boolean | null;
  /** Uncommitted changes, including untracked files. */
  dirty: boolean | null;
  /** ISO-8601 UTC, millisecond precision. */
  observedAt: string;
  errorCode?: string;
  errorMessage?: string;
}

export const GIT_STATUS_LABELS: Record<GitStatus, string> = {
  OK: "Observed",
  NO_LOCAL_ROOT: "No local root recorded",
  NOT_A_GIT_REPOSITORY: "Not a Git repository",
  GIT_UNAVAILABLE: "Git unavailable",
  TIMEOUT: "Timed out",
  ERROR: "Not observed (error)",
};

export function isGitStatus(value: unknown): value is GitStatus {
  return typeof value === "string" && (GIT_STATUSES as readonly string[]).includes(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/**
 * Accepts a command result as an observation, fail closed: anything unexpected becomes an `ERROR`
 * observation with no facts rather than a partially trusted one.
 */
export function asGitObservation(value: unknown, observedAt: string): GitObservation {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  if (!record || !isGitStatus(record.status)) {
    return {
      status: "ERROR",
      head: null,
      branch: null,
      detached: null,
      dirty: null,
      observedAt,
      errorCode: "MALFORMED_OBSERVATION",
      errorMessage: "The Git observation could not be read.",
    };
  }
  const errorCode = optionalString(record.errorCode);
  const errorMessage = optionalString(record.errorMessage);
  return {
    status: record.status,
    head: optionalString(record.head),
    branch: optionalString(record.branch),
    detached: optionalBoolean(record.detached),
    dirty: optionalBoolean(record.dirty),
    observedAt: optionalString(record.observedAt) ?? observedAt,
    ...(errorCode === null ? {} : { errorCode }),
    ...(errorMessage === null ? {} : { errorMessage }),
  };
}

/** An observation together with the project instance it was taken for. */
export interface ObservedGitState {
  localRoot: string | null;
  /** `createdAt` of the project as it was when the observation was taken. */
  projectCreatedAt: string;
  observation: GitObservation;
}

/** What an observation has to still match to be shown: the same folder of the same project. */
export interface ObservedProject {
  localRoot: string | null;
  createdAt: string;
}

/**
 * The observation to show for a project, or `undefined` when there is none that still describes it.
 * Changing the recorded root — or deleting a project and creating another one under the same id —
 * makes the old facts meaningless rather than merely old, so they are dropped instead of shown.
 */
export function observationForProject(
  observed: ObservedGitState | undefined,
  project: ObservedProject | undefined,
): GitObservation | undefined {
  if (!observed || !project) return undefined;
  const sameProject = observed.localRoot === project.localRoot && observed.projectCreatedAt === project.createdAt;
  return sameProject ? observed.observation : undefined;
}

/** An observation that stands for a failed call; the derived Freshness turns it into UNKNOWN. */
export function failedObservation(observedAt: string, errorCode: string, errorMessage: string): GitObservation {
  return {
    status: "ERROR",
    head: null,
    branch: null,
    detached: null,
    dirty: null,
    observedAt,
    errorCode,
    errorMessage,
  };
}
