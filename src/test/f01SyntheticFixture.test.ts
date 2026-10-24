import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DATA_ROOT,
  FIXTURE,
  FIXTURE_DIR,
  LIMITS,
  MANIFEST_PATH,
  SENTINELS,
  TEMP_COPY_PREFIX,
  evaluateEntries,
  fixtureFiles,
  generateFixture,
  manifestText,
  parseManifest,
  readManifest,
  verifyDataRoot,
  type ListedEntry,
  type VerifyResult,
} from "../../scripts/lib/f01-synthetic-fixture.mjs";
import { appReducer, initialAppState, type AppState } from "../app/appState";
import { controlReadSourceFrom } from "../app/controlReadSource";
import { CONTROL_READ_CONTRACT } from "../domain/controlRead/contract";
import { readControl } from "../domain/controlRead/readControl";
import { loadAll } from "../services/persistence";
import { MemoryStorage } from "./memoryStorage";

/**
 * F01 synthetic-only pilot data (DVCC-F01-SYNTHETIC-PREP-01, docs/f01-synthetic-data-boundary.md).
 *
 * The fixture is verified against its committed manifest, never against values recomputed from the
 * data, and the manifest itself is pinned here. The verified bytes then go through the app's own
 * loading path (loadAll -> appReducer -> controlReadSourceFrom) into the pure `readControl`.
 */

/**
 * The real `node:fs`, except that every `readdirSync` call is recorded and `lstatSync` reports the
 * paths in `linkPaths` as links. This lets the tests observe the verifier's actual scan, and exercise
 * its link handling, without creating a link or reparse point on disk.
 */
const fsProbe = vi.hoisted(() => ({ readdirCalls: [] as string[], linkPaths: new Set<string>() }));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const { resolve } = await import("node:path");
  const key = (target: unknown): string => resolve(String(target)).toLowerCase();
  const readdirSync = ((dir: unknown, options?: unknown) => {
    fsProbe.readdirCalls.push(String(dir));
    return (actual.readdirSync as (dir: unknown, options?: unknown) => unknown)(dir, options);
  }) as typeof actual.readdirSync;
  const lstatSync = ((target: unknown, options?: unknown) => {
    const stat = (actual.lstatSync as (target: unknown, options?: unknown) => object)(target, options);
    if (!fsProbe.linkPaths.has(key(target))) return stat;
    return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, {
      isSymbolicLink: () => true,
      isDirectory: () => false,
      isFile: () => false,
    });
  }) as typeof actual.lstatSync;
  return { ...actual, default: { ...actual, readdirSync, lstatSync }, readdirSync, lstatSync };
});

/** SHA-256 of fixtures/f01-synthetic/v1/manifest.json. Changing the fixture means changing this too. */
const MANIFEST_SHA256 = "9c7696259730769f353fbd458b44cb83bf45ed4c56fa2b415c8f32e2bc43d23d";

const REVIEW_DIR = `reviews/${FIXTURE.reviewId}`;
const ENV = { now: () => "2026-10-20T01:00:00.000Z", newSnapshotId: () => "snap-f0100000-0000-4000-8000-000000000001" };
const OPERATIONS = {
  get_control_snapshot: { project_id: FIXTURE.projectId },
  get_project_state: { project_id: FIXTURE.projectId },
  get_review_state: { review_session_id: FIXTURE.reviewId },
} as const;

const copies: string[] = [];

beforeEach(() => {
  fsProbe.readdirCalls.length = 0;
  fsProbe.linkPaths.clear();
});

afterEach(() => {
  fsProbe.linkPaths.clear();
  for (const dir of copies.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const simulateLink = (target: string): void => {
  fsProbe.linkPaths.add(path.resolve(target).toLowerCase());
};

/** `readdirSync` calls made for `folder` or anything below it. */
function listedInside(folder: string): string[] {
  const base = path.resolve(folder).toLowerCase();
  return fsProbe.readdirCalls.filter((dir) => {
    const resolved = path.resolve(dir).toLowerCase();
    return resolved === base || resolved.startsWith(`${base}${path.sep}`);
  });
}

/** Creates `dir` holding one file more than the entry limit. */
function fillFolder(dir: string): void {
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i <= LIMITS.maxEntries; i += 1) writeFileSync(path.join(dir, `f-${i}.txt`), "x");
}

function tempDir(prefix: string = TEMP_COPY_PREFIX): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  copies.push(dir);
  return dir;
}

function copyFixture(prefix?: string): string {
  const dir = tempDir(prefix);
  cpSync(DATA_ROOT, dir, { recursive: true });
  return dir;
}

const at = (root: string, rel: string): string => path.join(root, ...rel.split("/"));
const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
const findings = (result: VerifyResult): string[] => result.findings.map(({ code, path: rel }) => `${code} ${rel}`);

function verifiedFiles(root: string = DATA_ROOT): Map<string, Buffer> {
  const result = verifyDataRoot(root, readManifest());
  if (!result.ok) throw new Error(`fixture rejected: ${findings(result).join(", ")}`);
  return result.files;
}

/** The app's own loading path, fed only with verified bytes (decoded as strict UTF-8, as Rust does). */
async function stateFrom(files: Map<string, Buffer>): Promise<AppState> {
  const memory = new MemoryStorage();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (const [rel, bytes] of files) memory.files.set(rel, decoder.decode(bytes));
  const data = await loadAll(memory);
  return appReducer(initialAppState, { type: "loaded", storage: { dataDir: "memory://f01-synthetic", source: "env", debugBuild: true }, data });
}

function respond(state: AppState, operation: string, target: Record<string, string>): unknown {
  return readControl({ contract: CONTROL_READ_CONTRACT, version: 1, operation, ...target }, controlReadSourceFrom(state), ENV);
}

const expected = (operation: string): unknown =>
  JSON.parse(readFileSync(path.join(FIXTURE_DIR, "expected", `${operation}.json`), "utf8"));

describe("F01 synthetic fixture definition", () => {
  it("pins the committed manifest", () => {
    expect(sha256(readFileSync(MANIFEST_PATH))).toBe(MANIFEST_SHA256);
  });

  it("commits exactly the manifest the fixed definitions imply", () => {
    expect(readFileSync(MANIFEST_PATH, "utf8")).toBe(manifestText());
  });

  it("commits exactly the generated bytes in data-root", () => {
    const files = verifiedFiles();
    const generated = fixtureFiles();
    expect([...files.keys()].sort()).toEqual([...generated.keys()].sort());
    for (const [rel, text] of generated) expect(files.get(rel)?.equals(Buffer.from(text, "utf8")), rel).toBe(true);
  });

  it("holds one fictional project and one fictional review with fixed IDs and times", async () => {
    const state = await stateFrom(verifiedFiles());
    expect(state.projects.map((project) => project.projectId)).toEqual([FIXTURE.projectId]);
    expect(state.reviews.map((review) => review.reviewId)).toEqual([FIXTURE.reviewId]);
    expect(state.projects[0].createdAt).toBe("2026-10-20T00:00:00.000Z");
    expect(state.reviews[0].session?.updatedAt).toBe("2026-10-20T00:32:00.000Z");
  });
});

describe("verifyDataRoot: fails closed on any difference from the manifest", () => {
  it("accepts an unmodified copy", () => {
    const result = verifyDataRoot(copyFixture(), readManifest());
    expect(findings(result)).toEqual([]);
    expect(result.files?.size).toBe(fixtureFiles().size);
  });

  it("rejects a content change of the same size", () => {
    const root = copyFixture();
    const file = at(root, `${REVIEW_DIR}/result-r1.md`);
    writeFileSync(file, readFileSync(file, "utf8").replace("SENTINEL_RESULT_BODY", "SENTINEL_RESULT_BODZ"));
    const result = verifyDataRoot(root, readManifest());
    expect(findings(result)).toEqual([`CONTENT_MISMATCH ${REVIEW_DIR}/result-r1.md`]);
    expect(result.files).toBeNull();
  });

  it("rejects a content change of another size", () => {
    const root = copyFixture();
    writeFileSync(at(root, "projects.json"), `${readFileSync(at(root, "projects.json"), "utf8")}\n`);
    expect(findings(verifyDataRoot(root, readManifest()))).toEqual(["CONTENT_MISMATCH projects.json"]);
  });

  it("rejects a missing file", () => {
    const root = copyFixture();
    unlinkSync(at(root, `${REVIEW_DIR}/checkpoint.md`));
    expect(findings(verifyDataRoot(root, readManifest()))).toEqual([`MISSING_FILE ${REVIEW_DIR}/checkpoint.md`]);
  });

  it("rejects a missing review folder", () => {
    const root = copyFixture();
    rmSync(at(root, REVIEW_DIR), { recursive: true });
    const result = findings(verifyDataRoot(root, readManifest()));
    expect(result).toContain(`MISSING_DIRECTORY ${REVIEW_DIR}`);
    expect(result).toContain(`MISSING_FILE ${REVIEW_DIR}/session.json`);
  });

  it("rejects an extra file", () => {
    const root = copyFixture();
    writeFileSync(at(root, "notes.txt"), "extra\n");
    expect(findings(verifyDataRoot(root, readManifest()))).toEqual(["UNEXPECTED_ENTRY notes.txt"]);
  });

  it("rejects an extra review folder as one entry, without looking inside it", () => {
    const root = copyFixture();
    mkdirSync(at(root, "reviews/rv-20261021-other1"));
    writeFileSync(at(root, "reviews/rv-20261021-other1/session.json"), "{}\n");
    expect(findings(verifyDataRoot(root, readManifest()))).toEqual(["UNEXPECTED_ENTRY reviews/rv-20261021-other1"]);
  });

  it("rejects DVCC temp, backup and set-aside files with their own reason", () => {
    const root = copyFixture();
    writeFileSync(at(root, "projects.json.bak"), "{}\n");
    writeFileSync(at(root, `${REVIEW_DIR}/session.json.tmp-123-1`), "{}\n");
    writeFileSync(at(root, "settings.json.corrupt-1760918400000"), "{}\n");
    expect(findings(verifyDataRoot(root, readManifest()))).toEqual([
      "TRANSIENT_STORAGE_FILE projects.json.bak",
      `TRANSIENT_STORAGE_FILE ${REVIEW_DIR}/session.json.tmp-123-1`,
      "TRANSIENT_STORAGE_FILE settings.json.corrupt-1760918400000",
    ]);
  });

  it("accepts an empty .dvcc.lock without hashing or returning it", () => {
    const root = copyFixture();
    writeFileSync(at(root, ".dvcc.lock"), "");
    const result = verifyDataRoot(root, readManifest());
    expect(findings(result)).toEqual([]);
    expect(result.files?.has(".dvcc.lock")).toBe(false);
  });

  it("rejects a .dvcc.lock that is not an empty regular file", () => {
    const withContent = copyFixture();
    writeFileSync(at(withContent, ".dvcc.lock"), "x");
    expect(findings(verifyDataRoot(withContent, readManifest()))).toEqual(["RUNTIME_FILE_INVALID .dvcc.lock"]);
    const asFolder = copyFixture();
    mkdirSync(at(asFolder, ".dvcc.lock"));
    expect(findings(verifyDataRoot(asFolder, readManifest()))).toEqual(["RUNTIME_FILE_INVALID .dvcc.lock"]);
  });

  it("rejects an expected file replaced by a folder", () => {
    const root = copyFixture();
    unlinkSync(at(root, "settings.json"));
    mkdirSync(at(root, "settings.json"));
    expect(findings(verifyDataRoot(root, readManifest()))).toEqual(["NOT_EXPECTED_KIND settings.json"]);
  });

  it("refuses every root except the fixture folder and dvcc-f01- temp copies, before listing it", () => {
    for (const root of [os.tmpdir(), path.dirname(DATA_ROOT), copyFixture("dvcc-other-"), at(copyFixture(), "reviews")]) {
      const result = verifyDataRoot(root, readManifest());
      expect(findings(result), root).toEqual(["ROOT_NOT_ALLOWED null"]);
      expect(result.files).toBeNull();
    }
  });

  it("rejects a malformed manifest before listing the folder", () => {
    const manifest = readManifest() as { files: { path: string; size: number; sha256: string }[] } & Record<string, unknown>;
    const first = manifest.files[0];
    const withFile = (change: Partial<typeof first>) => ({ ...manifest, files: [{ ...first, ...change }, ...manifest.files.slice(1)] });
    const variants: unknown[] = [
      null,
      { ...manifest, extra: true },
      { ...manifest, version: 2 },
      { ...manifest, files: [] },
      { ...manifest, files: [...manifest.files, first] },
      { ...manifest, runtime_managed: [] },
      withFile({ sha256: first.sha256.toUpperCase() }),
      withFile({ sha256: first.sha256.slice(1) }),
      withFile({ size: -1 }),
      withFile({ path: "/projects.json" }),
      withFile({ path: "../projects.json" }),
      withFile({ path: "reviews/../projects.json" }),
      withFile({ path: "X:/projects.json" }),
    ];
    for (const variant of variants) {
      expect(parseManifest(variant), JSON.stringify(variant).slice(0, 80)).toBeNull();
      expect(findings(verifyDataRoot(copyFixture(), variant))).toEqual(["MANIFEST_INVALID null"]);
    }
  });

  it("judges the data by the manifest, not by values recomputed from the data", () => {
    const manifest = readManifest() as { files: { path: string; sha256: string }[] };
    const pinned = {
      ...manifest,
      files: manifest.files.map((file) => (file.path === "projects.json" ? { ...file, sha256: sha256("other content") } : file)),
    };
    expect(findings(verifyDataRoot(copyFixture(), pinned))).toEqual(["CONTENT_MISMATCH projects.json"]);
  });

  it("stops listing at the entry limit", () => {
    const root = copyFixture();
    for (let i = 0; i < LIMITS.maxEntries; i += 1) writeFileSync(at(root, `extra-${i}.txt`), "");
    expect(findings(verifyDataRoot(root, readManifest()))).toEqual(["LIMIT_EXCEEDED null"]);
  });

  it("reports fixed codes with relative, echo-safe paths only", () => {
    const root = copyFixture();
    writeFileSync(at(root, "has space.txt"), "");
    writeFileSync(at(root, "notes.txt"), "");
    unlinkSync(at(root, "settings.json"));
    const result = verifyDataRoot(root, readManifest());
    expect(findings(result)).toEqual(["UNEXPECTED_ENTRY null", "UNEXPECTED_ENTRY notes.txt", "MISSING_FILE settings.json"]);
    for (const { path: rel } of result.findings) {
      if (rel === null) continue;
      expect(rel).toMatch(/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/);
      expect(rel.toLowerCase()).not.toContain(os.tmpdir().toLowerCase());
    }
  });
});

describe("verifyDataRoot scan: enters only the manifest's folders (RF-F01-IR01-01)", () => {
  function expectRejectedUnread(root: string, folder: string, expected: string[]): void {
    const result = verifyDataRoot(root, readManifest());
    expect(findings(result)).toEqual(expected);
    expect(result.ok).toBe(false);
    expect(result.files).toBeNull();
    expect(listedInside(at(root, folder))).toEqual([]);
  }

  it("lists the root and the manifest's folders (the probe sees the real scan)", () => {
    const root = copyFixture();
    fsProbe.readdirCalls.length = 0;
    expect(verifyDataRoot(root, readManifest()).ok).toBe(true);
    expect(fsProbe.readdirCalls.map((dir) => path.relative(root, dir).replaceAll("\\", "/")).sort()).toEqual(["", "reviews", REVIEW_DIR]);
  });

  it("an unknown review folder with 65 files is one UNEXPECTED_ENTRY and is never listed", () => {
    const root = copyFixture();
    fillFolder(at(root, "reviews/rv-20261021-other1"));
    expectRejectedUnread(root, "reviews/rv-20261021-other1", ["UNEXPECTED_ENTRY reviews/rv-20261021-other1"]);
  });

  it("an unknown top-level folder with nested folders and 65 files is one UNEXPECTED_ENTRY and is never listed", () => {
    const root = copyFixture();
    fillFolder(at(root, "unknown-folder"));
    fillFolder(at(root, "unknown-folder/nested"));
    expectRejectedUnread(root, "unknown-folder", ["UNEXPECTED_ENTRY unknown-folder"]);
  });

  it("folders named like a lock, an expected file or a backup are not entered either", () => {
    const lock = copyFixture();
    fillFolder(at(lock, ".dvcc.lock"));
    expectRejectedUnread(lock, ".dvcc.lock", ["RUNTIME_FILE_INVALID .dvcc.lock"]);

    const expectedFile = copyFixture();
    unlinkSync(at(expectedFile, "settings.json"));
    fillFolder(at(expectedFile, "settings.json"));
    expectRejectedUnread(expectedFile, "settings.json", ["NOT_EXPECTED_KIND settings.json"]);

    const backup = copyFixture();
    fillFolder(at(backup, "projects.json.bak"));
    expectRejectedUnread(backup, "projects.json.bak", ["TRANSIENT_STORAGE_FILE projects.json.bak"]);
  });

  it("the entry limit still applies inside the manifest's folders", () => {
    const root = copyFixture();
    for (let i = 0; i < LIMITS.maxEntries; i += 1) writeFileSync(at(root, `${REVIEW_DIR}/extra-${i}.md`), "");
    const result = verifyDataRoot(root, readManifest());
    expect(findings(result)).toEqual(["LIMIT_EXCEEDED null"]);
    expect(result.files).toBeNull();
  });

  it("a folder reported as a link is rejected and never listed", () => {
    const root = copyFixture();
    simulateLink(at(root, "reviews"));
    expectRejectedUnread(root, "reviews", ["LINK_OR_REPARSE reviews"]);
  });

  it("a root reported as a link is rejected before anything is listed", () => {
    const root = copyFixture();
    simulateLink(root);
    fsProbe.readdirCalls.length = 0;
    const result = verifyDataRoot(root, readManifest());
    expect(findings(result)).toEqual(["ROOT_INVALID null"]);
    expect(result.files).toBeNull();
    expect(fsProbe.readdirCalls).toEqual([]);
  });
});

describe("generateFixture: refuses foreign entries and links before writing", () => {
  const written = (root: string): boolean => existsSync(at(root, "projects.json"));

  it("generates exactly the committed fixture into an empty temp folder", () => {
    const root = tempDir();
    generateFixture(root);
    expect(findings(verifyDataRoot(root, readManifest()))).toEqual([]);
  });

  it("refuses an unknown folder without listing it or writing anything", () => {
    const root = tempDir();
    fillFolder(at(root, "unknown-folder"));
    expect(() => generateFixture(root)).toThrow("FIXTURE_FOLDER_HAS_FOREIGN_ENTRY");
    expect(listedInside(at(root, "unknown-folder"))).toEqual([]);
    expect(written(root)).toBe(false);
  });

  it("refuses a foreign file without writing anything", () => {
    const root = tempDir();
    writeFileSync(at(root, "notes.txt"), "extra\n");
    expect(() => generateFixture(root)).toThrow("FIXTURE_FOLDER_HAS_FOREIGN_ENTRY");
    expect(written(root)).toBe(false);
  });

  it("refuses an entry or a root reported as a link", () => {
    const linkedEntry = tempDir();
    mkdirSync(at(linkedEntry, "reviews"));
    simulateLink(at(linkedEntry, "reviews"));
    expect(() => generateFixture(linkedEntry)).toThrow("FIXTURE_FOLDER_HAS_FOREIGN_ENTRY");
    expect(written(linkedEntry)).toBe(false);

    const linkedRoot = tempDir();
    simulateLink(linkedRoot);
    expect(() => generateFixture(linkedRoot)).toThrow("FIXTURE_FOLDER_INVALID");
    expect(readdirSync(linkedRoot)).toEqual([]);
  });

  it("refuses a root other than data-root or a dvcc-f01- temp folder", () => {
    const other = tempDir("dvcc-other-");
    expect(() => generateFixture(other)).toThrow("ROOT_NOT_ALLOWED");
    expect(readdirSync(other)).toEqual([]);
  });
});

describe("evaluateEntries: links and reparse points (pure; no link is created on disk)", () => {
  const manifest = parseManifest(readManifest())!;
  const generated = fixtureFiles();
  const listing = (): ListedEntry[] =>
    [
      ...[...manifest.dirs].map((rel) => ({ path: rel, kind: "dir" as const, size: 0, redirected: false })),
      ...[...generated].map(([rel, text]) => ({ path: rel, kind: "file" as const, size: Buffer.byteLength(text), redirected: false })),
    ].sort((a, b) => (a.path < b.path ? -1 : 1));
  const reader = (read: string[]) => (entry: ListedEntry) => {
    read.push(entry.path);
    return Buffer.from(generated.get(entry.path)!, "utf8");
  };

  it("accepts the listing of the unmodified fixture", () => {
    expect(findings(evaluateEntries(listing(), manifest, reader([])))).toEqual([]);
  });

  it("rejects a linked folder and never reads below it", () => {
    const read: string[] = [];
    const entries = listing()
      .filter((entry) => !entry.path.startsWith("reviews/"))
      .map((entry) => (entry.path === "reviews" ? { ...entry, kind: "link" as const } : entry));
    expect(findings(evaluateEntries(entries, manifest, reader(read)))).toEqual(["LINK_OR_REPARSE reviews"]);
    expect(read.some((rel) => rel.startsWith("reviews/"))).toBe(false);
  });

  it("rejects a redirected file (resolved path differs) without reading it", () => {
    const read: string[] = [];
    const entries = listing().map((entry) => (entry.path === "projects.json" ? { ...entry, redirected: true } : entry));
    expect(findings(evaluateEntries(entries, manifest, reader(read)))).toEqual(["LINK_OR_REPARSE projects.json"]);
    expect(read).not.toContain("projects.json");
  });

  it("rejects a file that changed or cannot be read between listing and reading", () => {
    const vanished = evaluateEntries(listing(), manifest, (entry) => (entry.path === "settings.json" ? null : Buffer.from(generated.get(entry.path)!)));
    expect(findings(vanished)).toEqual(["CHANGED_OR_UNREADABLE settings.json"]);
    const failing = evaluateEntries(listing(), manifest, (entry) => {
      if (entry.path === "settings.json") throw new Error("EACCES");
      return Buffer.from(generated.get(entry.path)!);
    });
    expect(findings(failing)).toEqual(["CHANGED_OR_UNREADABLE settings.json"]);
  });

  it("rejects an entry that is neither a file nor a folder", () => {
    const entries = listing().map((entry) => (entry.path === "settings.json" ? { ...entry, kind: "other" as const } : entry));
    expect(findings(evaluateEntries(entries, manifest, reader([])))).toEqual(["NOT_EXPECTED_KIND settings.json"]);
  });
});

describe("Control Read over the verified synthetic fixture", () => {
  it("loads through the app's own loading path with healthy files", async () => {
    const state = await stateFrom(verifiedFiles());
    expect(state.phase).toBe("ready");
    expect(state.projectsHealth).toEqual({ status: "ok" });
    expect(state.reviews.map((review) => review.health.status)).toEqual(["ok"]);
    expect(Object.keys(controlReadSourceFrom(state)).sort()).toEqual(["gitObservations", "phase", "projects", "projectsHealth", "reviews"]);
  });

  for (const [operation, target] of Object.entries(OPERATIONS)) {
    it(`${operation} returns the expected response`, async () => {
      expect(respond(await stateFrom(verifiedFiles()), operation, target)).toEqual(expected(operation));
    });
  }

  it("no response or error discloses a sentinel, a path or a data-folder file name", async () => {
    const state = await stateFrom(verifiedFiles());
    const responses = [
      ...Object.entries(OPERATIONS).map(([operation, target]) => respond(state, operation, target)),
      respond(state, "get_project_state", { project_id: "synthetic-missing" }),
      respond(state, "get_review_state", { review_session_id: "rv-20261020-absent" }),
      respond(state, "get_run_state", { project_id: FIXTURE.projectId }),
    ];
    const text = JSON.stringify(responses);
    for (const value of Object.values(SENTINELS)) expect(text, value).not.toContain(value);
    expect(text).not.toMatch(/[A-Za-z]:[\\/]|\\\\|chatgpt|\.jsonl?"|\.md"|settings|locale|data-root|memory:/i);
    expect(text.toLowerCase()).not.toContain(os.tmpdir().toLowerCase().replaceAll("\\", "\\\\"));
  });

  it("answers from the verified bytes, so a later change on disk does not reach the response", async () => {
    const root = copyFixture();
    const verified = verifyDataRoot(root, readManifest());
    expect(verified.ok).toBe(true);
    const file = at(root, `${REVIEW_DIR}/session.json`);
    writeFileSync(file, readFileSync(file, "utf8").replace('"prNumber": 7', '"prNumber": 8'));
    const state = await stateFrom(verified.files!);
    expect(respond(state, "get_review_state", OPERATIONS.get_review_state)).toEqual(expected("get_review_state"));
    // The changed disk copy itself no longer verifies.
    expect(findings(verifyDataRoot(root, readManifest()))).toEqual([`CONTENT_MISMATCH ${REVIEW_DIR}/session.json`]);
  });
});
