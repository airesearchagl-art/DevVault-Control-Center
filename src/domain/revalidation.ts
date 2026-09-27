import type { DuplicateFinding, PriorReviewReference } from "./duplicate";

/**
 * Whether a second substantive review of the same head may go ahead.
 *
 * The canonical rule is a prohibition with a condition
 * (`02_Prompts/GPTS_Review_Agent/DevVault_Review_Depth_Tiering.md` at obsidian-vault main
 * `77ce41e`): "合理的な失効理由なしに、同一headのfull-suiteや同一検査を最初からduplicate実行する
 * ことを禁止する" (line 46), and only "head、base、対象blob、relevant contract、実行環境等に合理的な
 * 失効理由がある部分だけを再確認する" (line 45).
 *
 * So the permission is decided by a reason **code**, not by the Human having typed something. The
 * explanation the Human writes is kept beside the code for the record and for the reviewer to read;
 * it is not what opens the gate. There is no free-form override, and no standing permission: the
 * canonical exception routes elsewhere in the contract are explicitly single-use and rebound to a
 * fresh head and base.
 */

/**
 * The reasons the contract names, and only those. The canonical sentence ends in "等", but an
 * open-ended list would be an invitation to invent one, so this list is exactly what is written.
 */
export const INVALIDATION_REASONS = [
  "HEAD_CHANGED",
  "BASE_CHANGED",
  "TARGET_BLOB_CHANGED",
  "RELEVANT_CONTRACT_CHANGED",
  "EXECUTION_ENVIRONMENT_CHANGED",
] as const;
export type InvalidationReason = (typeof INVALIDATION_REASONS)[number];

export function isInvalidationReason(value: unknown): value is InvalidationReason {
  return typeof value === "string" && (INVALIDATION_REASONS as readonly string[]).includes(value);
}

/**
 * A head that changed is not a same-head duplicate at all — it is an ordinary new review. So on a
 * same-head finding, `HEAD_CHANGED` contradicts the finding rather than justifying it, and the
 * remaining four are the ones that can make evidence for *this* head stale.
 */
export const SAME_HEAD_INVALIDATION_REASONS: readonly InvalidationReason[] = [
  "BASE_CHANGED",
  "TARGET_BLOB_CHANGED",
  "RELEVANT_CONTRACT_CHANGED",
  "EXECUTION_ENVIRONMENT_CHANGED",
];

export const REVALIDATION_PERMISSIONS = [
  "NO_DUPLICATE",
  "DUPLICATE_BLOCKED",
  "REVALIDATION_ALLOWED",
  "UNDECIDABLE",
] as const;
export type RevalidationPermission = (typeof REVALIDATION_PERMISSIONS)[number];

export interface RevalidationRequest {
  duplicate: DuplicateFinding;
  /** The machine-readable reason, chosen by the Human from the canonical list. */
  reason: InvalidationReason | null;
  /** What the Human wrote about it. Kept with the decision; never what decides it. */
  explanation: string | null;
}

export interface RevalidationAssessment {
  permission: RevalidationPermission;
  /** The reviews this decision is about, so the record can point at them. */
  priorReviews: readonly PriorReviewReference[];
  /** Echoed back only when it actually granted the permission. */
  reason: InvalidationReason | null;
  explanation: string | null;
}

export function assessRevalidationPermission(request: RevalidationRequest): RevalidationAssessment {
  const priorReviews = request.duplicate.matches;
  const base = { priorReviews, reason: null, explanation: request.explanation } as const;

  if (request.duplicate.status === "NO_DUPLICATE") return { ...base, permission: "NO_DUPLICATE" };
  // Not being able to tell whether this head was already reviewed is not permission to review it.
  if (request.duplicate.status === "UNDECIDABLE") return { ...base, permission: "UNDECIDABLE" };

  const reason = request.reason;
  if (reason === null || !SAME_HEAD_INVALIDATION_REASONS.includes(reason)) {
    return { ...base, permission: "DUPLICATE_BLOCKED" };
  }
  return { permission: "REVALIDATION_ALLOWED", priorReviews, reason, explanation: request.explanation };
}
