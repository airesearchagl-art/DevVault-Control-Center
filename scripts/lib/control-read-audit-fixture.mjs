// Synthetic data folder for the Control Read real-data audit harness (HD-5A-10).
//
// Shared by the unit tests (scripts/lib/control-read-audit.test.ts) and by the harness self-test
// (`verify-control-read-real-data-audit.ps1 -SelfTest`). Every sensitive field holds a synthetic
// sentinel; nothing here reads or writes the operator's real data. CLI: `node <this> <root>` seeds
// `<root>/data` and prints `{"status":"SEEDED"}` (or `{"status":"SEED_FAILED"}`).

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FIXTURE = Object.freeze({
  projectId: "project-alpha",
  betaProjectId: "project-beta",
  reviewId: "rv-20261004-ctrl01",
  closedReviewId: "rv-20261004-close1",
  brokenReviewId: "rv-20261004-broke1",
  owner: "example-org",
  name: "example-app",
  branch: "sentinel-branch-name",
});

export const SENTINELS = Object.freeze({
  rootFolder: "SENTINELROOT-alpha",
  betaRootFolder: "SENTINELROOT-beta",
  displayName: "SENTINEL_DISPLAY_NAME_ALPHA",
  notes: "SENTINEL_NOTES_ALPHA free text",
  projectNextAction: "SENTINEL_PROJECT_NEXT_ACTION",
  developmentIde: "SENTINEL_IDE_LABEL",
  reviewType: "SENTINEL_REVIEW_TYPE",
  threadTitle: "SENTINEL_THREAD_TITLE",
  threadUrl: "https://chatgpt.com/c/sentinel-thread-0001",
  reviewNextAction: "SENTINEL_REVIEW_NEXT_ACTION",
  verdictNote: "SENTINEL_VERDICT_NOTE",
  checkpoint: "SENTINEL_CHECKPOINT_BODY",
  resultBody: "SENTINEL_RESULT_BODY",
  eventNote: "SENTINEL_EVENT_NOTE",
  betaDisplayName: "SENTINEL_BETA_DISPLAY_NAME",
  betaNotes: "SENTINEL_BETA_NOTES",
  closedThreadTitle: "SENTINEL_CLOSED_THREAD_TITLE",
  codexFolder: "SENTINEL-CODEX",
});

const T0 = "2026-10-04T00:00:00.000Z";
const RESULT_AT = "2026-10-04T00:10:00.000Z";
const VERDICT_AT = "2026-10-04T00:20:00.000Z";
const FALLBACK_HEAD = "0123456789abcdef0123456789abcdef01234567";

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(file, text) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text, "utf8");
}

function git(dir, ...args) {
  return execFileSync(
    "git",
    ["-c", "user.name=dvcc-audit-fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args],
    { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true },
  ).trim();
}

function session(id, projectId, overrides, roundOverrides) {
  return {
    schemaVersion: 1,
    reviewSessionId: id,
    projectId,
    prNumber: 7,
    reviewType: SENTINELS.reviewType,
    reviewRound: 1,
    resourceState: "HOT",
    reviewState: "FIX_REQUIRED",
    suspendedFrom: null,
    chatgptThreadTitle: SENTINELS.threadTitle,
    chatgptThreadUrl: SENTINELS.threadUrl,
    nextAction: SENTINELS.reviewNextAction,
    rounds: [
      {
        round: 1,
        expectedHead: FALLBACK_HEAD,
        reviewedHead: FALLBACK_HEAD,
        requestSavedAt: T0,
        resultCapturedAt: RESULT_AT,
        verdict: "FIX_REQUIRED",
        verdictConfirmedAt: VERDICT_AT,
        verdictNote: SENTINELS.verdictNote,
        ...roundOverrides,
      },
    ],
    createdAt: T0,
    updatedAt: VERDICT_AT,
    ...overrides,
  };
}

/**
 * Seeds `<root>/data` (and, with `git`, a repository on the branch `sentinel-branch-name` at
 * `<root>/SENTINELROOT-alpha`). Returns the paths and the repository HEAD.
 */
export function seedFixture(root, { git: withGit = true } = {}) {
  const dataDir = path.join(root, "data");
  const repoDir = path.join(root, SENTINELS.rootFolder);
  mkdirSync(repoDir, { recursive: true });
  let head = FALLBACK_HEAD;
  if (withGit) {
    git(repoDir, "init", "-q");
    writeText(path.join(repoDir, "a.txt"), "one\n");
    git(repoDir, "add", "a.txt");
    git(repoDir, "commit", "-q", "-m", "one");
    git(repoDir, "checkout", "-q", "-b", FIXTURE.branch);
    head = git(repoDir, "rev-parse", "HEAD").toLowerCase();
  }

  writeJson(path.join(dataDir, "projects.json"), {
    schemaVersion: 1,
    projects: [
      {
        projectId: FIXTURE.projectId,
        displayName: SENTINELS.displayName,
        repositoryUrl: `https://github.com/${FIXTURE.owner}/${FIXTURE.name}`,
        localRoot: repoDir,
        developmentIde: SENTINELS.developmentIde,
        nextAction: SENTINELS.projectNextAction,
        notes: SENTINELS.notes,
        createdAt: T0,
        updatedAt: T0,
      },
      {
        projectId: FIXTURE.betaProjectId,
        displayName: SENTINELS.betaDisplayName,
        repositoryUrl: null,
        localRoot: path.join(root, SENTINELS.betaRootFolder),
        developmentIde: null,
        nextAction: "",
        notes: SENTINELS.betaNotes,
        createdAt: T0,
        updatedAt: T0,
      },
    ],
  });

  const reviewDir = path.join(dataDir, "reviews", FIXTURE.reviewId);
  writeJson(path.join(reviewDir, "session.json"), session(FIXTURE.reviewId, FIXTURE.projectId, {}, { expectedHead: head, reviewedHead: head }));
  writeText(path.join(reviewDir, "checkpoint.md"), `${SENTINELS.checkpoint}\n`);
  writeText(path.join(reviewDir, "result-r1.md"), `# Result\n\n${SENTINELS.resultBody}\n`);
  writeText(path.join(reviewDir, "events.jsonl"), `${JSON.stringify({ v: 1, ts: VERDICT_AT, type: "verdict_confirmed", note: SENTINELS.eventNote })}\n`);

  writeJson(
    path.join(dataDir, "reviews", FIXTURE.closedReviewId, "session.json"),
    session(FIXTURE.closedReviewId, FIXTURE.projectId, { reviewState: "CLOSED", resourceState: "COLD", chatgptThreadTitle: SENTINELS.closedThreadTitle }, {}),
  );
  writeText(path.join(dataDir, "reviews", FIXTURE.brokenReviewId, "session.json"), "{ not json");

  writeJson(path.join(dataDir, "settings.json"), {
    schemaVersion: 1,
    locale: "ja",
    codexExecutablePath: path.join(root, SENTINELS.codexFolder, "codex.exe"),
  });
  return { dataDir, repoDir, head };
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked !== "" && invoked.toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  let status = "SEED_FAILED";
  try {
    if (process.argv[2]) {
      seedFixture(path.resolve(process.argv[2]));
      status = "SEEDED";
    }
  } catch {
    status = "SEED_FAILED";
  }
  process.stdout.write(`${JSON.stringify({ status })}\n`);
}
