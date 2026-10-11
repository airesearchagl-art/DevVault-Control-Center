import type { ReviewAction, ReviewActionType } from "../transitions";
import type { ActionId, CheckId, EligibilityRuleId, Executor, PayloadEvaluation, PayloadField } from "./contract";

/**
 * The closed Action Eligibility v1 catalog (Phase 5B, Annex A5 / A7): three review actions, each
 * executed only by the Human UI, each with a fixed check order and a fixed payload scope.
 */

export type CatalogDomainType = Extract<ReviewActionType, "startReview" | "confirmVerdict" | "startNextRound">;

export interface CatalogEntry {
  action_id: ActionId;
  /** The domain action the checks ask about; internal, never part of an assessment. */
  domain_type: CatalogDomainType;
  executor: Executor;
  rule: EligibilityRuleId;
  checks: readonly CheckId[];
  payload: { evaluation: PayloadEvaluation; fields: readonly PayloadField[] };
}

/**
 * Every payload key of a catalog action maps to a payload field. Typed against `ReviewAction`, so a
 * payload key added to the domain action is a compile error here instead of a silently unlisted field.
 */
type PayloadKeys<T extends CatalogDomainType> = Exclude<keyof Extract<ReviewAction, { type: T }>, "type">;

const START_REVIEW_PAYLOAD: Record<PayloadKeys<"startReview">, PayloadField> = {};
const CONFIRM_VERDICT_PAYLOAD: Record<PayloadKeys<"confirmVerdict">, PayloadField> = {
  verdict: "verdict",
  note: "verdict_note",
  confirmedByHuman: "human_confirmation",
};
const START_NEXT_ROUND_PAYLOAD: Record<PayloadKeys<"startNextRound">, PayloadField> = {
  expectedHead: "expected_head",
};

export const ACTION_CATALOG: readonly CatalogEntry[] = [
  {
    action_id: "review.start_review",
    domain_type: "startReview",
    executor: "HUMAN_UI",
    rule: "eligibility.review.start-review@1",
    checks: ["state_guard", "project_registered", "expected_head_exact", "freshness_aligned"],
    payload: { evaluation: "NOT_APPLICABLE", fields: Object.values(START_REVIEW_PAYLOAD) },
  },
  {
    action_id: "review.confirm_verdict",
    domain_type: "confirmVerdict",
    executor: "HUMAN_UI",
    rule: "eligibility.review.confirm-verdict@1",
    checks: ["state_guard", "verdict_prerequisites", "project_registered", "reviewed_head_exact", "freshness_aligned", "human_decision"],
    payload: { evaluation: "NOT_EVALUATED", fields: Object.values(CONFIRM_VERDICT_PAYLOAD) },
  },
  {
    action_id: "review.start_next_round",
    domain_type: "startNextRound",
    executor: "HUMAN_UI",
    rule: "eligibility.review.start-next-round@1",
    checks: ["state_guard", "project_registered", "verdict_confirmation_recorded"],
    payload: { evaluation: "NOT_EVALUATED", fields: Object.values(START_NEXT_ROUND_PAYLOAD) },
  },
];
