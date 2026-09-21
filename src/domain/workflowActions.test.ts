import { describe, expect, it } from "vitest";
import { canCaptureJudgment, canSendTurn2, progressOfRound } from "./freshContext";
import { newRound, type ReviewSession, type RoundRecord } from "./review";
import { applyReviewAction, type ReviewAction } from "./transitions";

/**
 * The Phase 3 actions, checked against the invariants Waves 2.5 and 2.6 settled. The guards are
 * asked of the same functions the interface reads (`canSendTurn2`, `canCaptureJudgment`), so a
 * disabled button and a refused action can never disagree.
 */

const T0 = "2026-01-01T10:00:00.000Z";
const T1 = "2026-01-01T11:00:00.000Z";
const T2 = "2026-01-01T12:00:00.000Z";
const NOW = "2026-01-01T13:00:00.000Z";
const HEAD_A = "a".repeat(40);
const REVIEW_ID = "rv-20260101-alpha1";

function sessionWith(round: Partial<RoundRecord>, reviewState: ReviewSession["reviewState"] = "REVIEWING"): ReviewSession {
  return {
    schemaVersion: 1,
    reviewSessionId: REVIEW_ID,
    projectId: "project-alpha",
    prNumber: 45,
    reviewType: "PR review",
    reviewRound: 1,
    resourceState: "HOT",
    reviewState,
    suspendedFrom: null,
    chatgptThreadTitle: null,
    chatgptThreadUrl: null,
    nextAction: "",
    rounds: [{ ...newRound(1, HEAD_A), requestSavedAt: T0, ...round }],
    createdAt: T0,
    updatedAt: T0,
  };
}

function apply(session: ReviewSession, action: ReviewAction) {
  return applyReviewAction(session, action, NOW);
}

describe("saving Turn 2", () => {
  const action: ReviewAction = { type: "recordFollowupSaved" };

  it("waits for the Fresh Assessment", () => {
    const result = apply(sessionWith({}), action);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.key).toBe("action.followup.assessmentRequired");
  });

  it("records the time once the assessment is in", () => {
    const result = apply(sessionWith({ resultCapturedAt: T1 }), action);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.session.rounds[0].followupSavedAt).toBe(NOW);
    expect(result.value.event.type).toBe("followup_saved");
    expect(result.value.event.note).toBe("followup-r1.md");
    // Nothing else about the round moves.
    expect(result.value.session.reviewState).toBe("REVIEWING");
    expect(result.value.session.rounds[0].resultCapturedAt).toBe(T1);
  });

  it("can be rewritten while it is still unanswered", () => {
    const result = apply(sessionWith({ resultCapturedAt: T1, followupSavedAt: T2 }), action);
    expect(result.ok).toBe(true);
  });

  it("cannot be rewritten once the Final Judgment is in", () => {
    const round = { resultCapturedAt: T1, followupSavedAt: T2, judgmentCapturedAt: NOW };
    const result = apply(sessionWith(round), action);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.key).toBe("action.followup.judgmentCaptured");
  });

  it("asks the same question the interface asks", () => {
    const round = { ...newRound(1, HEAD_A), resultCapturedAt: T1, followupSavedAt: T2, judgmentCapturedAt: NOW };
    expect(canSendTurn2(progressOfRound(round))).toBe(false);
  });
});

describe("capturing the Final Judgment", () => {
  const action: ReviewAction = { type: "captureJudgment" };

  it("needs the Turn 2 it answers", () => {
    const result = apply(sessionWith({ resultCapturedAt: T1 }), action);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.key).toBe("action.judgment.followupRequired");
  });

  it("records the time once the follow-up has gone out", () => {
    const result = apply(sessionWith({ resultCapturedAt: T1, followupSavedAt: T2 }), action);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.session.rounds[0].judgmentCapturedAt).toBe(NOW);
    expect(result.value.event.type).toBe("judgment_captured");
    // The Fresh Assessment is untouched: both responses survive.
    expect(result.value.session.rounds[0].resultCapturedAt).toBe(T1);
  });

  it("refuses to replace one without an explicit confirmation", () => {
    const round = { resultCapturedAt: T1, followupSavedAt: T2, judgmentCapturedAt: T2 };
    const result = apply(sessionWith(round), action);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.key).toBe("action.judgment.replaceConfirmationRequired");
  });

  it("keeps the replaced text under its own archive name", () => {
    const round = { resultCapturedAt: T1, followupSavedAt: T2, judgmentCapturedAt: T2 };
    const archived = `judgment-r1-previous-${Date.parse(T2)}.md`;
    const result = apply(sessionWith(round), {
      type: "captureJudgment",
      replaceConfirmedByHuman: true,
      archivedJudgmentFiles: [archived],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.session.rounds[0].archivedJudgments).toEqual([archived]);
    expect(result.value.event.note).toContain(archived);
  });

  it("refuses an archive name from another response kind", () => {
    const round = { resultCapturedAt: T1, followupSavedAt: T2, judgmentCapturedAt: T2 };
    const result = apply(sessionWith(round), {
      type: "captureJudgment",
      replaceConfirmedByHuman: true,
      archivedJudgmentFiles: [`result-r1-previous-${Date.parse(T2)}.md`],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.key).toBe("action.archive.roundMismatch");
  });

  it("asks the same question the interface asks", () => {
    const round = { ...newRound(1, HEAD_A), resultCapturedAt: T1, followupSavedAt: T2 };
    expect(canCaptureJudgment(progressOfRound(round))).toBe(true);
  });
});

describe("setting the Risk Tier", () => {
  it("records the tier and the subjects the Human declared", () => {
    const result = apply(sessionWith({}), {
      type: "setRiskTier",
      riskTier: "TIER_2",
      subjects: ["SECURITY"],
      confirmedByHuman: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.session.rounds[0].riskTier).toBe("TIER_2");
    expect(result.value.session.rounds[0].riskTierSubjects).toEqual(["SECURITY"]);
    expect(result.value.event.detail).toEqual({ kind: "risk_tier_set", riskTier: "TIER_2", subjects: ["SECURITY"] });
  });

  it("refuses a tier below what the declared subjects require, and changes nothing", () => {
    const session = sessionWith({});
    const result = apply(session, {
      type: "setRiskTier",
      riskTier: "TIER_1",
      subjects: ["MIGRATION"],
      confirmedByHuman: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.key).toBe("action.riskTier.belowRequired");
    expect(result.error.params?.required).toBe("TIER_2");
    expect(session.rounds[0].riskTier).toBeNull();
  });

  it("never settles a tier implicitly", () => {
    const result = apply(sessionWith({}), {
      type: "setRiskTier",
      riskTier: "TIER_1",
      subjects: [],
      confirmedByHuman: false as unknown as true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.key).toBe("action.riskTier.confirmationRequired");
  });

  it("changes no other axis", () => {
    const result = apply(sessionWith({}), {
      type: "setRiskTier",
      riskTier: "TIER_0",
      subjects: [],
      confirmedByHuman: true,
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.session.reviewState).toBe("REVIEWING");
    expect(result.value.session.resourceState).toBe("HOT");
    expect(result.value.event.reviewState).toBeNull();
  });
});

describe("recording why a duplicate review goes ahead", () => {
  const priorReviews = [{ reviewId: REVIEW_ID, round: 1 }];

  it("records the reason as data and the Human's words as text", () => {
    const result = apply(sessionWith({}), {
      type: "recordRevalidation",
      reason: "RELEVANT_CONTRACT_CHANGED",
      priorReviews,
      explanation: "  the contract moved  ",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.session.rounds[0].revalidation).toEqual({
      reason: "RELEVANT_CONTRACT_CHANGED",
      priorReviews,
      explanation: "the contract moved",
    });
    expect(result.value.event.detail).toEqual({
      kind: "duplicate_continued",
      invalidationReason: "RELEVANT_CONTRACT_CHANGED",
      priorReviews,
    });
  });

  it("refuses a reason that does not apply to the same head", () => {
    const result = apply(sessionWith({}), {
      type: "recordRevalidation",
      reason: "HEAD_CHANGED",
      priorReviews,
      explanation: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.key).toBe("action.revalidation.reasonNotApplicable");
  });

  it("refuses to record one without the review it is about", () => {
    const result = apply(sessionWith({}), {
      type: "recordRevalidation",
      reason: "BASE_CHANGED",
      priorReviews: [],
      explanation: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.key).toBe("action.revalidation.priorReviewRequired");
  });

  it("does not quietly replace one that is already recorded", () => {
    const existing = { reason: "BASE_CHANGED" as const, priorReviews, explanation: null };
    const result = apply(sessionWith({ revalidation: existing }), {
      type: "recordRevalidation",
      reason: "TARGET_BLOB_CHANGED",
      priorReviews,
      explanation: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.key).toBe("action.revalidation.alreadyRecorded");
  });
});

describe("recording the evidence decisions", () => {
  const decision = {
    id: "prior-result",
    source: "INDEPENDENT_REVIEW_RESULT" as const,
    boundHead: HEAD_A,
    capturedAt: T1,
    status: "REUSABLE" as const,
    reason: "SHA_BOUND" as const,
  };

  it("stores them on the round and in the event, as data", () => {
    const result = apply(sessionWith({}), { type: "recordEvidenceDecisions", decisions: [decision] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.session.rounds[0].evidenceDecisions).toEqual([decision]);
    expect(result.value.event.detail).toEqual({ kind: "evidence_reused", items: [decision] });
    expect(result.value.event.note).toBeNull();
  });

  it("refuses the same item twice", () => {
    const result = apply(sessionWith({}), { type: "recordEvidenceDecisions", decisions: [decision, decision] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.key).toBe("action.evidence.duplicateItem");
  });

  it("refuses once the verdict is confirmed", () => {
    // A round can still be reachable after its verdict: FIX_REQUIRED, then blocked.
    const round = { resultCapturedAt: T1, verdict: "FIX_REQUIRED" as const, verdictConfirmedAt: T2 };
    const result = apply(sessionWith(round, "BLOCKED"), { type: "recordEvidenceDecisions", decisions: [decision] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.key).toBe("action.evidence.verdictConfirmed");
  });
});
