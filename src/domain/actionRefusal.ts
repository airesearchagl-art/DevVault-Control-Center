import type { Message } from "./message";
import type { ReviewSession } from "./review";
import { SAME_HEAD_INVALIDATION_REASONS } from "./revalidation";
import { applyReviewAction, type ReviewAction, type ReviewActionType } from "./transitions";

/**
 * Why an operation is refused right now, in the domain's own words.
 *
 * A disabled control has to say why it is disabled, and the only honest source for that is the
 * function that refuses the operation. So this asks `applyReviewAction` itself, with a
 * representative payload the Human could have supplied, and returns its refusal unchanged. Being
 * pure, the dry run writes nothing; the payload only has to be one the Human's own dialog could
 * send, so a refusal here is a refusal of the operation rather than of the example.
 */

const PROBE_TIME = "1970-01-01T00:00:00.000Z";

const PROBES = {
  recordRequestSaved: { type: "recordRequestSaved" },
  captureResult: { type: "captureResult", reviewedHead: null, replaceConfirmedByHuman: true },
  recordFollowupSaved: { type: "recordFollowupSaved" },
  captureJudgment: { type: "captureJudgment", replaceConfirmedByHuman: true },
  confirmVerdict: { type: "confirmVerdict", verdict: "REVIEW_PASS", note: null, confirmedByHuman: true },
  // The highest tier is refused only by the state and the round, never by the subjects.
  setRiskTier: { type: "setRiskTier", riskTier: "TIER_2", subjects: [], confirmedByHuman: true },
  recordRevalidation: {
    type: "recordRevalidation",
    reason: SAME_HEAD_INVALIDATION_REASONS[0],
    priorReviews: [{ reviewId: "probe", round: 1 }],
    explanation: null,
  },
  recordEvidenceDecisions: { type: "recordEvidenceDecisions", decisions: [] },
  startNextRound: { type: "startNextRound", expectedHead: null },
} satisfies Partial<Record<ReviewActionType, ReviewAction>>;

export type ProbedAction = keyof typeof PROBES;

export function actionRefusal(session: ReviewSession, type: ProbedAction): Message | null {
  const result = applyReviewAction(session, PROBES[type], PROBE_TIME);
  return result.ok ? null : result.error;
}
