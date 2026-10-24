import { readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  T2_CHECKS,
  createAccessGate,
  createRecordingTransport,
  type AccessGate,
  type AccessGateOptions,
  type Binding,
  type StageResult,
  type T2Check,
} from "../../scripts/lib/f01-access-gate-harness.mjs";
import { FIXTURE, MANIFEST_PATH, SENTINELS, readManifest, verifyDataRoot } from "../../scripts/lib/f01-synthetic-fixture.mjs";
import { controlReadSourceFrom } from "../app/controlReadSource";
import { CONTROL_READ_CONTRACT } from "../domain/controlRead/contract";
import { ReviewHub } from "../services/reviewHub";
import { createLocaleStore, loadSettings } from "../services/settings";
import { PROJECTS_TARGET, StorageError } from "../services/storage";
import type { MemoryStorage } from "./memoryStorage";
import { HUB_CALLS, SETTINGS_CALLS, trackService, verifyMemoryStorage, type ServiceCall, type Tracking } from "./f01ServiceWiring";
import {
  BASELINE,
  CODEX_PATH,
  MANIFEST_SHA256,
  OPERATION_NAMES,
  REVIEW_DIR,
  SNAPSHOT_REQUEST,
  baseline,
  editProject,
  expectRefused,
  expected,
  findings,
  flush,
  materialize,
  memoryFindings,
  onRig,
  projectInput,
  releasePath,
  removeTemps,
  request,
  respondWith,
  rig,
  sourceFromVerified,
  until,
  verifiedTicket,
  type Rig,
} from "./f01GateRig";

/**
 * F01 candidate completion (DVCC-F01-CANDIDATE-COMPLETE-01, docs/f01-synthetic-data-boundary.md §6.9).
 *
 * S: updates tracked from the service call (`SERVICE_AND_STORAGE` wiring): the real `ReviewHub` and
 *    settings store, with updates counted from the moment they are called, including the time they
 *    wait in the service's own queue. A reload is one update of its own, from its call until after its
 *    `loaded` dispatch (RF-F01-CANDIDATE-IR01-01).
 * T: the candidate T2 (`t2Check: "REVERIFY_STORAGE"`) compared with the original (`SOURCE_ONLY`), over
 *    the in-memory store.
 * D: the same comparison over a `dvcc-f01-*` temp copy on disk, verified by the reference disk verifier.
 *
 * Ordering is controlled with held storage calls and promises only: no timer, no sleep. Nothing here
 * is a decision to adopt either T2.
 */

afterEach(removeTemps);

const SENT: StageResult = { status: "SENT" };
const CHECKPOINT = `${REVIEW_DIR}/checkpoint.md`;
const SESSION = `${REVIEW_DIR}/session.json`;
const EVENTS = `${REVIEW_DIR}/events.jsonl`;
const REQUEST_R1 = `${REVIEW_DIR}/request-r1.md`;

const tracked = (undecided: "OFF" | "KEEP", overrides: Partial<AccessGateOptions<unknown>> = {}) =>
  rig(undecided, overrides, "SERVICE_AND_STORAGE");
const onTracked = (undecided: "OFF" | "KEEP", overrides: Partial<AccessGateOptions<unknown>> = {}) =>
  onRig(undecided, overrides, "SERVICE_AND_STORAGE");

/** Service calls (`call` / `settle`) and storage writes (`begin` / `end`), in the order reported. */
const updatesIn = (log: readonly string[]): string[] => log.filter((entry) => /^(call|settle|begin|end) /.test(entry));
const counts = (r: { gate: AccessGate }) => ({ operations: r.gate.pendingOperations(), writes: r.gate.pendingWrites() });
const storeVerifies = (r: Rig): boolean => verifyMemoryStorage(r.memory, readManifest()).ok;

function expectNothingDisclosed(payloads: readonly string[], binding: Binding | null): void {
  if (binding === null) throw new Error("no binding");
  for (const text of payloads) {
    for (const value of Object.values(SENTINELS)) expect(text, value).not.toContain(value);
    expect(text).not.toMatch(/SENTINEL_|[A-Za-z]:[\\/]|\\\\|chatgpt|\.jsonl?"|\.md"|\.lock|settings|locale|codex|data-root|memory:/i);
    expect(text.toLowerCase()).not.toContain(os.tmpdir().toLowerCase().replaceAll("\\", "\\\\"));
    for (const value of [binding.manifestId, binding.sourceDigest]) expect(text).not.toContain(value);
    expect(text).not.toMatch(/gh[pousr]_[A-Za-z0-9]{20,}|\bsk-(ant-)?[A-Za-z0-9_-]{20,}|\bAKIA[0-9A-Z]{16}\b/);
  }
}

/** The same file edits, applied to the in-memory store or to a temp copy on disk. Nothing reports them. */
interface Files {
  read(rel: string): string;
  write(rel: string, text: string): void;
  remove(rel: string): void;
}

function memoryFiles(memory: MemoryStorage): Files {
  return {
    read: (rel) => memory.files.get(rel) ?? "",
    write: (rel, text) => void memory.files.set(rel, text),
    remove: (rel) => void memory.files.delete(rel),
  };
}

function diskFiles(root: string): Files {
  const at = (rel: string) => path.join(root, ...rel.split("/"));
  return {
    read: (rel) => readFileSync(at(rel), "utf8"),
    write: (rel, text) => writeFileSync(at(rel), text, "utf8"),
    remove: (rel) => rmSync(at(rel)),
  };
}

const FILE_CHANGES: [string, (files: Files) => void, string[]][] = [
  ["the language in settings.json changed", (f) => f.write("settings.json", f.read("settings.json").replace('"ja"', '"en"')), ["CONTENT_MISMATCH settings.json"]],
  [
    "the checkpoint body changed",
    (f) => f.write(CHECKPOINT, f.read(CHECKPOINT).replace("SENTINEL_CHECKPOINT_BODY", "SENTINEL_CHECKPOINT_BODY_CHANGED")),
    [`CONTENT_MISMATCH ${CHECKPOINT}`],
  ],
  ["a field of session.json changed", (f) => f.write(SESSION, f.read(SESSION).replace("SENTINEL_VERDICT_NOTE", "SENTINEL_VERDICT_NOTF")), [`CONTENT_MISMATCH ${SESSION}`]],
  ["an event appended", (f) => f.write(EVENTS, `${f.read(EVENTS)}{"v":1,"type":"synthetic_extra"}\n`), [`CONTENT_MISMATCH ${EVENTS}`]],
  ["a backup file added", (f) => f.write("projects.json.bak", f.read("projects.json")), ["TRANSIENT_STORAGE_FILE projects.json.bak"]],
  ["a temp file added", (f) => f.write("settings.json.tmp-4242-1", "{}"), ["TRANSIENT_STORAGE_FILE settings.json.tmp-4242-1"]],
  ["request-r1.md removed", (f) => f.remove(REQUEST_R1), [`MISSING_FILE ${REQUEST_R1}`]],
];

describe("S: updates tracked from the service call", () => {
  it("tracks exactly the updates of the hub and the settings store; reads and local members pass through untracked", async () => {
    // HUB_CALLS and SETTINGS_CALLS are typed over every public member: an unclassified one fails the typecheck.
    const updates = (calls: Readonly<Record<string, ServiceCall>>): string[] =>
      Object.entries(calls)
        .filter(([, kind]) => kind === "update")
        .map(([name]) => name)
        .sort();
    expect(updates(HUB_CALLS)).toEqual([
      "apply",
      "captureJudgment",
      "captureResult",
      "createProject",
      "createReview",
      "editProject",
      "load",
      "saveFollowup",
      "saveRequest",
      "setAsideProjects",
    ]);
    expect(updates(SETTINGS_CALLS)).toEqual(["save", "saveCodexExecutablePath"]);
    const r = await onTracked("KEEP");
    await r.wiring.hub.info();
    expect(await r.wiring.hub.loadArtifacts(FIXTURE.reviewId)).not.toBeNull();
    expect(r.wiring.hub.snapshot().projects).toHaveLength(1);
    expect(r.wiring.hub.session(FIXTURE.reviewId)?.reviewSessionId).toBe(FIXTURE.reviewId);
    expect(r.wiring.settings).toMatchObject({ persisted: "ja", codexExecutablePath: null, writable: true });
    expect(updatesIn(r.log)).toEqual([]);
    expect(counts(r)).toEqual({ operations: 0, writes: 0 });
    expect(r.gate.status().access).toBe("ON");
  });

  it.each(["STORAGE", "SERVICE_AND_STORAGE"] as const)(
    "an edit waiting in the hub queue behind a held read (%s tracking)",
    async (tracking) => {
      const r = await onRig("KEEP", {}, tracking);
      const pastT1 = verifiedTicket(r);
      r.held.holdingReads = true;
      const loading = r.wiring.hub.loadArtifacts(FIXTURE.reviewId);
      await until(() => r.held.waiting.length === 1, "read held");
      const edit = editProject(r);
      await flush();
      // The edit waits in the hub's queue: storage has not been asked to write anything.
      expect(r.held.waiting.map((call) => call.operation)).toEqual(["read"]);
      expect(r.gate.pendingWrites()).toBe(0);
      expect(r.memory.files.get("projects.json")).toBe(baseline("projects.json"));
      if (tracking === "SERVICE_AND_STORAGE") {
        expect(r.gate.pendingOperations()).toBe(1);
        expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "OPERATION_STARTED" });
        expectRefused(pastT1.send(), "ACCESS_OFF");
        expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "OPERATION_PENDING" });
        expectRefused(r.gate.handle(SNAPSHOT_REQUEST), "ACCESS_OFF");
      } else {
        // The storage-only wiring cannot see the queued edit: the ticket goes out, and T0 turns ON again.
        expect(r.gate.pendingOperations()).toBe(0);
        expect(r.gate.status().access).toBe("ON");
        expect(pastT1.send()).toEqual(SENT);
        expect(await r.gate.turnOn()).toEqual({ access: "ON" });
        expect(r.gate.handle(SNAPSHOT_REQUEST)).toEqual(SENT);
      }
      r.held.holdingReads = false;
      r.held.release();
      expect(await loading).not.toBeNull();
      expect((await edit).ok).toBe(true);
      expect(counts(r)).toEqual({ operations: 0, writes: 0 });
      expect(r.gate.status().access).toBe("OFF");
      expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "VERIFICATION_FAILED" });
      expect(r.transport.calls()).toBe(tracking === "STORAGE" ? 2 : 0);
    },
  );

  it("after one update settles, an update still waiting in the queue keeps ON refused, with no write in progress", async () => {
    const r = await onTracked("KEEP");
    r.memory.failingWrites.add("projects.json");
    r.held.holding = true;
    const edit = editProject(r);
    await until(() => r.held.waiting.length === 1, "edit write held");
    r.held.holdingReads = true;
    const loading = r.wiring.hub.loadArtifacts(FIXTURE.reviewId);
    const apply = r.wiring.hub.apply(FIXTURE.reviewId, { type: "setResource", resourceState: "WARM" });
    expect(counts(r)).toEqual({ operations: 2, writes: 1 });
    releasePath(r, "projects.json");
    await expect(edit).rejects.toMatchObject({ code: "WRITE_FAILED" });
    await until(() => r.held.waiting.some((call) => call.operation === "read"), "read held");
    // The failed edit changed nothing and no write is in progress, but the apply still waits.
    expect(counts(r)).toEqual({ operations: 1, writes: 0 });
    expect(storeVerifies(r)).toBe(true);
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "OPERATION_PENDING" });
    r.held.holding = false;
    r.held.holdingReads = false;
    r.held.release();
    expect(await loading).not.toBeNull();
    expect((await apply).ok).toBe(true);
    expect(counts(r)).toEqual({ operations: 0, writes: 0 });
    expect(updatesIn(r.log)).toEqual([
      "call hub.editProject",
      "begin storage.write",
      "call hub.apply",
      "end storage.write",
      "settle hub.editProject",
      "begin storage.write",
      "end storage.write",
      "begin storage.appendLine",
      "end storage.appendLine",
      "settle hub.apply",
    ]);
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "VERIFICATION_FAILED" });
    expect(r.transport.calls()).toBe(0);
  });

  it("a reload that recovers projects.json: the load is pending from its call, and stays pending after its storage writes settle", async () => {
    const r = await onTracked("KEEP");
    r.memory.files.set("projects.json", "{ broken");
    r.memory.files.set("projects.json.bak", baseline("projects.json"));
    r.held.holding = true;
    const reloading = r.wiring.reload();
    await until(() => r.held.waiting.length === 1, "set-aside held");
    expect(r.held.waiting[0].operation).toBe("quarantine");
    // The reload and the hub.load inside it, each with its own token.
    expect(counts(r)).toEqual({ operations: 2, writes: 1 });
    r.held.release();
    await until(() => r.held.waiting.length === 1, "restore held");
    expect(r.held.waiting[0].operation).toBe("restoreBackup");
    r.held.holdingReads = true;
    r.held.release();
    await until(() => r.held.waiting.length === 1, "read after the restore held");
    expect(r.held.waiting[0].operation).toBe("read");
    // Both storage writes have settled; the load that made them has not.
    expect(counts(r)).toEqual({ operations: 2, writes: 0 });
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "OPERATION_PENDING" });
    r.held.holding = false;
    r.held.holdingReads = false;
    r.held.release();
    await reloading;
    expect(updatesIn(r.log)).toEqual([
      "call app.reload",
      "call hub.load",
      "begin storage.quarantine",
      "end storage.quarantine",
      "begin storage.restoreBackup",
      "end storage.restoreBackup",
      "settle hub.load",
      "settle app.reload",
    ]);
    expect(r.log.slice(-2)).toEqual(["notify loaded", "settle app.reload"]);
    expect(counts(r)).toEqual({ operations: 0, writes: 0 });
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "VERIFICATION_FAILED" });
  });

  // RF-F01-CANDIDATE-IR01-01: `reload()` asks `hub.info()` first, a read that can wait in the hub queue.
  it.each<[Tracking, T2Check]>([
    ["STORAGE", "SOURCE_ONLY"],
    ["SERVICE_AND_STORAGE", "SOURCE_ONLY"],
    ["SERVICE_AND_STORAGE", "REVERIFY_STORAGE"],
  ])("a reload waiting in the hub queue behind a held read (%s tracking, t2Check %s)", async (tracking, t2Check) => {
    const r = await onRig("KEEP", { t2Check }, tracking);
    const services = tracking === "SERVICE_AND_STORAGE";
    const pastT1 = verifiedTicket(r);
    const atLoaded: ReturnType<typeof counts>[] = [];
    r.app.listen((type) => {
      if (type === "loaded") atLoaded.push(counts(r));
    });
    r.held.holdingReads = true;
    const loading = r.wiring.hub.loadArtifacts(FIXTURE.reviewId);
    await until(() => r.held.waiting.length === 1, "read held");
    const reloading = r.wiring.reload();
    if (services) {
      // OFF from the call itself, before hub.info() has left the queue.
      expect(counts(r)).toEqual({ operations: 1, writes: 0 });
      expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "OPERATION_STARTED" });
    }
    await flush();
    // hub.info() still waits behind the held read: hub.load() has not been called.
    expect(r.held.waiting.map((call) => call.operation)).toEqual(["read"]);
    expect(r.app.dispatched.filter((type) => type === "loaded")).toHaveLength(1);
    const fresh = r.gate.receive(SNAPSHOT_REQUEST);
    if (services) {
      expect(updatesIn(r.log)).toEqual(["call app.reload"]);
      expect(counts(r)).toEqual({ operations: 1, writes: 0 });
      expectRefused(pastT1.send(), t2Check === "REVERIFY_STORAGE" ? "UPDATE_PENDING" : "ACCESS_OFF");
      expectRefused(fresh.verify(), "ACCESS_OFF");
      expectRefused(fresh.send(), "ACCESS_OFF");
      expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "OPERATION_PENDING" });
      expectRefused(r.gate.handle(SNAPSHOT_REQUEST), "ACCESS_OFF");
    } else {
      // The storage-only wiring sees nothing until the load's data is dispatched: both requests go out.
      expect(updatesIn(r.log)).toEqual([]);
      expect(counts(r)).toEqual({ operations: 0, writes: 0 });
      expect(r.gate.status().access).toBe("ON");
      expect(pastT1.send()).toEqual(SENT);
      expect(fresh.verify()).toEqual({ status: "VERIFIED" });
      expect(fresh.send()).toEqual(SENT);
      expect(await r.gate.turnOn()).toEqual({ access: "ON" });
      expect(r.gate.handle(SNAPSHOT_REQUEST)).toEqual(SENT);
    }
    r.held.holdingReads = false;
    r.held.release();
    expect(await loading).not.toBeNull();
    await reloading;
    // At the dispatch, hub.load() has settled; with service tracking the reload itself has not.
    expect(atLoaded).toEqual([{ operations: services ? 1 : 0, writes: 0 }]);
    if (services) {
      expect(updatesIn(r.log)).toEqual(["call app.reload", "call hub.load", "settle hub.load", "settle app.reload"]);
      expect(r.log.slice(-2)).toEqual(["notify loaded", "settle app.reload"]);
    } else {
      expect(updatesIn(r.log)).toEqual([]);
      expect(r.log.at(-1)).toBe("notify loaded");
    }
    expect(counts(r)).toEqual({ operations: 0, writes: 0 });
    // Nothing turns access back ON by itself.
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: services ? "OPERATION_SETTLED" : "EVENT" });
    expect(r.transport.calls()).toBe(services ? 0 : 3);
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
    expect(r.gate.handle(SNAPSHOT_REQUEST)).toEqual(SENT);
    expect(r.transport.calls()).toBe(services ? 1 : 4);
  });

  it("a reload whose hub.info() fails: its update still ends, hub.load() is never called, and nothing turns ON by itself", async () => {
    const r = await onTracked("KEEP");
    const pastT1 = verifiedTicket(r);
    const info = vi.spyOn(r.memory, "info").mockRejectedValueOnce(new StorageError("READ_FAILED", "synthetic info failure"));
    const reloading = r.wiring.reload();
    expect(counts(r)).toEqual({ operations: 1, writes: 0 });
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "OPERATION_STARTED" });
    await expect(reloading).rejects.toMatchObject({ code: "READ_FAILED" });
    expect(info).toHaveBeenCalledTimes(1);
    expect(updatesIn(r.log)).toEqual(["call app.reload", "settle app.reload"]);
    expect(r.log).not.toContain("notify loaded");
    expect(counts(r)).toEqual({ operations: 0, writes: 0 });
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "OPERATION_SETTLED" });
    expectRefused(pastT1.send(), "ACCESS_OFF");
    expect(r.transport.calls()).toBe(0);
    // The store and the app state are unchanged, so an explicit ON works again.
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
  });

  it("dispose while a reload waits in the hub queue: the gate stays CLOSED after the reload settles", async () => {
    const r = await onTracked("KEEP");
    const pastT1 = verifiedTicket(r);
    r.held.holdingReads = true;
    const loading = r.wiring.hub.loadArtifacts(FIXTURE.reviewId);
    await until(() => r.held.waiting.length === 1, "read held");
    const reloading = r.wiring.reload();
    expect(counts(r)).toEqual({ operations: 1, writes: 0 });
    r.wiring.dispose();
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "CLOSED" });
    r.held.holdingReads = false;
    r.held.release();
    expect(await loading).not.toBeNull();
    await reloading;
    // The load ran and its data reached the app, but no app event reached the gate any more.
    expect(r.app.dispatched.filter((type) => type === "loaded")).toHaveLength(2);
    expect(updatesIn(r.log)).toEqual(["call app.reload", "call hub.load", "settle hub.load", "settle app.reload"]);
    expect(r.log).not.toContain("notify loaded");
    expect(counts(r)).toEqual({ operations: 0, writes: 0 });
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "CLOSED" });
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "CLOSED" });
    expectRefused(pastT1.send(), "ACCESS_OFF");
    expectRefused(r.gate.handle(SNAPSHOT_REQUEST), "ACCESS_OFF");
    expect(r.transport.calls()).toBe(0);
  });

  it.each<[string, "hub" | "settings", "projects.json" | "settings.json"]>([
    ["the hub edit fails, the settings save succeeds; the save settles first", "hub", "settings.json"],
    ["the hub edit succeeds, the settings save fails; the save settles first", "settings", "settings.json"],
    ["the hub edit fails, the settings save succeeds; the edit settles first", "hub", "projects.json"],
    ["the hub edit succeeds, the settings save fails; the edit settles first", "settings", "projects.json"],
  ])("a hub update and a settings save overlap: %s", async (_, failing, first) => {
    const r = await onTracked("KEEP");
    r.memory.failingWrites.add(failing === "hub" ? "projects.json" : "settings.json");
    r.held.holding = true;
    const edit = editProject(r);
    const save = r.wiring.settings.save("en");
    // Both are counted from the call, before either reaches storage.
    expect(counts(r)).toEqual({ operations: 2, writes: 0 });
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "OPERATION_STARTED" });
    await until(() => r.held.waiting.length === 2, "both writes held");
    expect(counts(r)).toEqual({ operations: 2, writes: 2 });
    releasePath(r, first);
    await until(() => r.gate.pendingOperations() === 1, "first call settled");
    expect(r.gate.pendingWrites()).toBe(1);
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "OPERATION_PENDING" });
    releasePath(r, first === "projects.json" ? "settings.json" : "projects.json");
    const [edited, saved] = await Promise.allSettled([edit, save]);
    expect(edited.status).toBe(failing === "hub" ? "rejected" : "fulfilled");
    expect(saved).toMatchObject({ status: "fulfilled", value: { ok: failing !== "settings" } });
    expect(counts(r)).toEqual({ operations: 0, writes: 0 });
    // Exactly the one that succeeded changed the store.
    const changed = failing === "hub" ? "settings.json" : "projects.json";
    expect(memoryFindings(r.memory)).toEqual([`CONTENT_MISMATCH ${changed}`, `TRANSIENT_STORAGE_FILE ${changed}.bak`]);
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "VERIFICATION_FAILED" });
    expect(r.transport.calls()).toBe(0);
  });

  it("a settings update waiting in the settings queue is counted from its call, and each call settles on its own", async () => {
    const r = await onTracked("KEEP");
    r.held.holding = true;
    const first = r.wiring.settings.save("en");
    const second = r.wiring.settings.saveCodexExecutablePath(CODEX_PATH);
    await until(() => r.held.waiting.length === 1, "first write held");
    await flush();
    expect(r.held.waiting).toHaveLength(1);
    expect(counts(r)).toEqual({ operations: 2, writes: 1 });
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "OPERATION_PENDING" });
    r.held.release();
    expect(await first).toMatchObject({ ok: true, locale: "en" });
    expect(r.gate.pendingOperations()).toBe(1);
    await until(() => r.held.waiting.length === 1, "second write held");
    expect(counts(r)).toEqual({ operations: 1, writes: 1 });
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "OPERATION_PENDING" });
    r.held.release();
    // A string only: nothing looks for this path or starts it.
    expect(await second).toEqual({ ok: true, codexExecutablePath: CODEX_PATH });
    expect(counts(r)).toEqual({ operations: 0, writes: 0 });
    const reported = updatesIn(r.log);
    expect(reported.slice(0, 3)).toEqual(["call settings.save", "call settings.saveCodexExecutablePath", "begin settings.write"]);
    expect(reported.at(-1)).toBe("settle settings.saveCodexExecutablePath");
    expect(reported.filter((entry) => entry.startsWith("begin "))).toEqual(["begin settings.write", "begin settings.write"]);
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "VERIFICATION_FAILED" });
  });

  it.each<[string, (r: Rig) => Promise<unknown>, Record<string, unknown>, string]>([
    [
      "hub.editProject for an unknown project",
      (r) => r.wiring.hub.editProject("not-a-project", projectInput(r.app.state, "SENTINEL_PROJECT_NEXT_ACTION_EDITED")),
      { ok: false },
      "hub.editProject",
    ],
    [
      "hub.apply for an unknown review",
      (r) => r.wiring.hub.apply("rv-20261020-absent", { type: "setResource", resourceState: "WARM" }),
      { ok: false },
      "hub.apply",
    ],
    [
      "settings.save on a store that will not write",
      (r) => {
        r.wiring.settings.adopt({ locale: "ja", codexExecutablePath: null, problem: "invalid", raw: baseline("settings.json") });
        return r.wiring.settings.save("en");
      },
      { ok: false, refusal: "blocked" },
      "settings.save",
    ],
  ])("an update refused before storage (%s): OFF from its call; afterwards only an explicit T0 turns ON", async (_, call, outcome, name) => {
    const r = await onTracked("KEEP");
    const old = verifiedTicket(r);
    const pending = call(r);
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "OPERATION_STARTED" });
    expect(await pending).toMatchObject(outcome);
    expect(updatesIn(r.log)).toEqual([`call ${name}`, `settle ${name}`]);
    expect(counts(r)).toEqual({ operations: 0, writes: 0 });
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "OPERATION_SETTLED" });
    expect(storeVerifies(r)).toBe(true);
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
    expectRefused(old.send(), "EPOCH_MISMATCH");
    expect(r.transport.calls()).toBe(0);
  });

  it("a suspend that writes checkpoint.md and then fails on session.json: pending until the call settles; T0 refuses the partial change", async () => {
    const r = await onTracked("KEEP");
    r.memory.failingWrites.add(SESSION);
    r.held.holding = true;
    const suspend = r.wiring.hub.apply(FIXTURE.reviewId, { type: "suspend", resourceState: "WARM", checkpoint: "SENTINEL_CHECKPOINT_BODY_2" });
    await until(() => r.held.waiting.length === 1, "checkpoint write held");
    releasePath(r, CHECKPOINT);
    await until(() => r.held.waiting.length === 1 && r.held.waiting[0].path === SESSION, "session write held");
    // checkpoint.md is written already; the call has not settled.
    expect(r.memory.files.get(CHECKPOINT)).toContain("SENTINEL_CHECKPOINT_BODY_2");
    expect(counts(r)).toEqual({ operations: 1, writes: 1 });
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "OPERATION_PENDING" });
    r.held.release();
    await expect(suspend).rejects.toMatchObject({ code: "WRITE_FAILED" });
    expect(counts(r)).toEqual({ operations: 0, writes: 0 });
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "OPERATION_SETTLED" });
    expect(updatesIn(r.log)).toEqual([
      "call hub.apply",
      "begin storage.write",
      "end storage.write",
      "begin storage.write",
      "end storage.write",
      "settle hub.apply",
    ]);
    expect(r.app.dispatched).not.toContain("hubCommitted");
    expect(memoryFindings(r.memory)).toEqual([`CONTENT_MISMATCH ${CHECKPOINT}`]);
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "VERIFICATION_FAILED" });
  });

  it.each(["before the write is released", "in the same turn as the release", "after the call settled"] as const)(
    "dispose %s: the gate stays closed, and both counts still return to zero",
    async (when) => {
      const r = await onTracked("KEEP");
      const old = verifiedTicket(r);
      r.held.holding = true;
      const edit = editProject(r);
      await until(() => r.held.waiting.length === 1, "write held");
      if (when === "before the write is released") r.wiring.dispose();
      r.held.release();
      if (when === "in the same turn as the release") r.wiring.dispose();
      const result = await edit;
      if (when === "after the call settled") r.wiring.dispose();
      expect(result.ok).toBe(true);
      expect(counts(r)).toEqual({ operations: 0, writes: 0 });
      expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "CLOSED" });
      expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "CLOSED" });
      expectRefused(old.send(), "ACCESS_OFF");
      expectRefused(r.gate.handle(SNAPSHOT_REQUEST), "ACCESS_OFF");
      // The commit reached the app only when it came before dispose.
      expect(r.app.dispatched.includes("hubCommitted")).toBe(when === "after the call settled");
      expect(r.transport.calls()).toBe(0);
    },
  );

  it("after a failed update: a reload, re-verification and an explicit ON serve the goldens; the old ticket stays refused", async () => {
    const r = await onTracked("KEEP");
    const old = verifiedTicket(r);
    r.memory.failingWrites.add("projects.json");
    await expect(editProject(r)).rejects.toMatchObject({ code: "WRITE_FAILED" });
    r.memory.failingWrites.clear();
    r.log.length = 0;
    await r.wiring.reload();
    expect(updatesIn(r.log)).toEqual(["call app.reload", "call hub.load", "settle hub.load", "settle app.reload"]);
    expect(r.gate.status().access).toBe("OFF");
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
    expectRefused(old.send(), "EPOCH_MISMATCH");
    for (const operation of OPERATION_NAMES) expect(r.gate.handle(request(operation))).toEqual(SENT);
    expect(r.transport.payloads().map((payload) => JSON.parse(payload))).toEqual(OPERATION_NAMES.map(expected));
  });

  it("the tracker ends the token on a synchronous throw, a rejection and a refusal result (stand-in service)", async () => {
    const r = await onTracked("KEEP");
    // The real services never throw synchronously (every member returns a promise), so a stand-in does.
    const service = {
      throwNow(): Promise<void> {
        throw new StorageError("WRITE_FAILED", "synthetic synchronous failure");
      },
      rejectLater(): Promise<void> {
        return Promise.reject(new StorageError("WRITE_FAILED", "synthetic rejection"));
      },
      refuse(): Promise<{ ok: false }> {
        return Promise.resolve({ ok: false });
      },
    };
    const stub = trackService(service, { throwNow: "update", rejectLater: "update", refuse: "update" }, "stub", r.gate);
    expect(() => stub.throwNow()).toThrow(StorageError);
    expect(r.gate.pendingOperations()).toBe(0);
    const rejecting = stub.rejectLater();
    expect(r.gate.pendingOperations()).toBe(1);
    await expect(rejecting).rejects.toThrow(StorageError);
    expect(r.gate.pendingOperations()).toBe(0);
    const refusing = stub.refuse();
    expect(r.gate.pendingOperations()).toBe(1);
    expect(await refusing).toEqual({ ok: false });
    expect(r.gate.pendingOperations()).toBe(0);
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "OPERATION_SETTLED" });
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
  });

  it("an update token counts once, however often it is ended; updates and writes are counted separately", async () => {
    const r = await onTracked("KEEP");
    const a = r.gate.beginOperation("stub.a");
    const b = r.gate.beginOperation("stub.b");
    const w = r.gate.beginWrite("storage.write");
    expect(counts(r)).toEqual({ operations: 2, writes: 1 });
    a.end();
    a.end();
    a.end();
    expect(counts(r)).toEqual({ operations: 1, writes: 1 });
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "OPERATION_PENDING" });
    b.end();
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "WRITE_PENDING" });
    w.end();
    expect(counts(r)).toEqual({ operations: 0, writes: 0 });
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
  });

  it("a hub method the classification does not know is tracked as an update (fail closed)", async () => {
    const r = await onTracked("KEEP");
    class FutureHub extends ReviewHub {
      readonly calls: (() => void)[] = [];
      compact(): Promise<void> {
        return new Promise((done) => this.calls.push(done));
      }
    }
    const future = new FutureHub(r.memory);
    const hub = trackService(future, HUB_CALLS as unknown as Readonly<Record<keyof FutureHub, ServiceCall>>, "hub", r.gate);
    const compacting = hub.compact();
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "OPERATION_STARTED" });
    expect(counts(r)).toEqual({ operations: 1, writes: 0 });
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "OPERATION_PENDING" });
    future.calls[0]();
    await compacting;
    expect(r.gate.pendingOperations()).toBe(0);
    // It touched no storage, so an explicit T0 turns ON again.
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
  });
});

describe("T: the candidate T2 compared with the original, in memory", () => {
  it("t2Check is SOURCE_ONLY when left out, and only the two listed values are accepted", async () => {
    expect(T2_CHECKS).toEqual(["SOURCE_ONLY", "REVERIFY_STORAGE"]);
    await expect(rig("KEEP", { t2Check: "ALWAYS" as T2Check })).rejects.toThrow(TypeError);
  });

  it.each(FILE_CHANGES)("%s after T1, unreported: the original T2 sends (also by default); the candidate refuses VERIFICATION_FAILED", async (_, change, expectedFindings) => {
    const rigs = [await onRig("KEEP"), await onRig("KEEP", { t2Check: "SOURCE_ONLY" }), await onRig("KEEP", { t2Check: "REVERIFY_STORAGE" })];
    const tickets = rigs.map((r) => verifiedTicket(r));
    for (const r of rigs) change(memoryFiles(r.memory));
    for (const r of rigs) {
      expect(r.log).toEqual([]);
      expect(r.gate.status().access).toBe("ON");
      expect(memoryFindings(r.memory)).toEqual(expectedFindings);
    }
    expect(tickets.map((ticket) => ticket.send())).toEqual([SENT, SENT, { status: "REFUSED", code: "VERIFICATION_FAILED" }]);
    expect(rigs.map((r) => r.transport.calls())).toEqual([1, 1, 0]);
    // What the original sent is the response built at T1, before the change.
    expect(JSON.parse(rigs[0].transport.payloads()[0])).toEqual(expected("get_control_snapshot"));
    expect(rigs[2].gate.status()).toMatchObject({ access: "OFF", reason: "VERIFICATION_FAILED" });
    expect(tickets[2].state()).toBe("REFUSED");
    // The original refuses only from the next T1 on.
    for (const r of rigs.slice(0, 2)) expectRefused(r.gate.handle(SNAPSHOT_REQUEST), "VERIFICATION_FAILED");
  });

  it("a settings store on the unobserved backend saves after T1: the original T2 sends, the candidate refuses", async () => {
    const results: [T2Check, StageResult, number][] = [];
    for (const t2Check of T2_CHECKS) {
      const r = await onRig("KEEP", { t2Check });
      const ticket = verifiedTicket(r);
      const unwired = createLocaleStore(r.memory);
      unwired.adopt(await loadSettings(r.memory));
      expect(await unwired.save("en")).toMatchObject({ ok: true, locale: "en" });
      expect(r.log).toEqual([]);
      results.push([t2Check, ticket.send(), r.transport.calls()]);
    }
    expect(results).toEqual([
      ["SOURCE_ONLY", SENT, 1],
      ["REVERIFY_STORAGE", { status: "REFUSED", code: "VERIFICATION_FAILED" }, 0],
    ]);
  });

  it("the manifest bytes change after T1: the original T2 sends, the candidate refuses MANIFEST_CHANGED", async () => {
    const pinned = readFileSync(MANIFEST_PATH);
    const results: [T2Check, StageResult, number, string][] = [];
    for (const t2Check of T2_CHECKS) {
      let bytes = pinned;
      const r = await onRig("KEEP", { t2Check, readManifestBytes: () => bytes });
      const ticket = verifiedTicket(r);
      bytes = Buffer.concat([pinned, Buffer.from("\n")]);
      results.push([t2Check, ticket.send(), r.transport.calls(), r.gate.status().access]);
    }
    expect(results).toEqual([
      ["SOURCE_ONLY", SENT, 1, "ON"],
      ["REVERIFY_STORAGE", { status: "REFUSED", code: "MANIFEST_CHANGED" }, 0, "OFF"],
    ]);
  });

  it.each<[T2Check, string, string]>([
    ["SOURCE_ONLY", "ACCESS_OFF", "ACCESS_OFF"],
    ["REVERIFY_STORAGE", "UPDATE_PENDING", "CLOSED"],
  ])("t2Check %s: a ticket past T1 is refused %s while a called update is pending, and %s after dispose", async (t2Check, pendingCode, closedCode) => {
    const r = await onTracked("KEEP", { t2Check });
    const a = verifiedTicket(r);
    const b = verifiedTicket(r);
    r.held.holding = true;
    const save = r.wiring.settings.save("en");
    expectRefused(a.send(), pendingCode);
    r.wiring.dispose();
    expectRefused(b.send(), closedCode);
    await until(() => r.held.waiting.length === 1, "write held");
    r.held.release();
    expect(await save).toMatchObject({ ok: true });
    expect(counts(r)).toEqual({ operations: 0, writes: 0 });
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "CLOSED" });
    expect(r.transport.calls()).toBe(0);
  });

  /** A candidate rig whose store verification and source reads can be interrupted once, after T1. */
  async function interruptible(at: "verify" | "read", during: (r: Rig) => Promise<unknown> | void) {
    let armed = false;
    let started: Promise<unknown> | void = undefined;
    let reads = 0;
    const r: Rig = await tracked("KEEP", {
      t2Check: "REVERIFY_STORAGE",
      verifyStorage: (manifest) => {
        const result = verifyMemoryStorage(r.memory, manifest);
        if (armed && at === "verify") {
          armed = false;
          started = during(r);
        }
        return result;
      },
      readSource: () => {
        reads += 1;
        if (armed && at === "read") {
          armed = false;
          started = during(r);
        }
        return controlReadSourceFrom(r.app.state);
      },
    });
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
    const ticket = verifiedTicket(r);
    return {
      r,
      ticket,
      reads: () => reads,
      arm: () => {
        armed = true;
      },
      settle: async () => {
        await started;
      },
    };
  }

  const DURING: [string, (r: Rig) => Promise<unknown> | void][] = [
    ["a settings save is called", (r) => r.wiring.settings.save("en")],
    ["a storage write starts", (r) => r.wiring.backend.write(PROJECTS_TARGET, baseline("projects.json"))],
    ["access is turned OFF", (r) => r.gate.turnOff()],
    ["the wiring is disposed", (r) => r.wiring.dispose()],
  ];

  it.each(DURING)("candidate T2: %s while the store is verified → CHANGED_DURING_CHECK; the source is not read afterwards", async (_, during) => {
    const c = await interruptible("verify", during);
    const readsBefore = c.reads();
    c.arm();
    expectRefused(c.ticket.send(), "CHANGED_DURING_CHECK");
    expect(c.reads()).toBe(readsBefore);
    expect(c.ticket.state()).toBe("REFUSED");
    expectRefused(c.ticket.send(), "CHANGED_DURING_CHECK");
    await c.settle();
    expect(c.r.transport.calls()).toBe(0);
    expect(c.r.gate.status().access).toBe("OFF");
  });

  it.each<[string, (r: Rig) => Promise<unknown> | void]>([
    ["the app commits an unchanged hub snapshot", (r) => r.app.dispatch({ type: "hubCommitted", snapshot: r.wiring.hub.snapshot() })],
    ["a settings save is called", (r) => r.wiring.settings.save("en")],
    ["access is turned OFF", (r) => r.gate.turnOff()],
  ])("candidate T2: %s while the source is read after a successful verification → CHANGED_DURING_CHECK", async (_, during) => {
    const c = await interruptible("read", during);
    c.arm();
    expectRefused(c.ticket.send(), "CHANGED_DURING_CHECK");
    expect(c.ticket.state()).toBe("REFUSED");
    await c.settle();
    expect(c.r.transport.calls()).toBe(0);
    expect(c.r.gate.status().access).toBe("OFF");
  });

  it("candidate T2: a refused ticket stays refused, even after the store is restored and access is ON again", async () => {
    const r = await onRig("KEEP", { t2Check: "REVERIFY_STORAGE" });
    const ticket = verifiedTicket(r);
    r.memory.files.set("projects.json.bak", baseline("projects.json"));
    expectRefused(ticket.send(), "VERIFICATION_FAILED");
    r.memory.files.delete("projects.json.bak");
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
    expectRefused(ticket.send(), "VERIFICATION_FAILED");
    expect(ticket.state()).toBe("REFUSED");
    expect(r.gate.handle(SNAPSHOT_REQUEST)).toEqual(SENT);
    expect(r.transport.calls()).toBe(1);
  });

  it("candidate T2: a check that throws refuses CHECK_FAILED, turns access OFF and drops the payload for good", async () => {
    let throwOnce = false;
    const r: Rig = await rig("KEEP", {
      t2Check: "REVERIFY_STORAGE",
      verifyStorage: (manifest) => {
        if (throwOnce) {
          throwOnce = false;
          throw new Error("synthetic verifier failure");
        }
        return verifyMemoryStorage(r.memory, manifest);
      },
    });
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
    const ticket = verifiedTicket(r);
    throwOnce = true;
    expectRefused(ticket.send(), "CHECK_FAILED");
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "CHECK_FAILED" });
    expectRefused(ticket.send(), "CHECK_FAILED");
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
    expectRefused(ticket.send(), "CHECK_FAILED");
    expect(ticket.state()).toBe("REFUSED");
    expect(r.transport.calls()).toBe(0);
  });

  it.each([...T2_CHECKS])("t2Check %s: a ticket from before OFF → T0 → ON is refused EPOCH_MISMATCH; a ticket is sent at most once", async (t2Check) => {
    const r = await onRig("KEEP", { t2Check });
    const old = verifiedTicket(r);
    r.gate.turnOff();
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
    expectRefused(old.send(), "EPOCH_MISMATCH");
    expectRefused(old.send(), "EPOCH_MISMATCH");
    const fresh = verifiedTicket(r);
    expect(fresh.send()).toEqual(SENT);
    expectRefused(fresh.send(), "OUT_OF_ORDER");
    expect(fresh.state()).toBe("SENT");
    expect(r.gate.status().access).toBe("ON");
    expect(r.transport.payloads().map((payload) => JSON.parse(payload))).toEqual([expected("get_control_snapshot")]);
  });

  it.each([...T2_CHECKS])("t2Check %s: the source changed after T1 without any event is refused SOURCE_CHANGED", async (t2Check) => {
    const r = await onRig("KEEP", { t2Check });
    const ticket = verifiedTicket(r);
    r.app.state = { ...r.app.state, projects: [] };
    expectRefused(ticket.send(), "SOURCE_CHANGED");
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "SOURCE_CHANGED" });
    expect(r.transport.calls()).toBe(0);
  });

  it("candidate T2: the goldens are served, and no response carries a sentinel, path, setting, body or secret", async () => {
    const r = await onTracked("KEEP", { t2Check: "REVERIFY_STORAGE" });
    const artifacts = await r.wiring.hub.loadArtifacts(FIXTURE.reviewId);
    if (artifacts === null) throw new Error("no artifacts");
    r.app.dispatch({ type: "artifactsLoaded", reviewId: FIXTURE.reviewId, artifacts });
    const requests: unknown[] = [
      ...OPERATION_NAMES.map(request),
      { contract: CONTROL_READ_CONTRACT, version: 1, operation: "get_project_state", project_id: "not-a-project" },
      { contract: CONTROL_READ_CONTRACT, version: 1, operation: "get_review_state", review_session_id: "rv-20261020-absent" },
      { contract: CONTROL_READ_CONTRACT, version: 1, operation: "get_run_state", run_id: "run-1" },
      { contract: CONTROL_READ_CONTRACT, version: 2, operation: "get_control_snapshot" },
      "not an object",
    ];
    for (const req of requests) expect(r.gate.handle(req)).toEqual(SENT);
    const payloads = r.transport.payloads();
    expect(payloads.slice(0, 3).map((payload) => JSON.parse(payload))).toEqual(OPERATION_NAMES.map(expected));
    expectNothingDisclosed(payloads, r.gate.binding());
  });
});

describe("D: the candidate T2 over a dvcc-f01-* temp copy on disk (reference disk verifier)", () => {
  /** A gate over a temp copy: T0, T1 and the candidate T2 verify the folder on disk. */
  async function diskGate(t2Check: T2Check) {
    const root = materialize({ files: BASELINE });
    const verified = verifyDataRoot(root, readManifest());
    if (!verified.ok) throw new Error("temp copy rejected");
    // The live source: the app's own loading path over the bytes verified once at start-up.
    const source = await sourceFromVerified(verified.files);
    const transport = createRecordingTransport();
    const gate = createAccessGate<unknown>({
      root,
      pinnedManifestSha256: MANIFEST_SHA256,
      sourceFromFiles: sourceFromVerified,
      readSource: () => source,
      respond: respondWith,
      transport,
      undecidedEvents: "KEEP",
      t2Check,
    });
    expect(await gate.turnOn()).toEqual({ access: "ON" });
    return { root, gate, transport };
  }

  it.each([...T2_CHECKS])("an unchanged temp copy: t2Check %s serves the three goldens", async (t2Check) => {
    const d = await diskGate(t2Check);
    for (const operation of OPERATION_NAMES) expect(d.gate.handle(request(operation))).toEqual(SENT);
    expect(d.transport.payloads().map((payload) => JSON.parse(payload))).toEqual(OPERATION_NAMES.map(expected));
    expectNothingDisclosed(d.transport.payloads(), d.gate.binding());
  });

  it.each(FILE_CHANGES)("%s on disk after T1: the original T2 sends; the candidate refuses, with the same findings as in memory", async (_, change, expectedFindings) => {
    const original = await diskGate("SOURCE_ONLY");
    const candidate = await diskGate("REVERIFY_STORAGE");
    const tickets = [verifiedTicket(original), verifiedTicket(candidate)];
    for (const d of [original, candidate]) change(diskFiles(d.root));
    expect(findings(verifyDataRoot(candidate.root, readManifest()))).toEqual(expectedFindings);
    expect(tickets.map((ticket) => ticket.send())).toEqual([SENT, { status: "REFUSED", code: "VERIFICATION_FAILED" }]);
    expect([original.transport.calls(), candidate.transport.calls()]).toEqual([1, 0]);
    expect(candidate.gate.status()).toMatchObject({ access: "OFF", reason: "VERIFICATION_FAILED" });
    expectRefused(original.gate.handle(SNAPSHOT_REQUEST), "VERIFICATION_FAILED");
  });
});
