import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REVIEW_EVENT_TYPES } from "../domain/events";
import { EVIDENCE_REASONS, EVIDENCE_SOURCES, EVIDENCE_STATUSES } from "../domain/evidenceReuse";
import { INVALIDATION_REASONS } from "../domain/revalidation";
import { newRound, SCHEMA_VERSION } from "../domain/review";
import { RISK_TIERS, TIER_2_SUBJECTS } from "../domain/riskTier";

/**
 * The written contract keeps up with the code: every stored name the code can write is named in
 * `docs/data-contract-v1.md`, and the README states the release status as it is.
 */

const contract = readFileSync("docs/data-contract-v1.md", "utf8");
const readme = readFileSync("README.md", "utf8");

describe("docs/data-contract-v1.md", () => {
  it("names every round field a round can hold", () => {
    // A v1 field is named in the example or the table; every Phase 3 field has its own table row.
    for (const field of Object.keys(newRound(1, null))) {
      expect(contract.includes(`\`rounds[].${field}\``) || contract.includes(`"${field}":`), field).toBe(true);
    }
    for (const field of ["followupSavedAt", "judgmentCapturedAt", "riskTier", "riskTierSubjects", "revalidation", "evidenceDecisions", "archivedJudgments"]) {
      expect(contract, field).toContain(`| \`rounds[].${field}\` | Phase 3, optional.`);
    }
  });

  it("names every event type", () => {
    for (const type of REVIEW_EVENT_TYPES) expect(contract, type).toContain(`\`${type}\``);
  });

  it("names every stored Phase 3 code", () => {
    for (const code of [...RISK_TIERS, ...TIER_2_SUBJECTS, ...INVALIDATION_REASONS, ...EVIDENCE_SOURCES, ...EVIDENCE_STATUSES, ...EVIDENCE_REASONS]) {
      expect(contract, code).toContain(`\`${code}\``);
    }
  });

  it("names the Phase 3 files and keeps schemaVersion 1", () => {
    for (const file of ["followup-r<N>.md", "judgment-r<N>.md", "judgment-r<N>-previous-<ms>[-<n>].md"]) expect(contract).toContain(file);
    expect(SCHEMA_VERSION).toBe(1);
    expect(contract).toContain("`schemaVersion` stays `1`");
  });
});

describe("README status", () => {
  it("states what is merged, what is in development, and that nothing is released", () => {
    const status = readme.slice(readme.indexOf("> Status:"), readme.indexOf("## What it does"));
    expect(status).toMatch(/Phase 1 .*Phase 2 .*Localization[\s\S]*merged/);
    expect(status).toMatch(/Phase 3[\s\S]*under development/);
    expect(status).toMatch(/no pull request has been opened/);
    expect(status).toMatch(/Not released; no installer is published\./);
    expect(status).not.toMatch(/under review/);
  });
});
