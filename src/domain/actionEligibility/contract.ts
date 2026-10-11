import type { BlockedReason, ControlReadErrorCode, UnknownReason } from "../controlRead/contract";
import type { EvidenceRef } from "../controlRead/evidenceRef";

/**
 * Action Eligibility v1 — the versioned, transport-neutral, read-only assessment contract of DVCC
 * (Phase 5B, Task Packet rev 3 MVP). It answers, for one review and a closed catalog of three
 * Human UI actions, whether the action is refused for a reason that does not depend on the payload
 * (`BLOCKED`), waits only on the Human decision of the action itself (`NEEDS_HUMAN`), or met every
 * action-level check (`ELIGIBLE_NOW`).
 *
 * An assessment is never an authorization, a reservation, a lock or a promise of success: it carries
 * `authority: "NONE"`, the payload is not evaluated, and the action must be revalidated by its own
 * Human path before it runs. Nothing here is bound to a transport, and nothing here is persisted.
 */

export const ACTION_ELIGIBILITY_CONTRACT = "dvcc.action-eligibility" as const;
export const ACTION_ELIGIBILITY_VERSION = 1 as const;

export const ACTION_ELIGIBILITY_OPERATIONS = ["assess_review_actions"] as const;
export type ActionEligibilityOperation = (typeof ACTION_ELIGIBILITY_OPERATIONS)[number];

/** The exact request field set; anything else is an unrecognized field. */
export const ACTION_ELIGIBILITY_REQUEST_KEYS = ["contract", "version", "operation", "review_session_id"] as const;

export const ASSESSMENT_SCOPE = "ACTION_LEVEL" as const;

export const DISPOSITIONS = ["ELIGIBLE_NOW", "BLOCKED", "NEEDS_HUMAN"] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

export const ACTION_IDS = ["review.start_review", "review.confirm_verdict", "review.start_next_round"] as const;
export type ActionId = (typeof ACTION_IDS)[number];

export const EXECUTORS = ["HUMAN_UI"] as const;
export type Executor = (typeof EXECUTORS)[number];

export const ELIGIBILITY_RULE_IDS = [
  "eligibility.review.start-review@1",
  "eligibility.review.confirm-verdict@1",
  "eligibility.review.start-next-round@1",
] as const;
export type EligibilityRuleId = (typeof ELIGIBILITY_RULE_IDS)[number];

export const CHECK_IDS = [
  "state_guard",
  "verdict_prerequisites",
  "project_registered",
  "expected_head_exact",
  "reviewed_head_exact",
  "freshness_aligned",
  "verdict_confirmation_recorded",
  "human_decision",
] as const;
export type CheckId = (typeof CHECK_IDS)[number];

export const CHECK_OUTCOMES = ["PASS", "FAIL", "NEEDS_HUMAN", "NOT_EVALUATED"] as const;
export type CheckOutcome = (typeof CHECK_OUTCOMES)[number];

/**
 * NH admissibility rule (HD-5B-05): only a check whose remaining requirement is supplied at run time
 * by the assessed action's own Human path may answer `NEEDS_HUMAN`. In v1 that is the Human decision.
 */
export const NEEDS_HUMAN_CAPABLE_CHECKS = ["human_decision"] as const;

export const PAYLOAD_EVALUATIONS = ["NOT_APPLICABLE", "NOT_EVALUATED"] as const;
export type PayloadEvaluation = (typeof PAYLOAD_EVALUATIONS)[number];

export const PAYLOAD_FIELDS = ["verdict", "verdict_note", "human_confirmation", "expected_head"] as const;
export type PayloadField = (typeof PAYLOAD_FIELDS)[number];

export const NOT_EVALUATED_SCOPES = ["ACTION_PAYLOAD", "AGENT_PERMISSION", "EXTERNAL_GATES", "EXECUTION_OUTCOME"] as const;
export type NotEvaluatedScope = (typeof NOT_EVALUATED_SCOPES)[number];

export const REASON_CODES = [
  "REVIEW_STATE_NOT_ALLOWED",
  "ROUND_LIMIT_REACHED",
  "RESULT_NOT_CAPTURED",
  "FINAL_JUDGMENT_NOT_CAPTURED",
  "DOMAIN_REFUSED_OTHER",
  "PROJECT_NOT_REGISTERED",
  "EXPECTED_HEAD_NOT_RECORDED",
  "EXPECTED_HEAD_NOT_EXACT",
  "REVIEWED_HEAD_NOT_RECORDED",
  "REVIEWED_HEAD_NOT_EXACT",
  "HEAD_CHANGED",
  "REVIEW_STALE",
  "WORKTREE_DIRTY",
  "FRESHNESS_UNKNOWN",
  "EVIDENCE_INCOMPLETE",
  "HUMAN_DECISION_REQUIRED",
  "VERDICT_CONFIRMATION_NOT_RECORDED",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export const ACTION_ELIGIBILITY_ERROR_REASONS = [
  // INVALID_REQUEST
  "NOT_AN_OBJECT",
  "UNRECOGNIZED_FIELD",
  "MISSING_FIELD",
  "INVALID_FIELD_TYPE",
  // UNSUPPORTED_CONTRACT_VERSION
  "REQUESTED_VERSION_NOT_SUPPORTED",
  // SOURCE_UNAVAILABLE
  "APP_NOT_READY",
  "REGISTRY_UNREADABLE",
  "REGISTRY_IO_ERROR",
  "REGISTRY_UNSUPPORTED_VERSION",
  "BASIS_CONTRACT_VIOLATION",
  // TARGET_UNAVAILABLE
  "UNREADABLE",
  "IO_ERROR",
  "UNSUPPORTED_VERSION",
  "MISSING",
  "IDENTITY_MISMATCH",
] as const;
export type ActionEligibilityErrorReason = (typeof ACTION_ELIGIBILITY_ERROR_REASONS)[number];

export interface CheckResultV1 {
  check: CheckId;
  outcome: CheckOutcome;
  /** Present only for `FAIL` and `NEEDS_HUMAN`. */
  reason?: ReasonCode;
  /** Present only when an `UNKNOWN` / `BLOCKED` Control Read fact caused the outcome. */
  fact_reason?: UnknownReason | BlockedReason;
  /** A `PASS` cites at least one reference; `NOT_EVALUATED` cites none. */
  evidence_refs: EvidenceRef[];
}

export interface PayloadScopeV1 {
  evaluation: PayloadEvaluation;
  fields: PayloadField[];
}

export interface ActionAssessmentV1 {
  action_id: ActionId;
  executor: Executor;
  rule: EligibilityRuleId;
  disposition: Disposition;
  reasons: ReasonCode[];
  checks: CheckResultV1[];
  payload: PayloadScopeV1;
  /** Observation time of the freshness fact the assessment relied on, else `null`. */
  basis_observed_at: string | null;
}

export interface ActionEligibilityDataV1 {
  review_session_id: string;
  project_id: string;
  current_round: number;
  assessments: ActionAssessmentV1[];
}

export interface ActionEligibilityEnvelopeV1 {
  contract: typeof ACTION_ELIGIBILITY_CONTRACT;
  version: typeof ACTION_ELIGIBILITY_VERSION;
  operation: ActionEligibilityOperation;
  /** Identifier only — never an authority, lock or concurrency token. */
  assessment_id: string;
  generated_at: string;
  authority: "NONE";
  scope: typeof ASSESSMENT_SCOPE;
  revalidation: "REQUIRED_BEFORE_EXECUTION";
  basis: { contract: "dvcc.control-read"; version: 1; operation: "get_review_state" };
  not_evaluated: NotEvaluatedScope[];
  data: ActionEligibilityDataV1;
}

export interface ActionEligibilityError {
  contract: typeof ACTION_ELIGIBILITY_CONTRACT;
  /** The version DVCC speaks. */
  version: typeof ACTION_ELIGIBILITY_VERSION;
  error: {
    code: ControlReadErrorCode;
    reason?: ActionEligibilityErrorReason;
    /** Request field NAMES only (request validation of this contract only); never values. */
    fields?: string[];
    unlisted_field_count?: number;
    supported_versions?: [1];
  };
}

export type ActionEligibilityResult = ActionEligibilityEnvelopeV1 | ActionEligibilityError;

/** Injected by the caller; each is called exactly once per successful assessment, never on an error. */
export interface ActionEligibilityEnv {
  now: () => string;
  newAssessmentId: () => string;
}
