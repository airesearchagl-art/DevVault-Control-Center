import { describe, expect, it } from "vitest";
import { offeredEvidence } from "./evidenceOffer";
import { assessEvidence } from "./evidenceReuse";
import type { GitObservation } from "./git";
import { newRound, type ReviewSession, type RoundRecord } from "./review";

const HEAD_A = "a".repeat(40);
const HEAD_B = "b".repeat(40);
const T1 = "2026-01-01T10:00:00.000Z";
const T2 = "2026-01-02T10:00:00.000Z";

function session(rounds: Partial<RoundRecord>[]): ReviewSession {
  return {
    schemaVersion: 1,
    reviewSessionId: "rv-20260101-alpha1",
    projectId: "project-alpha",
    prNumber: null,
    reviewType: "PR review",
    reviewRound: rounds.length,
    resourceState: "HOT",
    reviewState: "REVIEWING",
    suspendedFrom: null,
    chatgptThreadTitle: null,
    chatgptThreadUrl: null,
    nextAction: "",
    rounds: rounds.map((round, index) => ({ ...newRound(index + 1, null), ...round })),
    createdAt: T1,
    updatedAt: T1,
  };
}

const observation: GitObservation = {
  status: "OK",
  head: HEAD_A,
  branch: "main",
  detached: false,
  dirty: false,
  observedAt: T2,
};

describe("offeredEvidence", () => {
  it("offers nothing for a first round with no observation", () => {
    expect(offeredEvidence(session([{}]), undefined)).toEqual([]);
  });

  it("offers an earlier round's response and the head the Human recorded for it", () => {
    const items = offeredEvidence(session([{ reviewedHead: HEAD_A, resultCapturedAt: T1 }, {}]), undefined);
    expect(items.map((item) => [item.id, item.source, item.boundHead, item.capturedAt])).toEqual([
      ["round-1-result", "INDEPENDENT_REVIEW_RESULT", HEAD_A, T1],
      ["round-1-reviewed-head", "HUMAN_RECORDED_HEAD", HEAD_A, T1],
    ]);
  });

  it("offers the Final Judgment rather than the assessment it superseded", () => {
    const round = { reviewedHead: HEAD_A, resultCapturedAt: T1, followupSavedAt: T1, judgmentCapturedAt: T2 };
    const items = offeredEvidence(session([round, {}]), undefined);
    expect(items[0].id).toBe("round-1-judgment");
    expect(items[0].capturedAt).toBe(T2);
  });

  it("never offers the current round's own response to itself", () => {
    const items = offeredEvidence(session([{ reviewedHead: HEAD_A, resultCapturedAt: T1 }]), undefined);
    expect(items).toEqual([]);
  });

  it("offers an observation only when Git could actually be read", () => {
    expect(offeredEvidence(session([{}]), observation).map((item) => item.source)).toEqual(["GIT_OBSERVATION"]);
    const failed: GitObservation = { ...observation, status: "GIT_UNAVAILABLE", head: null };
    expect(offeredEvidence(session([{}]), failed)).toEqual([]);
  });

  it("carries the bindings the assessment needs, without deciding reuse itself", () => {
    const items = offeredEvidence(session([{ reviewedHead: HEAD_A, resultCapturedAt: T1 }, {}]), observation);
    // Same head, nothing invalidated: everything is reusable.
    expect(assessEvidence(items, { currentHead: HEAD_A, invalidationReasons: [] }).map((a) => a.status)).toEqual([
      "REUSABLE",
      "REUSABLE",
      "REUSABLE",
    ]);
    // A changed contract only touches what the contract binds.
    expect(
      assessEvidence(items, { currentHead: HEAD_A, invalidationReasons: ["RELEVANT_CONTRACT_CHANGED"] }).map((a) => [a.id, a.status]),
    ).toEqual([
      ["round-1-result", "RECHECK_REQUIRED"],
      ["round-1-reviewed-head", "REUSABLE"],
      ["git-observation", "REUSABLE"],
    ]);
    // Another head is never carried over.
    expect(assessEvidence(items, { currentHead: HEAD_B, invalidationReasons: [] }).map((a) => a.status)).toEqual([
      "RECHECK_REQUIRED",
      "RECHECK_REQUIRED",
      "RECHECK_REQUIRED",
    ]);
  });
});
