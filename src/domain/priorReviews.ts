import type { PriorReview } from "./duplicate";
import type { ReviewSession } from "./review";

/**
 * The rounds that could already have reviewed the head a new request would be about.
 *
 * A round is never its own duplicate, so the round the request is for is left out. Everything else
 * — including earlier rounds of the same review — is offered to `detectDuplicate`, which decides
 * what actually matches; nothing is filtered here on a guess about relevance.
 */
export function priorReviewsFor(
  sessions: readonly ReviewSession[],
  current: { reviewSessionId: string; round: number },
): PriorReview[] {
  const out: PriorReview[] = [];
  for (const session of sessions) {
    for (const round of session.rounds) {
      if (session.reviewSessionId === current.reviewSessionId && round.round === current.round) continue;
      out.push({
        reviewId: session.reviewSessionId,
        round: round.round,
        projectId: session.projectId,
        reviewedHead: round.reviewedHead,
        // What makes a review substantive is the contract's own definition, not a judgement here.
        substantive: round.resultCapturedAt !== null || round.verdictConfirmedAt !== null,
      });
    }
  }
  return out;
}
