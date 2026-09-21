import { describe, expect, it } from "vitest";
import { detectDuplicate } from "./duplicate";
import { priorReviewsFor } from "./priorReviews";
import { newRound, type ReviewSession, type RoundRecord } from "./review";

const HEAD_A = "a".repeat(40);
const HEAD_B = "b".repeat(40);
const T = "2026-01-01T10:00:00.000Z";

function session(id: string, projectId: string, rounds: Partial<RoundRecord>[]): ReviewSession {
  return {
    schemaVersion: 1,
    reviewSessionId: id,
    projectId,
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
    createdAt: T,
    updatedAt: T,
  };
}

describe("priorReviewsFor", () => {
  it("leaves out the round the request is about, and keeps the earlier ones", () => {
    const alpha = session("rv-a", "project-alpha", [
      { reviewedHead: HEAD_A, resultCapturedAt: T },
      { reviewedHead: HEAD_A },
    ]);
    const priors = priorReviewsFor([alpha], { reviewSessionId: "rv-a", round: 2 });
    expect(priors).toEqual([
      { reviewId: "rv-a", round: 1, projectId: "project-alpha", reviewedHead: HEAD_A, substantive: true },
    ]);
  });

  it("marks a round substantive once its result is captured or its verdict confirmed", () => {
    const alpha = session("rv-a", "project-alpha", [
      { reviewedHead: HEAD_A, requestSavedAt: T },
      { reviewedHead: HEAD_B, verdict: "REVIEW_PASS", verdictConfirmedAt: T },
    ]);
    const priors = priorReviewsFor([alpha], { reviewSessionId: "rv-b", round: 1 });
    expect(priors.map((p) => p.substantive)).toEqual([false, true]);
  });

  it("keeps other projects in the list, for the detector to filter", () => {
    const beta = session("rv-b", "project-beta", [{ reviewedHead: HEAD_A, resultCapturedAt: T }]);
    const priors = priorReviewsFor([beta], { reviewSessionId: "rv-a", round: 1 });
    expect(priors).toHaveLength(1);
    expect(detectDuplicate({ projectId: "project-alpha", targetHead: HEAD_A, priorReviews: priors }).status).toBe("NO_DUPLICATE");
    expect(detectDuplicate({ projectId: "project-beta", targetHead: HEAD_A, priorReviews: priors }).status).toBe("SAME_HEAD_DUPLICATE");
  });

  it("finds the duplicate a second round of the same review would be", () => {
    const alpha = session("rv-a", "project-alpha", [
      { reviewedHead: HEAD_A, resultCapturedAt: T },
      { expectedHead: HEAD_A },
    ]);
    const priors = priorReviewsFor([alpha], { reviewSessionId: "rv-a", round: 2 });
    const finding = detectDuplicate({ projectId: "project-alpha", targetHead: HEAD_A, priorReviews: priors });
    expect(finding.status).toBe("SAME_HEAD_DUPLICATE");
    expect(finding.matches).toEqual([{ reviewId: "rv-a", round: 1 }]);
  });
});
