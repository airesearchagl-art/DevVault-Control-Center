import os from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { OFF_EVENTS, UNDECIDED_EVENTS, snapshotSource, sourceDigest } from "../../scripts/lib/f01-access-gate-harness.mjs";
import { FIXTURE, SENTINELS, readManifest, verifyDataRoot } from "../../scripts/lib/f01-synthetic-fixture.mjs";
import { controlReadSourceFrom } from "../app/controlReadSource";
import { CONTROL_READ_CONTRACT } from "../domain/controlRead/contract";
import { emptyReviewForm } from "../domain/review";
import { createLocaleStore, loadSettings } from "../services/settings";
import { PROJECTS_TARGET, StorageError, reviewTarget, type StorageBackend } from "../services/storage";
import { MemoryStorage } from "./memoryStorage";
import { observeStorage, storageEventOf, verifyMemoryStorage } from "./f01ServiceWiring";
import {
  CODEX_PATH,
  NEW_REVIEW_ID,
  OPERATION_NAMES,
  REVIEW_DIR,
  SNAPSHOT_REQUEST,
  baseline,
  deferred,
  editProject,
  expectRefused,
  expected,
  findings,
  flush,
  materialize,
  memoryFindings,
  onRig,
  releasePath,
  removeTemps,
  request,
  rig,
  sourceFromVerified,
  until,
  verifiedTicket,
  writesIn,
  type Rig,
} from "./f01GateRig";

/**
 * F01 access gate wired to DVCC's real services (DVCC-F01-SERVICE-INTEGRATION-01,
 * docs/f01-synthetic-data-boundary.md §6.8).
 *
 * The real `ReviewHub`, the real settings store and `loadSettings`, the app's reducer and
 * `controlReadSourceFrom` run against an in-memory store (`MemoryStorage`) seeded with the synthetic
 * fixture. Events reach the gate through the test-only wiring in `f01ServiceWiring.ts`, from actual
 * service calls; the tests never call `notify` for the scenarios themselves. Writes can be held in
 * progress (`HeldStorage`) and released in any order; no timer, no sleep. Disk is used only for
 * `dvcc-f01-*` temp copies written from the in-memory store. The set-up is shared with
 * `f01CandidateComplete.test.ts` (`f01GateRig.ts`); these tests use the storage-only wiring.
 */

afterEach(removeTemps);

describe("A: the real services reach the gate through the test-only wiring", () => {
  it("starts OFF; after the real reload and settings load, an explicit T0 verifies the in-memory store and turns ON", async () => {
    const r = await rig("KEEP");
    expect(r.gate.status().access).toBe("OFF");
    expect(r.app.dispatched).toEqual(["loaded"]);
    expect(r.wiring.settings).toMatchObject({ persisted: "ja", codexExecutablePath: null, writable: true });
    expectRefused(r.gate.handle(SNAPSHOT_REQUEST), "ACCESS_OFF");
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
    for (const operation of OPERATION_NAMES) expect(r.gate.handle(request(operation))).toEqual({ status: "SENT" });
    expect(r.transport.payloads().map((payload) => JSON.parse(payload))).toEqual(OPERATION_NAMES.map(expected));
    // Serving requests touches no storage: the verifier reads the store directly.
    expect(r.log).toEqual([]);
  });

  it("reports reads as undecided events, and every other operation, known or not, as a write", () => {
    // Typed: a storage method added to the product without a classification fails the typecheck.
    const operations: Record<keyof StorageBackend, "read" | "write"> = {
      info: "read",
      read: "read",
      listReviews: "read",
      assertUnchanged: "read",
      write: "write",
      appendLine: "write",
      quarantine: "write",
      restoreBackup: "write",
    };
    for (const [operation, kind] of Object.entries(operations)) {
      const reported = storageEventOf(operation, [PROJECTS_TARGET]);
      expect(reported.kind, operation).toBe(kind);
      expect(kind === "read" ? UNDECIDED_EVENTS : OFF_EVENTS, operation).toContain(reported.event);
    }
    expect(storageEventOf("write", [{ kind: "settings" }])).toEqual({ kind: "write", event: "settings.write" });
    expect(storageEventOf("compact", [])).toEqual({ kind: "write", event: "storage.compact" });
    expect([...OFF_EVENTS, ...UNDECIDED_EVENTS]).not.toContain("storage.compact");
  });
});

describe("B: a write in progress", () => {
  it("a hub write turns access OFF as it starts; while it is pending nothing is served and ON is refused", async () => {
    const r = await onRig("KEEP");
    const inFlight = verifiedTicket(r);
    const before = r.memory.files.get("projects.json");
    r.held.holding = true;
    const edit = editProject(r);
    await until(() => r.held.waiting.length === 1, "write held");
    expect(r.gate.pendingWrites()).toBe(1);
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "WRITE_STARTED" });
    expect(r.memory.files.get("projects.json")).toBe(before);
    expectRefused(inFlight.send(), "ACCESS_OFF");
    expectRefused(r.gate.handle(SNAPSHOT_REQUEST), "ACCESS_OFF");
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "WRITE_PENDING" });
    expect(r.gate.pendingWrites()).toBe(1);
    r.held.release();
    expect((await edit).ok).toBe(true);
    expect(r.gate.pendingWrites()).toBe(0);
    expect(r.log).toEqual(["begin storage.write", "end storage.write", "notify hubCommitted"]);
    expect(r.app.state.projects[0].nextAction).toBe("SENTINEL_PROJECT_NEXT_ACTION_EDITED");
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "EVENT" });
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "VERIFICATION_FAILED" });
    expect(r.responses).toHaveLength(1);
    expect(r.transport.calls()).toBe(0);
  });

  it.each([
    ["succeeds", false],
    ["fails", true],
  ])("access stays OFF after a hub write that %s, until an explicit T0", async (_, fail) => {
    const r = await onRig("KEEP");
    if (fail) r.memory.failingWrites.add("projects.json");
    const edit = editProject(r);
    if (fail) await expect(edit).rejects.toMatchObject({ code: "WRITE_FAILED" });
    else expect((await edit).ok).toBe(true);
    await flush();
    expect(r.gate.pendingWrites()).toBe(0);
    expect(r.gate.status().access).toBe("OFF");
    expectRefused(r.gate.handle(SNAPSHOT_REQUEST), "ACCESS_OFF");
    expect(r.log).toEqual(fail ? ["begin storage.write", "end storage.write"] : ["begin storage.write", "end storage.write", "notify hubCommitted"]);
    // A failed write changed nothing, so re-verification passes; a successful one changed the data.
    expect(await r.gate.turnOn()).toEqual(fail ? { access: "ON" } : { access: "OFF", code: "VERIFICATION_FAILED" });
    expect(r.transport.calls()).toBe(0);
  });

  it.each<[string, [string, string], boolean]>([
    ["hub write settles first, both succeed", ["projects.json", "settings.json"], false],
    ["settings write settles first, both succeed", ["settings.json", "projects.json"], false],
    ["hub write settles first, both fail", ["projects.json", "settings.json"], true],
    ["settings write settles first, both fail", ["settings.json", "projects.json"], true],
  ])("two overlapping writes, one settling does not end the pending state: %s", async (_, [first, second], fail) => {
    const r = await onRig("KEEP");
    if (fail) for (const file of ["projects.json", "settings.json"]) r.memory.failingWrites.add(file);
    r.held.holding = true;
    const edit = editProject(r);
    const save = r.wiring.settings.save("en");
    await until(() => r.held.waiting.length === 2, "both writes held");
    expect(r.held.waiting.map((call) => call.path).sort()).toEqual(["projects.json", "settings.json"]);
    expect(r.gate.pendingWrites()).toBe(2);
    releasePath(r, first);
    await until(() => r.gate.pendingWrites() === 1, "first write settled");
    expect(r.gate.status().access).toBe("OFF");
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "WRITE_PENDING" });
    expectRefused(r.gate.handle(SNAPSHOT_REQUEST), "ACCESS_OFF");
    releasePath(r, second);
    const [edited, saved] = await Promise.allSettled([edit, save]);
    expect(edited.status).toBe(fail ? "rejected" : "fulfilled");
    expect(saved).toMatchObject({ status: "fulfilled", value: { ok: !fail } });
    expect(r.gate.pendingWrites()).toBe(0);
    expect(await r.gate.turnOn()).toEqual(fail ? { access: "ON" } : { access: "OFF", code: "VERIFICATION_FAILED" });
    expect(r.transport.calls()).toBe(0);
  });

  it("a write that throws synchronously still ends its token, and an old ticket does not come back", async () => {
    const r = await onRig("KEEP");
    const old = verifiedTicket(r);
    const throwing: StorageBackend = {
      info: () => r.memory.info(),
      read: (target, options) => r.memory.read(target, options),
      listReviews: () => r.memory.listReviews(),
      write: () => {
        throw new StorageError("WRITE_FAILED", "synthetic synchronous failure");
      },
      appendLine: (target, line) => r.memory.appendLine(target, line),
      quarantine: (target, options) => r.memory.quarantine(target, options),
      restoreBackup: (target) => r.memory.restoreBackup(target),
    };
    const observed = observeStorage(throwing, r.gate);
    expect(() => observed.write(PROJECTS_TARGET, "{}")).toThrow(StorageError);
    expect(r.gate.pendingWrites()).toBe(0);
    r.memory.failAppends = true;
    await expect(observed.appendLine(reviewTarget(FIXTURE.reviewId, "events.jsonl"), "{}")).rejects.toMatchObject({ code: "WRITE_FAILED" });
    expect(r.gate.pendingWrites()).toBe(0);
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "WRITE_SETTLED" });
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
    expectRefused(old.send(), "EPOCH_MISMATCH");
    expect(old.state()).toBe("REFUSED");
    expect(r.transport.calls()).toBe(0);
  });

  it("a write token counts once, however often it is ended", async () => {
    const r = await onRig("KEEP");
    const a = r.gate.beginWrite("storage.write");
    const b = r.gate.beginWrite("storage.write");
    expect(r.gate.pendingWrites()).toBe(2);
    a.end();
    a.end();
    a.end();
    expect(r.gate.pendingWrites()).toBe(1);
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "WRITE_PENDING" });
    b.end();
    expect(r.gate.pendingWrites()).toBe(0);
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
  });
});

describe("C: scenarios started from real service calls", () => {
  it("ReviewHub.apply: a session write and an event append, then the commit; access is OFF from the first write", async () => {
    const r = await onRig("KEEP");
    const events = `${REVIEW_DIR}/events.jsonl`;
    const result = await r.wiring.hub.apply(FIXTURE.reviewId, { type: "setResource", resourceState: "WARM" });
    expect(result.ok).toBe(true);
    expect(r.log).toEqual([
      "begin storage.write",
      "end storage.write",
      "begin storage.appendLine",
      "end storage.appendLine",
      "notify hubCommitted",
    ]);
    expect(r.app.state.reviews[0].session?.resourceState).toBe("WARM");
    expect(r.memory.files.get(events)?.startsWith(baseline(events))).toBe(true);
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "EVENT" });
    expect(memoryFindings(r.memory)).toEqual([
      `CONTENT_MISMATCH ${REVIEW_DIR}/events.jsonl`,
      `CONTENT_MISMATCH ${REVIEW_DIR}/session.json`,
      `TRANSIENT_STORAGE_FILE ${REVIEW_DIR}/session.json.bak`,
    ]);
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "VERIFICATION_FAILED" });
  });

  it("settings: saving the language turns access OFF through its storage write alone; the source digest cannot see it", async () => {
    const r = await onRig("KEEP");
    const bound = r.gate.binding()?.sourceDigest;
    expect(await r.wiring.settings.save("en")).toMatchObject({ ok: true, locale: "en" });
    expect(r.log).toEqual(["begin settings.write", "end settings.write"]);
    expect(r.app.dispatched).not.toContain("hubCommitted");
    expect(sourceDigest(controlReadSourceFrom(r.app.state))).toBe(bound);
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "WRITE_SETTLED" });
    expect(memoryFindings(r.memory)).toEqual(["CONTENT_MISMATCH settings.json", "TRANSIENT_STORAGE_FILE settings.json.bak"]);
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "VERIFICATION_FAILED" });
  });

  it("settings: a fictional Codex path is saved and cleared as a string only, and never reaches the source", async () => {
    const r = await onRig("KEEP");
    // The settings store only stores the string; nothing looks for or starts an executable.
    expect(await r.wiring.settings.saveCodexExecutablePath(CODEX_PATH)).toEqual({ ok: true, codexExecutablePath: CODEX_PATH });
    expect(r.memory.files.get("settings.json")).toContain("SENTINEL_CODEX");
    expect(r.gate.status().access).toBe("OFF");
    expect(JSON.stringify(snapshotSource(controlReadSourceFrom(r.app.state)).value)).not.toMatch(/SENTINEL_CODEX|codexExecutablePath|locale/);
    expect(await r.wiring.settings.saveCodexExecutablePath(null)).toEqual({ ok: true, codexExecutablePath: null });
    expect(r.memory.files.get("settings.json")).toBe(baseline("settings.json"));
    expect(r.log).toEqual(["begin settings.write", "end settings.write", "begin settings.write", "end settings.write"]);
    // The content is the baseline again, but the writes left a backup: still refused.
    expect(memoryFindings(r.memory)).toEqual(["TRANSIENT_STORAGE_FILE settings.json.bak"]);
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "VERIFICATION_FAILED" });
  });

  it("storage.quarantine and storage.restoreBackup: a reload that recovers a broken projects.json", async () => {
    const r = await onRig("KEEP");
    // Another program breaks the file and leaves a valid backup; nothing reports that.
    r.memory.files.set("projects.json", "{ broken");
    r.memory.files.set("projects.json.bak", baseline("projects.json"));
    expect(r.gate.status().access).toBe("ON");
    await r.wiring.reload();
    expect([...writesIn(r.log), r.log.at(-1)]).toEqual([
      "begin storage.quarantine",
      "end storage.quarantine",
      "begin storage.restoreBackup",
      "end storage.restoreBackup",
      "notify loaded",
    ]);
    expect(r.app.state.projectsHealth).toMatchObject({ status: "restored_from_backup", cause: "corrupt_primary" });
    expect(r.memory.files.get("projects.json")).toBe(baseline("projects.json"));
    expect(memoryFindings(r.memory)).toEqual(["TRANSIENT_STORAGE_FILE projects.json.bak", "TRANSIENT_STORAGE_FILE projects.json.corrupt-1"]);
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "VERIFICATION_FAILED" });
  });

  it.each<[string, (b: StorageBackend) => Promise<unknown>, ((memory: MemoryStorage) => void) | null]>([
    ["write", (b) => b.write(PROJECTS_TARGET, baseline("projects.json")), null],
    ["appendLine", (b) => b.appendLine(reviewTarget(FIXTURE.reviewId, "events.jsonl"), JSON.stringify({ v: 1 })), null],
    ["quarantine", (b) => b.quarantine(PROJECTS_TARGET), null],
    [
      "restoreBackup",
      (b) => b.restoreBackup(PROJECTS_TARGET),
      (memory) => {
        memory.files.set("projects.json.bak", baseline("projects.json"));
        memory.files.delete("projects.json");
      },
    ],
  ])("storage.%s through the observed backend: OFF from its start, pending until it settles", async (operation, call, setup) => {
    const r = await onRig("KEEP");
    setup?.(r.memory);
    r.held.holding = true;
    const running = call(r.wiring.backend);
    await until(() => r.held.waiting.length === 1, "write held");
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "WRITE_STARTED" });
    expect(r.gate.pendingWrites()).toBe(1);
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "WRITE_PENDING" });
    r.held.release();
    await running;
    expect(r.gate.pendingWrites()).toBe(0);
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "WRITE_SETTLED" });
    expect(r.log).toEqual([`begin storage.${operation}`, `end storage.${operation}`]);
  });

  it("CONFLICT from the hub: another program changed projects.json, and nothing is overwritten", async () => {
    const r = await onRig("KEEP");
    const changed = baseline("projects.json").replace("SENTINEL_PROJECT_NOTES", "SENTINEL_PROJECT_NOTEZ");
    r.memory.files.set("projects.json", changed);
    await expect(editProject(r)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(r.memory.files.get("projects.json")).toBe(changed);
    expect(r.log).toEqual(["begin storage.write", "end storage.write"]);
    expect(r.app.dispatched).not.toContain("hubCommitted");
    expect(r.gate.pendingWrites()).toBe(0);
    expect(r.gate.status().access).toBe("OFF");
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "VERIFICATION_FAILED" });
  });

  it("CONFLICT from the settings store: another program changed settings.json; the store stops writing", async () => {
    const r = await onRig("KEEP");
    r.memory.files.set("settings.json", baseline("settings.json").replace('"ja"', '"en"'));
    expect(await r.wiring.settings.save("ja")).toMatchObject({ ok: false, locale: "ja", refusal: "blocked" });
    expect(r.wiring.settings.writable).toBe(false);
    expect(r.log).toEqual(["begin settings.write", "end settings.write"]);
    expect(r.gate.status().access).toBe("OFF");
    // Read-only from now on: a later save does not even reach storage.
    r.log.length = 0;
    expect(await r.wiring.settings.save("en")).toMatchObject({ ok: false, refusal: "blocked" });
    expect(r.log).toEqual([]);
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "VERIFICATION_FAILED" });
  });

  it("consecutive settings saves: the second starts only after the first settles, and access stays OFF throughout", async () => {
    const r = await onRig("KEEP");
    r.held.holding = true;
    const first = r.wiring.settings.save("en");
    const second = r.wiring.settings.save("ja");
    await until(() => r.held.waiting.length === 1, "first write held");
    await flush();
    // The second save waits in the settings queue, not in storage, so it is not yet counted.
    expect(r.held.waiting).toHaveLength(1);
    expect(r.gate.pendingWrites()).toBe(1);
    r.held.release();
    await until(() => r.held.waiting.length === 1, "second write held");
    expect(r.gate.pendingWrites()).toBe(1);
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "WRITE_PENDING" });
    r.held.release();
    expect(await first).toMatchObject({ ok: true, locale: "en", superseded: true });
    expect(await second).toMatchObject({ ok: true, locale: "ja", superseded: false });
    expect(r.memory.files.get("settings.json")).toBe(baseline("settings.json"));
    expect(r.log).toEqual(["begin settings.write", "end settings.write", "begin settings.write", "end settings.write"]);
    expect(memoryFindings(r.memory)).toEqual(["TRANSIENT_STORAGE_FILE settings.json.bak"]);
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "VERIFICATION_FAILED" });
  });

  it("after unsubscribe, hub commits no longer reach the app, but the write still turns access OFF and T0 refuses", async () => {
    const r = await onRig("KEEP");
    r.wiring.unsubscribe();
    expect((await editProject(r)).ok).toBe(true);
    expect(r.log).toEqual(["begin storage.write", "end storage.write"]);
    expect(r.app.dispatched).toEqual(["loaded"]);
    expect(r.app.state.projects[0].nextAction).toBe("SENTINEL_PROJECT_NEXT_ACTION");
    expect(r.gate.status().access).toBe("OFF");
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "VERIFICATION_FAILED" });
  });

  it("after dispose, the gate is closed: no T0 turns it ON again, even over unchanged data and after a reload", async () => {
    const r = await onRig("KEEP");
    const old = verifiedTicket(r);
    r.wiring.dispose();
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "CLOSED" });
    expectRefused(old.send(), "ACCESS_OFF");
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "CLOSED" });
    await r.wiring.reload();
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "CLOSED" });
    expectRefused(r.gate.handle(SNAPSHOT_REQUEST), "ACCESS_OFF");
    expect(r.transport.calls()).toBe(0);
  });

  it.each(["OFF", "KEEP"] as const)("reads (loading review artifacts) with undecidedEvents %s", async (policy) => {
    const r = await onRig(policy);
    const artifacts = await r.wiring.hub.loadArtifacts(FIXTURE.reviewId);
    if (artifacts === null) throw new Error("no artifacts");
    expect(artifacts.checkpoint).toContain("SENTINEL_CHECKPOINT_BODY");
    r.app.dispatch({ type: "artifactsLoaded", reviewId: FIXTURE.reviewId, artifacts });
    expect(writesIn(r.log)).toEqual([]);
    expect(r.log).toContain("notify storage.read");
    expect(r.log.at(-1)).toBe("notify artifactsLoaded");
    if (policy === "OFF") {
      expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "UNDECIDED_EVENT" });
      expectRefused(r.gate.handle(SNAPSHOT_REQUEST), "ACCESS_OFF");
      expect(r.transport.calls()).toBe(0);
    } else {
      expect(r.gate.status().access).toBe("ON");
      expect(r.gate.handle(SNAPSHOT_REQUEST)).toEqual({ status: "SENT" });
      expect(r.transport.payloads()[0]).not.toMatch(/SENTINEL_(CHECKPOINT|RESULT|REQUEST)_BODY|SENTINEL_EVENT_NOTE/);
    }
  });

  it("an operation the wiring does not know is treated as a write: OFF and pending until it settles", async () => {
    const r = await onRig("KEEP");
    class FutureStorage extends MemoryStorage {
      readonly calls: (() => void)[] = [];
      compact(): Promise<void> {
        return new Promise((done) => this.calls.push(done));
      }
    }
    const future = new FutureStorage();
    const compacting = observeStorage(future, r.gate).compact();
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "UNKNOWN_EVENT" });
    expect(r.gate.pendingWrites()).toBe(1);
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "WRITE_PENDING" });
    future.calls[0]();
    await compacting;
    expect(r.gate.pendingWrites()).toBe(0);
    // The synthetic store was not touched by it, so an explicit T0 turns ON again.
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
  });
});

describe("D: ordered sequences", () => {
  it("a hub write that starts while T0 runs cancels it", async () => {
    const hold = deferred();
    const r = await rig("KEEP", {
      sourceFromFiles: async (files) => {
        await hold.promise;
        return sourceFromVerified(files);
      },
    });
    r.held.holding = true;
    const starting = r.gate.turnOn();
    const edit = editProject(r);
    await until(() => r.held.waiting.length === 1, "write held");
    hold.resolve();
    expect(await starting).toEqual({ access: "OFF", code: "CHANGED_DURING_CHECK" });
    expect(r.gate.binding()).toBeNull();
    r.held.release();
    expect((await edit).ok).toBe(true);
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "VERIFICATION_FAILED" });
    expect(r.responses).toEqual([]);
    expect(r.transport.calls()).toBe(0);
  });

  it("a settings write that starts after T1 and before T2 refuses the send", async () => {
    const r = await onRig("KEEP");
    const ticket = verifiedTicket(r);
    r.held.holding = true;
    const save = r.wiring.settings.save("en");
    await until(() => r.held.waiting.length === 1, "write held");
    expectRefused(ticket.send(), "ACCESS_OFF");
    expect(ticket.state()).toBe("REFUSED");
    r.held.release();
    expect(await save).toMatchObject({ ok: true });
    expectRefused(ticket.send(), "ACCESS_OFF");
    expect(r.responses).toHaveLength(1);
    expect(r.transport.calls()).toBe(0);
  });

  it("after a failed write: reload, re-verification and an explicit ON serve again; the old ticket stays refused", async () => {
    const r = await onRig("KEEP");
    const old = verifiedTicket(r);
    const epoch = r.gate.status().epoch;
    r.memory.failingWrites.add("projects.json");
    await expect(editProject(r)).rejects.toMatchObject({ code: "WRITE_FAILED" });
    r.memory.failingWrites.clear();
    await r.wiring.reload();
    expect(r.app.dispatched.at(-1)).toBe("loaded");
    expect(r.gate.status().access).toBe("OFF");
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
    expect(r.gate.status().epoch).toBeGreaterThan(epoch);
    expectRefused(old.send(), "EPOCH_MISMATCH");
    expect(old.state()).toBe("REFUSED");
    for (const operation of OPERATION_NAMES) expect(r.gate.handle(request(operation))).toEqual({ status: "SENT" });
    expect(r.transport.payloads().map((payload) => JSON.parse(payload))).toEqual(OPERATION_NAMES.map(expected));
    expect(r.responses).toHaveLength(1 + OPERATION_NAMES.length);
  });

  it("interleaved tickets around a write: each is sent at most once, and only before the write", async () => {
    const r = await onRig("KEEP");
    const a = r.gate.receive(request("get_control_snapshot"));
    const b = r.gate.receive(request("get_project_state"));
    const c = r.gate.receive(request("get_review_state"));
    expect(a.verify()).toEqual({ status: "VERIFIED" });
    expect(b.verify()).toEqual({ status: "VERIFIED" });
    expect(b.send()).toEqual({ status: "SENT" });
    r.memory.failingWrites.add("projects.json");
    r.held.holding = true;
    const edit = editProject(r);
    await until(() => r.held.waiting.length === 1, "write held");
    expectRefused(a.send(), "ACCESS_OFF");
    expectRefused(c.verify(), "ACCESS_OFF");
    r.held.release();
    await expect(edit).rejects.toMatchObject({ code: "WRITE_FAILED" });
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
    // Nothing comes back after ON: a and c stay refused, b was already sent.
    expectRefused(a.send(), "ACCESS_OFF");
    expectRefused(c.send(), "ACCESS_OFF");
    expectRefused(b.send(), "OUT_OF_ORDER");
    expect(r.gate.handle(SNAPSHOT_REQUEST)).toEqual({ status: "SENT" });
    expect(r.transport.payloads().map((payload) => JSON.parse(payload))).toEqual([
      expected("get_project_state"),
      expected("get_control_snapshot"),
    ]);
    expect(r.responses).toHaveLength(3);
    expect([a, b, c].map((ticket) => ticket.state())).toEqual(["REFUSED", "SENT", "REFUSED"]);
  });

  it("synchronous dispatches during an asynchronous write: releasing it is not settling it", async () => {
    const r = await onRig("KEEP");
    r.held.holding = true;
    const edit = editProject(r);
    await until(() => r.held.waiting.length === 1, "write held");
    r.app.dispatch({ type: "selectReview", reviewId: FIXTURE.reviewId });
    r.app.dispatch({ type: "filterChanged", filter: { text: "alpha" } });
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "WRITE_STARTED" });
    r.held.release();
    // Released in this synchronous turn, but not yet settled: still pending.
    expect(r.gate.pendingWrites()).toBe(1);
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "WRITE_PENDING" });
    expect((await edit).ok).toBe(true);
    expect(r.log).toEqual([
      "begin storage.write",
      "notify selectReview",
      "notify filterChanged",
      "end storage.write",
      "notify hubCommitted",
    ]);
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "VERIFICATION_FAILED" });
    expect(r.transport.calls()).toBe(0);
  });
});

describe("E: synthetic files, in memory and in a temp copy on disk", () => {
  const CHANGES: [string, (r: Rig) => Promise<unknown>, string[]][] = [
    ["the language saved", (r) => r.wiring.settings.save("en"), ["CONTENT_MISMATCH settings.json", "TRANSIENT_STORAGE_FILE settings.json.bak"]],
    ["a project edited", (r) => editProject(r), ["CONTENT_MISMATCH projects.json", "TRANSIENT_STORAGE_FILE projects.json.bak"]],
    ["a review created (extra files)", (r) => r.wiring.hub.createReview(emptyReviewForm(FIXTURE.projectId)), [`UNEXPECTED_ENTRY reviews/${NEW_REVIEW_ID}`]],
    [
      "projects.json recovered from its backup",
      (r) => {
        r.memory.files.set("projects.json", "{ broken");
        r.memory.files.set("projects.json.bak", baseline("projects.json"));
        return r.wiring.reload();
      },
      ["TRANSIENT_STORAGE_FILE projects.json.bak", "TRANSIENT_STORAGE_FILE projects.json.corrupt-1"],
    ],
    [
      "projects.json set aside (missing)",
      async (r) => {
        r.memory.files.set("projects.json", "{ broken");
        await r.wiring.reload();
        return r.wiring.hub.setAsideProjects();
      },
      ["MISSING_FILE projects.json", "TRANSIENT_STORAGE_FILE projects.json.corrupt-1"],
    ],
  ];

  it.each(CHANGES)("%s: rejected in memory, and with the same findings once written out to a dvcc-f01-* temp copy", async (_, change, expectedFindings) => {
    const r = await onRig("KEEP");
    await change(r);
    expect(r.gate.status().access).toBe("OFF");
    expect(memoryFindings(r.memory)).toEqual(expectedFindings);
    const onDisk = verifyDataRoot(materialize(r.memory), readManifest());
    expect(findings(onDisk)).toEqual(expectedFindings);
    expect(onDisk.files).toBeNull();
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "VERIFICATION_FAILED" });
  });

  it("the unchanged store, written out, verifies on disk as well", async () => {
    const r = await onRig("KEEP");
    expect(verifyDataRoot(materialize(r.memory), readManifest()).ok).toBe(true);
  });

  it("restoring the content does not turn access ON; only an explicit T0 after the folder equals the baseline does", async () => {
    const r = await onRig("KEEP");
    await r.wiring.settings.save("en");
    await r.wiring.settings.save("ja");
    expect(r.memory.files.get("settings.json")).toBe(baseline("settings.json"));
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "VERIFICATION_FAILED" });
    // A reviewed reset outside the services removes the backup; the store equals the baseline again.
    r.memory.files.delete("settings.json.bak");
    expect(verifyMemoryStorage(r.memory, readManifest()).ok).toBe(true);
    await flush();
    expect(r.gate.status().access).toBe("OFF");
    expectRefused(r.gate.handle(SNAPSHOT_REQUEST), "ACCESS_OFF");
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
    expect(r.gate.handle(SNAPSHOT_REQUEST)).toEqual({ status: "SENT" });
  });

  it("serves only Control Read output: the goldens, and no sentinel, path, setting, body or secret in any response", async () => {
    const r = await onRig("KEEP");
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
    for (const req of requests) expect(r.gate.handle(req)).toEqual({ status: "SENT" });
    const payloads = r.transport.payloads();
    expect(payloads.slice(0, 3).map((payload) => JSON.parse(payload))).toEqual(OPERATION_NAMES.map(expected));
    const binding = r.gate.binding();
    for (const text of payloads) {
      for (const value of Object.values(SENTINELS)) expect(text, value).not.toContain(value);
      expect(text).not.toMatch(/SENTINEL_|[A-Za-z]:[\\/]|\\\\|chatgpt|\.jsonl?"|\.md"|\.lock|settings|locale|codex|data-root|memory:/i);
      expect(text.toLowerCase()).not.toContain(os.tmpdir().toLowerCase().replaceAll("\\", "\\\\"));
      for (const value of [binding?.manifestId ?? "", binding?.sourceDigest ?? ""]) expect(text).not.toContain(value);
      expect(text).not.toMatch(/gh[pousr]_[A-Za-z0-9]{20,}|\bsk-(ant-)?[A-Za-z0-9_-]{20,}|\bAKIA[0-9A-Z]{16}\b/);
    }
  });
});

describe("G: a writer that bypasses the wiring (a missed notification)", () => {
  it("a settings store on the unobserved backend: no event, T1 still refuses, but a ticket already past T1 is sent", async () => {
    const r = await onRig("KEEP");
    const pastT1 = verifiedTicket(r);
    const unwired = createLocaleStore(r.memory);
    unwired.adopt(await loadSettings(r.memory));
    expect(await unwired.save("en")).toMatchObject({ ok: true, locale: "en" });
    // Nothing reported the write, and settings are not in the source, so access is still ON.
    expect(r.log).toEqual([]);
    expect(r.gate.status().access).toBe("ON");
    // T2 checks access, epoch and the source digest only: this ticket goes out.
    expect(pastT1.send()).toEqual({ status: "SENT" });
    // The next request is refused at T1, where the store is verified again.
    expectRefused(r.gate.handle(SNAPSHOT_REQUEST), "VERIFICATION_FAILED");
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "VERIFICATION_FAILED" });
    expect(r.transport.calls()).toBe(1);
  });
});

describe("F: product behavior recorded here (not changed by this test)", () => {
  it("a suspend whose session write fails leaves a new checkpoint.md and commits nothing; the source digest does not change", async () => {
    const r = await onRig("KEEP");
    const bound = r.gate.binding()?.sourceDigest;
    r.memory.failingWrites.add(`${REVIEW_DIR}/session.json`);
    await expect(
      r.wiring.hub.apply(FIXTURE.reviewId, { type: "suspend", resourceState: "WARM", checkpoint: "SENTINEL_CHECKPOINT_BODY_2" }),
    ).rejects.toMatchObject({ code: "WRITE_FAILED" });
    expect(writesIn(r.log)).toEqual(["begin storage.write", "end storage.write", "begin storage.write", "end storage.write"]);
    expect(r.app.dispatched).not.toContain("hubCommitted");
    expect(sourceDigest(controlReadSourceFrom(r.app.state))).toBe(bound);
    expect(r.memory.files.get(`${REVIEW_DIR}/checkpoint.md`)).toContain("SENTINEL_CHECKPOINT_BODY_2");
    // Only the storage observer (OFF at the first write) and verification see this change.
    expect(r.gate.status().access).toBe("OFF");
    expect(memoryFindings(r.memory)).toEqual([`CONTENT_MISMATCH ${REVIEW_DIR}/checkpoint.md`]);
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "VERIFICATION_FAILED" });
  });

  it("a failed event append is returned as a warning, and the session write is still committed", async () => {
    const r = await onRig("KEEP");
    r.memory.failAppends = true;
    const result = await r.wiring.hub.apply(FIXTURE.reviewId, { type: "setResource", resourceState: "WARM" });
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.warning).not.toBeNull();
    expect(r.log).toEqual([
      "begin storage.write",
      "end storage.write",
      "begin storage.appendLine",
      "end storage.appendLine",
      "notify hubCommitted",
    ]);
    expect(r.memory.files.get(`${REVIEW_DIR}/events.jsonl`)).toBe(baseline(`${REVIEW_DIR}/events.jsonl`));
    expect(memoryFindings(r.memory)).toEqual([
      `CONTENT_MISMATCH ${REVIEW_DIR}/session.json`,
      `TRANSIENT_STORAGE_FILE ${REVIEW_DIR}/session.json.bak`,
    ]);
    expect(r.gate.status().access).toBe("OFF");
  });
});
