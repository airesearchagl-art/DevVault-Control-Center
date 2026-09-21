import { describe, expect, it } from "vitest";
import {
  ORACLE_RESOURCE_STATES,
  ORACLE_REVIEW_STATES,
  RESOURCE_CHANGING_ACTIONS,
  RESUME_NOT_SUSPENDED_FROM,
  TRANSITION_CONTRACT,
  type ContractRow,
  type OracleState,
} from "../test/transitionContract";
import { createReviewSession, currentRound, emptyReviewForm, type ReviewSession } from "./review";
import type { ResourceState } from "./states";
import { applyReviewAction, canApply, type ReviewAction } from "./transitions";

/**
 * F-5: the implementation is checked against the independent contract in
 * `src/test/transitionContract.ts` (never against the implementation's own table).
 */

const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-01-01T01:00:00.000Z";
const HEAD = "0123456789abcdef0123456789abcdef01234567";

/** A session in `state` whose other prerequisites are satisfied (captured result, non-HOT resource). */
function sessionIn(state: OracleState, resource: ResourceState = "WARM", captured = true): ReviewSession {
  const created = createReviewSession({ ...emptyReviewForm("project-alpha"), prNumber: "7" }, new Set(["project-alpha"]), "rv-20260101-oracle", T0);
  if (!created.ok) throw new Error("fixture");
  const base = created.value.session;
  return {
    ...base,
    reviewState: state,
    resourceState: resource,
    suspendedFrom: state === "SUSPENDED" ? "FIX_REQUIRED" : null,
    rounds: [{ ...base.rounds[0], resultCapturedAt: captured ? T0 : null }],
  };
}

/** A valid payload for the contract row (so only the state decides acceptance). */
function actionFor(row: ContractRow, session: ReviewSession): ReviewAction {
  switch (row.action) {
    case "confirmVerdict":
      return { type: "confirmVerdict", verdict: row.label.endsWith("REVIEW_PASS") ? "REVIEW_PASS" : "FIX_REQUIRED", note: null, confirmedByHuman: true };
    case "block":
      return { type: "block", reason: "oracle reason", confirmedByHuman: true };
    case "close":
      return { type: "close", confirmedByHuman: true };
    case "suspend":
      return { type: "suspend", resourceState: "COLD", checkpoint: "oracle checkpoint" };
    case "startNextRound":
      return { type: "startNextRound", expectedHead: HEAD };
    case "captureResult":
      // sessionIn() has a recorded result captured at T0: replacing it needs confirmation and the
      // deterministic archive name result-r1-previous-<T0 ms>.md (F-6).
      return { type: "captureResult", reviewedHead: HEAD, replaceConfirmedByHuman: true, archivedResultFiles: ["result-r1-previous-1767225600000.md"] };
    case "setResource":
      return { type: "setResource", resourceState: session.resourceState === "HOT" ? "COLD" : "HOT" };
    case "setNextAction":
      return { type: "setNextAction", nextAction: "oracle next action" };
    case "updateMetadata":
      return {
        type: "updateMetadata",
        metadata: { reviewType: "Oracle review", prNumber: 8, expectedHead: HEAD, chatgptThreadTitle: "t", chatgptThreadUrl: null },
      };
    default:
      return { type: row.action } as ReviewAction;
  }
}

describe("independent transition oracle (F-5)", () => {
  for (const row of TRANSITION_CONTRACT) {
    for (const state of ORACLE_REVIEW_STATES) {
      const allowed = row.from.includes(state);
      it(`${row.label} from ${state} is ${allowed ? "allowed" : "prohibited"}`, () => {
        // Resume of a non-suspended review is a separate contract (resource-only, below); HOT
        // isolates the "resume a suspended review" row.
        const session = row.action === "resume" && state !== "SUSPENDED" ? sessionIn(state, "HOT") : sessionIn(state);
        const result = applyReviewAction(session, actionFor(row, session), T1);
        expect(result.ok).toBe(allowed);
        expect(canApply(session, row.action as ReviewAction["type"])).toBe(allowed);
        if (!result.ok) return;
        const expected = row.to === "unchanged" ? state : row.to === "suspendedFrom" ? session.suspendedFrom : row.to;
        expect(result.value.session.reviewState).toBe(expected);
        if (!RESOURCE_CHANGING_ACTIONS.includes(row.action)) {
          expect(result.value.session.resourceState).toBe(session.resourceState);
        }
      });
    }
  }

  it("covers every Review State and every contract action", () => {
    expect(new Set(TRANSITION_CONTRACT.map((row) => row.action))).toEqual(
      new Set(["markReady", "startReview", "cancelReview", "recordRequestSaved", "captureResult", "confirmVerdict", "block", "startNextRound", "suspend", "resume", "close", "setResource", "setNextAction", "updateMetadata"]),
    );
  });
});

describe("resume on a review that is not suspended", () => {
  for (const state of ORACLE_REVIEW_STATES.filter((s) => s !== "SUSPENDED")) {
    for (const resource of ORACLE_RESOURCE_STATES) {
      const allowed = RESUME_NOT_SUSPENDED_FROM.includes(state) && resource !== "HOT";
      it(`${state} + ${resource} → ${allowed ? "HOT, state unchanged" : "prohibited"}`, () => {
        const result = applyReviewAction(sessionIn(state, resource), { type: "resume" }, T1);
        expect(result.ok).toBe(allowed);
        if (result.ok) expect(result.value.session).toMatchObject({ reviewState: state, resourceState: "HOT", suspendedFrom: null });
      });
    }
  }
});

describe("verdict prerequisites (AC-14)", () => {
  it("rejects a verdict without a captured result for the round", () => {
    for (const verdict of ["FIX_REQUIRED", "REVIEW_PASS"] as const) {
      const result = applyReviewAction(sessionIn("REVIEWING", "WARM", false), { type: "confirmVerdict", verdict, note: null, confirmedByHuman: true }, T1);
      expect(result.ok).toBe(false);
    }
  });

  it("rejects verdict, block and close without explicit Human confirmation", () => {
    const reviewing = sessionIn("REVIEWING");
    const unconfirmed = [
      { type: "confirmVerdict", verdict: "FIX_REQUIRED", note: null },
      { type: "confirmVerdict", verdict: "REVIEW_PASS", note: null, confirmedByHuman: false },
      { type: "block", reason: "x" },
      { type: "close" },
      { type: "close", confirmedByHuman: "yes" },
    ];
    for (const action of unconfirmed) {
      expect(applyReviewAction(reviewing, action as unknown as ReviewAction, T1).ok).toBe(false);
    }
  });

  it("rejects a block without a reason and an unknown verdict", () => {
    expect(applyReviewAction(sessionIn("NEW"), { type: "block", reason: "  ", confirmedByHuman: true }, T1).ok).toBe(false);
    expect(
      applyReviewAction(sessionIn("REVIEWING"), { type: "confirmVerdict", verdict: "BLOCKED", note: null, confirmedByHuman: true } as unknown as ReviewAction, T1).ok,
    ).toBe(false);
  });

  it("never changes the Review State by capturing a result", () => {
    for (const state of ["REVIEWING", "FIX_REQUIRED", "REVIEW_PASS", "BLOCKED"] as const) {
      const result = applyReviewAction(sessionIn(state, "WARM", false), { type: "captureResult", reviewedHead: null }, T1);
      expect(result.ok && result.value.session.reviewState).toBe(state);
    }
  });
});

describe("suspend / resume contract (D2)", () => {
  for (const state of ORACLE_REVIEW_STATES.filter((s) => s !== "SUSPENDED" && s !== "CLOSED")) {
    for (const resource of ["WARM", "COLD"] as const) {
      it(`${state} → SUSPENDED (${resource}) → resume restores ${state} + HOT`, () => {
        const start = sessionIn(state, "HOT");
        const suspended = applyReviewAction(start, { type: "suspend", resourceState: resource, checkpoint: "cp" }, T1);
        if (!suspended.ok) throw new Error(JSON.stringify(suspended.error));
        expect(suspended.value.session).toMatchObject({ reviewState: "SUSPENDED", suspendedFrom: state, resourceState: resource });
        const resumed = applyReviewAction(suspended.value.session, { type: "resume" }, T1);
        if (!resumed.ok) throw new Error(JSON.stringify(resumed.error));
        expect(resumed.value.session).toMatchObject({ reviewState: state, suspendedFrom: null, resourceState: "HOT" });
        expect(resumed.value.session.rounds).toEqual(start.rounds);
      });
    }
  }

  it("rejects suspend to HOT and suspend without a checkpoint", () => {
    expect(applyReviewAction(sessionIn("REVIEWING"), { type: "suspend", resourceState: "HOT", checkpoint: "cp" } as unknown as ReviewAction, T1).ok).toBe(false);
    expect(applyReviewAction(sessionIn("REVIEWING"), { type: "suspend", resourceState: "WARM", checkpoint: " " }, T1).ok).toBe(false);
  });
});

describe("resource independence (AC-04)", () => {
  for (const state of ORACLE_REVIEW_STATES) {
    for (const from of ORACLE_RESOURCE_STATES) {
      for (const to of ORACLE_RESOURCE_STATES.filter((r) => r !== from)) {
        it(`${state}: ${from} → ${to} keeps the Review State`, () => {
          const result = applyReviewAction(sessionIn(state, from), { type: "setResource", resourceState: to }, T1);
          if (!result.ok) throw new Error(JSON.stringify(result.error));
          expect(result.value.session).toMatchObject({ reviewState: state, resourceState: to });
        });
      }
    }
  }
});

describe("re-capture contract (F-6)", () => {
  it("first capture needs no confirmation; replacing a recorded result needs explicit Human confirmation", () => {
    const first = applyReviewAction(sessionIn("REVIEWING", "WARM", false), { type: "captureResult", reviewedHead: null }, T1);
    expect(first.ok).toBe(true);
    const recorded = sessionIn("FIX_REQUIRED");
    expect(applyReviewAction(recorded, { type: "captureResult", reviewedHead: null, archivedResultFiles: ["result-r1-previous-1767225600000.md"] }, T1).ok).toBe(false);
    const unconfirmed = { type: "captureResult", reviewedHead: null, replaceConfirmedByHuman: false, archivedResultFiles: ["result-r1-previous-1767225600000.md"] };
    expect(applyReviewAction(recorded, unconfirmed as unknown as ReviewAction, T1).ok).toBe(false);
  });

  it("records the archive of the replaced result and keeps the verdict", () => {
    const recorded = { ...sessionIn("FIX_REQUIRED"), rounds: [{ ...sessionIn("FIX_REQUIRED").rounds[0], verdict: "FIX_REQUIRED" as const }] };
    const result = applyReviewAction(
      recorded,
      { type: "captureResult", reviewedHead: null, replaceConfirmedByHuman: true, archivedResultFiles: ["result-r1-previous-1767225600000.md"] },
      T1,
    );
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(currentRound(result.value.session)).toMatchObject({
      resultCapturedAt: T1,
      verdict: "FIX_REQUIRED",
      archivedResults: ["result-r1-previous-1767225600000.md"],
    });
    expect(result.value.session.reviewState).toBe("FIX_REQUIRED");
    expect(result.value.event.note).toContain("result-r1-previous-1767225600000.md");
  });

  it("rejects an archive name that does not belong to the replaced result", () => {
    const recorded = sessionIn("REVIEWING");
    for (const name of [
      "result-r1-previous-1.md",
      "result-r2-previous-1767225600000.md",
      "result-r1.md",
      "../x.md",
      "result-r1-previous-1767225600000-0.md",
      "result-r1-previous-1767225600000-01.md",
      "result-r1-previous-1767225600000-1000.md",
    ]) {
      const action = { type: "captureResult", reviewedHead: null, replaceConfirmedByHuman: true, archivedResultFiles: [name] } as const;
      expect(applyReviewAction(recorded, action, T1).ok, name).toBe(false);
    }
  });

  it("records unrecorded archives of an interrupted capture before the new archive, each only once (E-2)", () => {
    const recorded = sessionIn("REVIEWING");
    const names = ["result-r1-previous-1767225600000.md", "result-r1-previous-1767225600000-1.md"];
    const result = applyReviewAction(recorded, { type: "captureResult", reviewedHead: null, replaceConfirmedByHuman: true, archivedResultFiles: names }, T1);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(currentRound(result.value.session).archivedResults).toEqual(names);
    const duplicate = [names[0], names[0]];
    expect(applyReviewAction(recorded, { type: "captureResult", reviewedHead: null, replaceConfirmedByHuman: true, archivedResultFiles: duplicate }, T1).ok).toBe(false);
    const again = applyReviewAction(result.value.session, { type: "captureResult", reviewedHead: null, replaceConfirmedByHuman: true, archivedResultFiles: [names[1]] }, T1);
    expect(again.ok).toBe(false);
  });
});

describe("next round contract", () => {
  it("adds an empty round, keeps previous rounds and becomes READY_FOR_REVIEW", () => {
    for (const state of ["FIX_REQUIRED", "REVIEW_PASS"] as const) {
      const start = { ...sessionIn(state), rounds: [{ ...sessionIn(state).rounds[0], verdict: state, verdictConfirmedAt: T0 }] };
      const result = applyReviewAction(start, { type: "startNextRound", expectedHead: null }, T1);
      if (!result.ok) throw new Error(JSON.stringify(result.error));
      const next = result.value.session;
      expect(next.reviewRound).toBe(2);
      expect(next.rounds[0]).toEqual(start.rounds[0]);
      expect(currentRound(next)).toEqual({
        round: 2,
        expectedHead: null,
        reviewedHead: null,
        requestSavedAt: null,
        resultCapturedAt: null,
        verdict: null,
        verdictConfirmedAt: null,
        verdictNote: null,
        // Phase 3: a new round starts with nothing handed over, nothing captured, nothing decided.
        followupSavedAt: null,
        judgmentCapturedAt: null,
        riskTier: null,
        revalidation: null,
        evidenceDecisions: [],
        archivedJudgments: [],
        archivedResults: [],
      });
      expect(next.reviewState).toBe("READY_FOR_REVIEW");
    }
  });
});
