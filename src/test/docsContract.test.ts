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
    // Phase 4b-1.2 (LRP-20261002-DVCC-010 §32): merged via PR #9, with the new main SHA.
    expect(status).toMatch(/Phase 4b-1\.2[\s\S]*merged via[\s>]+PR #9/);
    expect(status).toMatch(/a54a77e12d2b144027d4dec96c1f14236f3715fd/);
    // Phase 4b-2b is on its branch: under development, not merged, not released.
    expect(status).toMatch(/Phase 4b-2b[\s\S]*under development[\s\S]*not merged/);
    expect(status).toMatch(/On `main`, DVCC copies a Resume command[\s\S]*it does not execute it/);
    expect(status).toMatch(/Not[\s>]+released; no[\s>]+installer is published\./);
    expect(status).not.toMatch(/under review|no pull request has been opened|released via|merged via[\s>]+PR #10/);
  });

  it("only Phase 4b-2b is described as under development (PR #8 / PR #9 reconciliation)", () => {
    const positions = [...readme.matchAll(/under development/g)].map((match) => match.index ?? 0);
    expect(positions.length).toBeGreaterThan(0);
    // Each mention belongs to Phase 4b-2b: it is named within the same sentence just before.
    for (const at of positions) expect(readme.slice(Math.max(0, at - 160), at)).toMatch(/Phase 4b-2b/);
    expect(readme).toMatch(/\*\*Resume Handoff\*\* \(Phase 4b-2a, merged via PR #8\)/);
    expect(readme).toMatch(/DVCC copies the\s+command; it does not run it/);
  });
});

describe("README Resume in Codex boundary (Phase 4b-2b, LRP-20261002-DVCC-010 §32)", () => {
  const section = readme.slice(readme.indexOf("**Resume in Codex**"), readme.indexOf("**Japanese and English**"));

  it("states the launch boundary explicitly", () => {
    expect(section).toMatch(/one native Codex process, only after Human confirmation/);
    expect(section).toMatch(/no shell, no terminal launcher/);
    expect(section).toMatch(/no provider output is\s+captured/);
    expect(section).toMatch(/Copy Resume Command remains available/);
    expect(section).toMatch(/DVCC does not observe whether Codex resumed the session/);
    expect(section).toMatch(/no Claude Code launcher exists/);
  });

  it("never claims the launch resumed the session or that anything is released", () => {
    expect(section).not.toMatch(/resumed successfully|is released|installer is available/i);
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
