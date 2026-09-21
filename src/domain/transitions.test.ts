import { describe, expect, it } from "vitest";
import { createReviewSession, currentRound, emptyReviewForm, type ReviewSession } from "./review";
import { REVIEW_STATES, RESOURCE_STATES, type ResourceState, type ReviewState } from "./states";
import { applyReviewAction, guardAction, type ReviewAction } from "./transitions";

// The allowed / prohibited transition matrix is verified against the independent contract in
// src/test/transitionContract.ts by transitionContract.test.ts (F-5). This file covers flows.

const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-01-01T01:00:00.000Z";
const HEAD_A = "0123456789abcdef0123456789abcdef01234567";
const HEAD_B = "89abcdef0123456789abcdef0123456789abcdef";

function newSession(): ReviewSession {
  const created = createReviewSession(
    { ...emptyReviewForm("project-alpha"), prNumber: "45", expectedHead: HEAD_A },
    new Set(["project-alpha"]),
    "rv-20260101-alpha1",
    T0,
  );
  if (!created.ok) throw new Error(JSON.stringify(created.error));
  return created.value.session;
}

function withState(reviewState: ReviewState, resourceState: ResourceState = "HOT"): ReviewSession {
  const base = newSession();
  return {
    ...base,
    reviewState,
    resourceState,
    suspendedFrom: reviewState === "SUSPENDED" ? "FIX_REQUIRED" : null,
  };
}

function apply(session: ReviewSession, action: ReviewAction, now = T1) {
  const result = applyReviewAction(session, action, now);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

describe("resume guard", () => {
  it("resume is not allowed for an active HOT review that is not suspended", () => {
    expect(guardAction(withState("FIX_REQUIRED", "HOT"), "resume")).not.toBeNull();
    expect(guardAction(withState("FIX_REQUIRED", "WARM"), "resume")).toBeNull();
    expect(guardAction(withState("SUSPENDED", "HOT"), "resume")).toBeNull();
  });
});

describe("review lifecycle", () => {
  it("runs NEW → READY → REVIEWING → capture → FIX_REQUIRED → next round", () => {
    let s = newSession();
    expect(s.reviewState).toBe("NEW");
    s = apply(s, { type: "markReady" }).session;
    expect(s.reviewState).toBe("READY_FOR_REVIEW");
    s = apply(s, { type: "startReview" }).session;
    expect(s.reviewState).toBe("REVIEWING");

    const captured = apply(s, { type: "captureResult", reviewedHead: HEAD_A });
    expect(captured.session.reviewState).toBe("REVIEWING");
    expect(currentRound(captured.session).reviewedHead).toBe(HEAD_A);
    expect(captured.event.type).toBe("result_captured");
    expect(captured.event.reviewState).toBeNull();

    const verdict = apply(captured.session, {
      type: "confirmVerdict",
      verdict: "FIX_REQUIRED",
      note: "R1 findings",
      confirmedByHuman: true,
    });
    expect(verdict.session.reviewState).toBe("FIX_REQUIRED");
    expect(currentRound(verdict.session).verdict).toBe("FIX_REQUIRED");
    expect(verdict.event).toMatchObject({ type: "verdict_confirmed", reviewState: { from: "REVIEWING", to: "FIX_REQUIRED" } });

    const next = apply(verdict.session, { type: "startNextRound", expectedHead: HEAD_B });
    expect(next.session.reviewRound).toBe(2);
    expect(next.session.rounds).toHaveLength(2);
    expect(next.session.rounds[0].verdict).toBe("FIX_REQUIRED");
    expect(currentRound(next.session)).toMatchObject({ round: 2, expectedHead: HEAD_B, verdict: null });
    expect(next.session.reviewState).toBe("READY_FOR_REVIEW");
    expect(next.event.round).toBe(2);
  });

  it("never changes Review State on capture and requires a captured result before a verdict (AC-14)", () => {
    const reviewing = withState("REVIEWING");
    const noResult = applyReviewAction(
      reviewing,
      { type: "confirmVerdict", verdict: "REVIEW_PASS", note: null, confirmedByHuman: true },
      T1,
    );
    expect(noResult.ok).toBe(false);

    const unconfirmed = applyReviewAction(
      apply(reviewing, { type: "captureResult", reviewedHead: null }).session,
      { type: "confirmVerdict", verdict: "REVIEW_PASS", note: null, confirmedByHuman: false } as unknown as ReviewAction,
      T1,
    );
    expect(unconfirmed.ok).toBe(false);

    for (const state of ["REVIEWING", "FIX_REQUIRED", "REVIEW_PASS", "BLOCKED"] as const) {
      const out = apply(withState(state), { type: "captureResult", reviewedHead: null });
      expect(out.session.reviewState).toBe(state);
    }
  });

  it("rejects close and block without explicit Human confirmation", () => {
    const s = withState("REVIEWING");
    expect(applyReviewAction(s, { type: "close" } as unknown as ReviewAction, T1).ok).toBe(false);
    expect(applyReviewAction(s, { type: "block", reason: "x" } as unknown as ReviewAction, T1).ok).toBe(false);
    expect(applyReviewAction(s, { type: "block", reason: "   ", confirmedByHuman: true }, T1).ok).toBe(false);
  });

  it("records BLOCKED as the round verdict only when blocked while reviewing", () => {
    const fromReviewing = apply(withState("REVIEWING"), { type: "block", reason: "Missing env", confirmedByHuman: true });
    expect(fromReviewing.session.reviewState).toBe("BLOCKED");
    expect(currentRound(fromReviewing.session).verdict).toBe("BLOCKED");
    expect(fromReviewing.event.type).toBe("verdict_confirmed");

    const fromNew = apply(withState("NEW"), { type: "block", reason: "Waiting for spec", confirmedByHuman: true });
    expect(currentRound(fromNew.session).verdict).toBeNull();
    expect(fromNew.event).toMatchObject({ type: "blocked", note: "Waiting for spec" });

    const unblocked = apply(fromNew.session, { type: "markReady" });
    expect(unblocked.session.reviewState).toBe("READY_FOR_REVIEW");
  });
});

describe("suspend / resume (D2)", () => {
  it("stores suspendedFrom, lets the Human pick WARM or COLD and restores on resume", () => {
    const start = withState("FIX_REQUIRED", "WARM");
    for (const resource of ["WARM", "COLD"] as const) {
      const suspended = apply(start, { type: "suspend", resourceState: resource, checkpoint: "Stopped after R1" });
      expect(suspended.session).toMatchObject({ reviewState: "SUSPENDED", suspendedFrom: "FIX_REQUIRED", resourceState: resource });
      expect(suspended.event).toMatchObject({ type: "suspended", reviewState: { from: "FIX_REQUIRED", to: "SUSPENDED" } });

      const resumed = apply(suspended.session, { type: "resume" });
      expect(resumed.session).toMatchObject({ reviewState: "FIX_REQUIRED", suspendedFrom: null, resourceState: "HOT" });
      expect(resumed.event).toMatchObject({
        type: "resumed",
        reviewState: { from: "SUSPENDED", to: "FIX_REQUIRED" },
        resourceState: { from: resource, to: "HOT" },
      });
      expect(resumed.session.rounds).toEqual(start.rounds);
      expect(resumed.session.prNumber).toBe(start.prNumber);
    }
  });

  it("requires a checkpoint note and WARM/COLD", () => {
    const s = withState("REVIEWING");
    expect(applyReviewAction(s, { type: "suspend", resourceState: "WARM", checkpoint: "  " }, T1).ok).toBe(false);
    expect(
      applyReviewAction(s, { type: "suspend", resourceState: "HOT", checkpoint: "x" } as unknown as ReviewAction, T1).ok,
    ).toBe(false);
    expect(applyReviewAction(withState("SUSPENDED"), { type: "suspend", resourceState: "COLD", checkpoint: "x" }, T1).ok).toBe(false);
    expect(applyReviewAction(withState("CLOSED"), { type: "suspend", resourceState: "COLD", checkpoint: "x" }, T1).ok).toBe(false);
  });

  it("resume on a non-suspended WARM review only brings the resource to HOT", () => {
    const out = apply(withState("READY_FOR_REVIEW", "COLD"), { type: "resume" });
    expect(out.session).toMatchObject({ reviewState: "READY_FOR_REVIEW", resourceState: "HOT" });
    expect(out.event.reviewState).toBeNull();
  });

  it("close from SUSPENDED clears suspendedFrom", () => {
    const out = apply(withState("SUSPENDED", "COLD"), { type: "close", confirmedByHuman: true });
    expect(out.session).toMatchObject({ reviewState: "CLOSED", suspendedFrom: null, resourceState: "COLD" });
  });
});

describe("independent resource axis (AC-04)", () => {
  it("changes resource in every review state without touching review state", () => {
    for (const state of REVIEW_STATES) {
      for (const resource of RESOURCE_STATES) {
        const session = withState(state, resource === "HOT" ? "COLD" : "HOT");
        const out = apply(session, { type: "setResource", resourceState: resource });
        expect(out.session.reviewState).toBe(state);
        expect(out.session.resourceState).toBe(resource);
        expect(out.event).toMatchObject({ type: "resource_changed", reviewState: null });
      }
    }
  });

  it("rejects a no-op resource change", () => {
    expect(applyReviewAction(withState("NEW", "HOT"), { type: "setResource", resourceState: "HOT" }, T1).ok).toBe(false);
  });
});

describe("metadata and next action", () => {
  it("updates metadata and the current round expected HEAD only", () => {
    const next = apply(
      apply(withState("FIX_REQUIRED"), { type: "startNextRound", expectedHead: null }).session,
      {
        type: "updateMetadata",
        metadata: {
          reviewType: "Re-review",
          prNumber: 46,
          expectedHead: HEAD_B,
          chatgptThreadTitle: "Alpha R2",
          chatgptThreadUrl: "https://chatgpt.com/c/example-thread-alpha",
        },
      },
    );
    expect(next.session).toMatchObject({ reviewType: "Re-review", prNumber: 46, chatgptThreadTitle: "Alpha R2" });
    expect(next.session.rounds[0].expectedHead).toBe(HEAD_A);
    expect(next.session.rounds[1].expectedHead).toBe(HEAD_B);
    expect(next.event.type).toBe("metadata_updated");
  });

  it("rejects invalid HEAD values in payloads", () => {
    const s = withState("REVIEWING");
    expect(applyReviewAction(s, { type: "captureResult", reviewedHead: "not-a-sha" }, T1).ok).toBe(false);
    expect(applyReviewAction(withState("FIX_REQUIRED"), { type: "startNextRound", expectedHead: "XYZ" }, T1).ok).toBe(false);
  });

  it("sets next action and rejects unchanged text", () => {
    const out = apply(withState("NEW"), { type: "setNextAction", nextAction: "  Re-run tests  " });
    expect(out.session.nextAction).toBe("Re-run tests");
    expect(applyReviewAction(out.session, { type: "setNextAction", nextAction: "Re-run tests" }, T1).ok).toBe(false);
  });

  it("stamps updatedAt and records the request-saved time on the current round", () => {
    const out = apply(withState("READY_FOR_REVIEW"), { type: "recordRequestSaved" });
    expect(out.session.updatedAt).toBe(T1);
    expect(currentRound(out.session).requestSavedAt).toBe(T1);
    expect(out.event.note).toBe("request-r1.md");
  });
});
