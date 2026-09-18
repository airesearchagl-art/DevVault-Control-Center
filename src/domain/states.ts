/**
 * Two independent state axes (Task Packet D2 / AC-04 / AC-05).
 * Resource State says how "open" a review is on this machine; Review State says where the
 * review process is. Neither is derived from the other.
 */

export const RESOURCE_STATES = ["HOT", "WARM", "COLD"] as const;
export type ResourceState = (typeof RESOURCE_STATES)[number];

export const REVIEW_STATES = [
  "NEW",
  "READY_FOR_REVIEW",
  "REVIEWING",
  "FIX_REQUIRED",
  "REVIEW_PASS",
  "BLOCKED",
  "SUSPENDED",
  "CLOSED",
] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

/** Verdicts a Human can confirm for a round. */
export const VERDICTS = ["FIX_REQUIRED", "REVIEW_PASS", "BLOCKED"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** States a suspended review may return to (`suspendedFrom`). */
export type ResumableState = Exclude<ReviewState, "SUSPENDED" | "CLOSED">;

export function isResourceState(value: unknown): value is ResourceState {
  return typeof value === "string" && (RESOURCE_STATES as readonly string[]).includes(value);
}

export function isReviewState(value: unknown): value is ReviewState {
  return typeof value === "string" && (REVIEW_STATES as readonly string[]).includes(value);
}

export function isVerdict(value: unknown): value is Verdict {
  return typeof value === "string" && (VERDICTS as readonly string[]).includes(value);
}

export function isResumableState(value: unknown): value is ResumableState {
  return isReviewState(value) && value !== "SUSPENDED" && value !== "CLOSED";
}

export const REVIEW_STATE_LABELS: Record<ReviewState, string> = {
  NEW: "New",
  READY_FOR_REVIEW: "Ready for review",
  REVIEWING: "Reviewing",
  FIX_REQUIRED: "Fix required",
  REVIEW_PASS: "Review pass",
  BLOCKED: "Blocked",
  SUSPENDED: "Suspended",
  CLOSED: "Closed",
};

export const RESOURCE_STATE_LABELS: Record<ResourceState, string> = {
  HOT: "Hot",
  WARM: "Warm",
  COLD: "Cold",
};

export const RESOURCE_STATE_HINTS: Record<ResourceState, string> = {
  HOT: "Working on it now — ChatGPT / IDE may stay open",
  WARM: "Resuming soon — UI and ChatGPT can be closed",
  COLD: "Paused — only the saved state is kept",
};
