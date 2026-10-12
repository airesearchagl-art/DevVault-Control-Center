import { describe, expect, it, vi } from "vitest";
import * as persistence from "../../services/persistence";
import {
  assessOk,
  DECISION_SOURCES,
  ENV,
  ID_A,
  PROJECT_ID,
  successCorpus,
  T,
  type DecisionSourceName,
} from "../../test/actionEligibilityFixtures";
import type { ActionAssessmentV1, ActionEligibilityEnvelopeV1, ReasonCode } from "./contract";

vi.mock("../../services/persistence", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return Object.fromEntries(Object.entries(actual).map(([name, value]) => [name, typeof value === "function" ? vi.fn() : value]));
});

/** Annex D: DT (decision table) and S-01 … S-06 (strictness / limits), end to end through the entry point. */

type Actions = { SR: ActionAssessmentV1; CV: ActionAssessmentV1; SNR: ActionAssessmentV1 };

function actions(result: ActionEligibilityEnvelopeV1): Actions {
  const [SR, CV, SNR] = result.data.assessments;
  expect([SR.action_id, CV.action_id, SNR.action_id]).toEqual(["review.start_review", "review.confirm_verdict", "review.start_next_round"]);
  return { SR, CV, SNR };
}

function assess(name: DecisionSourceName): Actions {
  return actions(assessOk(DECISION_SOURCES[name]()));
}

function expectRefused(assessment: ActionAssessmentV1) {
  expect(assessment.disposition).toBe("BLOCKED");
  expect(assessment.reasons).toEqual(["REVIEW_STATE_NOT_ALLOWED"]);
  expect(assessment.checks[0]).toMatchObject({ check: "state_guard", outcome: "FAIL", reason: "REVIEW_STATE_NOT_ALLOWED" });
  for (const later of assessment.checks.slice(1)) expect(later).toEqual({ check: later.check, outcome: "NOT_EVALUATED", evidence_refs: [] });
}

function expectBlocked(assessment: ActionAssessmentV1, reason: ReasonCode, factReason?: string) {
  expect(assessment.disposition).toBe("BLOCKED");
  expect(assessment.reasons).toEqual([reason]);
  const failed = assessment.checks.find((check) => check.outcome === "FAIL");
  expect(failed?.reason).toBe(reason);
  expect(failed?.fact_reason).toBe(factReason);
}

function expectEligible(assessment: ActionAssessmentV1) {
  expect(assessment.disposition).toBe("ELIGIBLE_NOW");
  expect(assessment.reasons).toEqual([]);
  expect(assessment.checks.every((check) => check.outcome === "PASS")).toBe(true);
}

function expectNeedsHuman(assessment: ActionAssessmentV1) {
  expect(assessment.disposition).toBe("NEEDS_HUMAN");
  expect(assessment.reasons).toEqual(["HUMAN_DECISION_REQUIRED"]);
  expect(assessment.checks.slice(0, -1).every((check) => check.outcome === "PASS")).toBe(true);
  expect(assessment.checks[assessment.checks.length - 1]).toEqual({
    check: "human_decision",
    outcome: "NEEDS_HUMAN",
    reason: "HUMAN_DECISION_REQUIRED",
    evidence_refs: [],
  });
}

const REF = {
  state: `dvcc:review/${ID_A}/field/review-state`,
  project: `dvcc:project/${PROJECT_ID}`,
  expected: `dvcc:review/${ID_A}/round/1/expected-head`,
  observation: `dvcc:git-observation/${PROJECT_ID}/${T}`,
};

describe("DT — decision table", () => {
  it("DT-01 F-READY: start_review is eligible now, with the exact evidence it relied on", () => {
    const { SR, CV, SNR } = assess("F-READY");
    expectEligible(SR);
    expect(SR.checks).toEqual([
      { check: "state_guard", outcome: "PASS", evidence_refs: [REF.state] },
      { check: "project_registered", outcome: "PASS", evidence_refs: [REF.project] },
      { check: "expected_head_exact", outcome: "PASS", evidence_refs: [REF.expected] },
      { check: "freshness_aligned", outcome: "PASS", evidence_refs: [REF.observation, REF.expected] },
    ]);
    expect(SR.basis_observed_at).toBe(T);
    expect(SR.payload).toEqual({ evaluation: "NOT_APPLICABLE", fields: [] });
    expectRefused(CV);
    expectRefused(SNR);
  });

  it("DT-02 F-REV: confirm_verdict needs the Human decision, with its payload not evaluated", () => {
    const { SR, CV, SNR } = assess("F-REV");
    expectRefused(SR);
    expectNeedsHuman(CV);
    expect(CV.payload).toEqual({ evaluation: "NOT_EVALUATED", fields: ["verdict", "verdict_note", "human_confirmation"] });
    expectRefused(SNR);
  });

  it("DT-03-01 F-READY with a changed head: start_review is blocked (HEAD_CHANGED)", () => {
    const { SR, CV, SNR } = assess("DT-03-01");
    expectBlocked(SR, "HEAD_CHANGED");
    expectRefused(CV);
    expectRefused(SNR);
  });

  it("DT-03-02 F-REV reviewed at the new head with the old expected head: confirm_verdict is blocked (HEAD_CHANGED)", () => {
    const { SR, CV, SNR } = assess("DT-03-02");
    expectBlocked(CV, "HEAD_CHANGED");
    expectRefused(SR);
    expectRefused(SNR);
  });

  it("DT-04-01 F-READY with a dirty tree: start_review is blocked (WORKTREE_DIRTY)", () => {
    const { SR, CV, SNR } = assess("DT-04-01");
    expectBlocked(SR, "WORKTREE_DIRTY");
    expectRefused(CV);
    expectRefused(SNR);
  });

  it("DT-04-02 F-REV with a dirty tree: confirm_verdict is blocked and the Human decision is not evaluated", () => {
    const { SR, CV, SNR } = assess("DT-04-02");
    expectBlocked(CV, "WORKTREE_DIRTY");
    expect(CV.checks[5]).toEqual({ check: "human_decision", outcome: "NOT_EVALUATED", evidence_refs: [] });
    expectRefused(SR);
    expectRefused(SNR);
  });

  it("DT-04-03 F-FIX with a dirty tree: start_next_round does not depend on Git", () => {
    const { SR, CV, SNR } = assess("DT-04-03");
    expectEligible(SNR);
    expect(SNR.basis_observed_at).toBeNull();
    expectRefused(SR);
    expectRefused(CV);
  });

  it.each([
    { case_id: "DT-05-01", name: "DT-05-01" as const, headBound: "SR" as const },
    { case_id: "DT-05-02", name: "DT-05-02" as const, headBound: "CV" as const },
    { case_id: "DT-05-03", name: "DT-05-03" as const, headBound: null },
  ])("$case_id no observation: a head-bound action is blocked (FRESHNESS_UNKNOWN / NOT_OBSERVED)", ({ name, headBound }) => {
    const result = assess(name);
    if (headBound === null) {
      expectEligible(result.SNR);
      expectRefused(result.SR);
      expectRefused(result.CV);
      return;
    }
    expectBlocked(result[headBound], "FRESHNESS_UNKNOWN", "NOT_OBSERVED");
    expect(result[headBound].basis_observed_at).toBeNull();
    for (const other of (["SR", "CV", "SNR"] as const).filter((key) => key !== headBound)) expectRefused(result[other]);
  });

  it.each([
    { case_id: "DT-06-01", name: "DT-06-01" as const, headBound: "SR" as const },
    { case_id: "DT-06-02", name: "DT-06-02" as const, headBound: "CV" as const },
    { case_id: "DT-06-03", name: "DT-06-03" as const, headBound: "CV" as const },
  ])("$case_id an invalidated observation: the head-bound action is blocked (OBSERVATION_INVALIDATED)", ({ name, headBound }) => {
    const result = assess(name);
    expectBlocked(result[headBound], "FRESHNESS_UNKNOWN", "OBSERVATION_INVALIDATED");
    for (const other of (["SR", "CV", "SNR"] as const).filter((key) => key !== headBound)) expectRefused(result[other]);
  });

  it("DT-07-01 F-REV with no registered project: confirm_verdict is blocked after state and prerequisites pass", () => {
    const { SR, CV, SNR } = assess("DT-07-01");
    expectBlocked(CV, "PROJECT_NOT_REGISTERED", "PROJECT_NOT_REGISTERED");
    expect(CV.checks.slice(0, 2).map((check) => check.outcome)).toEqual(["PASS", "PASS"]);
    expectRefused(SR);
    expectRefused(SNR);
  });

  it("DT-07-02 F-FIX with no registered project: start_next_round is blocked", () => {
    const { SR, CV, SNR } = assess("DT-07-02");
    expectBlocked(SNR, "PROJECT_NOT_REGISTERED", "PROJECT_NOT_REGISTERED");
    expectRefused(SR);
    expectRefused(CV);
  });

  it("DT-08-01 SUSPENDED from REVIEWING: every action is refused by its state, later checks not evaluated", () => {
    const { SR, CV, SNR } = assess("DT-08-01");
    expectRefused(SR);
    expectRefused(CV);
    expectRefused(SNR);
  });

  it("DT-08-02 no result captured (VG row 1): confirm_verdict is blocked (RESULT_NOT_CAPTURED)", () => {
    const { SR, CV, SNR } = assess("DT-08-02");
    expectBlocked(CV, "RESULT_NOT_CAPTURED");
    expectRefused(SR);
    expectRefused(SNR);
  });

  it("DT-08-03 Turn 2 sent without a Final Judgment (VG row 3): confirm_verdict is blocked (FINAL_JUDGMENT_NOT_CAPTURED)", () => {
    const { SR, CV, SNR } = assess("DT-08-03");
    expectBlocked(CV, "FINAL_JUDGMENT_NOT_CAPTURED");
    expect(CV.checks[1].evidence_refs).toEqual([`dvcc:review/${ID_A}/round/1/judgment`]);
    expectRefused(SR);
    expectRefused(SNR);
  });

  it.each([
    { case_id: "DT-08-04", name: "DT-08-04" as const },
    { case_id: "DT-08-05", name: "DT-08-05" as const },
    { case_id: "DT-08-06", name: "DT-08-06" as const },
  ])("$case_id an allowed verdict-gate row: confirm_verdict needs the Human decision", ({ name }) => {
    const { SR, CV, SNR } = assess(name);
    expectNeedsHuman(CV);
    expectRefused(SR);
    expectRefused(SNR);
  });

  it("DT-09 no success output mixes FAIL with NEEDS_HUMAN; only the Human decision needs the Human; confirm_verdict is never eligible now", () => {
    for (const { name, source } of successCorpus()) {
      for (const assessment of assessOk(source).data.assessments) {
        const outcomes = assessment.checks.map((check) => check.outcome);
        expect(outcomes.includes("FAIL") && outcomes.includes("NEEDS_HUMAN"), name).toBe(false);
        for (const check of assessment.checks) {
          if (check.outcome === "NEEDS_HUMAN") expect(check.check, name).toBe("human_decision");
        }
        if (assessment.action_id === "review.confirm_verdict") expect(assessment.disposition, name).not.toBe("ELIGIBLE_NOW");
      }
    }
  });

  it.each([
    { case_id: "DT-10-01", name: "DT-10-01" as const },
    { case_id: "DT-10-02", name: "DT-10-02" as const },
    { case_id: "DT-10-03", name: "DT-10-03" as const },
  ])("$case_id a verdict state without its durable confirmation: start_next_round is blocked", ({ name }) => {
    const { SR, CV, SNR } = assess(name);
    expectBlocked(SNR, "VERDICT_CONFIRMATION_NOT_RECORDED");
    expect(SNR.checks[2].evidence_refs).toEqual([REF.state]);
    expectRefused(SR);
    expectRefused(CV);
  });

  it("DT-12 a PR number does not change any assessment; external gates are not evaluated", () => {
    const withPr = assessOk(DECISION_SOURCES["DT-12"]());
    const withoutPr = assessOk(DECISION_SOURCES["F-REV"]());
    expect(withPr.data.assessments).toEqual(withoutPr.data.assessments);
    expect(withPr.not_evaluated).toContain("EXTERNAL_GATES");
  });

  it.each([
    { case_id: "DT-14-01", name: "DT-14-01" as const, headBound: "SR" as const },
    { case_id: "DT-14-02", name: "DT-14-02" as const, headBound: "CV" as const },
  ])("$case_id an observation time that is not a time: the head-bound action is blocked (EVIDENCE_INCOMPLETE)", ({ name, headBound }) => {
    const result = assess(name);
    expectBlocked(result[headBound], "EVIDENCE_INCOMPLETE", "INVALID_SOURCE_VALUE");
    for (const other of (["SR", "CV", "SNR"] as const).filter((key) => key !== headBound)) expectRefused(result[other]);
  });

  it("DT-16 two calls give the same data with different identifiers and touch no persistence API", () => {
    const first = assessOk(DECISION_SOURCES["DT-05-01"](), ENV);
    const second = assessOk(DECISION_SOURCES["DT-05-01"](), { now: () => "2026-10-11T03:00:00.000Z", newAssessmentId: () => "assess-second" });
    expect(second.data).toEqual(first.data);
    expect(second.assessment_id).not.toBe(first.assessment_id);
    for (const value of Object.values(persistence)) {
      if (vi.isMockFunction(value)) expect(value).not.toHaveBeenCalled();
    }
  });
});

describe("S — exact heads and limits", () => {
  it("S-01 a short expected head blocks start_review (EXPECTED_HEAD_NOT_EXACT)", () => {
    expectBlocked(assess("S-01").SR, "EXPECTED_HEAD_NOT_EXACT");
  });

  it("S-02 no expected head blocks start_review (EXPECTED_HEAD_NOT_RECORDED / NOTHING_RECORDED)", () => {
    expectBlocked(assess("S-02").SR, "EXPECTED_HEAD_NOT_RECORDED", "NOTHING_RECORDED");
  });

  it("S-03 no reviewed head blocks confirm_verdict (REVIEWED_HEAD_NOT_RECORDED)", () => {
    expectBlocked(assess("S-03").CV, "REVIEWED_HEAD_NOT_RECORDED", "NOTHING_RECORDED");
  });

  it("S-04 a short reviewed head blocks confirm_verdict (REVIEWED_HEAD_NOT_EXACT)", () => {
    expectBlocked(assess("S-04").CV, "REVIEWED_HEAD_NOT_EXACT");
  });

  it("S-05 a stale review blocks confirm_verdict (REVIEW_STALE)", () => {
    expectBlocked(assess("S-05").CV, "REVIEW_STALE");
  });

  it("S-06-01 at the round limit start_next_round is blocked (ROUND_LIMIT_REACHED)", () => {
    expectBlocked(assess("S-06-01").SNR, "ROUND_LIMIT_REACHED");
  });

  it("S-06-02 one round below the limit start_next_round is eligible now", () => {
    expectEligible(assess("S-06-02").SNR);
  });
});
