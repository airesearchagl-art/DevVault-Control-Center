// Synthetic data folder for the F01 synthetic-only pilot boundary (DVCC-F01-SYNTHETIC-PREP-01).
//
// One fictional Project and one fictional Review with fixed IDs and fixed times. Nothing is copied
// from real data or anonymized from it. Every field Control Read must never disclose holds a
// SENTINEL_* value so a test can prove its absence from a response.
//
// The fixture lives only in fixtures/f01-synthetic/v1/data-root. Its file list and SHA-256 values are
// pinned in fixtures/f01-synthetic/v1/manifest.json, outside the data root (the manifest never hashes
// itself). No command here writes the manifest, and verification never derives an expected value from
// the data it checks: the data is compared with the committed manifest, and a mismatch is a rejection.
//
// CLI (dependency-free; one JSON line on stdout; nothing outside the fixture folder is read or written):
//   node scripts/lib/f01-synthetic-fixture.mjs verify          check data-root against manifest.json
//   node scripts/lib/f01-synthetic-fixture.mjs generate        rewrite data-root from the definitions below
//   node scripts/lib/f01-synthetic-fixture.mjs print-manifest  print the manifest the definitions imply

import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const FIXTURE_DIR = path.join(REPO_ROOT, "fixtures", "f01-synthetic", "v1");
export const DATA_ROOT = path.join(FIXTURE_DIR, "data-root");
export const MANIFEST_PATH = path.join(FIXTURE_DIR, "manifest.json");
/** Name prefix of the temporary copies the tests verify: the only other root `verifyDataRoot` accepts. */
export const TEMP_COPY_PREFIX = "dvcc-f01-";

export const MANIFEST_FORMAT = "dvcc.f01-synthetic-manifest";
export const LOCK_RULE = "OPTIONAL_EMPTY_REGULAR_FILE";
export const LIMITS = Object.freeze({ maxEntries: 64, maxDepth: 4, maxFileBytes: 64 * 1024 });

export const FIXTURE = Object.freeze({
  fixtureId: "f01-synthetic-v1",
  projectId: "synthetic-alpha",
  reviewId: "rv-20261020-synth1",
  owner: "example-org",
  name: "synthetic-alpha",
  prNumber: 7,
  head: "f01a5e17f01a5e17f01a5e17f01a5e17f01a5e17",
});

export const SENTINELS = Object.freeze({
  localRoot: "X:\\SENTINEL_LOCAL_ROOT\\synthetic-alpha",
  displayName: "SENTINEL_DISPLAY_NAME",
  developmentIde: "SENTINEL_IDE_LABEL",
  projectNextAction: "SENTINEL_PROJECT_NEXT_ACTION",
  notes: "SENTINEL_PROJECT_NOTES",
  reviewType: "SENTINEL_REVIEW_TYPE",
  threadTitle: "SENTINEL_THREAD_TITLE",
  threadUrl: "https://chatgpt.com/c/example-sentinel-thread",
  reviewNextAction: "SENTINEL_REVIEW_NEXT_ACTION",
  verdictNote: "SENTINEL_VERDICT_NOTE",
  checkpoint: "SENTINEL_CHECKPOINT_BODY",
  requestBody: "SENTINEL_REQUEST_BODY",
  resultBody: "SENTINEL_RESULT_BODY",
  eventNote: "SENTINEL_EVENT_NOTE",
});

const T0 = "2026-10-20T00:00:00.000Z";
const REQUEST_AT = "2026-10-20T00:05:00.000Z";
const STARTED_AT = "2026-10-20T00:06:00.000Z";
const RESULT_AT = "2026-10-20T00:30:00.000Z";
const VERDICT_AT = "2026-10-20T00:32:00.000Z";

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function event(ts, type, reviewState, resourceState, note) {
  return { v: 1, ts, type, reviewSessionId: FIXTURE.reviewId, round: 1, reviewState, resourceState, note };
}

/** The fixture's files as `relative path -> UTF-8 text`, built only from the fixed definitions above. */
export function fixtureFiles() {
  const reviewDir = `reviews/${FIXTURE.reviewId}`;
  const events = [
    event(T0, "review_created", { from: null, to: "NEW" }, { from: null, to: "HOT" }, null),
    event(T0, "review_ready", { from: "NEW", to: "READY_FOR_REVIEW" }, null, null),
    event(REQUEST_AT, "request_saved", null, null, "request-r1.md"),
    event(STARTED_AT, "review_started", { from: "READY_FOR_REVIEW", to: "REVIEWING" }, null, null),
    event(RESULT_AT, "result_captured", null, null, "result-r1.md"),
    event(VERDICT_AT, "verdict_confirmed", { from: "REVIEWING", to: "FIX_REQUIRED" }, null, SENTINELS.eventNote),
  ];
  return new Map([
    [
      "projects.json",
      json({
        schemaVersion: 1,
        projects: [
          {
            projectId: FIXTURE.projectId,
            displayName: SENTINELS.displayName,
            repositoryUrl: `https://github.com/${FIXTURE.owner}/${FIXTURE.name}`,
            localRoot: SENTINELS.localRoot,
            developmentIde: SENTINELS.developmentIde,
            nextAction: SENTINELS.projectNextAction,
            notes: SENTINELS.notes,
            createdAt: T0,
            updatedAt: T0,
          },
        ],
      }),
    ],
    // Language only: the pilot baseline has no Codex executable path configured.
    ["settings.json", json({ schemaVersion: 1, locale: "ja" })],
    [
      `${reviewDir}/session.json`,
      json({
        schemaVersion: 1,
        reviewSessionId: FIXTURE.reviewId,
        projectId: FIXTURE.projectId,
        prNumber: FIXTURE.prNumber,
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
            expectedHead: FIXTURE.head,
            reviewedHead: FIXTURE.head,
            requestSavedAt: REQUEST_AT,
            resultCapturedAt: RESULT_AT,
            verdict: "FIX_REQUIRED",
            verdictConfirmedAt: VERDICT_AT,
            verdictNote: SENTINELS.verdictNote,
          },
        ],
        createdAt: T0,
        updatedAt: VERDICT_AT,
      }),
    ],
    [`${reviewDir}/checkpoint.md`, `${SENTINELS.checkpoint}\n`],
    [`${reviewDir}/events.jsonl`, events.map((line) => `${JSON.stringify(line)}\n`).join("")],
    [`${reviewDir}/request-r1.md`, `# Request\n\n${SENTINELS.requestBody}\n`],
    [`${reviewDir}/result-r1.md`, `# Result\n\n${SENTINELS.resultBody}\n`],
  ]);
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** The manifest text the definitions imply. Printed for review only; never written by this module. */
export function manifestText(files = fixtureFiles()) {
  const entries = [...files.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([rel, text]) => {
      const bytes = Buffer.from(text, "utf8");
      return { path: rel, size: bytes.length, sha256: sha256(bytes) };
    });
  return json({
    format: MANIFEST_FORMAT,
    version: 1,
    fixture_id: FIXTURE.fixtureId,
    hash: "sha256",
    files: entries,
    runtime_managed: [{ path: ".dvcc.lock", rule: LOCK_RULE }],
  });
}

/** Parses the committed manifest from its fixed location (not validated here; see `verifyDataRoot`). */
export function readManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

// ---------------------------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------------------------

/** Relative paths that may be echoed in a finding; anything else is reported with `path: null`. */
const ECHOABLE_PATH = /^[A-Za-z0-9._-]{1,128}(\/[A-Za-z0-9._-]{1,128}){0,7}$/;
const MANIFEST_PATH_SHAPE = /^[a-z0-9][a-z0-9._-]{0,127}(\/[a-z0-9][a-z0-9._-]{0,127}){0,3}$/;
/** `<name>.tmp-<pid>-<n>`, `<name>.bak`, `<name>.corrupt-<ms>[-n]` (src-tauri/src/storage.rs). */
const TRANSIENT_NAME = /\.tmp-|\.bak$|\.corrupt-/;

class LimitExceeded extends Error {}

function samePath(a, b) {
  const x = path.resolve(a);
  const y = path.resolve(b);
  return process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
}

/** The committed fixture folder, or a direct child of the OS temp folder named `dvcc-f01-*`. */
export function isAllowedRoot(root) {
  const resolved = path.resolve(root);
  if (samePath(resolved, DATA_ROOT)) return true;
  return samePath(path.dirname(resolved), os.tmpdir()) && path.basename(resolved).startsWith(TEMP_COPY_PREFIX);
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && [...keys].sort().every((key, i) => key === actual[i]);
}

/** Strict manifest check: closed keys, safe relative paths, unique entries, lowercase SHA-256. */
export function parseManifest(value) {
  if (!isPlainObject(value) || !hasExactKeys(value, ["format", "version", "fixture_id", "hash", "files", "runtime_managed"])) return null;
  if (value.format !== MANIFEST_FORMAT || value.version !== 1 || value.hash !== "sha256") return null;
  if (typeof value.fixture_id !== "string" || !Array.isArray(value.files) || !Array.isArray(value.runtime_managed)) return null;
  if (value.files.length === 0 || value.files.length > LIMITS.maxEntries) return null;
  const files = new Map();
  for (const entry of value.files) {
    if (!isPlainObject(entry) || !hasExactKeys(entry, ["path", "size", "sha256"])) return null;
    const { path: rel, size, sha256: digest } = entry;
    if (typeof rel !== "string" || !MANIFEST_PATH_SHAPE.test(rel) || rel.split("/").includes("..") || files.has(rel)) return null;
    if (!Number.isInteger(size) || size < 0 || size > LIMITS.maxFileBytes) return null;
    if (typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest)) return null;
    files.set(rel, { size, sha256: digest });
  }
  // The only runtime-managed entry this version knows: DVCC's data-folder lock.
  const runtime = value.runtime_managed;
  if (runtime.length !== 1 || !isPlainObject(runtime[0]) || !hasExactKeys(runtime[0], ["path", "rule"])) return null;
  if (runtime[0].path !== ".dvcc.lock" || runtime[0].rule !== LOCK_RULE) return null;
  if (files.has(".dvcc.lock")) return null;
  const dirs = new Set();
  for (const rel of files.keys()) {
    const parts = rel.split("/");
    for (let i = 1; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join("/"));
  }
  if ([...files.keys()].some((rel) => dirs.has(rel))) return null;
  return { files, dirs, lock: ".dvcc.lock" };
}

/**
 * Lists the entries under `root` without following links, entering only the folders in
 * `allowedDirs` (the manifest's folders). Any other folder is listed as one entry and never read,
 * so its contents count toward no limit and are never opened. An entry is `redirected` when the path
 * the OS resolves for it is not the plain `root/<rel>` path (a junction or mount point somewhere on
 * the way). Neither links nor redirected folders are entered.
 */
function scanTree(root, allowedDirs) {
  const realRoot = realpathSync.native(root);
  const entries = [];
  const walk = (dir, rel, depth) => {
    const dirents = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const dirent of dirents) {
      if (entries.length >= LIMITS.maxEntries) throw new LimitExceeded();
      const abs = path.join(dir, dirent.name);
      const entryRel = rel === "" ? dirent.name : `${rel}/${dirent.name}`;
      const stat = lstatSync(abs, { bigint: true });
      const kind = stat.isSymbolicLink() ? "link" : stat.isDirectory() ? "dir" : stat.isFile() ? "file" : "other";
      const redirected = kind !== "link" && !samePath(realpathSync.native(abs), path.join(realRoot, ...entryRel.split("/")));
      entries.push({ path: entryRel, kind, size: Number(stat.size), redirected, dev: stat.dev, ino: stat.ino });
      if (kind === "dir" && !redirected && allowedDirs.has(entryRel)) {
        if (depth + 1 >= LIMITS.maxDepth) throw new LimitExceeded();
        walk(abs, entryRel, depth + 1);
      }
    }
  };
  walk(root, "", 0);
  return entries;
}

/**
 * Reads a listed file through one handle and returns its bytes only if the opened file is still
 * the one that was listed (same device and file ID, still a regular file, within the size limit).
 */
function readListed(root, entry) {
  const fd = openSync(path.join(root, ...entry.path.split("/")), "r");
  try {
    const stat = fstatSync(fd, { bigint: true });
    if (!stat.isFile() || stat.dev !== entry.dev || stat.ino !== entry.ino) return null;
    if (stat.size > BigInt(LIMITS.maxFileBytes)) return null;
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}

function finding(code, rel) {
  return { code, path: rel !== null && ECHOABLE_PATH.test(rel) ? rel : null };
}

function rejected(findings) {
  return { ok: false, findings, files: null };
}

/**
 * Pure decision over listed entries. `read(entry)` returns the entry's bytes or `null`; it is called
 * only for entries the manifest lists as files, so unknown files are never opened.
 */
export function evaluateEntries(entries, manifest, read) {
  const findings = [];
  const verified = new Map();
  const seen = new Set();
  const skipped = [];
  const isSkipped = (rel) => skipped.some((prefix) => rel.startsWith(`${prefix}/`));

  for (const entry of entries) {
    const rel = entry.path;
    if (isSkipped(rel)) continue;
    seen.add(rel);
    if (entry.kind === "link" || entry.redirected) {
      findings.push(finding("LINK_OR_REPARSE", rel));
      skipped.push(rel);
      continue;
    }
    if (rel === manifest.lock) {
      if (entry.kind !== "file" || entry.size !== 0) findings.push(finding("RUNTIME_FILE_INVALID", rel));
      if (entry.kind === "dir") skipped.push(rel);
      continue;
    }
    if (manifest.dirs.has(rel)) {
      if (entry.kind !== "dir") findings.push(finding("NOT_EXPECTED_KIND", rel));
      continue;
    }
    const expected = manifest.files.get(rel);
    if (expected === undefined) {
      const name = rel.slice(rel.lastIndexOf("/") + 1);
      findings.push(finding(TRANSIENT_NAME.test(name) ? "TRANSIENT_STORAGE_FILE" : "UNEXPECTED_ENTRY", rel));
      if (entry.kind === "dir") skipped.push(rel);
      continue;
    }
    if (entry.kind !== "file") {
      findings.push(finding("NOT_EXPECTED_KIND", rel));
      if (entry.kind === "dir") skipped.push(rel);
      continue;
    }
    if (entry.size !== expected.size) {
      findings.push(finding("CONTENT_MISMATCH", rel));
      continue;
    }
    let bytes = null;
    try {
      bytes = read(entry);
    } catch {
      bytes = null;
    }
    if (bytes === null) {
      findings.push(finding("CHANGED_OR_UNREADABLE", rel));
      continue;
    }
    if (bytes.length !== expected.size || sha256(bytes) !== expected.sha256) {
      findings.push(finding("CONTENT_MISMATCH", rel));
      continue;
    }
    verified.set(rel, Buffer.from(bytes));
  }
  for (const rel of [...manifest.files.keys(), ...manifest.dirs]) {
    if (!seen.has(rel) && !isSkipped(rel)) findings.push(finding(manifest.files.has(rel) ? "MISSING_FILE" : "MISSING_DIRECTORY", rel));
  }
  const order = (item) => `${item.path ?? ""}\0${item.code}`;
  findings.sort((a, b) => (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0));
  return findings.length === 0 ? { ok: true, findings: [], files: verified } : rejected(findings);
}

/**
 * Verifies a data root against a manifest. Fails closed: any finding rejects the whole folder and no
 * bytes are returned. On success `files` holds the exact bytes that were hashed, so a caller can use
 * them without reading the disk again. Findings carry fixed codes and relative paths only.
 */
export function verifyDataRoot(root, manifestValue) {
  if (!isAllowedRoot(root)) return rejected([finding("ROOT_NOT_ALLOWED", null)]);
  const manifest = parseManifest(manifestValue);
  if (manifest === null) return rejected([finding("MANIFEST_INVALID", null)]);
  let entries;
  try {
    const stat = lstatSync(root);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return rejected([finding("ROOT_INVALID", null)]);
    entries = scanTree(root, manifest.dirs);
  } catch (error) {
    return rejected([finding(error instanceof LimitExceeded ? "LIMIT_EXCEEDED" : "SCAN_FAILED", null)]);
  }
  return evaluateEntries(entries, manifest, (entry) => readListed(root, entry));
}

// ---------------------------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------------------------

/**
 * Writes the fixture files from the definitions into `root` (the CLI always uses data-root; the
 * tests use a `dvcc-f01-*` temp folder). Refuses (throws) before writing anything when the root is
 * not allowed, when the folder is a link, or when it holds anything the definitions do not describe
 * (an unknown folder is not entered), so it never writes through a link or over foreign data.
 */
export function generateFixture(root = DATA_ROOT) {
  if (!isAllowedRoot(root)) throw new Error("ROOT_NOT_ALLOWED");
  const files = fixtureFiles();
  const manifest = parseManifest(JSON.parse(manifestText(files)));
  for (const dir of samePath(root, DATA_ROOT) ? [FIXTURE_DIR, DATA_ROOT] : [root]) {
    if (existsSync(dir) && (lstatSync(dir).isSymbolicLink() || !lstatSync(dir).isDirectory())) throw new Error("FIXTURE_FOLDER_INVALID");
  }
  if (existsSync(root)) {
    for (const entry of scanTree(root, manifest.dirs)) {
      const known = (entry.kind === "file" && files.has(entry.path)) || (entry.kind === "dir" && manifest.dirs.has(entry.path));
      if (!known || entry.redirected) throw new Error("FIXTURE_FOLDER_HAS_FOREIGN_ENTRY");
    }
  }
  for (const [rel, text] of files) {
    const target = path.join(root, ...rel.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text, "utf8");
  }
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked !== "" && invoked.toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  const command = process.argv[2];
  let output = { status: "USAGE", commands: ["verify", "generate", "print-manifest"] };
  let exitCode = 2;
  try {
    if (command === "verify") {
      const result = verifyDataRoot(DATA_ROOT, readManifest());
      output = result.ok ? { status: "VERIFIED", files: result.files.size } : { status: "REJECTED", findings: result.findings };
      exitCode = result.ok ? 0 : 1;
    } else if (command === "generate") {
      generateFixture();
      output = { status: "GENERATED" };
      exitCode = 0;
    } else if (command === "print-manifest") {
      output = JSON.parse(manifestText());
      exitCode = 0;
    }
  } catch {
    output = { status: "FAILED" };
    exitCode = 1;
  }
  process.stdout.write(`${JSON.stringify(output)}\n`);
  process.exitCode = exitCode;
}
