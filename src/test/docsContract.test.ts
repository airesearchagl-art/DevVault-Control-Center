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
    // Phase 4b-2b (post-4b-2b current-state repair): merged via PR #10, with the new main SHA and
    // the real-launch dogfood gate result.
    expect(status).toMatch(/Phase 4b-2b[\s\S]*merged via[\s>]+PR #10/);
    expect(status).toMatch(/2000a68fbc1c6ad1c573a30e820554c9110b4ce0/);
    expect(status).toMatch(/`REAL_CODEX_LAUNCH_DOGFOOD_GATE`: PASS/);
    // On `main` the copy action stays copy-only, and the launch needs explicit confirmation and
    // never becomes a shell, an output capture or session control.
    expect(status).toMatch(/On `main`, DVCC copies a Resume command for[\s>]+you to run/);
    expect(status).toMatch(/only[\s>]+after your explicit confirmation/);
    expect(status).toMatch(/runs no shell, captures no provider output/);
    expect(status).toMatch(/does not observe or control the[\s>]+session after the process starts/);
    // Still not released, and nothing has gone to Production.
    expect(status).toMatch(/Not[\s>]+released; no[\s>]+installer is published\./);
    expect(status).toMatch(/Production: not[\s>]+performed\./);
    expect(status).not.toMatch(/under review|no pull request has been opened|released via|is released|installer is available/i);
  });

  it("no current-facing README text describes Phase 4b-2b as under development or not merged", () => {
    // Every phase the README names is merged. A later in-progress phase must update this test
    // deliberately rather than inherit stale wording.
    expect(readme).not.toMatch(/under development/);
    expect(readme).not.toMatch(/not merged/);
    expect(readme).not.toMatch(/feat\/session-resume-launcher-v0\.4b2b/);
    expect(readme).toMatch(/\*\*Resume Handoff\*\* \(Phase 4b-2a, merged via PR #8\)/);
    expect(readme).toMatch(/\*\*Resume in Codex\*\* \(Phase 4b-2b, merged via PR #10\)/);
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
