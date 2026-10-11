import { actionRefusal } from "../actionRefusal";
import type { BlockedReason, Fact, FreshnessValue, PresenceFact, ReviewStateV1, RoundStateV1, UnknownReason } from "../controlRead/contract";
import { projectRef, type EvidenceRef } from "../controlRead/evidenceRef";
import { headBinding } from "../headBinding";
import type { Message } from "../message";
import type { ReviewSession } from "../review";
import type { ReviewState } from "../states";
import { guardAction } from "../transitions";
import type { CatalogEntry } from "./catalog";
import type { CheckId, CheckOutcome, CheckResultV1, Disposition, ReasonCode } from "./contract";

/**
 * Action Eligibility v1 checks (Phase 5B, Annex A5 / A6 / A8). Pure.
 *
 * Every domain decision is asked of the domain function the Human UI asks (`guardAction`,
 * `actionRefusal`, `headBinding`); every fact is the Control Read v1 fact, used as it is. A check
 * that cannot cite what it relied on does not pass, and an `UNKNOWN` or `BLOCKED` fact is never
 * read as a pass. The first `FAIL` stops the action's evaluation.
 */

function result(
  check: CheckId,
  outcome: CheckOutcome,
  evidenceRefs: readonly EvidenceRef[],
  reason?: ReasonCode,
  factReason?: UnknownReason | BlockedReason,
): CheckResultV1 {
  return {
    check,
    outcome,
    ...(reason === undefined ? {} : { reason }),
    ...(factReason === undefined ? {} : { fact_reason: factReason }),
    evidence_refs: [...evidenceRefs],
  };
}

/** Citability first: a pass that cannot cite a reference is incomplete evidence, not a pass. */
function pass(check: CheckId, evidenceRefs: readonly EvidenceRef[]): CheckResultV1 {
  return evidenceRefs.length > 0 ? result(check, "PASS", evidenceRefs) : result(check, "FAIL", [], "EVIDENCE_INCOMPLETE");
}

function fail(check: CheckId, reason: ReasonCode, evidenceRefs: readonly EvidenceRef[] = [], factReason?: UnknownReason | BlockedReason): CheckResultV1 {
  return result(check, "FAIL", evidenceRefs, reason, factReason);
}

/** A fact whose class is not one the check knows is incomplete evidence (fail closed). */
function incomplete(check: CheckId): CheckResultV1 {
  return fail(check, "EVIDENCE_INCOMPLETE");
}

function refusalReason(table: ReadonlyMap<string, ReasonCode>, refusal: Message): ReasonCode {
  return table.get(refusal.key) ?? "DOMAIN_REFUSED_OTHER";
}

const STATE_GUARD_REASONS: ReadonlyMap<string, ReasonCode> = new Map([
  ["action.notAllowed", "REVIEW_STATE_NOT_ALLOWED"],
  ["action.roundLimit", "ROUND_LIMIT_REACHED"],
]);

const VERDICT_PREREQUISITE_REASONS: ReadonlyMap<string, ReasonCode> = new Map([
  ["action.verdict.resultRequired", "RESULT_NOT_CAPTURED"],
  ["action.verdict.judgmentRequired", "FINAL_JUDGMENT_NOT_CAPTURED"],
]);

/** `state_guard`: the domain's state-level guard, cited by the review state it was asked about. */
export function stateGuardResult(reviewState: Fact<ReviewState>, refusal: Message | null): CheckResultV1 {
  if (reviewState.class === "BLOCKED") return fail("state_guard", "EVIDENCE_INCOMPLETE", [], reviewState.blocked_reason);
  if (reviewState.class !== "HUMAN_CONFIRMED") return incomplete("state_guard");
  const refs = [reviewState.evidence_ref];
  return refusal === null ? pass("state_guard", refs) : fail("state_guard", refusalReason(STATE_GUARD_REASONS, refusal), refs);
}

function presenceRefs(fact: PresenceFact | undefined): EvidenceRef[] {
  return fact !== undefined && Array.isArray(fact.derived_from) ? fact.derived_from : [];
}

/**
 * `verdict_prerequisites`: the domain's own refusal of `confirmVerdict` for this round, cross-checked
 * against the result-presence fact so that a pass always rests on a recorded result.
 */
export function verdictPrerequisitesResult(round: RoundStateV1, refusal: Message | null): CheckResultV1 {
  const resultRefs = presenceRefs(round.result_captured);
  const judgmentRefs = presenceRefs(round.judgment_captured);
  if (refusal !== null) {
    const reason = refusalReason(VERDICT_PREREQUISITE_REASONS, refusal);
    const refs = reason === "FINAL_JUDGMENT_NOT_CAPTURED" ? judgmentRefs : reason === "RESULT_NOT_CAPTURED" ? resultRefs : [];
    return fail("verdict_prerequisites", reason, refs);
  }
  if (round.result_captured?.value !== true || resultRefs.length === 0) return incomplete("verdict_prerequisites");
  const refs = round.judgment_captured?.value === true ? [...resultRefs, ...judgmentRefs] : resultRefs;
  return pass("verdict_prerequisites", refs);
}

/** `project_registered`: the review's project is in the registry (Control Read's own answer). */
export function projectRegisteredResult(freshness: Fact<FreshnessValue>, projectId: string): CheckResultV1 {
  if (freshness.class === "UNKNOWN" && freshness.unknown_reason === "PROJECT_NOT_REGISTERED") {
    return fail("project_registered", "PROJECT_NOT_REGISTERED", [], "PROJECT_NOT_REGISTERED");
  }
  const ref = projectRef(projectId);
  return ref === null ? incomplete("project_registered") : pass("project_registered", [ref]);
}

interface HeadReasons {
  notRecorded: ReasonCode;
  notExact: ReasonCode;
}

function headResult(check: CheckId, fact: Fact<string> & { binding?: string }, exact: boolean, reasons: HeadReasons): CheckResultV1 {
  switch (fact.class) {
    case "HUMAN_CONFIRMED":
      return exact ? pass(check, [fact.evidence_ref]) : fail(check, reasons.notExact, [fact.evidence_ref]);
    case "UNKNOWN":
      // C-01: only "nothing recorded" is a missing head; any other unknown is incomplete evidence.
      return fact.unknown_reason === "NOTHING_RECORDED"
        ? fail(check, reasons.notRecorded, [], fact.unknown_reason)
        : fail(check, "EVIDENCE_INCOMPLETE", [], fact.unknown_reason);
    case "BLOCKED":
      return fail(check, "EVIDENCE_INCOMPLETE", [], fact.blocked_reason);
    default:
      return incomplete(check);
  }
}

/** `expected_head_exact`: the recorded expected HEAD is a full commit SHA (Control Read's binding). */
export function expectedHeadResult(fact: RoundStateV1["expected_head"]): CheckResultV1 {
  const exact = fact.class === "HUMAN_CONFIRMED" && fact.binding === "EXACT";
  return headResult("expected_head_exact", fact, exact, { notRecorded: "EXPECTED_HEAD_NOT_RECORDED", notExact: "EXPECTED_HEAD_NOT_EXACT" });
}

/** `reviewed_head_exact`: the recorded reviewed HEAD is a full commit SHA (the domain's `headBinding`). */
export function reviewedHeadResult(fact: RoundStateV1["reviewed_head"]): CheckResultV1 {
  const exact = fact.class === "HUMAN_CONFIRMED" && headBinding(fact.value) === "EXACT";
  return headResult("reviewed_head_exact", fact, exact, { notRecorded: "REVIEWED_HEAD_NOT_RECORDED", notExact: "REVIEWED_HEAD_NOT_EXACT" });
}

const NOT_ALIGNED: ReadonlyMap<FreshnessValue, ReasonCode> = new Map([
  ["HEAD_CHANGED", "HEAD_CHANGED"],
  ["REVIEW_STALE", "REVIEW_STALE"],
  ["WORKTREE_DIRTY", "WORKTREE_DIRTY"],
]);

/** `freshness_aligned`: Control Read's derived freshness is `ALIGNED`; nothing else passes. */
export function freshnessAlignedResult(freshness: Fact<FreshnessValue>): CheckResultV1 {
  switch (freshness.class) {
    case "DERIVED": {
      if (freshness.value === "ALIGNED") return pass("freshness_aligned", freshness.derived_from);
      const reason = NOT_ALIGNED.get(freshness.value);
      return reason === undefined ? incomplete("freshness_aligned") : fail("freshness_aligned", reason, freshness.derived_from);
    }
    case "UNKNOWN":
      return fail("freshness_aligned", "FRESHNESS_UNKNOWN", [], freshness.unknown_reason);
    case "BLOCKED":
      return fail("freshness_aligned", "EVIDENCE_INCOMPLETE", [], freshness.blocked_reason);
    default:
      return incomplete("freshness_aligned");
  }
}

/** `verdict_confirmation_recorded`: the review state carries a durable verdict confirmation (EXPLICIT). */
export function verdictConfirmationResult(reviewState: Fact<ReviewState>, verdict: RoundStateV1["verdict"] | undefined): CheckResultV1 {
  if (reviewState.class === "BLOCKED") return fail("verdict_confirmation_recorded", "EVIDENCE_INCOMPLETE", [], reviewState.blocked_reason);
  if (reviewState.class !== "HUMAN_CONFIRMED") return incomplete("verdict_confirmation_recorded");
  if (reviewState.confirmation !== "EXPLICIT") {
    return fail("verdict_confirmation_recorded", "VERDICT_CONFIRMATION_NOT_RECORDED", [reviewState.evidence_ref]);
  }
  const refs = verdict !== undefined && verdict.class === "HUMAN_CONFIRMED" ? [reviewState.evidence_ref, verdict.evidence_ref] : [reviewState.evidence_ref];
  return pass("verdict_confirmation_recorded", refs);
}

/** `human_decision`: the action's own Human path supplies it at run time; never assumed here. */
export function humanDecisionResult(): CheckResultV1 {
  return result("human_decision", "NEEDS_HUMAN", [], "HUMAN_DECISION_REQUIRED");
}

export interface CheckContext {
  raw: ReviewSession;
  basis: ReviewStateV1;
}

export function evaluateCheck(check: CheckId, entry: CatalogEntry, context: CheckContext): CheckResultV1 {
  const { raw, basis } = context;
  const round = basis.rounds[0];
  switch (check) {
    case "state_guard":
      return stateGuardResult(basis.review_state, guardAction(raw, entry.domain_type));
    case "verdict_prerequisites":
      return verdictPrerequisitesResult(round, actionRefusal(raw, "confirmVerdict"));
    case "project_registered":
      return projectRegisteredResult(basis.freshness, basis.project_id);
    case "expected_head_exact":
      return expectedHeadResult(round.expected_head);
    case "reviewed_head_exact":
      return reviewedHeadResult(round.reviewed_head);
    case "freshness_aligned":
      return freshnessAlignedResult(basis.freshness);
    case "verdict_confirmation_recorded":
      return verdictConfirmationResult(basis.review_state, round.verdict);
    case "human_decision":
      return humanDecisionResult();
  }
}

const NEEDS_HUMAN_CAPABLE: ReadonlySet<CheckId> = new Set<CheckId>(["human_decision"]);

/**
 * Evaluates the checks in their fixed order and stops at the first `FAIL`: every later check is
 * `NOT_EVALUATED` with no references. A `NEEDS_HUMAN` from a check outside the NH admissibility rule
 * is refused as incomplete evidence.
 */
export function runChecks(checks: readonly CheckId[], evaluate: (check: CheckId) => CheckResultV1): CheckResultV1[] {
  const results: CheckResultV1[] = [];
  let stopped = false;
  for (const check of checks) {
    if (stopped) {
      results.push(result(check, "NOT_EVALUATED", []));
      continue;
    }
    let evaluated = evaluate(check);
    if (evaluated.outcome === "NEEDS_HUMAN" && !NEEDS_HUMAN_CAPABLE.has(check)) evaluated = incomplete(check);
    results.push(evaluated);
    if (evaluated.outcome === "FAIL") stopped = true;
  }
  return results;
}

/** Any `FAIL` blocks; otherwise any `NEEDS_HUMAN` needs the Human; only all-`PASS` is eligible now. */
export function dispositionOf(checks: readonly Pick<CheckResultV1, "outcome">[]): Disposition {
  if (checks.some((check) => check.outcome === "FAIL")) return "BLOCKED";
  if (checks.some((check) => check.outcome === "NEEDS_HUMAN")) return "NEEDS_HUMAN";
  return checks.length > 0 && checks.every((check) => check.outcome === "PASS") ? "ELIGIBLE_NOW" : "BLOCKED";
}

/** The reasons of the non-passing checks, in check order. */
export function reasonsOf(checks: readonly CheckResultV1[]): ReasonCode[] {
  return checks.flatMap((check) => (check.reason === undefined ? [] : [check.reason]));
}
