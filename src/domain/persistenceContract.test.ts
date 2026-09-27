import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildReReviewHandoff, buildRequiredFixHandoff, latestResponse } from "./handoff";
import { newRound, type ReviewSession, type RoundRecord } from "./review";
import { parseEventLine, parseSessionFile, serializeEvent, serializeSession } from "./schema";
import { applyReviewAction } from "./transitions";
import { validateTierChoice } from "./riskTier";
import { PERSISTED_ORDER_TABLE, VERDICT_GATE_TABLE } from "../test/workflowContract";

/**
 * Phase 3 persistence: what the new fields mean, that a file written before Phase 3 still means what
 * it meant, and that nothing about a round is recovered by reading prose.
 */

const NOW = "2026-01-01T00:00:00.000Z";
const HEAD_A = "a".repeat(40);
const HEAD_B = "b".repeat(40);
const REVIEW_ID = "rv-20260101-alpha1";

function session(rounds: RoundRecord[]): ReviewSession {
  return {
    schemaVersion: 1,
    reviewSessionId: REVIEW_ID,
    projectId: "project-alpha",
    prNumber: 45,
    reviewType: "PR review",
    reviewRound: rounds.length,
    resourceState: "HOT",
    reviewState: "FIX_REQUIRED",
    suspendedFrom: null,
    chatgptThreadTitle: null,
    chatgptThreadUrl: null,
    nextAction: "Fix the two required findings",
    rounds,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("a round from before Phase 3", () => {
  const fixture = readFileSync(`fixtures/v1/valid/reviews/${REVIEW_ID}/session.json`, "utf8");

  it("still loads, and its Phase 3 fields read as empty", () => {
    const parsed = parseSessionFile(fixture, REVIEW_ID);
    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") return;
    for (const round of parsed.value.rounds) {
      expect(round.followupSavedAt).toBeNull();
      expect(round.judgmentCapturedAt).toBeNull();
      expect(round.riskTier).toBeNull();
      expect(round.revalidation).toBeNull();
      expect(round.evidenceDecisions).toEqual([]);
      expect(round.archivedJudgments).toEqual([]);
    }
  });

  it("means the same thing it meant: no Turn 2 happened", () => {
    const parsed = parseSessionFile(fixture, REVIEW_ID);
    if (parsed.status !== "ok") throw new Error("fixture must parse");
    const round = parsed.value.rounds[0];
    expect(round.resultCapturedAt).not.toBeNull();
    // The verdict was made against the Fresh Assessment, because there is no Final Judgment.
    expect(latestResponse(round)?.kind).toBe("result");
  });

  it("does not gain the new keys when it is written back", () => {
    const parsed = parseSessionFile(fixture, REVIEW_ID);
    if (parsed.status !== "ok") throw new Error("fixture must parse");
    const written = JSON.parse(serializeSession(parsed.value)) as { rounds: Record<string, unknown>[] };
    // They are written, but as their empty values: a later read means exactly the same thing.
    expect(written.rounds[0].followupSavedAt).toBeNull();
    expect(written.rounds[0].evidenceDecisions).toEqual([]);
    const reparsed = parseSessionFile(JSON.stringify(written), REVIEW_ID);
    expect(reparsed.status).toBe("ok");
  });
});

describe("the Phase 3 round fields survive a round trip", () => {
  const round: RoundRecord = {
    ...newRound(1, HEAD_A),
    reviewedHead: HEAD_A,
    requestSavedAt: "2026-01-01T10:00:00.000Z",
    resultCapturedAt: "2026-01-01T11:00:00.000Z",
    followupSavedAt: "2026-01-01T12:00:00.000Z",
    judgmentCapturedAt: "2026-01-01T12:30:00.000Z",
    verdict: "FIX_REQUIRED",
    verdictConfirmedAt: "2026-01-01T13:00:00.000Z",
    verdictNote: "二つの修正必須がある",
    riskTier: "TIER_2",
    revalidation: {
      reason: "RELEVANT_CONTRACT_CHANGED",
      priorReviews: [{ reviewId: REVIEW_ID, round: 1 }],
      explanation: "contract updated after the first review",
    },
    evidenceDecisions: [
      {
        id: "prior-result",
        source: "INDEPENDENT_REVIEW_RESULT",
        boundHead: HEAD_A,
        capturedAt: "2026-01-01T11:00:00.000Z",
        status: "REUSABLE",
        reason: "SHA_BOUND",
      },
    ],
    archivedJudgments: ["judgment-r1-previous-1767225600000.md"],
  };

  it("parses back exactly as written", () => {
    const parsed = parseSessionFile(serializeSession(session([round])), REVIEW_ID);
    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") return;
    expect(parsed.value.rounds[0]).toEqual(round);
  });

  it("refuses a Risk Tier it does not know", () => {
    const broken = JSON.parse(serializeSession(session([round]))) as { rounds: Record<string, unknown>[] };
    broken.rounds[0].riskTier = "TIER_3";
    const parsed = parseSessionFile(JSON.stringify(broken), REVIEW_ID);
    expect(parsed.status).toBe("malformed");
    if (parsed.status !== "malformed") return;
    expect(parsed.reason.key).toBe("schema.round.unknownRiskTier");
  });

  it("refuses an invalidation reason it does not know", () => {
    const broken = JSON.parse(serializeSession(session([round]))) as { rounds: Record<string, unknown>[] };
    (broken.rounds[0].revalidation as Record<string, unknown>).reason = "BECAUSE_I_SAID_SO";
    const parsed = parseSessionFile(JSON.stringify(broken), REVIEW_ID);
    expect(parsed.status).toBe("malformed");
    if (parsed.status !== "malformed") return;
    expect(parsed.reason.key).toBe("schema.round.invalidationReason");
  });

  it("refuses an archived judgment that belongs to another round", () => {
    const broken = JSON.parse(serializeSession(session([round]))) as { rounds: Record<string, unknown>[] };
    broken.rounds[0].archivedJudgments = ["judgment-r2-previous-1767225600000.md"];
    const parsed = parseSessionFile(JSON.stringify(broken), REVIEW_ID);
    expect(parsed.status).toBe("malformed");
    if (parsed.status !== "malformed") return;
    expect(parsed.reason.key).toBe("schema.round.archivedJudgments");
  });
});

describe("event detail", () => {
  const base = {
    v: 1 as const,
    ts: NOW,
    reviewSessionId: REVIEW_ID,
    round: 2,
    reviewState: null,
    resourceState: null,
    note: null,
  };

  it("carries the duplicate continuation as data, not as a sentence", () => {
    const event = {
      ...base,
      type: "duplicate_continued" as const,
      note: "the contract changed after the first review",
      detail: {
        kind: "duplicate_continued" as const,
        invalidationReason: "RELEVANT_CONTRACT_CHANGED" as const,
        priorReviews: [{ reviewId: REVIEW_ID, round: 1 }],
      },
    };
    const parsed = parseEventLine(serializeEvent(event));
    expect(parsed).toEqual(event);
    // The note is along for the ride; the reason is what a reader acts on.
    expect(parsed?.detail?.kind).toBe("duplicate_continued");
  });

  it("carries the evidence decisions as data", () => {
    const event = {
      ...base,
      type: "evidence_reused" as const,
      detail: {
        kind: "evidence_reused" as const,
        items: [
          {
            id: "prior-result",
            source: "INDEPENDENT_REVIEW_RESULT" as const,
            boundHead: HEAD_A,
            capturedAt: NOW,
            status: "REUSABLE" as const,
            reason: "SHA_BOUND" as const,
          },
        ],
      },
    };
    expect(parseEventLine(serializeEvent(event))).toEqual(event);
  });

  it("skips a line whose detail does not match its type", () => {
    const line = JSON.stringify({
      ...base,
      type: "evidence_reused",
      detail: { kind: "duplicate_continued", invalidationReason: "BASE_CHANGED", priorReviews: [] },
    });
    expect(parseEventLine(line)).toBeNull();
  });

  it("skips a line whose detail is malformed rather than half-reading it", () => {
    const line = JSON.stringify({
      ...base,
      type: "duplicate_continued",
      detail: { kind: "duplicate_continued", invalidationReason: "NOT_A_REASON", priorReviews: [] },
    });
    expect(parseEventLine(line)).toBeNull();
  });

  it("reads a line written before Phase 3, which has no detail at all", () => {
    const line = JSON.stringify({ ...base, type: "request_saved", note: "request-r2.md" });
    const parsed = parseEventLine(line);
    expect(parsed?.detail).toBeNull();
    expect(parsed?.type).toBe("request_saved");
  });
});

describe("handoff", () => {
  const firstRound: RoundRecord = {
    ...newRound(1, HEAD_A),
    reviewedHead: HEAD_A,
    requestSavedAt: "2026-01-01T10:00:00.000Z",
    resultCapturedAt: "2026-01-01T11:00:00.000Z",
    verdict: "FIX_REQUIRED",
    verdictConfirmedAt: "2026-01-01T13:00:00.000Z",
    verdictNote: "修正必須が2件",
    riskTier: "TIER_1",
  };

  it("hands the required fixes over with everything the next round needs", () => {
    const handoff = buildRequiredFixHandoff(session([firstRound]), firstRound);
    expect(handoff).toEqual({
      fromRound: 1,
      reviewedHead: HEAD_A,
      resultArtifact: "result-r1.md",
      responseCapturedAt: "2026-01-01T11:00:00.000Z",
      verdict: "FIX_REQUIRED",
      verdictNote: "修正必須が2件",
      nextAction: "Fix the two required findings",
      riskTier: "TIER_1",
    });
  });

  it("points at the Final Judgment when the round had a Turn 2", () => {
    const withJudgment: RoundRecord = {
      ...firstRound,
      followupSavedAt: "2026-01-01T12:00:00.000Z",
      judgmentCapturedAt: "2026-01-01T12:30:00.000Z",
    };
    const handoff = buildRequiredFixHandoff(session([withJudgment]), withJudgment);
    expect(handoff?.resultArtifact).toBe("judgment-r1.md");
    expect(handoff?.responseCapturedAt).toBe("2026-01-01T12:30:00.000Z");
  });

  it("produces nothing for a round that passed or has no confirmed verdict", () => {
    expect(buildRequiredFixHandoff(session([{ ...firstRound, verdict: "REVIEW_PASS" }]), { ...firstRound, verdict: "REVIEW_PASS" })).toBeNull();
    const open = { ...firstRound, verdict: null, verdictConfirmedAt: null };
    expect(buildRequiredFixHandoff(session([open]), open)).toBeNull();
  });

  it("keeps the relation between the new round and the one before it", () => {
    const second: RoundRecord = {
      ...newRound(2, HEAD_B),
      revalidation: {
        reason: "BASE_CHANGED",
        priorReviews: [{ reviewId: REVIEW_ID, round: 1 }],
        explanation: "base moved",
      },
      evidenceDecisions: [
        {
          id: "prior-result",
          source: "INDEPENDENT_REVIEW_RESULT",
          boundHead: HEAD_A,
          capturedAt: "2026-01-01T11:00:00.000Z",
          status: "RECHECK_REQUIRED",
          reason: "BOUND_TO_ANOTHER_HEAD",
        },
      ],
    };
    const handoff = buildReReviewHandoff(session([firstRound, second]));
    expect(handoff).toEqual({
      previousRound: 1,
      previousReviewedHead: HEAD_A,
      previousVerdict: "FIX_REQUIRED",
      previousResultArtifact: "result-r1.md",
      currentRound: 2,
      currentExpectedHead: HEAD_B,
      reusedEvidence: second.evidenceDecisions,
      revalidationReason: "BASE_CHANGED",
      revalidationExplanation: "base moved",
    });
  });

  it("has no handoff for a first round", () => {
    expect(buildReReviewHandoff(session([firstRound]))).toBeNull();
  });

  it("never rewrites the previous round while building the handoff", () => {
    const before = JSON.stringify(firstRound);
    const second = newRound(2, HEAD_B);
    buildReReviewHandoff(session([firstRound, second]));
    buildRequiredFixHandoff(session([firstRound]), firstRound);
    expect(JSON.stringify(firstRound)).toBe(before);
  });
});

describe("the two-turn protocol invariant", () => {
  const base: RoundRecord = { ...newRound(1, HEAD_A), reviewedHead: HEAD_A, requestSavedAt: "2026-01-01T10:00:00.000Z" };

  it.each(VERDICT_GATE_TABLE)("$label", (row) => {
    const round: RoundRecord = {
      ...base,
      resultCapturedAt: row.resultCapturedAt,
      followupSavedAt: row.followupSavedAt,
      judgmentCapturedAt: row.judgmentCapturedAt,
    };
    const start = { ...session([round]), reviewState: "REVIEWING" as const };
    const result = applyReviewAction(
      start,
      { type: "confirmVerdict", verdict: "REVIEW_PASS", note: null, confirmedByHuman: true },
      "2026-01-01T14:00:00.000Z",
    );
    expect(result.ok).toBe(row.allowed);
    if (!result.ok) expect(result.error.key).toBe(row.refusal);
    // Whatever the answer, the round's own record is untouched by asking.
    expect(round.verdict).toBeNull();
  });

  it("refuses a file that claims a Final Judgment without a Turn 2", () => {
    const impossible = {
      ...newRound(1, HEAD_A),
      resultCapturedAt: "2026-01-01T11:00:00.000Z",
      judgmentCapturedAt: "2026-01-01T12:30:00.000Z",
    };
    const parsed = parseSessionFile(serializeSession(session([impossible])), REVIEW_ID);
    expect(parsed.status).toBe("malformed");
    if (parsed.status !== "malformed") return;
    expect(parsed.reason.key).toBe("schema.round.judgmentWithoutFollowup");
  });

  it("lets a round written before Phase 3 confirm a verdict exactly as it used to", () => {
    const fixture = readFileSync(`fixtures/v1/valid/reviews/${REVIEW_ID}/session.json`, "utf8");
    const parsed = parseSessionFile(fixture, REVIEW_ID);
    if (parsed.status !== "ok") throw new Error("fixture must parse");
    const round = parsed.value.rounds[parsed.value.rounds.length - 1];
    expect(round.followupSavedAt).toBeNull();
    const start = { ...parsed.value, reviewState: "REVIEWING" as const };
    const result = applyReviewAction(
      start,
      { type: "confirmVerdict", verdict: "REVIEW_PASS", note: null, confirmedByHuman: true },
      "2026-01-01T14:00:00.000Z",
    );
    expect(result.ok).toBe(round.resultCapturedAt !== null);
  });
});

describe("the order the protocol is persisted in", () => {
  it.each(PERSISTED_ORDER_TABLE)("$label", (row) => {
    const round: RoundRecord = {
      ...newRound(1, HEAD_A),
      requestSavedAt: "2026-01-01T10:00:00.000Z",
      resultCapturedAt: row.resultCapturedAt,
      followupSavedAt: row.followupSavedAt,
      judgmentCapturedAt: row.judgmentCapturedAt,
    };
    const parsed = parseSessionFile(serializeSession(session([round])), REVIEW_ID);
    expect(parsed.status).toBe(row.valid ? "ok" : "malformed");
    if (parsed.status === "malformed") expect(parsed.reason.key).toBe(row.refusal);
  });
});

describe("the Tier 2 subjects the Human declared", () => {
  it("come back after a restart, so the canonical rule stays enforceable", () => {
    const round: RoundRecord = {
      ...newRound(1, HEAD_A),
      resultCapturedAt: "2026-01-01T11:00:00.000Z",
      riskTier: "TIER_2",
      riskTierSubjects: ["SECURITY", "MIGRATION"],
    };
    const parsed = parseSessionFile(serializeSession(session([round])), REVIEW_ID);
    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") return;
    const restored = parsed.value.rounds[0];
    expect(restored.riskTierSubjects).toEqual(["SECURITY", "MIGRATION"]);
    // And the rule still refuses a downgrade, because the subjects survived.
    expect(validateTierChoice({ chosen: "TIER_1", subjects: restored.riskTierSubjects }).ok).toBe(false);
  });

  it("read as empty in a round written before Phase 3", () => {
    const fixture = readFileSync(`fixtures/v1/valid/reviews/${REVIEW_ID}/session.json`, "utf8");
    const parsed = parseSessionFile(fixture, REVIEW_ID);
    if (parsed.status !== "ok") throw new Error("fixture must parse");
    expect(parsed.value.rounds[0].riskTierSubjects).toEqual([]);
  });

  it("refuse a subject that is not one of the canonical five", () => {
    const round = { ...newRound(1, HEAD_A), riskTier: "TIER_2" as const, riskTierSubjects: ["SECURITY" as const] };
    const broken = JSON.parse(serializeSession(session([round]))) as { rounds: Record<string, unknown>[] };
    broken.rounds[0].riskTierSubjects = ["SECURITY", "VIBES"];
    const parsed = parseSessionFile(JSON.stringify(broken), REVIEW_ID);
    expect(parsed.status).toBe("malformed");
    if (parsed.status !== "malformed") return;
    expect(parsed.reason.key).toBe("schema.event.unknownTierSubject");
  });
});
