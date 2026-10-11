import { describe, expect, it } from "vitest";
import { FRESHNESS_CONTRACT } from "../../test/freshnessContract";
import { ORACLE_REVIEW_STATES, TRANSITION_CONTRACT } from "../../test/transitionContract";
import { VERDICT_GATE_TABLE } from "../../test/workflowContract";
import {
  assessOk,
  DECISION_SOURCES,
  fRev,
  H,
  ID_A,
  PROJECT_ID,
  sourceOf,
  successCorpus,
  T,
  type DecisionSourceName,
} from "../../test/actionEligibilityFixtures";
import { actionRefusal } from "../actionRefusal";
import type { ControlReadSource, Envelope, ReviewStateV1 } from "../controlRead/contract";
import { readControl } from "../controlRead/readControl";
import type { ReviewSession } from "../review";
import type { ReviewState } from "../states";
import { applyReviewAction } from "../transitions";
import { freshnessAlignedResult } from "./checks";
import type { ActionAssessmentV1, CheckResultV1 } from "./contract";

/**
 * Annex D: P-02 (probe independence) and PAR (parity with the independent oracles and with Control
 * Read). P-03, PAR-PR and PAR-UI are profile F (deferred under PILOT_FOCUSED, QD-5B-15 … 17).
 */

function controlRead(source: ControlReadSource): ReviewStateV1 {
  const result = readControl({ contract: "dvcc.control-read", version: 1, operation: "get_review_state", review_session_id: ID_A }, source, {
    now: () => "2026-10-11T00:00:00.000Z",
    newSnapshotId: () => "snap-test",
  });
  if ("error" in result) throw new Error(`fixture basis: ${JSON.stringify(result.error)}`);
  return (result as Envelope<ReviewStateV1>).data;
}

const VG_ROWS = VERDICT_GATE_TABLE.slice(0, 5);

function verdictGateSession(row: (typeof VG_ROWS)[number]): ReviewSession {
  return fRev({
    resultCapturedAt: row.resultCapturedAt,
    reviewedHead: row.resultCapturedAt === null ? null : H,
    followupSavedAt: row.followupSavedAt,
    judgmentCapturedAt: row.judgmentCapturedAt,
  });
}

describe("P-02 — prerequisite refusals do not depend on the probe verdict", () => {
  const rows = VG_ROWS.flatMap((row, index) =>
    (["FIX_REQUIRED", "REVIEW_PASS"] as const).map((verdict, offset) => ({
      case_id: `P-02-${String(index * 2 + offset + 1).padStart(2, "0")}`,
      row,
      verdict,
    })),
  );

  it.each(rows)("$case_id the refusal for this verdict equals the probe's refusal", ({ row, verdict }) => {
    const session = verdictGateSession(row);
    const applied = applyReviewAction(session, { type: "confirmVerdict", verdict, note: null, confirmedByHuman: true }, "2026-10-11T02:00:00.000Z");
    const refusalKey = applied.ok ? null : applied.error.key;
    expect(refusalKey).toBe(actionRefusal(session, "confirmVerdict")?.key ?? null);
    expect(refusalKey).toBe(row.refusal);
  });

  it("P-02-11 no success output names a verdict value", () => {
    for (const { name, source } of successCorpus()) {
      const text = JSON.stringify(assessOk(source));
      expect(text, name).not.toContain("FIX_REQUIRED");
      expect(text, name).not.toContain("REVIEW_PASS");
    }
  });
});

const ACTIONS = ["startReview", "confirmVerdict", "startNextRound"] as const;

describe("PAR-TC — state_guard agrees with the transition contract", () => {
  const rows = ORACLE_REVIEW_STATES.flatMap((state) =>
    ACTIONS.map((action, index) => ({ case_id: `PAR-TC-${state}-${action}`, state, action, index })),
  );

  it.each(rows)("$case_id", ({ state, action, index }) => {
    const allowed = TRANSITION_CONTRACT.filter((row) => row.action === action).some((row) => row.from.includes(state));
    const session = fRev({}, { reviewState: state as ReviewState, suspendedFrom: state === "SUSPENDED" ? "REVIEWING" : null });
    const guard = assessOk(sourceOf(session)).data.assessments[index].checks[0];
    expect(guard.check).toBe("state_guard");
    expect(guard.outcome).toBe(allowed ? "PASS" : "FAIL");
    if (!allowed) expect(guard.reason).toBe("REVIEW_STATE_NOT_ALLOWED");
  });
});

describe("PAR-VG — verdict_prerequisites agrees with the verdict gate table", () => {
  const REFUSAL_REASON: Record<string, string> = {
    "action.verdict.resultRequired": "RESULT_NOT_CAPTURED",
    "action.verdict.judgmentRequired": "FINAL_JUDGMENT_NOT_CAPTURED",
  };

  it.each(VG_ROWS.map((row, index) => ({ case_id: `PAR-VG-${String(index + 1).padStart(2, "0")}`, row })))("$case_id $row.label", ({ row }) => {
    const prerequisites = assessOk(sourceOf(verdictGateSession(row))).data.assessments[1].checks[1];
    expect(prerequisites.check).toBe("verdict_prerequisites");
    if (row.allowed) expect(prerequisites.outcome).toBe("PASS");
    else expect(prerequisites).toMatchObject({ outcome: "FAIL", reason: REFUSAL_REASON[row.refusal as string] });
  });
});

describe("PAR-FR — freshness_aligned agrees with the freshness contract", () => {
  const SAME_NAMED = ["WORKTREE_DIRTY", "REVIEW_STALE", "HEAD_CHANGED"];

  it.each(FRESHNESS_CONTRACT.map((row, index) => ({ case_id: `PAR-FR-${String(index + 1).padStart(2, "0")}`, row })))("$case_id $row.label", ({ row }) => {
    const session = fRev({ expectedHead: row.expectedHead, reviewedHead: row.reviewedHead });
    const observations =
      row.observation === null
        ? {}
        : {
            [PROJECT_ID]: {
              localRoot: "/synthetic/alpha",
              projectCreatedAt: "2026-10-01T00:00:00.000Z",
              observation: {
                status: row.observation.status as "OK",
                head: row.observation.head,
                dirty: row.observation.dirty,
                branch: null,
                detached: false,
                observedAt: T,
                ...(row.observation.errorMessage === undefined ? {} : { errorMessage: row.observation.errorMessage }),
              },
            },
          };
    const result = freshnessAlignedResult(controlRead(sourceOf(session, { gitObservations: observations })).freshness);
    if (row.expected === "ALIGNED") expect(result.outcome).toBe("PASS");
    else if (SAME_NAMED.includes(row.expected)) expect(result).toMatchObject({ outcome: "FAIL", reason: row.expected });
    else expect(result).toMatchObject({ outcome: "FAIL", reason: "FRESHNESS_UNKNOWN" });
  });
});

describe("PAR-5A — fact-derived evidence is Control Read's own", () => {
  function expectedRefs(check: CheckResultV1, basis: ReviewStateV1): string[] {
    const round = basis.rounds[0];
    const cite = (fact: { class: string; evidence_ref?: string }) => (fact.class === "HUMAN_CONFIRMED" && fact.evidence_ref !== undefined ? [fact.evidence_ref] : []);
    switch (check.check) {
      case "state_guard":
        return cite(basis.review_state);
      case "verdict_prerequisites":
        return round.judgment_captured.value ? [...round.result_captured.derived_from, ...round.judgment_captured.derived_from] : [...round.result_captured.derived_from];
      case "project_registered":
        return [`dvcc:project/${basis.project_id}`];
      case "expected_head_exact":
        return cite(round.expected_head);
      case "reviewed_head_exact":
        return cite(round.reviewed_head);
      case "freshness_aligned":
        return basis.freshness.class === "DERIVED" ? [...basis.freshness.derived_from] : [];
      case "verdict_confirmation_recorded":
        return [...cite(basis.review_state), ...cite(round.verdict)];
      case "human_decision":
        return [];
    }
  }

  function expectedObservedAt(assessment: ActionAssessmentV1, basis: ReviewStateV1): string | null {
    const freshness = assessment.checks.find((check) => check.check === "freshness_aligned");
    if (freshness === undefined || freshness.outcome === "NOT_EVALUATED") return null;
    return basis.freshness.class === "DERIVED" ? basis.freshness.basis_observed_at : null;
  }

  it.each([
    { case_id: "PAR-5A-01", name: "F-READY" as DecisionSourceName },
    { case_id: "PAR-5A-02", name: "F-REV" as DecisionSourceName },
    { case_id: "PAR-5A-03", name: "F-FIX" as DecisionSourceName },
  ])("$case_id $name", ({ name }) => {
    const basis = controlRead(DECISION_SOURCES[name]());
    for (const assessment of assessOk(DECISION_SOURCES[name]()).data.assessments) {
      for (const check of assessment.checks) {
        if (check.outcome === "NOT_EVALUATED") continue;
        expect(check.evidence_refs, `${assessment.action_id} ${check.check}`).toEqual(expectedRefs(check, basis));
        expect(check.fact_reason, `${assessment.action_id} ${check.check}`).toBeUndefined();
      }
      expect(assessment.basis_observed_at, assessment.action_id).toBe(expectedObservedAt(assessment, basis));
    }
    expect(basis.freshness).toMatchObject({ class: "DERIVED", value: "ALIGNED", basis_observed_at: T });
  });
});
