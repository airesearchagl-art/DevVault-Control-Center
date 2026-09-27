import { compareHead } from "./freshness";
import type { InvalidationReason } from "./revalidation";

/**
 * Which pieces of evidence may be carried into the next review, from the canonical contract
 * (`02_Prompts/GPTS_Review_Agent/DevVault_Review_Depth_Tiering.md` at obsidian-vault main
 * `77ce41e`, lines 43–47 and 67):
 *
 * > SHA-boundで有効な既確認Evidenceはreuseする。head、base、対象blob、relevant contract、実行環境等に
 * > 合理的な失効理由がある部分だけを再確認する。
 * > …old headの結論を無検証で流用しない。
 *
 * Two things follow, and both are implemented here. Reuse is decided **per item**, not for the set:
 * a contract change makes the contract-bound evidence stale and leaves the rest alone. And an item
 * whose binding cannot be checked is never assumed reusable — the answer is that it is unavailable.
 *
 * Derived Freshness is deliberately not one of these kinds: it is a conclusion drawn from evidence,
 * not evidence to carry forward, and the canonical rules bind evidence to a head, not to a status.
 */

export const EVIDENCE_SOURCES = [
  "GIT_OBSERVATION",
  "HUMAN_RECORDED_HEAD",
  "INDEPENDENT_REVIEW_RESULT",
  "PRIOR_RUN_EVIDENCE",
] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

export interface EvidenceItem {
  id: string;
  source: EvidenceSource;
  /** The head this evidence was established against. `null` means the binding is not recorded. */
  boundHead: string | null;
  /** Set when the evidence also depends on the base it was compared against. */
  boundBase: string | null;
  /** When it was captured or reviewed; kept so the Human can see how old it is. */
  capturedAt: string | null;
  /** Whether the item's validity depends on the file(s) under review, the relevant contract, or the environment it ran in. */
  blobBound: boolean;
  contractBound: boolean;
  environmentBound: boolean;
}

export const EVIDENCE_STATUSES = ["REUSABLE", "RECHECK_REQUIRED", "UNAVAILABLE"] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

/** Why an item is not simply reusable, in language-neutral terms the interface can translate. */
export const EVIDENCE_REASONS = [
  "SHA_BOUND",
  "NO_BINDING",
  "HEAD_NOT_COMPARABLE",
  "BOUND_TO_ANOTHER_HEAD",
  "BASE_CHANGED",
  "TARGET_BLOB_CHANGED",
  "RELEVANT_CONTRACT_CHANGED",
  "EXECUTION_ENVIRONMENT_CHANGED",
] as const;
export type EvidenceReason = (typeof EVIDENCE_REASONS)[number];

export interface EvidenceAssessment {
  id: string;
  status: EvidenceStatus;
  reason: EvidenceReason;
}

export interface EvidenceContext {
  /** The head the next review will be about. */
  currentHead: string | null;
  /** The invalidation reasons the Human recorded for this round. */
  invalidationReasons: readonly InvalidationReason[];
}

const BINDING_OF: Partial<Record<InvalidationReason, { binding: keyof EvidenceItem; reason: EvidenceReason }>> = {
  BASE_CHANGED: { binding: "boundBase", reason: "BASE_CHANGED" },
  TARGET_BLOB_CHANGED: { binding: "blobBound", reason: "TARGET_BLOB_CHANGED" },
  RELEVANT_CONTRACT_CHANGED: { binding: "contractBound", reason: "RELEVANT_CONTRACT_CHANGED" },
  EXECUTION_ENVIRONMENT_CHANGED: { binding: "environmentBound", reason: "EXECUTION_ENVIRONMENT_CHANGED" },
};

export function assessEvidenceItem(item: EvidenceItem, context: EvidenceContext): EvidenceAssessment {
  if (item.boundHead === null) return { id: item.id, status: "UNAVAILABLE", reason: "NO_BINDING" };

  const comparison = compareHead(item.boundHead, context.currentHead);
  if (comparison === "unknown") return { id: item.id, status: "UNAVAILABLE", reason: "HEAD_NOT_COMPARABLE" };
  if (comparison === "differs") {
    // An old head's conclusion is never carried over unverified.
    return { id: item.id, status: "RECHECK_REQUIRED", reason: "BOUND_TO_ANOTHER_HEAD" };
  }
  if (context.invalidationReasons.includes("HEAD_CHANGED")) {
    return { id: item.id, status: "RECHECK_REQUIRED", reason: "BOUND_TO_ANOTHER_HEAD" };
  }

  for (const invalidation of context.invalidationReasons) {
    const rule = BINDING_OF[invalidation];
    if (rule === undefined) continue;
    const bound = rule.binding === "boundBase" ? item.boundBase !== null : item[rule.binding] === true;
    if (bound) return { id: item.id, status: "RECHECK_REQUIRED", reason: rule.reason };
  }

  return { id: item.id, status: "REUSABLE", reason: "SHA_BOUND" };
}

export function assessEvidence(items: readonly EvidenceItem[], context: EvidenceContext): EvidenceAssessment[] {
  return items.map((item) => assessEvidenceItem(item, context));
}
