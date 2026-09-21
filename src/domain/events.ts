import type { EvidenceReason, EvidenceSource, EvidenceStatus } from "./evidenceReuse";
import type { InvalidationReason } from "./revalidation";
import type { RiskTier, Tier2Subject } from "./riskTier";
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
  // Phase 3. Older builds do not know these types and skip such lines, which the existing contract
  // already reports as a visible count rather than failing the load.
  "followup_saved",
  "judgment_captured",
  "risk_tier_set",
  "duplicate_continued",
  "evidence_reused",
] as const;
export type ReviewEventType = (typeof REVIEW_EVENT_TYPES)[number];

export interface StateChange<T> {
  from: T | null;
  to: T;
}

/**
 * What an event means, as data rather than as a sentence.
 *
 * `note` stays what it has always been: text for a Human to read. Nothing reads it back. A fact the
 * workflow has to act on — which reason allowed a second review of a head, which evidence was
 * carried over — lives here instead, in a closed shape per event type, so no state is ever
 * recovered by parsing prose.
 */
export interface DuplicateContinuedDetail {
  kind: "duplicate_continued";
  invalidationReason: InvalidationReason;
  priorReviews: { reviewId: string; round: number }[];
}

export interface EvidenceReusedDetail {
  kind: "evidence_reused";
  items: {
    id: string;
    source: EvidenceSource;
    boundHead: string | null;
    capturedAt: string | null;
    status: EvidenceStatus;
    reason: EvidenceReason;
  }[];
}

export interface RiskTierSetDetail {
  kind: "risk_tier_set";
  riskTier: RiskTier;
  subjects: Tier2Subject[];
}

export type ReviewEventDetail = DuplicateContinuedDetail | EvidenceReusedDetail | RiskTierSetDetail;

/** The event types that carry a detail, and the shape each one carries. */
export const DETAIL_EVENT_TYPES: readonly ReviewEventDetail["kind"][] = [
  "duplicate_continued",
  "evidence_reused",
  "risk_tier_set",
];

export interface ReviewEvent {
  v: 1;
  ts: string;
  type: ReviewEventType;
  reviewSessionId: string;
  round: number;
  reviewState: StateChange<ReviewState> | null;
  resourceState: StateChange<ResourceState> | null;
  note: string | null;
  /** Absent in every line written before Phase 3, and in every event type that carries no facts. */
  detail: ReviewEventDetail | null;
}

export function isReviewEventType(value: unknown): value is ReviewEventType {
  return typeof value === "string" && (REVIEW_EVENT_TYPES as readonly string[]).includes(value);
}
