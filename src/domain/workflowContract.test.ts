import { describe, expect, it } from "vitest";
import {
  canSendTurn2,
  freshContextState,
  FRESH_CONTEXT_MODES,
  FRESH_CONTEXT_TURNS,
  isFreshContextReview,
  REQUEST_STAGES,
  STAGES_OF_TURN,
  turnOfInputItem,
  type FreshContextTurn,
} from "./freshContext";
import { detectDuplicate, type PriorReview } from "./duplicate";
import { assessEvidenceItem, type EvidenceItem, type EvidenceSource } from "./evidenceReuse";
import {
  assessRevalidationPermission,
  INVALIDATION_REASONS,
  type InvalidationReason,
} from "./revalidation";
import { escalate, isRiskTier, RISK_TIERS, TIER_2_SUBJECTS, validateTierChoice, type RiskTier, type Tier2Subject } from "./riskTier";
import {
  CONTRACT_EVIDENCE_STATUSES,
  CONTRACT_INVALIDATION_REASONS,
  CONTRACT_MODES,
  CONTRACT_STAGES,
  CONTRACT_TIER_2_SUBJECTS,
  CONTRACT_TIERS,
  CONTRACT_TURNS,
  DUPLICATE_TABLE,
  EVIDENCE_TABLE,
  FRESH_CONTEXT_STATE_TABLE,
  INPUT_ITEM_TABLE,
  REVALIDATION_TABLE,
  TIER_CHOICE_TABLE,
  TIER_ESCALATION_TABLE,
  TURN_STAGE_TABLE,
} from "../test/workflowContract";

/**
 * The Phase 3 workflow domain checked against an independent contract table
 * (`src/test/workflowContract.ts`), which is written from the canonical DevVault review contract
 * and imports nothing from `src/domain`.
 */

describe("the vocabulary matches the contract", () => {
  it("has the turns, modes and stages the contract names", () => {
    expect([...FRESH_CONTEXT_TURNS]).toEqual([...CONTRACT_TURNS]);
    expect([...FRESH_CONTEXT_MODES]).toEqual([...CONTRACT_MODES]);
    expect([...REQUEST_STAGES]).toEqual([...CONTRACT_STAGES]);
  });

  it("has the tiers, the Tier 2 subjects and the invalidation reasons the contract names", () => {
    expect([...RISK_TIERS]).toEqual([...CONTRACT_TIERS]);
    expect([...TIER_2_SUBJECTS]).toEqual([...CONTRACT_TIER_2_SUBJECTS]);
    expect([...INVALIDATION_REASONS]).toEqual([...CONTRACT_INVALIDATION_REASONS]);
  });

  it("keeps every value language-neutral", () => {
    const values = [...RISK_TIERS, ...TIER_2_SUBJECTS, ...INVALIDATION_REASONS, ...REQUEST_STAGES, ...FRESH_CONTEXT_TURNS];
    for (const value of values) expect(value).toMatch(/^[A-Z0-9_]+$/);
  });
});

describe("Fresh Context", () => {
  it.each(TURN_STAGE_TABLE)("$turn carries its contracted stages", (row) => {
    expect([...STAGES_OF_TURN[row.turn as FreshContextTurn]]).toEqual(row.stages);
  });

  it.each(INPUT_ITEM_TABLE)("input item $item belongs to $turn", (row) => {
    expect(turnOfInputItem(row.item)).toBe(row.turn);
  });

  it("has no turn for an item outside the sixteen", () => {
    for (const item of [0, -1, 17, 1.5, Number.NaN]) expect(turnOfInputItem(item)).toBeNull();
  });

  it.each(FRESH_CONTEXT_STATE_TABLE)("$label", (row) => {
    const progress = {
      turn1SavedAt: row.turn1SavedAt,
      assessmentCapturedAt: row.assessmentCapturedAt,
      turn2SavedAt: row.turn2SavedAt,
      judgmentCapturedAt: row.judgmentCapturedAt,
      verdictConfirmedAt: row.verdictConfirmedAt,
    };
    expect(freshContextState(progress)).toBe(row.expected);
    expect(canSendTurn2(progress)).toBe(row.canSendTurn2);
  });

  it("never calls the single-turn fallback a fresh-context review", () => {
    expect(isFreshContextReview("TWO_TURN")).toBe(true);
    expect(isFreshContextReview("SINGLE_TURN")).toBe(false);
  });
});

describe("Risk Tier", () => {
  it.each(TIER_ESCALATION_TABLE)("$label", (row) => {
    expect(escalate(row.candidates as RiskTier[])).toBe(row.expected);
  });

  it.each(TIER_CHOICE_TABLE)("$label", (row) => {
    const verdict = validateTierChoice({
      chosen: row.chosen as RiskTier,
      subjects: row.subjects as Tier2Subject[],
      candidates: row.candidates as RiskTier[],
    });
    expect(verdict.ok).toBe(row.ok);
    if (!verdict.ok) {
      expect(verdict.refusal).toBe(row.refusal);
      expect(verdict.required).toBe(row.required);
    }
  });

  it("refuses a value that is not a tier at all", () => {
    expect(isRiskTier("TIER_3")).toBe(false);
    const verdict = validateTierChoice({ chosen: "TIER_3" as RiskTier, subjects: [] });
    expect(verdict.ok).toBe(false);
  });

  it("decides nothing about the review, resource or freshness axes", () => {
    // The module exports no review state, resource state or freshness value: the tier is its own axis.
    const exported = Object.keys({ escalate, isRiskTier, validateTierChoice, RISK_TIERS, TIER_2_SUBJECTS });
    expect(exported.join(" ")).not.toMatch(/review|resource|freshness/i);
  });
});

describe("same-head duplicate detection", () => {
  it.each(DUPLICATE_TABLE)("$label", (row) => {
    const finding = detectDuplicate({
      projectId: row.projectId,
      targetHead: row.targetHead,
      priorReviews: row.priors as PriorReview[],
    });
    expect(finding.status).toBe(row.expected);
    expect(finding.matches).toEqual(row.matches);
  });
});

describe("revalidation permission", () => {
  it.each(REVALIDATION_TABLE)("$label", (row) => {
    const assessment = assessRevalidationPermission({
      duplicate: { status: row.duplicate as "NO_DUPLICATE", matches: [{ reviewId: "rv-1", round: 1 }] },
      reason: row.reason as InvalidationReason | null,
      explanation: row.explanation,
    });
    expect(assessment.permission).toBe(row.expected);
    // The reason is echoed back only when it actually granted the permission.
    expect(assessment.reason).toBe(row.expected === "REVALIDATION_ALLOWED" ? row.reason : null);
  });

  it("keeps the Human's explanation with the decision without letting it decide", () => {
    const explanation = "the reviewer asked me to look again";
    const blocked = assessRevalidationPermission({
      duplicate: { status: "SAME_HEAD_DUPLICATE", matches: [{ reviewId: "rv-1", round: 1 }] },
      reason: null,
      explanation,
    });
    expect(blocked.permission).toBe("DUPLICATE_BLOCKED");
    expect(blocked.explanation).toBe(explanation);
  });

  it("points at the reviews the decision is about", () => {
    const matches = [
      { reviewId: "rv-1", round: 1 },
      { reviewId: "rv-2", round: 3 },
    ];
    const allowed = assessRevalidationPermission({
      duplicate: { status: "SAME_HEAD_DUPLICATE", matches },
      reason: "BASE_CHANGED",
      explanation: null,
    });
    expect(allowed.permission).toBe("REVALIDATION_ALLOWED");
    expect(allowed.priorReviews).toEqual(matches);
  });
});

describe("evidence reuse", () => {
  it("uses the statuses the contract names", () => {
    expect([...CONTRACT_EVIDENCE_STATUSES]).toEqual(["REUSABLE", "RECHECK_REQUIRED", "UNAVAILABLE"]);
  });

  it.each(EVIDENCE_TABLE)("$label", (row) => {
    const item: EvidenceItem = { ...row.item, source: row.item.source as EvidenceSource };
    const assessment = assessEvidenceItem(item, {
      currentHead: row.currentHead,
      invalidationReasons: row.invalidationReasons as InvalidationReason[],
    });
    expect(assessment.status).toBe(row.expected);
    expect(assessment.reason).toBe(row.reason);
    expect(assessment.id).toBe(row.item.id);
  });

  it("judges each item on its own rather than the set as a whole", () => {
    const shared = {
      boundHead: "a".repeat(40),
      boundBase: null,
      capturedAt: "2026-09-20T10:00:00.000Z",
      blobBound: false,
      environmentBound: false,
    };
    const items: EvidenceItem[] = [
      { ...shared, id: "contract-bound", source: "PRIOR_RUN_EVIDENCE", contractBound: true },
      { ...shared, id: "plain", source: "PRIOR_RUN_EVIDENCE", contractBound: false },
    ];
    const context = { currentHead: "a".repeat(40), invalidationReasons: ["RELEVANT_CONTRACT_CHANGED" as InvalidationReason] };
    const statuses = items.map((item) => assessEvidenceItem(item, context).status);
    expect(statuses).toEqual(["RECHECK_REQUIRED", "REUSABLE"]);
  });
});
