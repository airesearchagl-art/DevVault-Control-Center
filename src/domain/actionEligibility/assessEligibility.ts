import { ECHOABLE_FIELD_NAME, type ControlReadSource, type ReviewStateV1 } from "../controlRead/contract";
import type { ReviewSession } from "../review";
import { actionEligibilityError, resolveBasis } from "./basis";
import { ACTION_CATALOG, type CatalogEntry } from "./catalog";
import { dispositionOf, evaluateCheck, reasonsOf, runChecks } from "./checks";
import {
  ACTION_ELIGIBILITY_CONTRACT,
  ACTION_ELIGIBILITY_REQUEST_KEYS,
  ACTION_ELIGIBILITY_VERSION,
  ASSESSMENT_SCOPE,
  NOT_EVALUATED_SCOPES,
  type ActionAssessmentV1,
  type ActionEligibilityEnv,
  type ActionEligibilityError,
  type ActionEligibilityResult,
  type CheckResultV1,
} from "./contract";

/**
 * The single, transport-neutral entry point of Action Eligibility v1 (Phase 5B).
 *
 * Pure: the clock and the assessment identifier are injected and used once each, only on success;
 * nothing is read from or written to storage. The request is validated in a fixed order
 * (Annex A3):
 *
 *   1. plain object            -> INVALID_REQUEST / NOT_AN_OBJECT
 *   2. contract                -> UNSUPPORTED_CONTRACT
 *   3. version                 -> UNSUPPORTED_CONTRACT_VERSION
 *   4. operation               -> UNSUPPORTED_OPERATION
 *   5. unrecognized fields     -> INVALID_REQUEST / UNRECOGNIZED_FIELD
 *   6. missing / mistyped      -> INVALID_REQUEST / MISSING_FIELD | INVALID_FIELD_TYPE
 *   7–11. basis                -> the internal Control Read result, identity-bound (basis.ts)
 *   12. checks                 -> never an error
 *   13. envelope               -> newAssessmentId, then now
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Names that match the echo pattern are listed; the rest are only counted, never echoed. */
function unrecognizedFields(names: readonly string[]): ActionEligibilityError {
  const listable = names.filter((name) => ECHOABLE_FIELD_NAME.test(name)).sort();
  const unlisted = names.length - listable.length;
  return actionEligibilityError("INVALID_REQUEST", "UNRECOGNIZED_FIELD", {
    ...(listable.length > 0 ? { fields: listable } : {}),
    ...(unlisted > 0 ? { unlisted_field_count: unlisted } : {}),
  });
}

type ValidatedRequest = { ok: true; reviewSessionId: string } | { ok: false; error: ActionEligibilityError };

/** Steps 1–6. Every request property is read once, into a local. */
function validateRequest(request: unknown): ValidatedRequest {
  if (!isPlainObject(request)) return { ok: false, error: actionEligibilityError("INVALID_REQUEST", "NOT_AN_OBJECT") };
  const contract = request.contract;
  if (contract !== ACTION_ELIGIBILITY_CONTRACT) return { ok: false, error: actionEligibilityError("UNSUPPORTED_CONTRACT") };
  const version = request.version;
  if (version !== ACTION_ELIGIBILITY_VERSION) {
    return {
      ok: false,
      error: actionEligibilityError("UNSUPPORTED_CONTRACT_VERSION", "REQUESTED_VERSION_NOT_SUPPORTED", { supported_versions: [1] }),
    };
  }
  const operation = request.operation;
  if (operation !== "assess_review_actions") return { ok: false, error: actionEligibilityError("UNSUPPORTED_OPERATION") };
  const allowed: readonly string[] = ACTION_ELIGIBILITY_REQUEST_KEYS;
  const unknownNames = Object.keys(request).filter((name) => !allowed.includes(name));
  if (unknownNames.length > 0) return { ok: false, error: unrecognizedFields(unknownNames) };
  if (!Object.prototype.hasOwnProperty.call(request, "review_session_id")) {
    return { ok: false, error: actionEligibilityError("INVALID_REQUEST", "MISSING_FIELD", { fields: ["review_session_id"] }) };
  }
  const reviewSessionId = request.review_session_id;
  if (typeof reviewSessionId !== "string") {
    return { ok: false, error: actionEligibilityError("INVALID_REQUEST", "INVALID_FIELD_TYPE", { fields: ["review_session_id"] }) };
  }
  return { ok: true, reviewSessionId };
}

/** The observation time of the freshness fact an action actually evaluated, else `null`. */
function basisObservedAt(checks: readonly CheckResultV1[], basis: ReviewStateV1): string | null {
  const freshness = checks.find((check) => check.check === "freshness_aligned");
  if (freshness === undefined || freshness.outcome === "NOT_EVALUATED") return null;
  return basis.freshness.class === "DERIVED" ? basis.freshness.basis_observed_at : null;
}

function assessAction(entry: CatalogEntry, raw: ReviewSession, basis: ReviewStateV1): ActionAssessmentV1 {
  const checks = runChecks(entry.checks, (check) => evaluateCheck(check, entry, { raw, basis }));
  return {
    action_id: entry.action_id,
    executor: entry.executor,
    rule: entry.rule,
    disposition: dispositionOf(checks),
    reasons: reasonsOf(checks),
    checks,
    payload: { evaluation: entry.payload.evaluation, fields: [...entry.payload.fields] },
    basis_observed_at: basisObservedAt(checks, basis),
  };
}

export function assessActionEligibility(request: unknown, source: ControlReadSource, env: ActionEligibilityEnv): ActionEligibilityResult {
  const validated = validateRequest(request);
  if (!validated.ok) return validated.error;
  const bound = resolveBasis(validated.reviewSessionId, source);
  if (!bound.ok) return bound.error;
  const { raw, basis } = bound;
  const assessments = ACTION_CATALOG.map((entry) => assessAction(entry, raw, basis));
  const assessmentId = env.newAssessmentId();
  const generatedAt = env.now();
  return {
    contract: ACTION_ELIGIBILITY_CONTRACT,
    version: ACTION_ELIGIBILITY_VERSION,
    operation: "assess_review_actions",
    assessment_id: assessmentId,
    generated_at: generatedAt,
    authority: "NONE",
    scope: ASSESSMENT_SCOPE,
    revalidation: "REQUIRED_BEFORE_EXECUTION",
    basis: { contract: "dvcc.control-read", version: 1, operation: "get_review_state" },
    not_evaluated: [...NOT_EVALUATED_SCOPES],
    data: {
      review_session_id: basis.review_session_id,
      project_id: basis.project_id,
      current_round: raw.reviewRound,
      assessments,
    },
  };
}
