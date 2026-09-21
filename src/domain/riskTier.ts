/**
 * Risk Tier, as the canonical contract defines it
 * (`02_Prompts/GPTS_Review_Agent/DevVault_Review_Depth_Tiering.md` at obsidian-vault main
 * `77ce41e`: the three tiers at lines 13–31 and the boundary rules at lines 74–79).
 *
 * The tier decides how deep a review goes. It is an explicit Human decision — the canonical text
 * says a development IDE must not downgrade it by its own judgement — so nothing here infers a
 * tier. What this module does is hold the values, apply the two boundary rules the contract states,
 * and refuse a choice the contract forbids, with the reason named so the interface can show it.
 *
 * It is its own axis: it is not the Review State, not the Resource State, not Freshness, and not
 * the severity of a finding.
 */

export const RISK_TIERS = ["TIER_0", "TIER_1", "TIER_2"] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

export function isRiskTier(value: unknown): value is RiskTier {
  return typeof value === "string" && (RISK_TIERS as readonly string[]).includes(value);
}

/**
 * Subjects the contract sends to Tier 2 outright: "security、privacy、credential、production、
 * migrationに触れる変更はLOWへ分類しない（自動的にTier 2。この場合は曖昧性の有無に関わらずTier 2）".
 * The Human ticks these; DVCC does not detect them.
 */
export const TIER_2_SUBJECTS = ["SECURITY", "PRIVACY", "CREDENTIAL", "PRODUCTION", "MIGRATION"] as const;
export type Tier2Subject = (typeof TIER_2_SUBJECTS)[number];

export function isTier2Subject(value: unknown): value is Tier2Subject {
  return typeof value === "string" && (TIER_2_SUBJECTS as readonly string[]).includes(value);
}

const ORDER: Record<RiskTier, number> = { TIER_0: 0, TIER_1: 1, TIER_2: 2 };

/**
 * The one ambiguity rule: "候補Tierのうち高い方を採用する", with the exception that an ambiguity
 * between Tier 0 and Tier 1 stops at Tier 1 — the contract forbids jumping straight to Tier 2 from
 * that pair. An empty candidate list has no answer and is reported as such rather than guessed.
 */
export function escalate(candidates: readonly RiskTier[]): RiskTier | null {
  if (candidates.length === 0) return null;
  let highest = candidates[0];
  for (const candidate of candidates) {
    if (ORDER[candidate] > ORDER[highest]) highest = candidate;
  }
  return highest;
}

export type TierRefusal = "BELOW_TIER_2_SUBJECT" | "BELOW_CANDIDATES" | "NOT_A_TIER";

export interface TierChoice {
  /** What the Human picked. */
  chosen: RiskTier;
  /** Tier 2 subjects the Human declared for this change. */
  subjects: readonly Tier2Subject[];
  /** Other tiers under consideration, when the Human recorded more than one candidate. */
  candidates?: readonly RiskTier[];
}

export type TierVerdict = { ok: true; tier: RiskTier } | { ok: false; refusal: TierRefusal; required: RiskTier };

/**
 * Checks a Human's choice against the two canonical rules. It never changes the choice: a choice
 * the contract forbids comes back refused, with the tier the contract requires, so the interface
 * can say why instead of silently correcting it.
 */
export function validateTierChoice(choice: TierChoice): TierVerdict {
  if (!isRiskTier(choice.chosen)) return { ok: false, refusal: "NOT_A_TIER", required: "TIER_2" };

  if (choice.subjects.length > 0 && choice.chosen !== "TIER_2") {
    return { ok: false, refusal: "BELOW_TIER_2_SUBJECT", required: "TIER_2" };
  }

  const candidates = choice.candidates ?? [];
  if (candidates.length > 0) {
    const required = escalate([...candidates, choice.chosen]) as RiskTier;
    if (ORDER[choice.chosen] < ORDER[required]) {
      return { ok: false, refusal: "BELOW_CANDIDATES", required };
    }
  }
  return { ok: true, tier: choice.chosen };
}
