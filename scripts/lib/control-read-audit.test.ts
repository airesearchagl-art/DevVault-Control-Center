import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
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
import { en } from "../../src/i18n/en";
import { ja } from "../../src/i18n/ja";
import * as audit from "./control-read-audit.mjs";
import { FIXTURE, SENTINELS, seedFixture } from "./control-read-audit-fixture.mjs";

/**
 * G4 audit harness (HD-5A-10, Task Packet rev 3.4). The audit core is checked against the real
 * product (`readControl` output must pass its allowlist; its vocabulary and UI labels must equal the
 * product's), against planted leaks and unresolved overlaps, and the harness scripts are checked
 * statically and behaviourally for the raw-data rules.
 */

const CORE = path.join(__dirname, "control-read-audit.mjs");
const HARNESS = path.join(__dirname, "..", "verify-control-read-real-data-audit.ps1");
const FINALIZE = path.join(__dirname, "control-read-audit-finalize.ps1");
const NOW = "2026-10-04T03:00:00.000Z";
const OBSERVED_AT = "2026-10-04T02:00:00.000Z";
const ENV = { now: () => NOW, newSnapshotId: () => "snap-00000000-0000-4000-8000-000000000000" };
const WINDOWS = {
  refresh: [Date.parse(OBSERVED_AT) - 1000, Date.parse(OBSERVED_AT) + 1000],
  copy: [Date.parse(NOW) - 1000, Date.parse(NOW) + 1000],
};
const CLEAN = {
  reviewedHead: "133576c944c55b8b50a4bdfec670d8651fdfb11e",
  harnessHead: "a".repeat(40),
  sampleRef: "sha256:0123456789abcdef",
  coverage: 10,
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
let gitUi: { status: string; head: string; branch: string };

beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "dvcc-g4-test-"));
  fixture = seedFixture(root);
  gitUi = { status: "Observed", head: fixture.head, branch: FIXTURE.branch };
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

function snapshotOf(source: ControlReadSource, projectId: string = FIXTURE.projectId): string {
  const result = readControl({ contract: CONTROL_READ_CONTRACT, version: 1, operation: "get_control_snapshot", project_id: projectId }, source, ENV);
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
    gitUi,
    windows: WINDOWS,
    ...extra,
  });
}

function bindingFor(parsed: unknown) {
  const folder = audit.loadDataFolder(fixture.dataDir);
  const project = folder.projects.find((p: { projectId: string }) => p.projectId === FIXTURE.projectId);
  return { folder, binding: audit.sourceBinding(folder, project, parsed, WINDOWS, gitUi) };
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

describe("the audit oracle matches the product", () => {
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

  it("reads DVCC's Git observation with the labels the Review detail renders (ja / en)", () => {
    expect([...audit.GIT_UI.statusOkLabels].sort()).toEqual([ja["git.status.ok"], en["git.status.ok"]].sort());
    expect(audit.GIT_UI.detachedLabel).toBe(ja["git.branch.detached"]);
    expect(audit.GIT_UI.detachedLabel).toBe(en["git.branch.detached"]);
    expect(audit.interpretGitUi({ status: ja["git.status.ok"], head: fixture.head, branch: FIXTURE.branch })).toEqual({ statusOk: true, head: fixture.head, branch: FIXTURE.branch, detached: false });
    expect(audit.interpretGitUi({ status: en["git.status.ok"], head: fixture.head, branch: en["git.branch.detached"] })).toEqual({ statusOk: true, head: fixture.head, branch: null, detached: true });
    expect(audit.interpretGitUi({ status: en["git.status.notARepository"], head: null, branch: null })).toEqual({ statusOk: false, head: null, branch: null, detached: null });
    expect(audit.interpretGitUi(null)).toEqual({ statusOk: false, head: null, branch: null, detached: null });
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

describe("B. exact sensitive-value comparison (source-bound, rev 3.4)", () => {
  const parsed = () => JSON.parse(observedText());

  it("finds a long value inside any string, and a path in any separator or case", () => {
    const s = parsed();
    s.data.project.planted = `prefix ${SENTINELS.notes} suffix`;
    s.data.project.planted_path = fixture.repoDir.replace(/\\/g, "/").toUpperCase();
    const leaks = audit.exactLeaks(s, { free_text: [SENTINELS.notes], absolute_path: [fixture.repoDir] }, bindingFor(s).binding.legit);
    expect(leaks.free_text).toBe(1);
    expect(leaks.absolute_path).toBe(1);
  });

  it("matches a short value only as a whole string", () => {
    const s = parsed();
    s.data.project.a = "contains WIP inside";
    expect(audit.exactLeaks(s, { free_text: ["WIP"] }, bindingFor(s).binding.legit).free_text).toBe(0);
    s.data.project.b = "WIP";
    expect(audit.exactLeaks(s, { free_text: ["WIP"] }, bindingFor(s).binding.legit).free_text).toBe(1);
  });

  it("excludes only values bound to the selected source (identity, vocabulary, recorded head / time, observation, own values)", () => {
    const s = parsed();
    const leaks = audit.exactLeaks(s, { free_text: [FIXTURE.name, "FIX_REQUIRED", fixture.head, "2026-10-04T00:10:00.000Z", OBSERVED_AT, NOW] }, bindingFor(s).binding.legit);
    expect(leaks).toMatchObject({ free_text: 0, overlapsResolved: 6, overlapsUnresolved: 0 });
  });

  it("does not exempt a value for its shape: SHA / review-id / ISO / EvidenceRef-shaped free text in the snapshot is unresolved", () => {
    for (const shaped of ["abcdef1", "rv-20261004-zzzzzz", "2026-10-04T05:00:00.000Z", "dvcc:project/other-project"]) {
      const s = parsed();
      s.data.project.repository.value.name = shaped.replace(/[:/]/g, "-");
      s.data.project.planted = shaped;
      const leaks = audit.exactLeaks(s, { free_text: [shaped] }, bindingFor(s).binding.legit);
      expect(leaks, shaped).toMatchObject({ free_text: 0, overlapsResolved: 0, overlapsUnresolved: 1 });
    }
  });

  it("an unresolved overlap never PASSes", () => {
    const audited = { status: "AUDITED", contractParse: "PASS", allowlistDecided: true, allowlist: "PASS", detectorsLive: true, coverage: 11, overlapsExcluded: 1, overlapsUnresolved: 1, exactSensitiveValueLeaks: 0, absolutePathLeaks: 0, gitBranchLeaks: 0, freeTextLeaks: 0, threadPointerLeaks: 0, providerIdentifierLeaks: 0, credentialPatternHits: 0, expectedMachineFacts: "PASS" };
    expect(audit.decide({ ...CLEAN, audit: audited })).toEqual({ result: "INCONCLUSIVE", reason: "EXACT_COMPARISON_OVERLAP" });
    expect(audit.decide({ ...CLEAN, audit: { ...audited, overlapsUnresolved: 0 } })).toEqual({ result: "PASS", reason: "ALL_CHECKS_PASSED" });
  });

  it("still finds free text placed in a lawful position (identity comes from the source, not the snapshot)", () => {
    const s = parsed();
    s.data.project.repository.value.name = SENTINELS.developmentIde;
    expect(audit.validateSnapshot(s).unknownFields).toBe(0);
    expect(audit.exactLeaks(s, { free_text: [SENTINELS.developmentIde] }, bindingFor(s).binding.legit).free_text).toBe(1);
  });

  it("keeps every non-empty body line, short ones included (compared by equality)", () => {
    const folder = audit.loadDataFolder(fixture.dataDir);
    const forbidden = audit.forbiddenValues(fixture.dataDir, folder, FIXTURE.branch);
    expect(forbidden.free_text).toContain("# Result");
    const s = parsed();
    s.data.project.planted = "# Result";
    expect(audit.exactLeaks(s, { free_text: ["# Result"] }, bindingFor(s).binding.legit).free_text).toBe(1);
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

describe("positive assertions (source-bound)", () => {
  const expectation = (parsed: unknown, extra: Record<string, unknown> = {}) => ({
    projectId: FIXTURE.projectId,
    reviewId: FIXTURE.reviewId,
    repository: { owner: FIXTURE.owner, name: FIXTURE.name },
    localRootConfigured: true,
    reviewState: "FIX_REQUIRED",
    resourceState: "HOT",
    prNumber: 7,
    binding: bindingFor(parsed).binding,
    windows: WINDOWS,
    gitRefreshCompleted: true,
    gitUi,
    ...extra,
  });
  const check = (mutateFn: (s: any) => void, extra: Record<string, unknown> = {}) => {
    const s = JSON.parse(observedText());
    mutateFn(s);
    return audit.expectedFacts(s, expectation(s, extra)).failures;
  };

  it("passes on real output, observed and unobserved", () => {
    expect(check(() => {})).toEqual([]);
    const u = JSON.parse(unobservedText());
    expect(audit.expectedFacts(u, expectation(u, { gitRefreshCompleted: false, gitUi: null })).failures).toEqual([]);
  });

  it("fails with fixed codes when a machine fact differs from DVCC's own observation or the source", () => {
    expect(check(() => {}, { reviewState: "REVIEW_PASS", prNumber: 8, repository: { owner: "other", name: FIXTURE.name }, gitUi: { ...gitUi, head: "f".repeat(40), branch: "detached HEAD" } })).toEqual([
      "REPOSITORY_IDENTITY",
      "REVIEW_STATE",
      "PR_NUMBER",
      "GIT_HEAD_VALUE",
      "GIT_DETACHED_VALUE",
    ]);
  });

  it("refuses identities of another project or review, and EvidenceRefs the source cannot produce", () => {
    expect(check((s) => s.data.project.review_session_ids.push(FIXTURE.closedReviewId))).toContain("FOREIGN_REVIEW_ID");
    expect(check((s) => (s.data.reviews[0].review_session_id = "rv-20261004-zzzzzz"))).toContain("FOREIGN_REVIEW_ID");
    expect(check((s) => (s.data.reviews[0].project_id = FIXTURE.betaProjectId))).toContain("FOREIGN_PROJECT_ID");
    expect(check((s) => s.data.reviews[0].freshness.derived_from.push(`dvcc:project/${FIXTURE.betaProjectId}`))).toContain("FOREIGN_EVIDENCE_REF");
    expect(check((s) => (s.data.reviews[0].review_state.evidence_ref = `dvcc:review/${FIXTURE.closedReviewId}/field/review-state`))).toContain("FOREIGN_EVIDENCE_REF");
  });

  it("binds recorded heads and timestamps to the review's own rounds, and the response's times to the run", () => {
    expect(check((s) => (s.data.reviews[0].rounds[0].reviewed_head.value = "abcdef1"))).toContain("SOURCE_BOUND_HEAD");
    expect(check((s) => (s.data.reviews[0].rounds[0].verdict.recorded_at = "2026-10-04T05:00:00.000Z"))).toContain("SOURCE_BOUND_TIMESTAMP");
    expect(check((s) => (s.data.project.repository.recorded_at = "2026-10-04T00:10:00.000Z"))).toContain("SOURCE_BOUND_TIMESTAMP");
    expect(check(() => {}, { windows: { ...WINDOWS, copy: [0, 1] } })).toContain("GENERATED_AT_WINDOW");
    expect(check(() => {}, { windows: { ...WINDOWS, refresh: [0, 1] } })).toContain("OBSERVED_AT_WINDOW");
  });
});

describe("local sources and selection (read-only, data folder only)", () => {
  it("selects the readable, non-CLOSED review with the broadest coverage, deterministically and opaquely, without Git", () => {
    const salt = Buffer.alloc(32, 7);
    const first = audit.selectSample(fixture.dataDir, salt);
    expect(first).toEqual({
      status: "SELECTED",
      reviewId: FIXTURE.reviewId,
      projectId: FIXTURE.projectId,
      hasLocalRoot: true,
      sampleRef: first.sampleRef,
      coverage: 10,
      coverageTotal: 11,
    });
    expect(audit.selectSample(fixture.dataDir, salt).sampleRef).toBe(first.sampleRef);
    expect(audit.selectSample(fixture.dataDir, Buffer.alloc(32, 8)).sampleRef).not.toBe(first.sampleRef);
    expect(first.sampleRef).toMatch(/^sha256:[0-9a-f]{16}$/);
    expect(first.sampleRef).not.toContain(FIXTURE.reviewId);
  });

  it("collects forbidden values from the whole folder, including other projects, bodies, notes and settings", () => {
    const folder = audit.loadDataFolder(fixture.dataDir);
    const forbidden = audit.forbiddenValues(fixture.dataDir, folder, FIXTURE.branch);
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
      expect(audit.selectSample(seeded.dataDir)).toMatchObject({ status: "SELECTED", coverage: 10 });
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

  it("never writes and never reaches a local root: data folder and repository byte-identical, local root not even listed", () => {
    const before = [treeHash(fixture.dataDir), treeHash(fixture.repoDir)];
    audit.selectSample(fixture.dataDir);
    finalizeWith(observedText());
    expect([treeHash(fixture.dataDir), treeHash(fixture.repoDir)]).toEqual(before);
    // A local root that does not exist changes nothing: the core never looks at it.
    const other = mkdtempSync(path.join(os.tmpdir(), "dvcc-g4-noroot-"));
    try {
      const seeded = seedFixture(other, { git: false });
      rmSync(seeded.repoDir, { recursive: true, force: true });
      expect(audit.selectSample(seeded.dataDir)).toMatchObject({ status: "SELECTED", hasLocalRoot: true, coverage: 10 });
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
});

describe("decision and sanitized report", () => {
  it("PASSes clean real output (observed and unobserved) with a report that holds no sensitive value", () => {
    for (const [text, refreshed] of [
      [observedText(), true],
      [unobservedText(), false],
    ] as const) {
      const final = finalizeWith(text, { gitRefreshCompleted: refreshed, gitUi: refreshed ? gitUi : null });
      expect(final).toMatchObject({ status: "FINALIZED", result: "PASS", reason: "ALL_CHECKS_PASSED" });
      const report = final.reportText as string;
      expect([...report.matchAll(/^([a-z_]+): /gm)].map((m) => m[1])).toEqual(audit.REPORT_SCHEMA.map(([k]: [string]) => k));
      for (const value of ALL_SENSITIVE()) expect(report.includes(value), value).toBe(false);
      expect(report).not.toMatch(/[A-Za-z]:[\\/]/);
      expect(reportValue(report, "sensitive_source_categories_present")).toBe(refreshed ? "11/11" : "10/11");
      expect(reportValue(report, "raw_snapshot_persisted")).toBe("NO");
      expect(reportValue(report, "os_clipboard_received_raw_snapshot")).toBe("NO");
    }
  });

  it("never PASSes SHA / review-id / ISO-shaped free text or a foreign identity planted into the snapshot", () => {
    const other = mkdtempSync(path.join(os.tmpdir(), "dvcc-g4-shaped-"));
    try {
      const seeded = seedFixture(other, { git: false });
      const file = path.join(seeded.dataDir, "projects.json");
      const shaped = ["abcdef1", "rv-20261004-zzzzzz", "2026-10-04T05:00:00.000Z"];
      const registry = JSON.parse(readFileSync(file, "utf8"));
      registry.projects[1].notes = shaped.join("\n");
      writeFileSync(file, JSON.stringify(registry));
      writeFileSync(path.join(seeded.dataDir, "reviews", FIXTURE.reviewId, "checkpoint.md"), `${shaped.join("\n")}\n`);
      const text = snapshotOf(sourceFrom(seeded.dataDir, false));
      const base = { ...CLEAN, dataDir: seeded.dataDir, projectId: FIXTURE.projectId, reviewId: FIXTURE.reviewId, gitRefreshCompleted: false, gitUi: null, windows: WINDOWS };
      expect(audit.finalize({ ...base, snapshotText: text })).toMatchObject({ result: "PASS" });
      for (const value of shaped) {
        const s = JSON.parse(text);
        s.data.project.repository.value.owner = value.replace(/[:.]/g, "-").slice(0, 39);
        s.data.project.planted_value = value;
        const final = audit.finalize({ ...base, snapshotText: JSON.stringify(s) });
        expect(final.result, value).not.toBe("PASS");
      }
      const t = JSON.parse(text);
      t.data.project.review_session_ids.push(FIXTURE.closedReviewId);
      expect(audit.finalize({ ...base, snapshotText: JSON.stringify(t) })).toMatchObject({ result: "FAIL", reason: "EXPECTED_MACHINE_FACTS" });
    } finally {
      rmSync(other, { recursive: true, force: true });
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

  it("uses DVCC's observed branch (not Git run by the harness) as the forbidden branch", () => {
    const t = JSON.parse(observedText());
    t.data.project.repository.value.owner = "observed-only-branch";
    const final = finalizeWith(JSON.stringify(t), { gitUi: { ...gitUi, branch: "observed-only-branch" } });
    expect(reportValue(final.reportText, "git_branch_leaks")).toBe("1");
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
    const audited = { status: "AUDITED", contractParse: "PASS", allowlistDecided: true, allowlist: "PASS", detectorsLive: true, coverage: 11, overlapsExcluded: 0, overlapsUnresolved: 0, exactSensitiveValueLeaks: 0, absolutePathLeaks: 0, gitBranchLeaks: 0, freeTextLeaks: 0, threadPointerLeaks: 0, providerIdentifierLeaks: 0, credentialPatternHits: 0, expectedMachineFacts: "PASS" };
    expect(audit.decide({ ...CLEAN, audit: { ...audited, coverage: 2 } })).toEqual({ result: "INCONCLUSIVE", reason: "LOW_COVERAGE" });
    expect(audit.decide({ ...CLEAN, audit: { ...audited, detectorsLive: false } })).toEqual({ result: "INCONCLUSIVE", reason: "DETECTORS_NOT_LIVE" });
  });

  it("proves its detectors live on the data, and is BLOCKED before touching anything", () => {
    const s = JSON.parse(observedText());
    const { folder, binding } = bindingFor(s);
    expect(audit.detectorsLive(s, audit.forbiddenValues(fixture.dataDir, folder, FIXTURE.branch), binding.legit)).toBe(true);
    const blocked = audit.finalize({ ...CLEAN, blockedCode: "DVCC_RUNNING", snapshotText: observedText(), dataDir: fixture.dataDir });
    expect(blocked).toMatchObject({ result: "BLOCKED", reason: "DVCC_RUNNING" });
    expect(reportValue(blocked.reportText, "contract_parse")).toBe("NOT_RUN");
  });

  it("refuses to render a value outside its declared domain, and honours the renderer fault only in a self-test", () => {
    expect(finalizeWith(observedText(), { reviewedHead: fixture.repoDir })).toEqual({ status: "FINALIZED", result: "INCONCLUSIVE", reason: "REPORT_RENDER_FAILED", reportText: null });
    expect(finalizeWith(observedText(), { selfTestFault: "RENDER" })).toEqual({ status: "FINALIZED", result: "INCONCLUSIVE", reason: "REPORT_RENDER_FAILED", reportText: null });
    expect(finalizeWith(observedText(), { selfTestFault: "RENDER", selfTest: false })).toMatchObject({ result: "PASS" });
  });
});

describe("CLI: stdin in, one sanitized line out", () => {
  const run = (input: string) => spawnSync(process.execPath, [CORE], { input, encoding: "utf8" });

  it("finalizes from stdin without echoing anything sensitive, and prints nothing on stderr", () => {
    const s = JSON.parse(observedText());
    s.data.project.leak = SENTINELS.notes;
    const out = run(JSON.stringify({ op: "finalize", ...CLEAN, dataDir: fixture.dataDir, projectId: FIXTURE.projectId, reviewId: FIXTURE.reviewId, snapshotText: JSON.stringify(s), gitRefreshCompleted: true, gitUi, windows: WINDOWS }));
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
    expect(JSON.parse(run(`\uFEFF${JSON.stringify({ op: "select", dataDir: fixture.dataDir })}`).stdout).status).toBe("SELECTED");
  });

  it("returns to the harness only the identifiers it needs to press the button", () => {
    const out = JSON.parse(run(JSON.stringify({ op: "select", dataDir: fixture.dataDir })).stdout);
    expect(Object.keys(out).sort()).toEqual(["coverage", "coverageTotal", "hasLocalRoot", "projectId", "reviewId", "sampleRef", "status"]);
    const text = JSON.stringify(out);
    for (const value of [...Object.values(SENTINELS), FIXTURE.branch, fixture.dataDir, fixture.repoDir, fixture.head]) expect(text.includes(value), value).toBe(false);
  });
});

describe.skipIf(process.platform !== "win32")("finalization boundary (PowerShell, behavioural, rev 3.4 RF-G4B-03)", () => {
  const DRIVER = `param([string] $Case, [string] $Lib, [string] $Node, [string] $Core, [string] $InputDir)
$ErrorActionPreference = "Stop"
. $Lib
$script:node = $Node
$script:auditCore = $Core
$obj = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $InputDir "measurements.json") | ConvertFrom-Json
$m = [ordered]@{}
foreach ($p in $obj.PSObject.Properties) { $m[$p.Name] = $p.Value }
$snapshot = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $InputDir "snapshot.json")
$reportPath = Join-Path $InputDir "report.md"
if ($Case -eq "AuditCoreUnavailable") { $script:node = Join-Path $InputDir "missing-node.exe" }
if ($Case -eq "ReportUnwritable") { $reportPath = Join-Path $InputDir "missing-folder\\report.md" }
if ($Case -eq "RendererThrows") { $m["selfTestFault"] = "RENDER" }
if ($Case -eq "Throws") {
  $m = [pscustomobject]@{}
  $m | Add-Member -MemberType ScriptProperty -Name blockedCode -Value { throw ("boom at " + $InputDir) }
}
$code = Complete-AuditRun $m $snapshot $reportPath "report.md"
exit $code
`;
  const runCase = (testCase: string) => {
    const dir = mkdtempSync(path.join(root, `fin-${testCase}-`));
    writeFileSync(path.join(dir, "driver.ps1"), DRIVER);
    writeFileSync(
      path.join(dir, "measurements.json"),
      JSON.stringify({ op: "finalize", ...CLEAN, dataDir: fixture.dataDir, projectId: FIXTURE.projectId, reviewId: FIXTURE.reviewId, gitRefreshCompleted: true, gitUi, windows: WINDOWS }),
    );
    writeFileSync(path.join(dir, "snapshot.json"), observedText());
    if (testCase === "ReportExists") writeFileSync(path.join(dir, "report.md"), "EARLIER\n");
    const out = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(dir, "driver.ps1"), "-Case", testCase, "-Lib", FINALIZE, "-Node", process.execPath, "-Core", CORE, "-InputDir", dir],
      { encoding: "utf8" },
    );
    const leftovers = readdirSync(dir).filter((name) => name.includes(".tmp-"));
    return { dir, code: out.status, stdout: out.stdout, stderr: out.stderr, report: existsSync(path.join(dir, "report.md")), leftovers };
  };
  const sanitized = (r: ReturnType<typeof runCase>) => {
    expect(r.stderr).toBe("");
    for (const line of r.stdout.split(/\r?\n/).filter((l) => l !== "")) expect(line).toMatch(/^\[g4\] [A-Za-z0-9 _=./(),:-]*$/);
    const all = r.stdout + r.stderr;
    expect(all).not.toMatch(/[A-Za-z]:[\\/]/);
    for (const value of [...ALL_SENSITIVE(), r.dir, "boom"]) expect(all.includes(value), value).toBe(false);
  };

  it("writes the report atomically and PASSes only after it is written", () => {
    const r = runCase("Pass");
    sanitized(r);
    expect(r.code).toBe(0);
    expect(r.stdout.trim().split(/\r?\n/)).toEqual(["[g4] result: PASS (ALL_CHECKS_PASSED)", "[g4] report: report.md"]);
    expect(r.report).toBe(true);
    expect(r.leftovers).toEqual([]);
  });

  it.each([
    ["AuditCoreUnavailable", "[g4] result: INCONCLUSIVE (AUDIT_FINALIZE_FAILED) - no report written"],
    ["ReportUnwritable", "[g4] result: INCONCLUSIVE (REPORT_WRITE_FAILED) - no report written"],
    ["RendererThrows", "[g4] result: INCONCLUSIVE (REPORT_RENDER_FAILED) - no report written"],
    ["Throws", "[g4] result: INCONCLUSIVE (AUDIT_FINALIZE_FAILED) - no report written"],
  ])("%s: a fixed code only, never PASS, no report, no temporary file", (testCase, line) => {
    const r = runCase(testCase);
    sanitized(r);
    expect(r.code).toBe(2);
    expect(r.stdout.trim()).toBe(line);
    expect(r.report).toBe(false);
    expect(r.leftovers).toEqual([]);
  });

  it("creates the attempt marker with CreateNew only: an existing file is refused and left as it was", () => {
    const dir = mkdtempSync(path.join(root, "marker-lib-"));
    const marker = path.join(dir, "marker.md");
    writeFileSync(marker, "EARLIER\n");
    const script = `$ErrorActionPreference = "Stop"
. "${FINALIZE}"
$h = "${"a".repeat(40)}"
$existing = New-AttemptMarker "${marker}" $h $h
$fresh = New-AttemptMarker "${path.join(dir, "fresh.md")}" $h $h
$bad = New-AttemptMarker "${path.join(dir, "bad.md")}" "C:\\x" $h
Say ("[g4] " + $existing + " " + $fresh + " " + $bad)
`;
    writeFileSync(path.join(dir, "driver.ps1"), script);
    const out = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(dir, "driver.ps1")], { encoding: "utf8" });
    expect(out.stderr).toBe("");
    expect(out.stdout.trim()).toBe("[g4] False True False");
    expect(readFileSync(marker, "utf8")).toBe("EARLIER\n");
    expect(readFileSync(path.join(dir, "fresh.md"), "utf8")).toBe(`schema_version: 1\nproduct_head: ${"a".repeat(40)}\nharness_head: ${"a".repeat(40)}\nstate: STARTED\n`);
    expect(existsSync(path.join(dir, "bad.md"))).toBe(false);
  });

  it("never overwrites an existing report: the rename refuses it and the earlier file stays as it was", () => {
    const r = runCase("ReportExists");
    sanitized(r);
    expect(r.code).toBe(2);
    expect(r.stdout.trim()).toBe("[g4] result: INCONCLUSIVE (REPORT_WRITE_FAILED) - no report written");
    expect(readFileSync(path.join(r.dir, "report.md"), "utf8")).toBe("EARLIER\n");
    expect(r.leftovers).toEqual([]);
  });
});

describe.skipIf(process.platform !== "win32")("one-shot attempt marker (harness, behavioural, synthetic roots only, rev 3.5 RF-G4B-04)", () => {
  const MARKER = "G4_SELF_TEST_ATTEMPT.md";
  const REPORT = "G4_SELF_TEST_REPORT.md";
  let fakeExe: string;
  let harnessHead: string;

  beforeAll(() => {
    // Satisfies the build-presence / freshness preconditions; none of these runs starts the app.
    fakeExe = path.join(root, "fake-release.exe");
    writeFileSync(fakeExe, "");
    harnessHead = spawnSync("git", ["-C", path.join(__dirname, "..", ".."), "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
  });

  const newRoot = () => mkdtempSync(path.join(root, "oneshot-"));
  // These synthetic runs bind -ReviewedHead to the checkout's own HEAD, so a later change under the
  // product paths cannot stop them at PRODUCT_DELTA before the one-shot behaviour under test. The
  // real-data default stays pinned to the reviewed product head (static test below).
  const run = (stRoot: string, ...extra: string[]) => {
    const out = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", HARNESS, "-SelfTest", "-SelfTestRoot", stRoot, "-Exe", fakeExe, "-ReviewedHead", harnessHead, ...extra], { encoding: "utf8" });
    expect(out.stderr).toBe("");
    const lines = out.stdout.split(/\r?\n/).filter((l) => l !== "");
    for (const line of lines) expect(line).toMatch(/^\[g4\] [A-Za-z0-9 _=./(),:-]*$/);
    for (const value of [...Object.values(SENTINELS), stRoot, FIXTURE.projectId, FIXTURE.reviewId, FIXTURE.branch]) expect(out.stdout.includes(value), value).toBe(false);
    return { code: out.status, lines };
  };
  const result = (lines: string[]) => lines.find((l) => l.startsWith("[g4] result: "));
  const dataTouched = (stRoot: string) => existsSync(path.join(stRoot, "data"));
  const markerText = () => `schema_version: 1\nproduct_head: ${harnessHead}\nharness_head: ${harnessHead}\nstate: STARTED\n`;

  it("creates the marker before the data phase; a crash right there leaves it, and the next run is ALREADY_ATTEMPTED with no data access", () => {
    const r = newRoot();
    const crashed = run(r, "-SelfTestFault", "AbortAtDataAccess");
    expect(crashed.code).toBe(9);
    expect(readFileSync(path.join(r, MARKER), "utf8")).toBe(markerText());
    expect(dataTouched(r)).toBe(false);
    const again = run(r);
    expect(again.code).toBe(2);
    expect(result(again.lines)).toBe("[g4] result: BLOCKED (ALREADY_ATTEMPTED) - no report written");
    expect(dataTouched(r)).toBe(false);
    expect(readFileSync(path.join(r, MARKER), "utf8")).toBe(markerText());
  }, 120_000);

  it("an existing marker blocks before any data access and is not touched", () => {
    const r = newRoot();
    writeFileSync(path.join(r, MARKER), "EARLIER\n");
    const out = run(r);
    expect(out.code).toBe(2);
    expect(result(out.lines)).toBe("[g4] result: BLOCKED (ALREADY_ATTEMPTED) - no report written");
    expect(dataTouched(r)).toBe(false);
    expect(readFileSync(path.join(r, MARKER), "utf8")).toBe("EARLIER\n");
    expect(existsSync(path.join(r, REPORT))).toBe(false);
  }, 120_000);

  it("an existing report blocks (ALREADY_RUN) before any data access, without creating a marker", () => {
    const r = newRoot();
    writeFileSync(path.join(r, REPORT), "EARLIER\n");
    const out = run(r);
    expect(result(out.lines)).toBe("[g4] result: BLOCKED (ALREADY_RUN) - no report written");
    expect(dataTouched(r)).toBe(false);
    expect(existsSync(path.join(r, MARKER))).toBe(false);
  }, 120_000);

  it("a marker that cannot be created blocks (ATTEMPT_MARKER_CREATE_FAILED) with no data access", () => {
    const r = newRoot();
    const out = run(r, "-SelfTestFault", "MarkerCreateFails");
    expect(out.code).toBe(2);
    expect(result(out.lines)).toBe("[g4] result: BLOCKED (ATTEMPT_MARKER_CREATE_FAILED) - no report written");
    expect(dataTouched(r)).toBe(false);
    expect(readdirSync(r)).toEqual([]);
  }, 120_000);

  it.each([
    ["ReportUnwritable", "[g4] result: INCONCLUSIVE (REPORT_WRITE_FAILED) - no report written"],
    ["AuditCoreUnavailable", "[g4] result: INCONCLUSIVE (AUDIT_FINALIZE_FAILED) - no report written"],
  ])("%s after the marker: the data phase ran, the marker remains, the next run is ALREADY_ATTEMPTED", (fault, line) => {
    const r = newRoot();
    const first = run(r, "-SelfTestNoApp", "-SelfTestFault", fault);
    expect(first.code).toBe(2);
    expect(dataTouched(r)).toBe(true);
    expect(result(first.lines)).toBe(line);
    expect(readFileSync(path.join(r, MARKER), "utf8")).toBe(markerText());
    expect(existsSync(path.join(r, REPORT))).toBe(false);
    const again = run(r);
    expect(result(again.lines)).toBe("[g4] result: BLOCKED (ALREADY_ATTEMPTED) - no report written");
    expect(again.lines.some((l) => l.includes("sample selected"))).toBe(false);
    expect(readFileSync(path.join(r, MARKER), "utf8")).toBe(markerText());
  }, 180_000);

  it("a completed run keeps its marker next to the report, and the next run is ALREADY_RUN", () => {
    const r = newRoot();
    const first = run(r, "-SelfTestNoApp");
    expect(result(first.lines)).toBe("[g4] result: INCONCLUSIVE (SELF_TEST_NO_APP)");
    expect(existsSync(path.join(r, REPORT))).toBe(true);
    expect(readFileSync(path.join(r, MARKER), "utf8")).toBe(markerText());
    const again = run(r);
    expect(result(again.lines)).toBe("[g4] result: BLOCKED (ALREADY_RUN) - no report written");
    expect(readFileSync(path.join(r, MARKER), "utf8")).toBe(markerText());
  }, 180_000);
});

describe("harness scripts: raw-data rules (static)", () => {
  const harness = readFileSync(HARNESS, "utf8");
  const lib = readFileSync(FINALIZE, "utf8");
  const core = readFileSync(CORE, "utf8");
  const both = `${harness}\n${lib}`;
  const linesOf = (text: string) => text.split(/\r?\n/);

  it("are ASCII without a BOM (Windows PowerShell 5.1 reads them in the ANSI code page)", () => {
    for (const text of [harness, lib]) {
      expect(text.charCodeAt(0)).not.toBe(0xfeff);
      expect(/^[\t\n\r\x20-\x7e]*$/.test(text)).toBe(true);
    }
  });

  it("have exactly one output call, guarded, and no other output, clipboard or file channel", () => {
    expect(linesOf(both).filter((l) => /Write-Host/.test(l))).toEqual(["  Write-Host $text"]);
    expect(linesOf(lib).some((l) => l === "  Write-Host $text")).toBe(true);
    for (const banned of [
      "Write-Output", "Write-Error", "Write-Warning", "Write-Verbose", "Write-Debug", "Write-Information", "Out-Host", "Out-File",
      "Set-Content", "Add-Content", "Tee-Object", "Export-", "Start-Transcript", "Get-Clipboard", "Set-Clipboard", "Clipboard]::",
      "clip.exe", "Get-ClipboardFingerprint", "Invoke-InterceptedCopy", "Test-OperatorClipboard", "Write-Summary", "Get-Content",
      "ReadAllText", "$_.Exception", ".Message",
    ]) {
      expect(both.includes(banned), banned).toBe(false);
    }
    expect(both).not.toMatch(/\$Error(?!ActionPreference)/);
    expect(linesOf(both).filter((l) => /^\s*(Check|Skip|Start-App)\s/.test(l))).toEqual([]);
  });

  it("write two files only: the attempt marker (CreateNew) and the core's report (temporary file renamed into place)", () => {
    expect(linesOf(harness).filter((l) => /WriteAll|\[System\.IO\.File\]/.test(l))).toEqual([]);
    const writes = linesOf(lib).filter((l) => /WriteAll|\[System\.IO\.File\]/.test(l)).map((l) => l.trim());
    expect(writes).toEqual([
      "$stream = [System.IO.File]::Open($path, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)",
      '[System.IO.File]::WriteAllText($temp, ($text -replace "`r?`n", "`n"), [System.Text.UTF8Encoding]::new($false))',
      "[System.IO.File]::Move($temp, $path)",
    ]);
    expect(lib).toContain("if (-not (Write-ReportAtomically $ReportPath ([string]$final.reportText))) {");
  });

  it("keep the raw snapshot in variables that only travel to the audit core and are released", () => {
    const allowedHarness = [
      /^\$snapshotText = \$null$/,
      /^else \{ \$snapshotText = \[string\]\(Invoke-Cdp "window\.__dvccClipboard\.writes\[\$count\]"\) \}$/,
      /^\$exitCode = Complete-AuditRun \$m \$snapshotText \$finalReportPath \$reportLabel$/,
    ];
    const harnessUses = linesOf(harness).filter((l) => /\$snapshotText/i.test(l)).map((l) => l.trim());
    expect(harnessUses).toHaveLength(4);
    for (const use of harnessUses) expect(allowedHarness.some((p) => p.test(use)), use).toBe(true);
    const allowedLib = [
      /^function Complete-AuditRun\(\$Measurements, \[AllowNull\(\)\] \[string\] \$SnapshotText, /,
      /^if \(\$null -eq \$Measurements\.blockedCode -and -not \[string\]::IsNullOrEmpty\(\$SnapshotText\)\) \{$/,
      /^\$request\["snapshotText"\] = \$SnapshotText$/,
      /^\$SnapshotText = \$null$/,
    ];
    const libUses = linesOf(lib).filter((l) => /\$snapshotText/i.test(l)).map((l) => l.trim());
    expect(libUses).toHaveLength(4);
    for (const use of libUses) expect(allowedLib.some((p) => p.test(use)), use).toBe(true);
  });

  it("keep exception text out of every catch block and end in a trap that prints a fixed line", () => {
    for (const match of both.matchAll(/catch\s*\{([^}]*)\}/g)) expect(match[1]).not.toMatch(/\$_/);
    expect(harness).toMatch(/trap \{\r?\n  Say "\[g4\] result: INCONCLUSIVE \(UNHANDLED_EXCEPTION\) - no report written"\r?\n  exit 2\r?\n\}/);
  });

  it("never run Git in, or touch, a Project's local root (RF-G4B-02)", () => {
    expect(core).not.toMatch(/child_process|execFile|spawn|(?<![.\w])exec\(|statSync|lstatSync|realpathSync|accessSync|opendirSync/);
    for (const line of linesOf(core).filter((l) => /localRoot/.test(l))) {
      expect(line, line).not.toMatch(/readFileSync|readdirSync|existsSync|readText|readJson|listDir/);
    }
    expect((harness.match(/git\.exe/g) ?? []).length).toBe(1);
    expect(harness).toContain("$out = & git.exe -C $script:repo @args 2>$null");
    expect(harness).not.toMatch(/\.localRoot\b/);
    expect(lib).not.toMatch(/git/i);
  });

  it("refuse real data without the G4-C authorization, after the one run, or on an occupied CDP port", () => {
    expect(harness).toContain('$REAL_AUTHORIZATION = "HD-5A-10/G4-C"');
    expect(harness).toContain('[string] $ReviewedHead = "133576c944c55b8b50a4bdfec670d8651fdfb11e"');
    expect(harness).toContain('if ($SelfTest -eq $RealData -or ($RealData -and ($SelfTestFault -ne "" -or $SelfTestRoot -ne "" -or $SelfTestNoApp))) {');
    expect(harness).toContain("if ($Port -eq 0) { $Port = Get-Random -Minimum 49152 -Maximum 65535 }");
    for (const code of [
      "NOT_AUTHORIZED", "ALREADY_RUN", "DIRTY_WORKTREE", "PRODUCT_DELTA", "STALE_BUILD", "DVCC_RUNNING", "DATA_DIR_OVERRIDE_PRESENT",
      "NO_DATA_DIR", "CDP_PORT_IN_USE", "DVCC_PAGE_UNCONFIRMED", "ALREADY_ATTEMPTED", "ATTEMPT_MARKER_CREATE_FAILED",
    ]) {
      expect(harness, code).toContain(`"${code}"`);
    }
  });

  it("never reassign a parameter through a same-named variable (PowerShell names are case-insensitive)", () => {
    const params = [...harness.slice(0, harness.indexOf("$ErrorActionPreference")).matchAll(/\]\s*\$([A-Za-z]+)/g)].map((m) => m[1]);
    expect(params).toEqual(expect.arrayContaining(["SelfTest", "RealData", "Authorization", "ReviewedHead", "Exe", "Port", "SelfTestFault", "SelfTestRoot", "SelfTestNoApp"]));
    // Only the documented defaults are filled in ($Exe, $Port).
    const reassigned = linesOf(harness).filter((l) => params.some((p) => new RegExp(`^\\s*(if \\(.*\\) \\{ )?\\$${p}\\s*=[^=]`, "i").test(l)));
    expect(reassigned.map((l) => l.trim())).toEqual([
      'if ($Exe -eq "") { $Exe = Join-Path $repo "src-tauri\\target\\release\\devvault-control-center.exe" }',
      "if ($Port -eq 0) { $Port = Get-Random -Minimum 49152 -Maximum 65535 }",
    ]);
  });

  it("gate the data phase behind the attempt marker: report, marker, CreateNew, then data (RF-G4B-04)", () => {
    const lines = linesOf(harness);
    const at = (needle: string) => lines.findIndex((l) => l.includes(needle));
    const report = at('elseif (Test-Path -LiteralPath $reportPath) { $m.blockedCode = "ALREADY_RUN" }');
    const marker = at('elseif (Test-Path -LiteralPath $attemptMarker) { $m.blockedCode = "ALREADY_ATTEMPTED" }');
    const create = at('elseif (-not (New-AttemptMarker $attemptMarker $ReviewedHead $m.harnessHead)) { $m.blockedCode = "ATTEMPT_MARKER_CREATE_FAILED" }');
    expect(report).toBeGreaterThan(0);
    expect(marker).toBeGreaterThan(report);
    expect(create).toBeGreaterThan(marker);
    // Every touch of a data folder (existence check, seeding, hashing, selection) comes after the marker.
    const touches = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /\$dataDir\b|\$dataDirCandidate\b|\$fixtureCore /.test(line) && /Test-Path|Get-Tree|Invoke-Node|Invoke-AuditCore|Get-ChildItem|Get-Item|= \$dataDirCandidate/.test(line));
    expect(touches.length).toBeGreaterThan(3);
    for (const { line, index } of touches) expect(index, line).toBeGreaterThan(create);
    // Every non-data precondition is decided before the one-shot gate.
    for (const code of ["NOT_AUTHORIZED", "NO_NODE", "HEAD_UNRESOLVED", "DIRTY_WORKTREE", "PRODUCT_DELTA", "STALE_BUILD", "DVCC_RUNNING", "DATA_DIR_OVERRIDE_PRESENT", "CDP_PORT_IN_USE"]) {
      expect(at(`"${code}"`), code).toBeLessThan(report);
    }
    expect(harness).toContain('$ATTEMPT_RELATIVE = ".agent-run/LR-20261005-DVCC-011/G4_REAL_DATA_ATTEMPT.md"');
  });

  it("never delete, overwrite or rewrite an attempt marker, and fill it with fixed metadata only", () => {
    const allowedMoves = [
      "if ($script:RealData) { Remove-Item Env:\\DVCC_DATA_DIR -ErrorAction SilentlyContinue } else { $env:DVCC_DATA_DIR = $script:dataDir }",
      "try { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force } } catch { }",
      "[System.IO.File]::Move($temp, $path)",
    ];
    for (const line of linesOf(both).filter((l) => /Remove-Item|\.Delete\(|::Move\(|Rename-Item|Move-Item|Copy-Item|Clear-Content|FileMode\]::(Create|Truncate|OpenOrCreate|Append)\b/.test(l))) {
      expect(allowedMoves, line).toContain(line.trim());
    }
    const allowedUses = [
      "$attemptMarker = $null",
      "$attemptMarker = Join-Path $repo $ATTEMPT_RELATIVE",
      '$attemptMarker = Join-Path $runRoot "G4_SELF_TEST_ATTEMPT.md"',
      'if ($SelfTestFault -eq "MarkerCreateFails") { $attemptMarker = Join-Path $runRoot "missing-folder\\G4_SELF_TEST_ATTEMPT.md" }',
      'elseif (Test-Path -LiteralPath $attemptMarker) { $m.blockedCode = "ALREADY_ATTEMPTED" }',
      'elseif (-not (New-AttemptMarker $attemptMarker $ReviewedHead $m.harnessHead)) { $m.blockedCode = "ATTEMPT_MARKER_CREATE_FAILED" }',
    ];
    const uses = linesOf(harness).filter((l) => /\$attemptMarker\b/.test(l)).map((l) => l.trim());
    expect(uses.sort()).toEqual([...allowedUses].sort());
    expect(lib).toContain('return "schema_version: 1`nproduct_head: $productHead`nharness_head: $harnessHead`nstate: STARTED`n"');
    expect(lib).toContain("if ($productHead -notmatch '^[0-9a-f]{40}$' -or $harnessHead -notmatch '^[0-9a-f]{40}$') { return $null }");
    expect((both.match(/::Exit\(/g) ?? []).length).toBe(1);
    expect(harness).toContain('if ($SelfTest -and $SelfTestFault -eq "AbortAtDataAccess") { [Environment]::Exit(9) }');
  });
});
