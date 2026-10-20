import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BLOCKED_REASONS,
  CONTROL_READ_CONTRACT,
  CONTROL_READ_ERROR_CODES,
  CONTROL_READ_ERROR_REASONS,
  CONTROL_READ_OPERATIONS,
  FACT_CLASSES,
  HUMAN_CONFIRMATIONS,
  LIMIT_KINDS,
  OMITTED_SECTIONS,
  RULE_IDS,
  UNKNOWN_REASONS,
} from "../domain/controlRead/contract";
import { EVIDENCE_REF_KINDS, REVIEW_FIELDS, REVIEW_ROUND_FIELDS } from "../domain/controlRead/evidenceRef";
import {
  ACTION_ELIGIBILITY_ERROR_REASONS,
  ACTION_IDS,
  CHECK_IDS,
  CHECK_OUTCOMES,
  DISPOSITIONS,
  NOT_EVALUATED_SCOPES,
  PAYLOAD_FIELDS,
  REASON_CODES,
} from "../domain/actionEligibility/contract";
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

  it("records Phase 5A as merged via PR #12 and closed, with nothing released", () => {
    const status = readme.slice(readme.indexOf("> Status:"), readme.indexOf("## What it does"));
    // Phase 5A (post-Phase-5A-merge current-state repair, QD-5A-05): merged via PR #12, with the new
    // main SHA.
    expect(status).toMatch(/Phase 5A \(Control Read Contract v1, merged via[\s>]+PR #12/);
    expect(status).toMatch(/`main` after PR #12: `bd50c37c58e70afc101e9227db86be4ccb6b000c`/);
    expect(status).toMatch(/Phase 5A: merged \/ closed\./);
    // Control Read stays read-only and copy-only for the Human; get_run_state stays reserved, and
    // there is no transport and no agent or Worker / Run authority.
    expect(status).toMatch(/Control Read \(Phase 5A\) remains read-only/);
    expect(status).toMatch(/\*\*Copy control snapshot \(JSON\)\*\*/);
    for (const operation of ["get_control_snapshot", "get_project_state", "get_review_state"]) expect(status, operation).toContain(`\`${operation}\``);
    expect(status).toMatch(/`get_run_state` is reserved and fails closed/);
    expect(status).toMatch(/No MCP transport, no IPC endpoint, no agent write[\s>]+authority and no Worker \/ Run authority\./);
    // Phase 5B is merged and closed, Phase 5C has not started, and nothing is released or in
    // Production.
    expect(status).toMatch(/Phase 5B: merged \/ closed \(PR #14\)\./);
    expect(status).toMatch(/Not[\s>]+released; no[\s>]+installer is published/);
    expect(status).toMatch(/Release: not[\s>]+performed\./);
    expect(status).toMatch(/Production: not[\s>]+performed\./);
    expect(status).not.toMatch(/Phase 5 (is )?complete|Phase 5B (is )?(started|in progress)|Phase 5C (is )?(started|in progress|merged|complete)|Production (is )?complete/i);
  });

  it("records Phase 5B as merged via PR #14 and closed, CI-R1 / CI-R2 via PR #15, and Phase 5C not started", () => {
    const status = readme.slice(readme.indexOf("> Status:"), readme.indexOf("## What it does"));
    // Phase 5B (post-PR15 current-state repair, DVCC-POST-PR15-README-REPAIR-01): merged via PR #14,
    // with the main SHA after PR #14; Phase 5A's current-state repair went in via PR #13.
    expect(status).toMatch(/current-state repair via[\s>]+PR #13/);
    expect(status).toMatch(/Phase 5B \(Action Eligibility Contract v1, Domain-only, merged via PR #14/);
    expect(status).toMatch(/`main` after[\s>]+PR #14: `1cd78c33bbef36963f34ea6d26f2e7e51c4c78a3`/);
    expect(status).not.toMatch(/Phase 5B: not[\s>]+started/);
    // The Phase 5B contract only assesses: no authority, no wiring, no Worker execution.
    expect(status).toMatch(/`dvcc\.action-eligibility`[\s>]+version `1`/);
    expect(status).toContain('`authority: "NONE"`');
    expect(status).toMatch(/no MCP, IPC, Tauri or UI wiring, no Worker[\s>]+execution, no execution authority and no Worker \/ Run authority\./);
    // CI-R1 / CI-R2 merged via PR #15, with the main SHA; its C2 evidence is checked as history below.
    expect(status).toMatch(/CI-R1 and CI-R2 are merged via PR #15/);
    expect(status).toMatch(/`main` after PR #15:[\s>]+`6df0755e3eea80f1e4dbdb0280bbca9ff6f6d828`/);
    expect(status).toContain("`cargo check --locked` (CI-R1)");
    expect(status).toContain("`cargo test --no-run --locked` (CI-R2)");
    // Phase 5C has not started and its implementation is not authorized.
    expect(status).toMatch(/Phase 5C: planned \/ not started;[\s>]+implementation authorization not issued\./);
  });

  it("records CI-R3 via PR #17 and CI-R4 via PR #18 with the current C2 evidence", () => {
    const status = readme.slice(readme.indexOf("> Status:"), readme.indexOf("## What it does"));
    // Post-PR18 current-state repair (DVCC-POST-PR18-README-REPAIR-01): C2 runs the Rust tests
    // (CI-R3) and three environment-dependent checks print a fixed EXECUTED marker (CI-R4).
    expect(status).toMatch(/CI-R3 is merged via[\s>]+PR #17/);
    expect(status).toMatch(/`main` after PR #17: `91da83fc1f31b550d4c116ed999941bf35284a79`/);
    expect(status).toMatch(/with `cargo test --locked -- --show-output`/);
    expect(status).toMatch(/CI-R4 is merged via PR #18/);
    expect(status).toMatch(/`main` after PR #18:[\s>]+`9f86c186413bcc96f5d9ea2ea5c5cc1fd3345465`/);
    for (const marker of ["E5-CHAIN", "E5-RELATIVE", "P4B2B-EXE-NETLINK"]) expect(status, marker).toContain(`\`${marker}\``);
    // 105 of the 107 Rust tests pass and 2 are ignored: never 107 passed.
    expect(status).not.toMatch(/\b107[\s>]+(Rust[\s>]+)?(tests?:?[\s>]+)?(passed|PASS)|Rust tests?:?[\s>]+107[\s>]+(passed|PASS)/i);

    const start = status.indexOf("Current CI evidence:");
    const end = status.indexOf("Historical record (PR #15");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const current = status.slice(start, end);
    expect(current).toMatch(/C2 run `39367427280` on the PR #18 head[\s>]+\(`f525fbbbb702f176edc6e6f0b42b24ab795e7962`\): SUCCESS/);
    expect(current).toMatch(/Product tests 1699 PASS, G4 synthetic[\s>]+59 PASS/);
    expect(current).toMatch(/Rust tests 105 PASS \/ 0 FAIL \/ 2 ignored \(of 107 tests;/);
    expect(current).toMatch(/`EXECUTED` 8, `SKIPPED` 0; each of the three CI-R4 markers appeared once\./);
    // A green run covers the hosted runner only: it never verifies every OS-dependent branch, and
    // the compile-only wording of PR #15 is not the current state.
    expect(current).toMatch(/does not verify every OS-dependent branch/);
    expect(current).not.toMatch(/(all|every) OS-dependent branch(es)? (is |are )?(verified|covered)|fully verified/i);
    expect(current).not.toMatch(/0 executed|compiled but not run/);
  });

  it("keeps the PR #15 compile-only CI evidence as a historical record", () => {
    const status = readme.slice(readme.indexOf("> Status:"), readme.indexOf("## What it does"));
    const start = status.indexOf("Historical record (PR #15, before CI-R3):");
    const end = status.indexOf("Phase 5A: merged / closed.");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const history = status.slice(start, end);
    expect(history).toMatch(/C2 run `38330904910` on the PR #15 head: SUCCESS/);
    expect(history).toMatch(/Product tests 1698 PASS, G4 synthetic 59 PASS/);
    // At PR #15 the Rust test targets were compiled, not run: no Rust test is claimed as passed there.
    expect(history).toMatch(/107 Rust tests were compiled but not run \(0 executed\)/);
    expect(history).not.toMatch(/Rust tests?:?[\s>]+(\d+[\s>]+)?(passed|PASS)/i);
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

describe("docs/control-read-contract-v1.md (Phase 5A)", () => {
  const controlRead = readFileSync("docs/control-read-contract-v1.md", "utf8");

  it("names the contract, its version and every stored vocabulary item", () => {
    expect(controlRead).toContain(`\`${CONTROL_READ_CONTRACT}\`, version \`1\``);
    for (const name of [
      ...FACT_CLASSES,
      ...RULE_IDS,
      ...UNKNOWN_REASONS,
      ...BLOCKED_REASONS,
      ...HUMAN_CONFIRMATIONS,
      ...CONTROL_READ_OPERATIONS,
      ...CONTROL_READ_ERROR_CODES,
      ...CONTROL_READ_ERROR_REASONS,
      ...OMITTED_SECTIONS,
      ...LIMIT_KINDS,
      ...EVIDENCE_REF_KINDS,
      ...REVIEW_FIELDS,
      ...REVIEW_ROUND_FIELDS,
    ]) {
      expect(controlRead, name).toContain(name);
    }
  });

  it("states the boundary: read-only, no transport, no persistence, no eligibility", () => {
    expect(controlRead).toMatch(/\*\*read-only\*\*/);
    expect(controlRead).toMatch(/No MCP server, IPC channel, named pipe, HTTP endpoint or\s+Tauri command exists for it/);
    expect(controlRead).toMatch(/Nothing is written: no storage write, no event, no new file\./);
    expect(controlRead).toMatch(/never answers what an agent may do/);
    expect(controlRead).toMatch(/snapshot_id`\s+\(identifier only — never an authority, lock or concurrency token\)/);
  });

  it("states the HD-5A-09 review state confirmation rule", () => {
    expect(controlRead).toMatch(/`CLOSED` → `EXPLICIT`/);
    expect(controlRead).toMatch(/`EXPLICIT` only if the current round's `verdict`\s+equals the review state \*\*and\*\* its `verdictConfirmedAt` is set; otherwise `ENTERED`/);
    expect(controlRead).toMatch(/No inference from the state name alone, from `suspendedFrom`, or from event history\./);
  });

  it("states that a stored round verdict is EXPLICIT only with its confirmation time (RF-5A-IR-01)", () => {
    expect(controlRead).toMatch(/A stored round verdict is not automatically `EXPLICIT`/);
    expect(controlRead).toMatch(/`EXPLICIT` \(with `recorded_at` =\s+`verdictConfirmedAt`\) only when its `verdictConfirmedAt` is set/);
    expect(controlRead).toMatch(/a stored verdict without one is\s+`ENTERED` with `recorded_at: null`/);
  });
});

describe("README Control Read (Phase 5A)", () => {
  it("describes the copy-only Human adapter and the read-only, transport-free boundary", () => {
    expect(readme).toMatch(/\*\*Control snapshot copy\*\* \(Phase 5A\)/);
    expect(readme).toMatch(/docs\/control-read-contract-v1\.md/);
    expect(readme).toMatch(/Control Read \(Phase 5A\) is read-only and has no transport: no MCP, IPC or network endpoint/);
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

describe("docs/action-eligibility-contract-v1.md (Phase 5B)", () => {
  const eligibility = readFileSync("docs/action-eligibility-contract-v1.md", "utf8");
  const listed = (names: readonly string[]) => {
    for (const name of names) expect(eligibility, name).toContain(`\`${name}\``);
  };

  it("DOC-01 names every disposition", () => listed(DISPOSITIONS));
  it("DOC-02 names every action id", () => listed(ACTION_IDS));
  it("DOC-03 names every check id", () => listed(CHECK_IDS));
  it("DOC-04 names every check outcome", () => listed(CHECK_OUTCOMES));
  it("DOC-05 names all 17 reason codes", () => {
    expect(REASON_CODES).toHaveLength(17);
    listed(REASON_CODES);
  });
  it("DOC-06 names all 8 error codes", () => {
    expect(CONTROL_READ_ERROR_CODES).toHaveLength(8);
    listed(CONTROL_READ_ERROR_CODES);
  });
  it("DOC-07 names all 15 error reasons", () => {
    expect(ACTION_ELIGIBILITY_ERROR_REASONS).toHaveLength(15);
    listed(ACTION_ELIGIBILITY_ERROR_REASONS);
  });
  it("DOC-08 names all 4 payload fields", () => {
    expect(PAYLOAD_FIELDS).toHaveLength(4);
    listed(PAYLOAD_FIELDS);
  });
  it("DOC-09 names all 4 not-evaluated scopes", () => {
    expect(NOT_EVALUATED_SCOPES).toHaveLength(4);
    listed(NOT_EVALUATED_SCOPES);
  });
  it("DOC-10 states the fixed envelope values and that an assessment is never an authorization", () => {
    expect(eligibility).toContain("`dvcc.action-eligibility`, version `1`");
    for (const value of ['`authority: "NONE"`', '`scope: "ACTION_LEVEL"`', '`revalidation: "REQUIRED_BEFORE_EXECUTION"`']) expect(eligibility, value).toContain(value);
    expect(eligibility).toContain('`basis: { contract: "dvcc.control-read", version: 1, operation: "get_review_state" }`');
    expect(eligibility).toContain("`assess_review_actions`");
    expect(eligibility).toMatch(/\*\*never an authorization\*\*/);
    expect(eligibility).toMatch(/No MCP server, IPC channel, named pipe, HTTP\s+endpoint, Tauri command or UI exists for it/);
  });
});
