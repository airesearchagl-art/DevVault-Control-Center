/**
 * Derived Freshness (Phase 2 — Evidence / Freshness).
 *
 * Freshness is a *third* axis next to Review State and Resource State: it is computed from the
 * Human-recorded HEAD values and the machine-observed Git facts, and it never changes either of
 * them. Deriving it is a pure comparison — nothing is inferred, and every case that cannot be
 * decided ends as `UNKNOWN` with the reason shown to the Human (fail closed).
 */

import type { GitObservation } from "./git";

export const FRESHNESS_STATES = [
  "ALIGNED",
  "HEAD_CHANGED",
  "REVIEW_STALE",
  "WORKTREE_DIRTY",
  "UNKNOWN",
] as const;

export type Freshness = (typeof FRESHNESS_STATES)[number];

/** A recorded HEAD is comparable only if it is 7–40 hexadecimal characters (schema contract). */
const RECORDED_HEAD_PATTERN = /^[0-9a-fA-F]{7,40}$/;
const FULL_HEAD_LENGTH = 40;

export type HeadComparison = "match" | "differs" | "unknown";

/**
 * Compares a Human-recorded HEAD with the observed current HEAD.
 *
 * A 40-character value must be equal; a 7–39-character value matches when the current full SHA
 * starts with it. An absent, malformed or unknown value is never guessed — the result is
 * `"unknown"` and the caller must fall back to `UNKNOWN`.
 */
export function compareHead(recorded: string | null | undefined, current: string | null | undefined): HeadComparison {
  if (typeof recorded !== "string" || typeof current !== "string") return "unknown";
  const left = recorded.trim().toLowerCase();
  const right = current.trim().toLowerCase();
  if (!RECORDED_HEAD_PATTERN.test(left)) return "unknown";
  if (right.length !== FULL_HEAD_LENGTH || !RECORDED_HEAD_PATTERN.test(right)) return "unknown";
  if (left.length === FULL_HEAD_LENGTH) return left === right ? "match" : "differs";
  return right.startsWith(left) ? "match" : "differs";
}

export interface FreshnessInput {
  /** `undefined` means the Git state has not been observed yet (e.g. right after a restart). */
  observation: GitObservation | undefined;
  expectedHead: string | null;
  reviewedHead: string | null;
}

export interface FreshnessResult {
  status: Freshness;
  /** One sentence saying why, shown next to the badge. */
  explanation: string;
  currentHead: string | null;
  expectedHead: string | null;
  reviewedHead: string | null;
}

/** First 7 characters, the usual short form; shorter recorded values are shown as they are. */
export function shortHead(head: string | null | undefined): string {
  if (typeof head !== "string" || head.trim() === "") return "—";
  return head.trim().toLowerCase().slice(0, 7);
}

function unobservedExplanation(observation: GitObservation | undefined): string {
  if (!observation) return "Git state has not been observed.";
  switch (observation.status) {
    case "NO_LOCAL_ROOT":
      return "No local root is recorded for this project.";
    case "NOT_A_GIT_REPOSITORY":
      return "The recorded local root is not a Git repository.";
    case "GIT_UNAVAILABLE":
      return "Git could not be started, so the repository was not observed.";
    case "TIMEOUT":
      return "Observing the repository timed out.";
    case "ERROR":
      return observation.errorMessage?.trim()
        ? `The repository could not be observed: ${observation.errorMessage.trim()}`
        : "The repository could not be observed.";
    default:
      return "Git state has not been observed.";
  }
}

/**
 * Derives Freshness in the contracted priority: WORKTREE_DIRTY, then REVIEW_STALE, then
 * HEAD_CHANGED, then ALIGNED, and UNKNOWN for everything that cannot be decided.
 */
export function deriveFreshness({ observation, expectedHead, reviewedHead }: FreshnessInput): FreshnessResult {
  const recorded = { expectedHead: expectedHead ?? null, reviewedHead: reviewedHead ?? null };

  if (!observation || observation.status !== "OK") {
    return { status: "UNKNOWN", explanation: unobservedExplanation(observation), currentHead: null, ...recorded };
  }

  const currentHead = observation.head ?? null;

  if (observation.dirty === true) {
    return {
      status: "WORKTREE_DIRTY",
      explanation: "Local working tree has uncommitted changes.",
      currentHead,
      ...recorded,
    };
  }
  if (observation.dirty !== false) {
    return {
      status: "UNKNOWN",
      explanation: "The working tree state is not known.",
      currentHead,
      ...recorded,
    };
  }
  if (currentHead === null) {
    return {
      status: "UNKNOWN",
      explanation: "The current HEAD is not known.",
      currentHead,
      ...recorded,
    };
  }

  if (recorded.reviewedHead !== null) {
    const comparison = compareHead(recorded.reviewedHead, currentHead);
    if (comparison === "differs") {
      return {
        status: "REVIEW_STALE",
        explanation: `Reviewed HEAD ${shortHead(recorded.reviewedHead)} differs from current HEAD ${shortHead(currentHead)}.`,
        currentHead,
        ...recorded,
      };
    }
    if (comparison === "unknown") {
      return {
        status: "UNKNOWN",
        explanation: "The recorded reviewed HEAD cannot be compared with the current HEAD.",
        currentHead,
        ...recorded,
      };
    }
  }

  if (recorded.expectedHead !== null) {
    const comparison = compareHead(recorded.expectedHead, currentHead);
    if (comparison === "differs") {
      return {
        status: "HEAD_CHANGED",
        explanation: `Expected HEAD ${shortHead(recorded.expectedHead)} differs from current HEAD ${shortHead(currentHead)}.`,
        currentHead,
        ...recorded,
      };
    }
    if (comparison === "unknown") {
      return {
        status: "UNKNOWN",
        explanation: "The recorded expected HEAD cannot be compared with the current HEAD.",
        currentHead,
        ...recorded,
      };
    }
  }

  if (recorded.expectedHead === null && recorded.reviewedHead === null) {
    return {
      status: "UNKNOWN",
      explanation: "No expected or reviewed HEAD is recorded for this round.",
      currentHead,
      ...recorded,
    };
  }

  return {
    status: "ALIGNED",
    explanation: "Recorded HEAD values match current local HEAD.",
    currentHead,
    ...recorded,
  };
}

/** Attention order inside one Review State: the states that need a look come first. */
export const FRESHNESS_ATTENTION: Record<Freshness, number> = {
  WORKTREE_DIRTY: 0,
  REVIEW_STALE: 1,
  HEAD_CHANGED: 2,
  UNKNOWN: 3,
  ALIGNED: 4,
};

export const FRESHNESS_LABELS: Record<Freshness, string> = {
  ALIGNED: "Aligned",
  HEAD_CHANGED: "HEAD changed",
  REVIEW_STALE: "Review stale",
  WORKTREE_DIRTY: "Working tree dirty",
  UNKNOWN: "Unknown",
};
