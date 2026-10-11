import { describe, expect, it } from "vitest";
import { assessOk, fRev, ID_A, PROJECT_ID, sourceOf, successCorpus } from "../../test/actionEligibilityFixtures";
import { BLOCKED_REASONS, UNKNOWN_REASONS, type BlockedFact, type Envelope, type ReviewStateV1, type UnknownFact } from "../controlRead/contract";
import { projectRef, type EvidenceRef } from "../controlRead/evidenceRef";
import { readControl } from "../controlRead/readControl";
import type { Message } from "../message";
import { ACTION_CATALOG } from "./catalog";
import {
  dispositionOf,
  expectedHeadResult,
  freshnessAlignedResult,
  projectRegisteredResult,
  reasonsOf,
  reviewedHeadResult,
  runChecks,
  stateGuardResult,
  verdictConfirmationResult,
  verdictPrerequisitesResult,
} from "./checks";
import type { CheckId, CheckOutcome, CheckResultV1 } from "./contract";

/** Annex D: S-07 (unmapped refusals), S-08 (UNKNOWN / BLOCKED facts per check) and CHK (check mechanics). */

function basisOf(): ReviewStateV1 {
  const result = readControl({ contract: "dvcc.control-read", version: 1, operation: "get_review_state", review_session_id: ID_A }, sourceOf(fRev()), {
    now: () => "2026-10-11T00:00:00.000Z",
    newSnapshotId: () => "snap-test",
  });
  if ("error" in result) throw new Error("fixture basis");
  return (result as Envelope<ReviewStateV1>).data;
}

const UNMAPPED = { key: "x.unmapped" } as unknown as Message;

describe("S-07 — a refusal outside the closed tables is never a pass", () => {
  it("S-07-01 state_guard given an unmapped refusal fails with DOMAIN_REFUSED_OTHER", () => {
    const result = stateGuardResult(basisOf().review_state, UNMAPPED);
    expect(result).toMatchObject({ check: "state_guard", outcome: "FAIL", reason: "DOMAIN_REFUSED_OTHER" });
    expect(reasonsOf([result])).toEqual(["DOMAIN_REFUSED_OTHER"]);
  });

  it("S-07-02 verdict_prerequisites given an unmapped refusal fails with DOMAIN_REFUSED_OTHER", () => {
    const result = verdictPrerequisitesResult(basisOf().rounds[0], UNMAPPED);
    expect(result).toMatchObject({ check: "verdict_prerequisites", outcome: "FAIL", reason: "DOMAIN_REFUSED_OTHER" });
    expect(reasonsOf([result])).toEqual(["DOMAIN_REFUSED_OTHER"]);
  });
});

const FACTS: (UnknownFact | BlockedFact)[] = [
  ...UNKNOWN_REASONS.map((reason): UnknownFact => ({ class: "UNKNOWN", unknown_reason: reason })),
  ...BLOCKED_REASONS.map((reason): BlockedFact => ({ class: "BLOCKED", blocked_reason: reason })),
];
const factReason = (fact: UnknownFact | BlockedFact) => (fact.class === "UNKNOWN" ? fact.unknown_reason : fact.blocked_reason);
const rows = (prefix: string, facts: (UnknownFact | BlockedFact)[] = FACTS) => facts.map((fact) => ({ case_id: `${prefix}-${factReason(fact)}`, fact }));

describe("S-08 — UNKNOWN and BLOCKED facts never pass", () => {
  it.each(rows("S-08-FR"))("$case_id freshness_aligned", ({ fact }) => {
    expect(freshnessAlignedResult(fact)).toEqual({
      check: "freshness_aligned",
      outcome: "FAIL",
      reason: fact.class === "UNKNOWN" ? "FRESHNESS_UNKNOWN" : "EVIDENCE_INCOMPLETE",
      fact_reason: factReason(fact),
      evidence_refs: [],
    });
  });

  it.each(rows("S-08-EH"))("$case_id expected_head_exact (C-01)", ({ fact }) => {
    const notRecorded = fact.class === "UNKNOWN" && fact.unknown_reason === "NOTHING_RECORDED";
    expect(expectedHeadResult(fact)).toEqual({
      check: "expected_head_exact",
      outcome: "FAIL",
      reason: notRecorded ? "EXPECTED_HEAD_NOT_RECORDED" : "EVIDENCE_INCOMPLETE",
      fact_reason: factReason(fact),
      evidence_refs: [],
    });
  });

  it.each(rows("S-08-RH"))("$case_id reviewed_head_exact (C-01)", ({ fact }) => {
    const notRecorded = fact.class === "UNKNOWN" && fact.unknown_reason === "NOTHING_RECORDED";
    expect(reviewedHeadResult(fact)).toEqual({
      check: "reviewed_head_exact",
      outcome: "FAIL",
      reason: notRecorded ? "REVIEWED_HEAD_NOT_RECORDED" : "EVIDENCE_INCOMPLETE",
      fact_reason: factReason(fact),
      evidence_refs: [],
    });
  });

  it.each(rows("S-08-PR"))("$case_id project_registered", ({ fact }) => {
    const absent = fact.class === "UNKNOWN" && fact.unknown_reason === "PROJECT_NOT_REGISTERED";
    expect(projectRegisteredResult(fact, PROJECT_ID)).toEqual(
      absent
        ? { check: "project_registered", outcome: "FAIL", reason: "PROJECT_NOT_REGISTERED", fact_reason: "PROJECT_NOT_REGISTERED", evidence_refs: [] }
        : { check: "project_registered", outcome: "PASS", evidence_refs: [`dvcc:project/${PROJECT_ID}`] },
    );
  });

  const blockedOnly = FACTS.filter((fact): fact is BlockedFact => fact.class === "BLOCKED");

  it.each(rows("S-08-VC", blockedOnly))("$case_id verdict_confirmation_recorded", ({ fact }) => {
    expect(verdictConfirmationResult(fact as BlockedFact, undefined)).toEqual({
      check: "verdict_confirmation_recorded",
      outcome: "FAIL",
      reason: "EVIDENCE_INCOMPLETE",
      fact_reason: factReason(fact),
      evidence_refs: [],
    });
  });

  it.each(rows("S-08-SG", blockedOnly))("$case_id state_guard", ({ fact }) => {
    expect(stateGuardResult(fact as BlockedFact, null)).toEqual({
      check: "state_guard",
      outcome: "FAIL",
      reason: "EVIDENCE_INCOMPLETE",
      fact_reason: factReason(fact),
      evidence_refs: [],
    });
  });
});

describe("CHK — check mechanics", () => {
  it("CHK-VPX-01 a domain pass without a captured result is incomplete evidence", () => {
    const round = basisOf().rounds[0];
    const result = verdictPrerequisitesResult({ ...round, result_captured: { ...round.result_captured, value: false } }, null);
    expect(result).toEqual({ check: "verdict_prerequisites", outcome: "FAIL", reason: "EVIDENCE_INCOMPLETE", evidence_refs: [] });
  });

  it("CHK-VPX-02 a domain pass whose result cannot be cited is incomplete evidence", () => {
    const round = basisOf().rounds[0];
    const result = verdictPrerequisitesResult({ ...round, result_captured: { ...round.result_captured, derived_from: [] } }, null);
    expect(result).toEqual({ check: "verdict_prerequisites", outcome: "FAIL", reason: "EVIDENCE_INCOMPLETE", evidence_refs: [] });
  });

  it.each([
    { case_id: "CHK-PREC-01", outcomes: ["PASS", "PASS"], expected: "ELIGIBLE_NOW" },
    { case_id: "CHK-PREC-02", outcomes: ["FAIL", "NOT_EVALUATED"], expected: "BLOCKED" },
    { case_id: "CHK-PREC-03", outcomes: ["PASS", "NEEDS_HUMAN"], expected: "NEEDS_HUMAN" },
    { case_id: "CHK-PREC-04", outcomes: ["FAIL", "NEEDS_HUMAN"], expected: "BLOCKED" },
    { case_id: "CHK-PREC-05", outcomes: ["NEEDS_HUMAN", "FAIL"], expected: "BLOCKED" },
  ] as { case_id: string; outcomes: CheckOutcome[]; expected: string }[])("$case_id disposition precedence", ({ outcomes, expected }) => {
    expect(dispositionOf(outcomes.map((outcome) => ({ outcome })))).toBe(expected);
  });

  const ref = projectRef(PROJECT_ID) as EvidenceRef;
  const shapeRows = ACTION_CATALOG.flatMap((entry) => {
    const label = entry.action_id === "review.start_review" ? "SR" : entry.action_id === "review.confirm_verdict" ? "CV" : "SNR";
    const positions = entry.checks.filter((check) => check !== "human_decision");
    return positions.map((_, index) => ({ case_id: `CHK-SHAPE-${label}${index + 1}`, checks: entry.checks, position: index }));
  });

  it.each(shapeRows)("$case_id the first FAIL stops evaluation", ({ checks, position }) => {
    const evaluated: CheckId[] = [];
    const results = runChecks(checks, (check): CheckResultV1 => {
      evaluated.push(check);
      return checks.indexOf(check) === position
        ? { check, outcome: "FAIL", reason: "DOMAIN_REFUSED_OTHER", evidence_refs: [] }
        : { check, outcome: "PASS", evidence_refs: [ref] };
    });
    expect(evaluated).toEqual(checks.slice(0, position + 1));
    expect(results.map((result) => result.check)).toEqual([...checks]);
    results.slice(0, position).forEach((result) => expect(result.outcome).toBe("PASS"));
    for (const later of results.slice(position + 1)) expect(later).toEqual({ check: later.check, outcome: "NOT_EVALUATED", evidence_refs: [] });
    expect(reasonsOf(results)).toEqual(["DOMAIN_REFUSED_OTHER"]);
    expect(dispositionOf(results)).toBe("BLOCKED");
  });

  it("CHK-ORD-CV a state refusal precedes the verdict prerequisites", () => {
    const source = sourceOf(fRev({ resultCapturedAt: null, reviewedHead: null }, { reviewState: "SUSPENDED", suspendedFrom: "REVIEWING" }));
    const confirm = assessOk(source).data.assessments[1];
    expect(confirm.reasons).toEqual(["REVIEW_STATE_NOT_ALLOWED"]);
    expect(confirm.checks[1]).toEqual({ check: "verdict_prerequisites", outcome: "NOT_EVALUATED", evidence_refs: [] });
  });

  it("CHK-CITE every pass cites a 5A reference, and nothing not evaluated cites one", () => {
    const pid = "[a-z0-9][a-z0-9-]{1,63}";
    const rid = "rv-\\d{8}-[a-z0-9]{6}";
    const grammar = [
      new RegExp(`^dvcc:project/${pid}$`),
      new RegExp(`^dvcc:project/${pid}/(repository|local-root)$`),
      new RegExp(`^dvcc:review/${rid}$`),
      new RegExp(`^dvcc:review/${rid}/field/(review-state|resource-state|pr-number)$`),
      new RegExp(`^dvcc:review/${rid}/round/[1-9]\\d{0,2}/(expected-head|reviewed-head|result|verdict|judgment|risk-tier)$`),
      new RegExp(`^dvcc:git-observation/${pid}/\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,3})?Z$`),
    ];
    let passes = 0;
    for (const { name, source } of successCorpus()) {
      for (const assessment of assessOk(source).data.assessments) {
        for (const check of assessment.checks) {
          if (check.outcome === "PASS") {
            passes += 1;
            expect(check.evidence_refs.length, `${name} ${check.check}`).toBeGreaterThan(0);
          }
          if (check.outcome === "NOT_EVALUATED") expect(check.evidence_refs, `${name} ${check.check}`).toEqual([]);
          for (const value of check.evidence_refs) expect(grammar.some((pattern) => pattern.test(value)), `${name} ${value}`).toBe(true);
        }
      }
    }
    expect(passes).toBeGreaterThan(0);
  });
});
