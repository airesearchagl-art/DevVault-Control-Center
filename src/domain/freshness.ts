/**
 * Derived Freshness (Phase 2 — Evidence / Freshness).
 *
 * Freshness is a *third* axis next to Review State and Resource State: it is computed from the
 * Human-recorded HEAD values and the machine-observed Git facts, and it never changes either of
 * them. Deriving it is a pure comparison — nothing is inferred, and every case that cannot be
 * decided ends as `UNKNOWN` with the reason shown to the Human (fail closed).
 */

import { message, type Message } from "./message";
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
  explanation: Message;
  currentHead: string | null;
  expectedHead: string | null;
  reviewedHead: string | null;
}

/** First 7 characters, the usual short form; shorter recorded values are shown as they are. */
export function shortHead(head: string | null | undefined): string {
  if (typeof head !== "string" || head.trim() === "") return "—";
  return head.trim().toLowerCase().slice(0, 7);
}

function unobservedExplanation(observation: GitObservation | undefined): Message {
  if (!observation) return message("freshness.explanation.notObserved");
  switch (observation.status) {
    case "NO_LOCAL_ROOT":
      return message("freshness.explanation.noLocalRoot");
    case "NOT_A_GIT_REPOSITORY":
      return message("freshness.explanation.notARepository");
    case "GIT_UNAVAILABLE":
      return message("freshness.explanation.gitUnavailable");
    case "TIMEOUT":
      return message("freshness.explanation.timeout");
    case "ERROR":
      if (observation.errorCode === "MALFORMED_OBSERVATION") return message("git.observation.malformed");
      return observation.errorMessage?.trim()
        ? message("freshness.explanation.errorWithReason", { reason: observation.errorMessage.trim() })
        : message("freshness.explanation.error");
    default:
      return message("freshness.explanation.notObserved");
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
      explanation: message("freshness.explanation.worktreeDirty"),
      currentHead,
      ...recorded,
    };
  }
  if (observation.dirty !== false) {
    return {
      status: "UNKNOWN",
      explanation: message("freshness.explanation.worktreeUnknown"),
      currentHead,
      ...recorded,
    };
  }
  if (currentHead === null) {
    return {
      status: "UNKNOWN",
      explanation: message("freshness.explanation.headUnknown"),
      currentHead,
      ...recorded,
    };
  }

  // Both recorded values are compared before anything is decided: a value that cannot be
  // compared must not hide a difference the other one shows.
  const reviewed = recorded.reviewedHead === null ? null : compareHead(recorded.reviewedHead, currentHead);
  const expected = recorded.expectedHead === null ? null : compareHead(recorded.expectedHead, currentHead);

  if (reviewed === "differs") {
    return {
      status: "REVIEW_STALE",
      explanation: message("freshness.explanation.reviewStale", {
        reviewed: shortHead(recorded.reviewedHead),
        current: shortHead(currentHead),
      }),
      currentHead,
      ...recorded,
    };
  }
  if (expected === "differs") {
    return {
      status: "HEAD_CHANGED",
      explanation: message("freshness.explanation.headChanged", {
        expected: shortHead(recorded.expectedHead),
        current: shortHead(currentHead),
      }),
      currentHead,
      ...recorded,
    };
  }
  if (reviewed === "unknown" || expected === "unknown") {
    return {
      status: "UNKNOWN",
      explanation:
        reviewed === "unknown"
          ? message("freshness.explanation.reviewedNotComparable")
          : message("freshness.explanation.expectedNotComparable"),
      currentHead,
      ...recorded,
    };
  }

  if (reviewed === null && expected === null) {
    return {
      status: "UNKNOWN",
      explanation: message("freshness.explanation.nothingRecorded"),
      currentHead,
      ...recorded,
    };
  }

  return {
    status: "ALIGNED",
    explanation: message("freshness.explanation.aligned"),
    currentHead,
    ...recorded,
  };
}

