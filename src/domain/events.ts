import type { ResourceState, ReviewState } from "./states";

/**
 * Append-only history (`events.jsonl`). `session.json` is the authoritative current state;
 * events are the audit trail and are never rewritten.
 */
export const REVIEW_EVENT_TYPES = [
  "review_created",
  "review_ready",
  "review_started",
  "review_cancelled",
  "request_saved",
  "result_captured",
  "verdict_confirmed",
  "blocked",
  "suspended",
  "resumed",
  "closed",
  "resource_changed",
  "next_action_updated",
  "metadata_updated",
] as const;
export type ReviewEventType = (typeof REVIEW_EVENT_TYPES)[number];

export interface StateChange<T> {
  from: T | null;
  to: T;
}

export interface ReviewEvent {
  v: 1;
  ts: string;
  type: ReviewEventType;
  reviewSessionId: string;
  round: number;
  reviewState: StateChange<ReviewState> | null;
  resourceState: StateChange<ResourceState> | null;
  note: string | null;
}

export function isReviewEventType(value: unknown): value is ReviewEventType {
  return typeof value === "string" && (REVIEW_EVENT_TYPES as readonly string[]).includes(value);
}
