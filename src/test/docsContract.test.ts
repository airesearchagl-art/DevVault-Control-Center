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
  it("states what is merged, what is deferred, and that nothing is released", () => {
    const status = readme.slice(readme.indexOf("> Status:"), readme.indexOf("## What it does"));
    expect(status).toMatch(/Phase 1 .*Phase 2 .*Localization[\s\S]*merged/);
    expect(status).toMatch(/Phase 4a[\s\S]*merged via[\s>]+PR #5/);
    expect(status).toMatch(/Phase 4b-1[\s\S]*merged via[\s>]+PR #6/);
    expect(status).toMatch(/93a703e6a7eba5ec1c66a5eaf43f0c0edbf2f69d/);
    expect(status).toMatch(/Phase 4b-1\.1[\s\S]*merged via[\s>]+PR #7/);
    expect(status).toMatch(/Phase 4b-2a[\s\S]*merged via[\s>]+PR #8/);
    expect(status).toMatch(/fda753d147d136f961e5c45d51c32f42cbe28bfc/);
    expect(status).toMatch(/Phase 4b-2b[\s\S]*deferred[\s>]+and[\s>]+not[\s>]+implemented/);
    expect(status).toMatch(/DVCC copies a Resume command[\s\S]*it does not execute it/);
    expect(status).toMatch(/does not run, resume, launch or control any session/);
    expect(status).toMatch(/Not[\s>]+released; no[\s>]+installer is published\./);
    expect(status).not.toMatch(/under review|no pull request has been opened|under development/);
  });

  it("no feature is still described as under development once merged (PR #8 reconciliation)", () => {
    expect(readme).not.toMatch(/under development/);
    expect(readme).toMatch(/\*\*Resume Handoff\*\* \(Phase 4b-2a, merged via PR #8\)/);
    expect(readme).toMatch(/DVCC copies the\s+command; it does not run it/);
  });
});

describe("README provider data boundary (DF-06 / HD-4B12-02)", () => {
  const boundary = readme.slice(readme.indexOf("**Provider data boundary**"), readme.indexOf("**Resume Handoff**"));

  it("states the read-only Codex contract and permits SQLite -shm coordination updates", () => {
    expect(boundary).toMatch(/does not modify provider application data/);
    expect(boundary).toMatch(/opened \*\*read-only\*\*/);
    expect(boundary).toMatch(/WAL mode/);
    expect(boundary).toMatch(/`-shm` coordination file/);
    expect(boundary).toMatch(/read-mark \/\s+lock bytes/);
    expect(boundary).toMatch(/filesystem metadata/);
  });

  it("never regresses into claiming every provider file is unchanged", () => {
    expect(boundary).toMatch(/does not claim every provider file stays byte-identical/);
    expect(readme).not.toMatch(/all provider files (are|remain|stay) (unchanged|untouched|byte-identical)/i);
    expect(readme).not.toMatch(/provider files are never (modified|touched)/i);
  });
});
