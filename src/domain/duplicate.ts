import { compareHead } from "./freshness";

/**
 * Same-head duplicate detection, from the canonical contract
 * (`02_Prompts/GPTS_Review_Agent/DevVault_Review_Depth_Tiering.md` at obsidian-vault main
 * `77ce41e`, lines 46, 66 and 71: one substantive review per head is the standard, and a duplicate
 * on the same head is prohibited without a stated reason for the earlier evidence to be stale).
 *
 * This module only *detects*. Whether a second review may go ahead is a separate question, asked
 * and answered in `revalidation.ts`, so that detection can never quietly grant permission.
 *
 * The comparison itself is Phase 2's `compareHead` contract; nothing here compares SHAs of its own.
 */

const FULL_HEAD_LENGTH = 40;

/** A review that already exists and may or may not be about the head we are asking about. */
export interface PriorReview {
  reviewId: string;
  round: number;
  projectId: string;
  /** The head the reviewer actually reviewed, as recorded by the Human. */
  reviewedHead: string | null;
  /**
   * A review counts as substantive once its result was captured or its verdict confirmed. A round
   * that only has a request written is not one.
   */
  substantive: boolean;
}

export interface DuplicateInput {
  projectId: string;
  /** The head the new request would be about. */
  targetHead: string | null;
  priorReviews: readonly PriorReview[];
}

export const DUPLICATE_STATUSES = ["NO_DUPLICATE", "SAME_HEAD_DUPLICATE", "UNDECIDABLE"] as const;
export type DuplicateStatus = (typeof DUPLICATE_STATUSES)[number];

export interface PriorReviewReference {
  reviewId: string;
  round: number;
}

export interface DuplicateFinding {
  status: DuplicateStatus;
  /** The reviews that are about the same head, in the order they were given. */
  matches: readonly PriorReviewReference[];
}

/**
 * `compareHead` answers "does this recorded value point at that full SHA", so the full-length side
 * has to be the second argument. Either side may be the full one here, so the orientation is
 * chosen rather than a second comparison written.
 */
function sameHead(a: string | null, b: string | null): ReturnType<typeof compareHead> {
  const full = (value: string | null) => typeof value === "string" && value.trim().length === FULL_HEAD_LENGTH;
  if (full(b)) return compareHead(a, b);
  if (full(a)) return compareHead(b, a);
  return "unknown";
}

/**
 * Finds the substantive reviews of this project that were made against the same head.
 *
 * When a head cannot be compared — missing, malformed, or two short values that could still be the
 * same commit — the answer is `UNDECIDABLE`, never `NO_DUPLICATE`: not being able to tell is not
 * the same as knowing there is no duplicate.
 */
export function detectDuplicate(input: DuplicateInput): DuplicateFinding {
  const matches: PriorReviewReference[] = [];
  let undecidable = false;

  for (const prior of input.priorReviews) {
    if (prior.projectId !== input.projectId || !prior.substantive) continue;
    const comparison = sameHead(prior.reviewedHead, input.targetHead);
    if (comparison === "match") matches.push({ reviewId: prior.reviewId, round: prior.round });
    else if (comparison === "unknown") undecidable = true;
  }

  if (matches.length > 0) return { status: "SAME_HEAD_DUPLICATE", matches };
  return { status: undecidable ? "UNDECIDABLE" : "NO_DUPLICATE", matches: [] };
}
