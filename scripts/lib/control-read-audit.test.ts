import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BLOCKED_REASONS,
  CONTROL_READ_CONTRACT,
  CONTROL_READ_VERSION,
  FACT_CLASSES,
  HUMAN_CONFIRMATIONS,
  LIMIT_KINDS,
  MAX_SNAPSHOT_REVIEWS,
  OMITTED_SECTIONS,
  RULE_IDS,
  UNKNOWN_REASONS,
  type ControlReadSource,
  type SourceHealthStatus,
} from "../../src/domain/controlRead/contract";
import { readControl } from "../../src/domain/controlRead/readControl";
import { RISK_TIERS } from "../../src/domain/riskTier";
import { parseProjectsFile, parseSessionFile } from "../../src/domain/schema";
import { RESOURCE_STATES, REVIEW_STATES, VERDICTS } from "../../src/domain/states";
import { PROJECT_ID_PATTERN, REVIEW_ID_PATTERN } from "../../src/domain/validation";
import * as audit from "./control-read-audit.mjs";
import { FIXTURE, SENTINELS, seedFixture } from "./control-read-audit-fixture.mjs";

/**
 * G4 audit harness (HD-5A-10). The audit core is checked against the real product (`readControl`
 * output must pass its allowlist; its vocabulary must equal contract.ts) and against planted leaks,
 * and the harness script is checked statically for the raw-data rules.
 */

const CORE = path.join(__dirname, "control-read-audit.mjs");
const HARNESS = path.join(__dirname, "..", "verify-control-read-real-data-audit.ps1");
const ENV = { now: () => "2026-10-04T03:00:00.000Z", newSnapshotId: () => "snap-00000000-0000-4000-8000-000000000000" };
const OBSERVED_AT = "2026-10-04T02:00:00.000Z";
const CLEAN = {
  reviewedHead: "133576c944c55b8b50a4bdfec670d8651fdfb11e",
  harnessHead: "a".repeat(40),
  sampleRef: "sha256:0123456789abcdef",
  coverage: 11,
  copyActions: 1,
  stateChange: "NO",
  writeDuringCopy: false,
  writeOutsideCopy: false,
  clipboardSequenceChanged: false,
  stopCode: null,
  blockedCode: null,
  selfTest: true,
};

let root: string;
let fixture: { dataDir: string; repoDir: string; head: string };

beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "dvcc-g4-test-"));
  fixture = seedFixture(root);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function sourceFrom(dataDir: string, observed: boolean): ControlReadSource {
  const projects = parseProjectsFile(readFileSync(path.join(dataDir, "projects.json"), "utf8"));
  if (projects.status !== "ok") throw new Error("fixture projects");
  const reviewsDir = path.join(dataDir, "reviews");
  const reviews = readdirSync(reviewsDir).map((id) => {
    const parsed = parseSessionFile(readFileSync(path.join(reviewsDir, id, "session.json"), "utf8"), id);
    const status: SourceHealthStatus = parsed.status === "ok" ? "ok" : "unreadable";
    return { reviewId: id, session: parsed.status === "ok" ? parsed.value : null, health: { status } };
  });
  const alpha = projects.value.find((p) => p.projectId === FIXTURE.projectId)!;
  return {
    phase: "ready",
    projects: projects.value,
    projectsHealth: { status: "ok" },
    reviews,
    gitObservations: observed
      ? {
          [FIXTURE.projectId]: {
            localRoot: alpha.localRoot,
            projectCreatedAt: alpha.createdAt,
            observation: { status: "OK", head: fixture.head, branch: FIXTURE.branch, detached: false, dirty: false, observedAt: OBSERVED_AT },
          },
        }
      : {},
  };
}

function snapshotOf(source: ControlReadSource): string {
  const result = readControl({ contract: CONTROL_READ_CONTRACT, version: 1, operation: "get_control_snapshot", project_id: FIXTURE.projectId }, source, ENV);
  return `${JSON.stringify(result, null, 2)}\n`;
}

const observedText = () => snapshotOf(sourceFrom(fixture.dataDir, true));
const unobservedText = () => snapshotOf(sourceFrom(fixture.dataDir, false));

function finalizeWith(snapshotText: string | null, extra: Record<string, unknown> = {}) {
  return audit.finalize({
    ...CLEAN,
    dataDir: fixture.dataDir,
    projectId: FIXTURE.projectId,
    reviewId: FIXTURE.reviewId,
    snapshotText,
    gitRefreshCompleted: true,
    gitObservedOk: true,
    ...extra,
  });
}

function reportValue(reportText: string, key: string): string | undefined {
  return new RegExp(`^${key}: (.*)$`, "m").exec(reportText)?.[1];
}

function treeHash(dir: string): string {
  const hash = createHash("sha256");
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const full = path.join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else hash.update(full).update(readFileSync(full));
    }
  };
  walk(dir);
  return hash.digest("hex");
}

const ALL_SENSITIVE = () => [
  ...Object.values(SENTINELS),
  FIXTURE.projectId,
  FIXTURE.reviewId,
  FIXTURE.owner,
  FIXTURE.name,
  FIXTURE.branch,
  fixture.dataDir,
  fixture.repoDir,
  fixture.head,
];

describe("the audit oracle matches the product contract", () => {
  it("has the same vocabularies as contract.ts and the domain", () => {
    const v = audit.VOCABULARY;
    expect(v.contract).toBe(CONTROL_READ_CONTRACT);
    expect(v.version).toBe(CONTROL_READ_VERSION);
    expect(v.factClasses).toEqual([...FACT_CLASSES]);
    expect(v.ruleIds).toEqual([...RULE_IDS]);
    expect(v.unknownReasons).toEqual([...UNKNOWN_REASONS]);
    expect(v.blockedReasons).toEqual([...BLOCKED_REASONS]);
    expect(v.confirmations).toEqual([...HUMAN_CONFIRMATIONS]);
    expect(v.omittedSections).toEqual([...OMITTED_SECTIONS]);
    expect(v.limitKinds).toEqual([...LIMIT_KINDS]);
    expect(v.reviewStates).toEqual([...REVIEW_STATES]);
    expect(v.resourceStates).toEqual([...RESOURCE_STATES]);
    expect(v.verdicts).toEqual([...VERDICTS]);
    expect(v.riskTiers).toEqual([...RISK_TIERS]);
    expect(audit.PROJECT_ID.source).toBe(PROJECT_ID_PATTERN.source);
    expect(audit.REVIEW_ID.source).toBe(REVIEW_ID_PATTERN.source);
  });

  it("accepts real readControl output with zero unknown fields and zero violations", () => {
    for (const text of [observedText(), unobservedText()]) {
      expect(audit.validateSnapshot(JSON.parse(text))).toEqual({ unknownFields: 0, violations: 0, decided: true });
    }
  });

  it("accepts real output for a project without local root or repository, and for truncated output", () => {
    const source = sourceFrom(fixture.dataDir, false);
    const beta = readControl({ contract: CONTROL_READ_CONTRACT, version: 1, operation: "get_control_snapshot", project_id: FIXTURE.betaProjectId }, source, ENV);
    expect(audit.validateSnapshot(beta)).toEqual({ unknownFields: 0, violations: 0, decided: true });

    const base = source.reviews.find((r) => r.reviewId === FIXTURE.reviewId)!.session!;
    const many = Array.from({ length: MAX_SNAPSHOT_REVIEWS + 1 }, (_, i) => {
      const id = `rv-20261004-m${String(i).padStart(5, "0")}`;
      const rounds = Array.from({ length: 21 }, (_, r) => ({ ...base.rounds[0], round: r + 1 }));
      return { reviewId: id, session: { ...base, reviewSessionId: id, rounds, reviewRound: rounds.length }, health: { status: "ok" as const } };
    });
    const truncated = readControl(
      { contract: CONTROL_READ_CONTRACT, version: 1, operation: "get_control_snapshot", project_id: FIXTURE.projectId },
      { ...source, reviews: many },
      ENV,
    ) as { complete: boolean; limits_applied: string[] };
    expect(truncated.complete).toBe(false);
    expect(truncated.limits_applied).toEqual(["MAX_REVIEWS", "MAX_ROUNDS"]);
    expect(audit.validateSnapshot(truncated)).toEqual({ unknownFields: 0, violations: 0, decided: true });
  });
});

describe("A. allowlist", () => {
  const mutate = (fn: (s: any) => void) => {
    const s = JSON.parse(observedText());
    fn(s);
    return audit.validateSnapshot(s);
  };

  it("counts every key outside the contract", () => {
    expect(mutate((s) => (s.extra = 1)).unknownFields).toBe(1);
    expect(mutate((s) => (s.data.project.display_name = "x")).unknownFields).toBe(1);
    expect(mutate((s) => (s.data.reviews[0].review_state.note = "x")).unknownFields).toBe(1);
    expect(mutate((s) => (s.data.project.repository.value.url = "x")).unknownFields).toBe(1);
  });

  it("flags values outside their grammar and missing keys", () => {
    expect(mutate((s) => (s.data.reviews[0].review_state.evidence_ref += "/C:/x")).violations).toBeGreaterThan(0);
    expect(mutate((s) => (s.data.reviews[0].review_state.class = "OBSERVED")).violations).toBeGreaterThan(0);
    expect(mutate((s) => delete s.data.external_gates).violations).toBeGreaterThan(0);
    expect(mutate((s) => (s.omitted_sections = ["runs"])).violations).toBeGreaterThan(0);
    expect(mutate((s) => (s.snapshot_id = "snap-x")).violations).toBeGreaterThan(0);
    expect(mutate((s) => (s.complete = false)).violations).toBeGreaterThan(0);
    expect(mutate((s) => (s.data.project.local_root.path = { class: "OBSERVED", value: "C:/x" })).violations).toBeGreaterThan(0);
    expect(mutate((s) => (s.data.project.git.head.value = "main")).violations).toBeGreaterThan(0);
    expect(mutate((s) => (s.data.project.repository.value.owner = "C:/Users/x")).violations).toBeGreaterThan(0);
  });
});

describe("B. exact sensitive-value comparison", () => {
  const legit = audit.legitimateTokens([FIXTURE.projectId, FIXTURE.reviewId, FIXTURE.owner, FIXTURE.name]);
  const parsed = () => JSON.parse(observedText());

  it("finds a long value inside any string, and a path in any separator or case", () => {
    const s = parsed();
    s.data.project.planted = `prefix ${SENTINELS.notes} suffix`;
    s.data.project.planted_path = fixture.repoDir.replace(/\\/g, "/").toUpperCase();
    const leaks = audit.exactLeaks(s, { free_text: [SENTINELS.notes], absolute_path: [fixture.repoDir] }, legit);
    expect(leaks.free_text).toBe(1);
    expect(leaks.absolute_path).toBe(1);
  });

  it("matches a short value only as a whole string", () => {
    const s = parsed();
    s.data.project.a = "contains WIP inside";
    expect(audit.exactLeaks(s, { free_text: ["WIP"] }, legit).free_text).toBe(0);
    s.data.project.b = "WIP";
    expect(audit.exactLeaks(s, { free_text: ["WIP"] }, legit).free_text).toBe(1);
  });

  it("excludes values that equal the lawful identity or vocabulary and counts them as overlaps", () => {
    const leaks = audit.exactLeaks(parsed(), { free_text: [FIXTURE.name, "FIX_REQUIRED", fixture.head, OBSERVED_AT] }, legit);
    expect(leaks.free_text).toBe(0);
    expect(leaks.overlaps).toBe(4);
  });

  it("still finds free text placed in a lawful position (identity comes from the source, not the snapshot)", () => {
    const s = parsed();
    s.data.project.repository.value.name = SENTINELS.developmentIde;
    expect(audit.validateSnapshot(s).unknownFields).toBe(0);
    expect(audit.exactLeaks(s, { free_text: [SENTINELS.developmentIde] }, legit).free_text).toBe(1);
  });
});

describe("C. pattern scan", () => {
  it("finds every pattern category and ignores the snapshot id", () => {
    const s = JSON.parse(observedText());
    expect(audit.patternHits(s)).toEqual({ absolute_path: 0, credential: 0, provider_identifier: 0, thread_pointer: 0 });
    const cases: Array<[string, string]> = [
      ["absolute_path", "C:\\Users\\someone"],
      ["absolute_path", "\\\\server\\share\\x"],
      ["absolute_path", "//server/share"],
      ["absolute_path", "file:///tmp/x"],
      ["absolute_path", "/home/someone/x"],
      ["credential", `ghp_${"a".repeat(36)}`],
      ["credential", `github_pat_${"a".repeat(30)}`],
      ["credential", `sk-${"a".repeat(24)}`],
      ["credential", "AKIAABCDEFGHIJKLMNOP"],
      ["credential", `Bearer ${"a".repeat(24)}`],
      ["credential", "-----BEGIN OPENSSH PRIVATE KEY-----"],
      ["provider_identifier", "019c1a2b-3c4d-7e5f-8a9b-0123456789ab"],
      ["thread_pointer", "https://chatgpt.com/c/abc"],
      ["thread_pointer", "chat.openai.com"],
    ];
    for (const [category, value] of cases) {
      const planted = { ...s, data: { ...s.data, project: { ...s.data.project, planted: value } } };
      expect(audit.patternHits(planted)[category], `${category}: ${value}`).toBe(1);
    }
  });
});

describe("positive assertions", () => {
  const base = {
    projectId: FIXTURE.projectId,
    reviewId: FIXTURE.reviewId,
    repository: { owner: FIXTURE.owner, name: FIXTURE.name },
    localRootConfigured: true,
    reviewState: "FIX_REQUIRED",
    resourceState: "HOT",
    prNumber: 7,
  };

  it("passes on real output, observed and unobserved", () => {
    const observed = audit.expectedFacts(JSON.parse(observedText()), { ...base, git: { refreshed: true, observedOk: true, head: fixture.head, detached: false } });
    expect(observed).toEqual({ pass: true, failures: [] });
    const unobserved = audit.expectedFacts(JSON.parse(unobservedText()), { ...base, git: { refreshed: false, observedOk: false, head: null, detached: null } });
    expect(unobserved).toEqual({ pass: true, failures: [] });
  });

  it("fails with fixed codes when a machine fact is wrong", () => {
    const facts = audit.expectedFacts(JSON.parse(observedText()), {
      ...base,
      reviewState: "REVIEW_PASS",
      prNumber: 8,
      repository: { owner: "other", name: FIXTURE.name },
      git: { refreshed: true, observedOk: true, head: "f".repeat(40), detached: true },
    });
    expect(facts.failures).toEqual(["REPOSITORY_IDENTITY", "REVIEW_STATE", "PR_NUMBER", "GIT_HEAD_VALUE", "GIT_DETACHED_VALUE"]);
    expect(audit.expectedFacts(JSON.parse(unobservedText()), { ...base, git: { refreshed: true, observedOk: true, head: null, detached: null } }).pass).toBe(false);
  });
});

describe("local sources and selection (read-only)", () => {
  it("selects the readable, non-CLOSED review with full coverage, deterministically and opaquely", () => {
    const salt = Buffer.alloc(32, 7);
    const first = audit.selectSample(fixture.dataDir, salt);
    expect(first).toMatchObject({
      status: "SELECTED",
      reviewId: FIXTURE.reviewId,
      projectId: FIXTURE.projectId,
      hasLocalRoot: true,
      gitWorkTree: true,
      coverage: 11,
      coverageTotal: 11,
    });
    expect(audit.selectSample(fixture.dataDir, salt).sampleRef).toBe(first.sampleRef);
    expect(audit.selectSample(fixture.dataDir, Buffer.alloc(32, 8)).sampleRef).not.toBe(first.sampleRef);
    expect(first.sampleRef).toMatch(/^sha256:[0-9a-f]{16}$/);
    expect(first.sampleRef).not.toContain(FIXTURE.reviewId);
  });

  it("collects forbidden values from the whole folder, including other projects, bodies, notes and settings", () => {
    const folder = audit.loadDataFolder(fixture.dataDir);
    const forbidden = audit.forbiddenValues(fixture.dataDir, folder, audit.localGit(fixture.repoDir));
    expect(forbidden.free_text).toEqual(
      expect.arrayContaining([SENTINELS.betaDisplayName, SENTINELS.betaNotes, SENTINELS.checkpoint, SENTINELS.resultBody, SENTINELS.eventNote, SENTINELS.verdictNote]),
    );
    expect(forbidden.thread_pointer).toEqual(expect.arrayContaining([SENTINELS.threadTitle, SENTINELS.threadUrl, SENTINELS.closedThreadTitle]));
    expect(forbidden.git_branch).toEqual([FIXTURE.branch]);
    expect(forbidden.absolute_path).toEqual(expect.arrayContaining([fixture.dataDir, fixture.repoDir, path.join(root, SENTINELS.codexFolder, "codex.exe")]));
  });

  it("falls back to the backup registry like the app, and reports an unreadable registry", () => {
    const other = mkdtempSync(path.join(os.tmpdir(), "dvcc-g4-bak-"));
    try {
      const seeded = seedFixture(other, { git: false });
      const projects = readFileSync(path.join(seeded.dataDir, "projects.json"), "utf8");
      writeFileSync(path.join(seeded.dataDir, "projects.json.bak"), projects);
      writeFileSync(path.join(seeded.dataDir, "projects.json"), "{ corrupt");
      expect(audit.selectSample(seeded.dataDir)).toMatchObject({ status: "SELECTED", gitWorkTree: false, coverage: 10 });
      rmSync(path.join(seeded.dataDir, "projects.json.bak"));
      expect(audit.selectSample(seeded.dataDir)).toEqual({ status: "REGISTRY_UNREADABLE" });
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("never selects a CLOSED review", () => {
    const other = mkdtempSync(path.join(os.tmpdir(), "dvcc-g4-closed-"));
    try {
      const seeded = seedFixture(other, { git: false });
      const file = path.join(seeded.dataDir, "reviews", FIXTURE.reviewId, "session.json");
      writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), reviewState: "CLOSED" }));
      expect(audit.selectSample(seeded.dataDir)).toEqual({ status: "NO_CANDIDATE" });
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("never writes: the data folder and the repository are byte-identical after select and finalize", () => {
    const before = [treeHash(fixture.dataDir), treeHash(fixture.repoDir)];
    audit.selectSample(fixture.dataDir);
    finalizeWith(observedText());
    expect([treeHash(fixture.dataDir), treeHash(fixture.repoDir)]).toEqual(before);
  });
});

describe("decision and sanitized report", () => {
  it("PASSes clean real output (observed and unobserved) with a report that holds no sensitive value", () => {
    for (const [text, refreshed] of [
      [observedText(), true],
      [unobservedText(), false],
    ] as const) {
      const final = finalizeWith(text, { gitRefreshCompleted: refreshed, gitObservedOk: refreshed });
      expect(final).toMatchObject({ status: "FINALIZED", result: "PASS", reason: "ALL_CHECKS_PASSED" });
      const report = final.reportText as string;
      expect([...report.matchAll(/^([a-z_]+): /gm)].map((m) => m[1])).toEqual(audit.REPORT_SCHEMA.map(([k]: [string]) => k));
      for (const value of ALL_SENSITIVE()) expect(report.includes(value), value).toBe(false);
      expect(report).not.toMatch(/[A-Za-z]:[\\/]/);
      expect(reportValue(report, "sensitive_source_categories_present")).toBe("11/11");
      expect(reportValue(report, "raw_snapshot_persisted")).toBe("NO");
      expect(reportValue(report, "os_clipboard_received_raw_snapshot")).toBe("NO");
    }
  });

  it("FAILs a planted unknown field and a planted value, and the report counts without naming", () => {
    const s = JSON.parse(observedText());
    s.data.project.display_name = SENTINELS.displayName;
    const unknown = finalizeWith(JSON.stringify(s));
    expect(unknown).toMatchObject({ result: "FAIL", reason: "ALLOWLIST" });
    expect(reportValue(unknown.reportText, "unknown_field_count")).toBe("1");
    expect(reportValue(unknown.reportText, "free_text_leaks")).toBe("1");
    expect(unknown.reportText.includes(SENTINELS.displayName)).toBe(false);

    const t = JSON.parse(observedText());
    t.data.project.repository.value.owner = FIXTURE.branch;
    const branch = finalizeWith(JSON.stringify(t));
    expect(branch).toMatchObject({ result: "FAIL", reason: "EXACT_SENSITIVE_VALUE_LEAK" });
    expect(reportValue(branch.reportText, "git_branch_leaks")).toBe("1");
    expect(reportValue(branch.reportText, "allowlist")).toBe("PASS");
    expect(reportValue(branch.reportText, "expected_machine_facts")).toBe("FAIL");
  });

  it("FAILs a write or a state change, and a finding outranks an unproven clipboard", () => {
    expect(finalizeWith(observedText(), { writeDuringCopy: true })).toMatchObject({ result: "FAIL", reason: "PERSISTENT_WRITE_DURING_COPY" });
    expect(finalizeWith(observedText(), { writeOutsideCopy: true })).toMatchObject({ result: "FAIL", reason: "PERSISTENT_WRITE_OUTSIDE_COPY" });
    expect(finalizeWith(observedText(), { stateChange: "YES" })).toMatchObject({ result: "FAIL", reason: "STATE_CHANGE" });
    const s = JSON.parse(observedText());
    s.data.project.leak = SENTINELS.threadUrl;
    expect(finalizeWith(JSON.stringify(s), { clipboardSequenceChanged: true })).toMatchObject({ result: "FAIL" });
  });

  it("is INCONCLUSIVE (fail-closed) whenever something could not be established", () => {
    const parse = finalizeWith("{ not json");
    expect(parse).toMatchObject({ result: "INCONCLUSIVE", reason: "JSON_PARSE_FAILED" });
    expect(reportValue(parse.reportText, "contract_parse")).toBe("FAIL");
    expect(reportValue(parse.reportText, "free_text_leaks")).toBe("NOT_RUN");
    const clipboard = finalizeWith(observedText(), { clipboardSequenceChanged: true });
    expect(clipboard).toMatchObject({ result: "INCONCLUSIVE", reason: "OS_CLIPBOARD_NOT_PROVEN_UNTOUCHED" });
    expect(reportValue(clipboard.reportText, "os_clipboard_received_raw_snapshot")).toBe("UNKNOWN");
    expect(finalizeWith(observedText(), { clipboardSequenceChanged: null })).toMatchObject({ result: "INCONCLUSIVE" });
    expect(finalizeWith(observedText(), { writeOutsideCopy: null })).toMatchObject({ result: "INCONCLUSIVE", reason: "WRITE_CHECK_INCOMPLETE" });
    expect(finalizeWith(observedText(), { stateChange: "UNKNOWN" })).toMatchObject({ result: "INCONCLUSIVE", reason: "STATE_CHECK_INCOMPLETE" });
    expect(finalizeWith(null, { copyActions: 1, stopCode: "NO_INTERCEPTED_WRITE" })).toMatchObject({ result: "INCONCLUSIVE", reason: "NO_INTERCEPTED_WRITE" });
    expect(finalizeWith(observedText(), { reviewId: "rv-20261004-zzzzzz" })).toMatchObject({ result: "INCONCLUSIVE", reason: "SAMPLE_UNAVAILABLE" });
    expect(audit.decide({ ...CLEAN, audit: { status: "AUDITED", contractParse: "PASS", allowlistDecided: true, allowlist: "PASS", detectorsLive: true, coverage: 2, exactSensitiveValueLeaks: 0, absolutePathLeaks: 0, gitBranchLeaks: 0, freeTextLeaks: 0, threadPointerLeaks: 0, providerIdentifierLeaks: 0, credentialPatternHits: 0, expectedMachineFacts: "PASS" } })).toEqual({ result: "INCONCLUSIVE", reason: "LOW_COVERAGE" });
    expect(audit.decide({ ...CLEAN, audit: { status: "AUDITED", contractParse: "PASS", allowlistDecided: true, allowlist: "PASS", detectorsLive: false, coverage: 11, exactSensitiveValueLeaks: 0, absolutePathLeaks: 0, gitBranchLeaks: 0, freeTextLeaks: 0, threadPointerLeaks: 0, providerIdentifierLeaks: 0, credentialPatternHits: 0, expectedMachineFacts: "PASS" } })).toEqual({ result: "INCONCLUSIVE", reason: "DETECTORS_NOT_LIVE" });
  });

  it("proves its detectors live on the data, and is BLOCKED before touching anything", () => {
    const folder = audit.loadDataFolder(fixture.dataDir);
    const legit = audit.legitimateTokens([FIXTURE.projectId, FIXTURE.reviewId, FIXTURE.owner, FIXTURE.name]);
    expect(audit.detectorsLive(JSON.parse(observedText()), audit.forbiddenValues(fixture.dataDir, folder, audit.localGit(fixture.repoDir)), legit)).toBe(true);
    const blocked = audit.finalize({ ...CLEAN, blockedCode: "DVCC_RUNNING", snapshotText: observedText(), dataDir: fixture.dataDir });
    expect(blocked).toMatchObject({ result: "BLOCKED", reason: "DVCC_RUNNING" });
    expect(reportValue(blocked.reportText, "contract_parse")).toBe("NOT_RUN");
  });

  it("refuses to render a value outside its declared domain", () => {
    expect(finalizeWith(observedText(), { reviewedHead: fixture.repoDir })).toEqual({ status: "FINALIZED", result: "INCONCLUSIVE", reason: "REPORT_GUARD", reportText: null });
  });
});

describe("CLI: stdin in, one sanitized line out", () => {
  const run = (input: string) => spawnSync(process.execPath, [CORE], { input, encoding: "utf8" });

  it("finalizes from stdin without echoing anything sensitive, and prints nothing on stderr", () => {
    const s = JSON.parse(observedText());
    s.data.project.leak = SENTINELS.notes;
    const out = run(JSON.stringify({ op: "finalize", ...CLEAN, dataDir: fixture.dataDir, projectId: FIXTURE.projectId, reviewId: FIXTURE.reviewId, snapshotText: JSON.stringify(s), gitRefreshCompleted: true, gitObservedOk: true }));
    expect(out.status).toBe(0);
    expect(out.stderr).toBe("");
    expect(out.stdout.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(out.stdout)).toMatchObject({ status: "FINALIZED", result: "FAIL" });
    for (const value of ALL_SENSITIVE()) expect(out.stdout.includes(value), value).toBe(false);
  });

  it("answers malformed input and unknown operations with a fixed code only", () => {
    const malformed = run(`{"op":"finalize","dataDir":"${SENTINELS.notes}"`);
    expect(malformed.stdout).toBe('{"status":"AUDIT_EXCEPTION"}\n');
    expect(malformed.stderr).toBe("");
    expect(run('{"op":"other"}').stdout).toBe('{"status":"UNKNOWN_OP"}\n');
  });

  it("accepts a request preceded by a UTF-8 BOM (as .NET's redirected stdin may send)", () => {
    expect(JSON.parse(run(`﻿${JSON.stringify({ op: "select", dataDir: fixture.dataDir })}`).stdout).status).toBe("SELECTED");
  });

  it("returns to the harness only the identifiers it needs to press the button", () => {
    const out = JSON.parse(run(JSON.stringify({ op: "select", dataDir: fixture.dataDir })).stdout);
    expect(Object.keys(out).sort()).toEqual(["coverage", "coverageTotal", "gitWorkTree", "hasLocalRoot", "projectId", "reviewId", "sampleRef", "status"]);
    const text = JSON.stringify(out);
    for (const value of [...Object.values(SENTINELS), FIXTURE.branch, fixture.dataDir, fixture.repoDir, fixture.head]) expect(text.includes(value), value).toBe(false);
  });
});

describe("harness script: raw-data rules (static)", () => {
  const text = readFileSync(HARNESS, "utf8");
  const lines = text.split(/\r?\n/);

  it("is ASCII without a BOM (Windows PowerShell 5.1 reads it in the ANSI code page)", () => {
    expect(text.charCodeAt(0)).not.toBe(0xfeff);
    expect(/^[\t\n\r\x20-\x7e]*$/.test(text)).toBe(true);
  });

  it("has exactly one output call, guarded, and no other output, clipboard or file channel", () => {
    expect(lines.filter((l) => /Write-Host/.test(l))).toEqual(["  Write-Host $text"]);
    for (const banned of [
      "Write-Output", "Write-Error", "Write-Warning", "Write-Verbose", "Write-Debug", "Write-Information", "Out-Host", "Out-File",
      "Set-Content", "Add-Content", "Tee-Object", "Export-", "Start-Transcript", "Get-Clipboard", "Set-Clipboard", "Clipboard]::",
      "clip.exe", "Get-ClipboardFingerprint", "Invoke-InterceptedCopy", "Test-OperatorClipboard", "Write-Summary", "Get-Content",
      "ReadAllText", "$_.Exception",
    ]) {
      expect(text.includes(banned), banned).toBe(false);
    }
    expect(text).not.toMatch(/\$Error(?!ActionPreference)/);
    expect(lines.filter((l) => /^\s*(Check|Skip|Start-App)\s/.test(l))).toEqual([]);
  });

  it("writes one file only: the sanitized report returned by the audit core", () => {
    const writes = lines.filter((l) => /WriteAll|\[System\.IO\.File\]/.test(l));
    expect(writes).toHaveLength(2);
    for (const line of writes) expect(line).toMatch(/WriteAllText\(.*\[string\]\$final\.reportText/);
  });

  it("keeps the raw snapshot in a variable that only travels to the audit core and is cleared", () => {
    const uses = lines.filter((l) => l.includes("$snapshotText")).map((l) => l.trim());
    const allowed = [
      /^\$snapshotText = \$null$/,
      /^else \{ \$snapshotText = \[string\]\(Invoke-Cdp "window\.__dvccClipboard\.writes\[\$count\]"\) \}$/,
      /^if \(\$null -eq \$m\.blockedCode -and \$null -ne \$snapshotText\) \{$/,
      /^\$request\["snapshotText"\] = \$snapshotText$/,
    ];
    expect(uses.length).toBe(5);
    for (const use of uses) expect(allowed.some((p) => p.test(use)), use).toBe(true);
  });

  it("keeps exception text out of every catch block", () => {
    for (const match of text.matchAll(/catch\s*\{([^}]*)\}/g)) expect(match[1]).not.toMatch(/\$_/);
  });

  it("refuses real data without the G4-C authorization and after the one run", () => {
    expect(text).toContain('$REAL_AUTHORIZATION = "HD-5A-10/G4-C"');
    expect(text).toContain('[string] $ReviewedHead = "133576c944c55b8b50a4bdfec670d8651fdfb11e"');
    for (const code of ["NOT_AUTHORIZED", "ALREADY_RUN", "DIRTY_WORKTREE", "PRODUCT_DELTA", "STALE_BUILD", "DVCC_RUNNING", "DATA_DIR_OVERRIDE_PRESENT", "NO_DATA_DIR"]) {
      expect(text, code).toContain(`"${code}"`);
    }
  });
});
