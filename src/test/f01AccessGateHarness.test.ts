import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  OFF_EVENTS,
  REFUSAL_CODES,
  SOURCE_KEYS,
  UNDECIDED_EVENTS,
  createAccessGate,
  createRecordingTransport,
  snapshotSource,
  sourceDigest,
  type AccessGate,
  type AccessGateOptions,
  type RecordingTransport,
  type StageResult,
} from "../../scripts/lib/f01-access-gate-harness.mjs";
import {
  DATA_ROOT,
  FIXTURE,
  FIXTURE_DIR,
  MANIFEST_PATH,
  SENTINELS,
  TEMP_COPY_PREFIX,
  fixtureFiles,
  manifestText,
  readManifest,
  verifyDataRoot,
} from "../../scripts/lib/f01-synthetic-fixture.mjs";
import { appReducer, initialAppState, type AppAction, type AppState } from "../app/appState";
import { controlReadSourceFrom } from "../app/controlReadSource";
import { CONTROL_READ_CONTRACT, type ControlReadSource } from "../domain/controlRead/contract";
import { readControl } from "../domain/controlRead/readControl";
import { loadAll, type LoadedData } from "../services/persistence";
import type { StorageBackend } from "../services/storage";
import { MemoryStorage } from "./memoryStorage";

/**
 * F01 access gate on synthetic data only (DVCC-F01-ACCESS-GATE-HARNESS-01,
 * docs/f01-synthetic-data-boundary.md §6.5 / §6.6).
 *
 * The gate runs against a temp copy of the synthetic fixture. The application side is the app's own
 * pure loading path and reducer, held by a small stand-in (`SyntheticApp`) that tells the gate about
 * each dispatch. Events are therefore simulated; changes on disk are real file edits in the temp
 * copy, and the gate sees them only when it verifies the folder at T0 or T1. Sending goes to a
 * recording transport. Every interleaving is placed by the test itself: no timers, no sleeps.
 */

/** SHA-256 of fixtures/f01-synthetic/v1/manifest.json (the same pin as f01SyntheticFixture.test.ts). */
const MANIFEST_SHA256 = "9c7696259730769f353fbd458b44cb83bf45ed4c56fa2b415c8f32e2bc43d23d";
const HARNESS_PATH = fileURLToPath(new URL("../../scripts/lib/f01-access-gate-harness.mjs", import.meta.url));

const REVIEW_DIR = `reviews/${FIXTURE.reviewId}`;
const OTHER_REPOSITORY = "https://github.com/example-org/synthetic-beta";
const ENV = { now: () => "2026-10-20T01:00:00.000Z", newSnapshotId: () => "snap-f0100000-0000-4000-8000-000000000001" };
const STORAGE_INFO = { dataDir: "memory://f01-synthetic", source: "env", debugBuild: true } as const;
const OPERATIONS = {
  get_control_snapshot: { project_id: FIXTURE.projectId },
  get_project_state: { project_id: FIXTURE.projectId },
  get_review_state: { review_session_id: FIXTURE.reviewId },
} as const;
type Operation = keyof typeof OPERATIONS;
const OPERATION_NAMES = Object.keys(OPERATIONS) as Operation[];

const request = (operation: Operation): Record<string, unknown> => ({
  contract: CONTROL_READ_CONTRACT,
  version: 1,
  operation,
  ...OPERATIONS[operation],
});
const SNAPSHOT_REQUEST = request("get_control_snapshot");

const expected = (operation: Operation): unknown =>
  JSON.parse(readFileSync(path.join(FIXTURE_DIR, "expected", `${operation}.json`), "utf8"));

const copies: string[] = [];

afterEach(() => {
  for (const dir of copies.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function copyFixture(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), TEMP_COPY_PREFIX));
  copies.push(dir);
  cpSync(DATA_ROOT, dir, { recursive: true });
  return dir;
}

const at = (root: string, rel: string): string => path.join(root, ...rel.split("/"));

function rewrite(root: string, rel: string, change: (text: string) => string): void {
  const file = at(root, rel);
  writeFileSync(file, change(readFileSync(file, "utf8")));
}

function verifiedFiles(root: string): Map<string, Buffer> {
  const result = verifyDataRoot(root, readManifest());
  if (!result.ok) throw new Error("fixture copy rejected");
  return result.files;
}

/** The app's own loading path over verified bytes (strict UTF-8, as Rust decodes them). */
async function loadedData(files: Map<string, Buffer>): Promise<LoadedData> {
  const memory = new MemoryStorage();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (const [rel, bytes] of files) memory.files.set(rel, decoder.decode(bytes));
  return loadAll(memory);
}

const loadedAction = (data: LoadedData): AppAction => ({ type: "loaded", storage: STORAGE_INFO, data });

async function sourceFromVerified(files: Map<string, Buffer>): Promise<ControlReadSource> {
  return controlReadSourceFrom(appReducer(initialAppState, loadedAction(await loadedData(files))));
}

/** The same data with another repository: a change Control Read would show. */
const changedData = (data: LoadedData): LoadedData => ({
  ...data,
  projects: data.projects.map((project) => ({ ...project, repositoryUrl: OTHER_REPOSITORY })),
});

const gitObservedAction = (data: LoadedData): AppAction => ({
  type: "gitObserved",
  projectId: FIXTURE.projectId,
  localRoot: data.projects[0].localRoot,
  projectCreatedAt: data.projects[0].createdAt,
  observation: {
    status: "OK",
    head: FIXTURE.head,
    branch: "main",
    detached: false,
    dirty: false,
    observedAt: "2026-10-20T00:40:00.000Z",
  },
});

/** The application side: its state, and dispatches that tell the gate the action's type. */
class SyntheticApp {
  state: AppState;
  private listener: (type: string) => void = () => undefined;

  constructor(state: AppState) {
    this.state = state;
  }

  listen(listener: (type: string) => void): void {
    this.listener = listener;
  }

  dispatch(action: AppAction): void {
    this.state = appReducer(this.state, action);
    this.listener(action.type);
  }

  /** A state change the gate is not told about. */
  replace(state: AppState): void {
    this.state = state;
  }
}

interface Hooks {
  /** Runs inside `respond`, before the response is built from the source the gate passed. */
  duringRespond?: (source: unknown) => void;
  /** Replaces what `readSource` returns (or throws). */
  readSource?: () => unknown;
}

interface Rig {
  root: string;
  app: SyntheticApp;
  gate: AccessGate;
  transport: RecordingTransport;
  data: LoadedData;
  hooks: Hooks;
  /** Every response `respond` built (only the transport ever receives one). */
  responses: unknown[];
}

async function rig(overrides: Partial<AccessGateOptions<unknown>> = {}): Promise<Rig> {
  const root = copyFixture();
  const data = await loadedData(verifiedFiles(root));
  const app = new SyntheticApp(appReducer(initialAppState, loadedAction(data)));
  const transport = createRecordingTransport();
  const hooks: Hooks = {};
  const responses: unknown[] = [];
  const gate = createAccessGate<unknown>({
    root,
    pinnedManifestSha256: MANIFEST_SHA256,
    sourceFromFiles: sourceFromVerified,
    readSource: () => (hooks.readSource ? hooks.readSource() : controlReadSourceFrom(app.state)),
    respond: (req, source) => {
      hooks.duringRespond?.(source);
      const response = readControl(req, source as ControlReadSource, ENV);
      responses.push(response);
      return response;
    },
    transport,
    undecidedEvents: "OFF",
    ...overrides,
  });
  app.listen((type) => gate.notify(type));
  return { root, app, gate, transport, data, hooks, responses };
}

async function onRig(overrides: Partial<AccessGateOptions<unknown>> = {}): Promise<Rig> {
  const r = await rig(overrides);
  expect(await r.gate.turnOn()).toEqual({ access: "ON" });
  return r;
}

/** A refusal is exactly `{ status, code }`: no response, no message, no path. */
function expectRefused(result: StageResult, code: string): void {
  expect(result).toEqual({ status: "REFUSED", code });
  expect(Object.keys(result).sort()).toEqual(["code", "status"]);
  expect(REFUSAL_CODES).toContain(code);
}

function verifiedTicket(r: Rig): ReturnType<AccessGate["receive"]> {
  const ticket = r.gate.receive(SNAPSHOT_REQUEST);
  expect(ticket.verify()).toEqual({ status: "VERIFIED" });
  return ticket;
}

/** A `readSource` that raises one event during its first read, then reads the live state. */
function raiseOnce(r: Rig, raise: (r: Rig) => void): () => unknown {
  let raised = false;
  return () => {
    if (!raised) {
      raised = true;
      raise(r);
    }
    return controlReadSourceFrom(r.app.state);
  };
}

/** OFF events raised from inside a read of the live source (RF-F01-GATE-IR01-01 / -02). */
const OFF_DURING_READ: [string, (r: Rig) => void][] = [
  ["a notified settings.write", (r) => r.gate.notify("settings.write")],
  ["a dispatched hubCommitted with unchanged data", (r) => r.app.dispatch({ type: "hubCommitted", snapshot: r.data })],
];

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function isDeepFrozen(value: unknown): boolean {
  if (value === null || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

describe("initial state", () => {
  it("starts OFF: nothing is built and nothing is sent", async () => {
    const r = await rig();
    expect(r.gate.status()).toEqual({ access: "OFF", epoch: 0, reason: "INITIAL" });
    expect(r.gate.binding()).toBeNull();
    for (const operation of OPERATION_NAMES) expectRefused(r.gate.handle(request(operation)), "ACCESS_OFF");
    const ticket = r.gate.receive(SNAPSHOT_REQUEST);
    expect(ticket.state()).toBe("REFUSED");
    expectRefused(ticket.verify(), "ACCESS_OFF");
    expectRefused(ticket.send(), "ACCESS_OFF");
    expect(r.responses).toEqual([]);
    expect(r.transport.calls()).toBe(0);
  });
});

describe("T0: turning access ON", () => {
  it("binds the manifest ID, the source digest and a new epoch after verifying against the pinned manifest", async () => {
    const r = await rig();
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
    const binding = r.gate.binding();
    expect(binding).toEqual({
      manifestId: MANIFEST_SHA256,
      sourceDigest: sourceDigest(controlReadSourceFrom(r.app.state)),
      epoch: 1,
    });
    expect(Object.isFrozen(binding)).toBe(true);
    expect(r.gate.status()).toEqual({ access: "ON", epoch: 1, reason: null });
    expect(r.transport.calls()).toBe(0);
  });

  it("stays OFF when the manifest is not byte-identical to the pinned one", async () => {
    const bytes = readFileSync(MANIFEST_PATH);
    const r = await rig({ readManifestBytes: () => Buffer.concat([bytes, Buffer.from("\n")]) });
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "MANIFEST_NOT_PINNED" });
    expect(r.gate.binding()).toBeNull();
  });

  it("stays OFF when the manifest was rebuilt from changed data", async () => {
    const files = fixtureFiles();
    const settings = `${JSON.stringify({ schemaVersion: 1, locale: "en" }, null, 2)}\n`;
    files.set("settings.json", settings);
    const rebuilt = manifestText(files);
    const r = await rig({ readManifestBytes: () => Buffer.from(rebuilt, "utf8") });
    writeFileSync(at(r.root, "settings.json"), settings);
    // The rebuilt manifest does describe the changed folder; only the pin refuses it.
    expect(verifyDataRoot(r.root, JSON.parse(rebuilt)).ok).toBe(true);
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "MANIFEST_NOT_PINNED" });
  });

  it.each([
    ["a backup file", (root: string) => writeFileSync(at(root, "projects.json.bak"), "{}")],
    ["a changed settings.json", (root: string) => rewrite(root, "settings.json", (text) => text.replace('"ja"', '"en"'))],
    ["a missing result file", (root: string) => unlinkSync(at(root, `${REVIEW_DIR}/result-r1.md`))],
  ])("stays OFF when the folder fails verification: %s", async (_, change) => {
    const r = await rig();
    change(r.root);
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "VERIFICATION_FAILED" });
    expect(r.gate.status().access).toBe("OFF");
  });

  it("stays OFF when the live source is not the one the verified bytes produce", async () => {
    const r = await rig();
    r.app.replace(appReducer(r.app.state, { type: "hubCommitted", snapshot: changedData(r.data) }));
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "SOURCE_NOT_VERIFIED" });
  });

  it("is cancelled by an event that arrives while it runs", async () => {
    const hold = deferred();
    const r = await rig({
      sourceFromFiles: async (files) => {
        await hold.promise;
        return sourceFromVerified(files);
      },
    });
    let reads = 0;
    r.hooks.readSource = () => {
      reads += 1;
      return controlReadSourceFrom(r.app.state);
    };
    const pending = r.gate.turnOn();
    r.app.dispatch({ type: "hubCommitted", snapshot: r.data });
    hold.resolve();
    expect(await pending).toEqual({ access: "OFF", code: "CHANGED_DURING_CHECK" });
    expect(r.gate.binding()).toBeNull();
    // Stopped before the live source was read.
    expect(reads).toBe(0);
  });

  it.each(OFF_DURING_READ)("stays OFF when an OFF event arrives while T0 reads the live source: %s", async (_, raise) => {
    const r = await rig();
    r.hooks.readSource = raiseOnce(r, raise);
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "CHANGED_DURING_CHECK" });
    expect(r.gate.status().access).toBe("OFF");
    expect(r.gate.binding()).toBeNull();
    for (const operation of OPERATION_NAMES) expectRefused(r.gate.handle(request(operation)), "ACCESS_OFF");
    expect(r.responses).toEqual([]);
    expect(r.transport.calls()).toBe(0);
  });

  it.each<[string, Partial<AccessGateOptions<unknown>>]>([
    ["reading the manifest", { readManifestBytes: () => { throw new Error("synthetic"); } }],
    ["deriving the source", { sourceFromFiles: () => { throw new Error("synthetic"); } }],
  ])("stays OFF when a check throws: %s", async (_, overrides) => {
    const r = await rig(overrides);
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "CHECK_FAILED" });
  });

  it("stays OFF when reading the live source throws", async () => {
    const r = await rig();
    r.hooks.readSource = () => {
      throw new Error("synthetic");
    };
    expect(await r.gate.turnOn()).toEqual({ access: "OFF", code: "CHECK_FAILED" });
  });
});

describe("T0 → T1 → T2", () => {
  it("sends only after all three, once per request, exactly the expected responses", async () => {
    const r = await onRig();
    for (const operation of OPERATION_NAMES) expect(r.gate.handle(request(operation))).toEqual({ status: "SENT" });
    expect(r.transport.calls()).toBe(OPERATION_NAMES.length);
    expect(r.transport.payloads().map((payload) => JSON.parse(payload))).toEqual(OPERATION_NAMES.map(expected));
    expect(r.gate.status().access).toBe("ON");
  });

  it("runs the stages in order only, and sends a ticket at most once", async () => {
    const r = await onRig();
    const early = r.gate.receive(SNAPSHOT_REQUEST);
    expectRefused(early.send(), "OUT_OF_ORDER");
    expectRefused(early.verify(), "OUT_OF_ORDER");
    const twice = verifiedTicket(r);
    expectRefused(twice.verify(), "OUT_OF_ORDER");
    expectRefused(twice.send(), "OUT_OF_ORDER");
    const once = verifiedTicket(r);
    expect(once.send()).toEqual({ status: "SENT" });
    expectRefused(once.send(), "OUT_OF_ORDER");
    expect(once.state()).toBe("SENT");
    expect(r.transport.calls()).toBe(1);
  });

  it("builds the response from a frozen copy of what T1 digested, not from the live objects", async () => {
    const r = await onRig();
    const passed: unknown[] = [];
    r.hooks.duringRespond = (source) => passed.push(source);
    expect(r.gate.handle(SNAPSHOT_REQUEST)).toEqual({ status: "SENT" });
    const [copy] = passed as ControlReadSource[];
    expect(copy.projects).not.toBe(r.app.state.projects);
    expect(copy.reviews).not.toBe(r.app.state.reviews);
    expect(isDeepFrozen(copy)).toBe(true);
    expect(Object.isFrozen(r.app.state.projects)).toBe(false);
    expect(sourceDigest(copy)).toBe(r.gate.binding()?.sourceDigest);
  });

  it.each<[string, (r: Rig) => void]>([
    ["a replaced state", (r) => r.app.replace(appReducer(r.app.state, { type: "hubCommitted", snapshot: changedData(r.data) }))],
    ["live objects changed in place", (r) => Object.assign(r.app.state.projects[0], { repositoryUrl: OTHER_REPOSITORY })],
  ])("keeps a change made while T1 builds the response out of it (%s), and T2 refuses the send", async (_, change) => {
    const r = await onRig();
    r.hooks.duringRespond = () => change(r);
    const ticket = r.gate.receive(SNAPSHOT_REQUEST);
    expect(ticket.verify()).toEqual({ status: "VERIFIED" });
    expect(r.responses).toEqual([expected("get_control_snapshot")]);
    expectRefused(ticket.send(), "SOURCE_CHANGED");
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "SOURCE_CHANGED" });
    expect(r.transport.calls()).toBe(0);
  });
});

describe("§6.5: access turns OFF on a change, and requests in flight are refused", () => {
  const OFF_ACTIONS: [string, (data: LoadedData) => AppAction][] = [
    ["loaded", (data) => loadedAction(data)],
    ["hubCommitted", (data) => ({ type: "hubCommitted", snapshot: data })],
    ["gitObserved", gitObservedAction],
    ["fatal", () => ({ type: "fatal", message: "synthetic" })],
  ];
  const NOTIFIED_EVENTS = [
    "settings.write",
    "storage.write",
    "storage.appendLine",
    "storage.quarantine",
    "storage.restoreBackup",
    "verification.failed",
  ];

  it("exercises every OFF event", () => {
    expect([...OFF_ACTIONS.map(([type]) => type), ...NOTIFIED_EVENTS].sort()).toEqual([...OFF_EVENTS].sort());
  });

  it.each(OFF_ACTIONS)("a dispatched %s action (simulated; even with unchanged data)", async (_, action) => {
    const r = await onRig();
    const received = r.gate.receive(SNAPSHOT_REQUEST);
    const verified = verifiedTicket(r);
    r.app.dispatch(action(r.data));
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "EVENT" });
    expectRefused(received.verify(), "ACCESS_OFF");
    expectRefused(verified.send(), "ACCESS_OFF");
    expectRefused(r.gate.handle(SNAPSHOT_REQUEST), "ACCESS_OFF");
    expect(r.transport.calls()).toBe(0);
  });

  it.each(NOTIFIED_EVENTS)("a %s notification (simulated; no file is touched)", async (event) => {
    const r = await onRig();
    const received = r.gate.receive(SNAPSHOT_REQUEST);
    const verified = verifiedTicket(r);
    r.gate.notify(event);
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "EVENT" });
    expectRefused(received.verify(), "ACCESS_OFF");
    expectRefused(verified.send(), "ACCESS_OFF");
    expect(r.transport.calls()).toBe(0);
  });

  it("the Human turning access OFF", async () => {
    const r = await onRig();
    const verified = verifiedTicket(r);
    r.gate.turnOff();
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "HUMAN_OFF" });
    expectRefused(verified.send(), "ACCESS_OFF");
    expect(r.transport.calls()).toBe(0);
  });

  it("an unknown event", async () => {
    const r = await onRig();
    r.gate.notify("somethingNew");
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "UNKNOWN_EVENT" });
  });

  const DISK_CHANGES: [string, (root: string) => void][] = [
    ["settings.json: language changed", (root) => rewrite(root, "settings.json", (text) => text.replace('"ja"', '"en"'))],
    [
      "settings.json: Codex path added",
      (root) => rewrite(root, "settings.json", (text) => text.replace('"locale"', '"codexExecutablePath": "X:\\\\SENTINEL_CODEX\\\\codex.exe",\n  "locale"')),
    ],
    ["events.jsonl: a line appended", (root) => appendFileSync(at(root, `${REVIEW_DIR}/events.jsonl`), "{}\n")],
    ["result-r1.md removed", (root) => unlinkSync(at(root, `${REVIEW_DIR}/result-r1.md`))],
    ["a backup file added", (root) => writeFileSync(at(root, "projects.json.bak"), "{}")],
    ["a temp file added", (root) => writeFileSync(at(root, "projects.json.tmp-1-1"), "{}")],
    ["a set-aside file added", (root) => writeFileSync(at(root, `${REVIEW_DIR}/session.json.corrupt-1`), "{}")],
  ];

  it.each(DISK_CHANGES)("a real file change with no event is caught at the next T1 only: %s", async (_, change) => {
    const r = await onRig();
    change(r.root);
    // Nothing watches the folder: access is still ON until a request is verified.
    expect(r.gate.status().access).toBe("ON");
    expectRefused(r.gate.handle(SNAPSHOT_REQUEST), "VERIFICATION_FAILED");
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "VERIFICATION_FAILED" });
    expect(r.responses).toEqual([]);
    expect(r.transport.calls()).toBe(0);
  });

  const SOURCE_CHANGES: [string, (state: AppState, data: LoadedData) => AppState][] = [
    ["gitObservations", (state, data) => appReducer(state, gitObservedAction(data))],
    ["phase", (state) => ({ ...state, phase: "loading" })],
    ["projects", (state, data) => appReducer(state, { type: "hubCommitted", snapshot: changedData(data) })],
    ["projectsHealth", (state) => ({ ...state, projectsHealth: { status: "missing" } })],
    ["reviews", (state) => ({ ...state, reviews: state.reviews.map((review) => ({ ...review, health: { status: "missing" } })) })],
  ];

  it("covers each of the five source keys", () => {
    expect(SOURCE_CHANGES.map(([key]) => key)).toEqual([...SOURCE_KEYS]);
  });

  it.each(SOURCE_CHANGES)("a change to %s with no event is caught at T1", async (_, change) => {
    const r = await onRig();
    r.app.replace(change(r.app.state, r.data));
    expectRefused(r.gate.handle(SNAPSHOT_REQUEST), "SOURCE_CHANGED");
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "SOURCE_CHANGED" });
    expect(r.responses).toEqual([]);
    expect(r.transport.calls()).toBe(0);
  });

  it("a manifest that no longer matches the binding is caught at T1", async () => {
    const bytes = readFileSync(MANIFEST_PATH);
    let current = bytes;
    const r = await onRig({ readManifestBytes: () => current });
    current = Buffer.concat([bytes, Buffer.from("\n")]);
    expectRefused(r.gate.handle(SNAPSHOT_REQUEST), "MANIFEST_CHANGED");
    expect(r.gate.status().access).toBe("OFF");
  });

  it.each(OFF_DURING_READ)("an OFF event raised while T1 reads the live source refuses before a response is built: %s", async (_, raise) => {
    const r = await onRig();
    r.hooks.readSource = raiseOnce(r, raise);
    const ticket = r.gate.receive(SNAPSHOT_REQUEST);
    expectRefused(ticket.verify(), "CHANGED_DURING_CHECK");
    expect(ticket.state()).toBe("REFUSED");
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "EVENT" });
    expect(r.responses).toEqual([]);
    expect(r.transport.calls()).toBe(0);
  });

  it("an event raised while T1 runs refuses that request", async () => {
    const r = await onRig();
    r.hooks.duringRespond = () => r.app.dispatch({ type: "hubCommitted", snapshot: r.data });
    const ticket = r.gate.receive(SNAPSHOT_REQUEST);
    expectRefused(ticket.verify(), "CHANGED_DURING_CHECK");
    expectRefused(ticket.send(), "CHANGED_DURING_CHECK");
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "EVENT" });
    expect(r.transport.calls()).toBe(0);
  });
});

describe("§6.6: a change between T1 and T2", () => {
  it("a replaced state with no event is caught at T2", async () => {
    const r = await onRig();
    const ticket = verifiedTicket(r);
    r.app.replace(appReducer(r.app.state, { type: "hubCommitted", snapshot: changedData(r.data) }));
    expectRefused(ticket.send(), "SOURCE_CHANGED");
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "SOURCE_CHANGED" });
    expect(r.transport.calls()).toBe(0);
  });

  it("an in-place change to the live objects is caught at T2", async () => {
    const r = await onRig();
    const ticket = verifiedTicket(r);
    Object.assign(r.app.state.projects[0], { repositoryUrl: OTHER_REPOSITORY });
    expectRefused(ticket.send(), "SOURCE_CHANGED");
    expect(r.transport.calls()).toBe(0);
  });

  it("a dispatched event is caught at T2", async () => {
    const r = await onRig();
    const ticket = verifiedTicket(r);
    r.app.dispatch({ type: "hubCommitted", snapshot: r.data });
    expectRefused(ticket.send(), "ACCESS_OFF");
    expect(r.transport.calls()).toBe(0);
  });

  it.each(OFF_DURING_READ)("an OFF event raised while T2 reads the live source refuses without throwing: %s", async (_, raise) => {
    const r = await onRig();
    const ticket = verifiedTicket(r);
    r.hooks.readSource = raiseOnce(r, raise);
    const send = (): StageResult => ticket.send();
    expect(send).not.toThrow();
    expect(ticket.state()).toBe("REFUSED");
    expectRefused(ticket.send(), "CHANGED_DURING_CHECK");
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "EVENT" });
    expect(r.transport.calls()).toBe(0);
    // The payload was dropped: the ticket stays refused after access is ON again.
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
    expectRefused(ticket.send(), "CHANGED_DURING_CHECK");
    expect(r.transport.calls()).toBe(0);
  });

  it("a check that throws at T2 refuses the send and turns access OFF", async () => {
    const r = await onRig();
    const ticket = verifiedTicket(r);
    r.hooks.readSource = () => {
      throw new Error("synthetic");
    };
    expectRefused(ticket.send(), "CHECK_FAILED");
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "CHECK_FAILED" });
    expect(r.transport.calls()).toBe(0);
  });

  it("a real file change between T1 and T2 is not seen at T2 (residual window); the next T1 refuses", async () => {
    const r = await onRig();
    const ticket = verifiedTicket(r);
    rewrite(r.root, "settings.json", (text) => text.replace('"ja"', '"en"'));
    // T2 checks access, epoch and source digest only. The payload is the one built at T1.
    expect(ticket.send()).toEqual({ status: "SENT" });
    expect(JSON.parse(r.transport.payloads()[0])).toEqual(expected("get_control_snapshot"));
    expectRefused(r.gate.handle(SNAPSHOT_REQUEST), "VERIFICATION_FAILED");
    expect(r.transport.calls()).toBe(1);
  });
});

describe("epochs", () => {
  it("after OFF, re-verification and ON, requests from the old epoch stay refused", async () => {
    const r = await onRig();
    const before = r.gate.binding();
    const received = r.gate.receive(SNAPSHOT_REQUEST);
    const verified = verifiedTicket(r);
    r.app.dispatch({ type: "hubCommitted", snapshot: r.data });
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
    expect(r.gate.binding()?.sourceDigest).toBe(before?.sourceDigest);
    expect(r.gate.binding()?.epoch).toBeGreaterThan(before?.epoch ?? Infinity);
    expectRefused(received.verify(), "EPOCH_MISMATCH");
    expectRefused(verified.send(), "EPOCH_MISMATCH");
    // An out-of-date ticket says nothing about the current data, so access stays ON.
    expect(r.gate.status().access).toBe("ON");
    expect(r.gate.handle(SNAPSHOT_REQUEST)).toEqual({ status: "SENT" });
    expect(r.transport.calls()).toBe(1);
  });

  it("turning access ON again while ON starts a new epoch", async () => {
    const r = await onRig();
    const verified = verifiedTicket(r);
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
    expectRefused(verified.send(), "EPOCH_MISMATCH");
    expect(r.transport.calls()).toBe(0);
  });

  it("restoring the state does not revive an old request", async () => {
    const r = await onRig();
    const before = r.gate.binding();
    const first = verifiedTicket(r);
    const second = verifiedTicket(r);
    r.app.dispatch({ type: "hubCommitted", snapshot: changedData(r.data) });
    r.app.dispatch({ type: "hubCommitted", snapshot: r.data });
    expect(sourceDigest(controlReadSourceFrom(r.app.state))).toBe(before?.sourceDigest);
    expect(r.gate.status().access).toBe("OFF");
    expectRefused(first.send(), "ACCESS_OFF");
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
    expectRefused(second.send(), "EPOCH_MISMATCH");
    expect(r.transport.calls()).toBe(0);
  });

  it("restoring the files does not revive an old request", async () => {
    const r = await onRig();
    const file = at(r.root, "settings.json");
    const original = readFileSync(file);
    const verified = verifiedTicket(r);
    const received = r.gate.receive(SNAPSHOT_REQUEST);
    writeFileSync(file, original.toString("utf8").replace('"ja"', '"en"'));
    expectRefused(r.gate.handle(SNAPSHOT_REQUEST), "VERIFICATION_FAILED");
    writeFileSync(file, original);
    expect(r.gate.status().access).toBe("OFF");
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
    expectRefused(verified.send(), "EPOCH_MISMATCH");
    expectRefused(received.verify(), "EPOCH_MISMATCH");
    expect(r.transport.calls()).toBe(0);
  });

  it("never turns itself back ON", async () => {
    const r = await onRig({ undecidedEvents: "KEEP" });
    r.app.dispatch({ type: "hubCommitted", snapshot: changedData(r.data) });
    r.app.dispatch({ type: "hubCommitted", snapshot: r.data });
    for (const event of UNDECIDED_EVENTS) r.gate.notify(event);
    r.app.dispatch({ type: "selectReview", reviewId: FIXTURE.reviewId });
    for (let i = 0; i < 3; i += 1) expectRefused(r.gate.handle(SNAPSHOT_REQUEST), "ACCESS_OFF");
    expect(r.gate.status().access).toBe("OFF");
    expect(r.gate.binding()).toBeNull();
    expect(await r.gate.turnOn()).toEqual({ access: "ON" });
    expect(r.gate.handle(SNAPSHOT_REQUEST)).toEqual({ status: "SENT" });
  });

  it("has no timer or clock that could act on its own", () => {
    const text = readFileSync(HARNESS_PATH, "utf8");
    expect(text).not.toMatch(/\b(setTimeout|setInterval|setImmediate|queueMicrotask|nextTick|Date\.now|new Date|performance)\b/);
  });
});

describe("undecided events (§6.5 open question: selection, filter, toasts, ...)", () => {
  it("has no default: the caller must choose OFF or KEEP", () => {
    const options = {
      root: DATA_ROOT,
      pinnedManifestSha256: MANIFEST_SHA256,
      sourceFromFiles: () => null,
      readSource: () => null,
      respond: () => null,
      transport: createRecordingTransport(),
    };
    expect(() => createAccessGate({ ...options, undecidedEvents: undefined as unknown as "OFF" })).toThrow(TypeError);
    expect(() => createAccessGate({ ...options, undecidedEvents: "OFF" })).not.toThrow();
  });

  it("classifies every application action and storage command, and nothing else", () => {
    // Typed records: adding an action or a storage method to the product fails the typecheck here.
    const actions: Record<AppAction["type"], true> = {
      loaded: true,
      fatal: true,
      selectReview: true,
      hubCommitted: true,
      artifactsLoaded: true,
      gitObserved: true,
      ideSessionsRefreshing: true,
      ideSessionsLoaded: true,
      ideSessionsFailed: true,
      filterChanged: true,
      dismissNotice: true,
      toast: true,
      dismissToast: true,
    };
    const storage: Record<keyof StorageBackend, true> = {
      info: true,
      read: true,
      write: true,
      appendLine: true,
      listReviews: true,
      quarantine: true,
      restoreBackup: true,
      assertUnchanged: true,
    };
    const known = [...Object.keys(actions), ...Object.keys(storage).map((name) => `storage.${name}`), "settings.write", "verification.failed"];
    expect([...OFF_EVENTS, ...UNDECIDED_EVENTS].sort()).toEqual(known.sort());
    expect(OFF_EVENTS.filter((event) => UNDECIDED_EVENTS.includes(event))).toEqual([]);
  });

  it.each(UNDECIDED_EVENTS)("with OFF, %s turns access OFF", async (event) => {
    const r = await onRig({ undecidedEvents: "OFF" });
    const verified = verifiedTicket(r);
    r.gate.notify(event);
    expect(r.gate.status()).toMatchObject({ access: "OFF", reason: "UNDECIDED_EVENT" });
    expectRefused(verified.send(), "ACCESS_OFF");
    expect(r.transport.calls()).toBe(0);
  });

  it.each(UNDECIDED_EVENTS)("with KEEP, %s leaves access ON", async (event) => {
    const r = await onRig({ undecidedEvents: "KEEP" });
    const verified = verifiedTicket(r);
    r.gate.notify(event);
    expect(r.gate.status().access).toBe("ON");
    expect(verified.send()).toEqual({ status: "SENT" });
  });

  it("UI-only dispatches leave the five source keys unchanged", async () => {
    const r = await onRig({ undecidedEvents: "KEEP" });
    const before = sourceDigest(controlReadSourceFrom(r.app.state));
    r.app.dispatch({ type: "selectReview", reviewId: FIXTURE.reviewId });
    r.app.dispatch({ type: "filterChanged", filter: { text: "alpha" } });
    r.app.dispatch({ type: "toast", kind: "info", message: "synthetic" });
    expect(sourceDigest(controlReadSourceFrom(r.app.state))).toBe(before);
    expect(r.gate.handle(SNAPSHOT_REQUEST)).toEqual({ status: "SENT" });
  });

  it("with KEEP, a source change that comes with an undecided event is still caught by the digest", async () => {
    const r = await onRig({ undecidedEvents: "KEEP" });
    r.app.replace(appReducer(r.app.state, { type: "hubCommitted", snapshot: changedData(r.data) }));
    r.gate.notify("selectReview");
    expect(r.gate.status().access).toBe("ON");
    expectRefused(r.gate.handle(SNAPSHOT_REQUEST), "SOURCE_CHANGED");
    expect(r.transport.calls()).toBe(0);
  });
});

describe("source digest", () => {
  const source = async (): Promise<ControlReadSource> => sourceFromVerified(verifiedFiles(copyFixture()));

  it("covers exactly the five keys, in any key order", async () => {
    const base = await source();
    const reordered = Object.fromEntries(Object.entries(base).reverse());
    expect(sourceDigest(reordered)).toBe(sourceDigest(base));
    expect(sourceDigest({ ...base, gitObservations: { [FIXTURE.projectId]: undefined } })).toBe(sourceDigest(base));
    expect(sourceDigest({ ...base, phase: "fatal" })).not.toBe(sourceDigest(base));
  });

  it.each<[string, (base: ControlReadSource) => unknown]>([
    ["an extra key", (base) => ({ ...base, selectedReviewId: null })],
    ["a missing key", (base) => {
      const rest: Record<string, unknown> = { ...base };
      delete rest.gitObservations;
      return rest;
    }],
    ["an undefined key", (base) => ({ ...base, reviews: undefined })],
    ["a class instance", (base) => ({ ...base, phase: new Map() })],
    ["a non-finite number", (base) => ({ ...base, phase: Number.NaN })],
    ["a bigint", (base) => ({ ...base, phase: 1n })],
    ["a function", (base) => ({ ...base, phase: () => "ready" })],
    ["undefined in an array", (base) => ({ ...base, projects: [undefined] })],
    ["a hole in an array", (base) => ({ ...base, projects: [, ...base.projects] })],
    ["a cycle", (base) => {
      const cyclic: Record<string, unknown> = {};
      cyclic.self = cyclic;
      return { ...base, gitObservations: cyclic };
    }],
  ])("rejects %s, and the gate turns OFF on it", async (_, shape) => {
    const base = await source();
    expect(() => snapshotSource(shape(base))).toThrow();
    const r = await onRig();
    r.hooks.readSource = () => shape(base);
    expectRefused(r.gate.handle(SNAPSHOT_REQUEST), "CHECK_FAILED");
    expect(r.gate.status().access).toBe("OFF");
  });
});

describe("disclosure", () => {
  it("sends only Control Read output: no sentinel, secret, absolute path, file name or binding value", async () => {
    const r = await onRig();
    const requests: unknown[] = [
      ...OPERATION_NAMES.map(request),
      { contract: CONTROL_READ_CONTRACT, version: 1, operation: "get_project_state", project_id: "not-a-project" },
      { contract: CONTROL_READ_CONTRACT, version: 1, operation: "get_run_state", run_id: "run-1" },
      { contract: CONTROL_READ_CONTRACT, version: 2, operation: "get_control_snapshot" },
      "not an object",
    ];
    for (const req of requests) expect(r.gate.handle(req)).toEqual({ status: "SENT" });
    const binding = r.gate.binding();
    const internal = [binding?.manifestId ?? "", binding?.sourceDigest ?? "", r.root.toLowerCase().replaceAll("\\", "\\\\")];
    expect(r.transport.payloads()).toHaveLength(requests.length);
    for (const text of r.transport.payloads()) {
      for (const value of Object.values(SENTINELS)) expect(text, value).not.toContain(value);
      expect(text).not.toMatch(/SENTINEL_|[A-Za-z]:[\\/]|\\\\|chatgpt|\.jsonl?"|\.md"|\.lock|settings|locale|codex|data-root|memory:/i);
      expect(text.toLowerCase()).not.toContain(os.tmpdir().toLowerCase().replaceAll("\\", "\\\\"));
      for (const value of internal) expect(text.toLowerCase()).not.toContain(value);
      expect(text).not.toMatch(/gh[pousr]_[A-Za-z0-9]{20,}|\bsk-(ant-)?[A-Za-z0-9_-]{20,}|\bAKIA[0-9A-Z]{16}\b/);
    }
  });

  it("refusals and status carry fixed codes only", async () => {
    const r = await onRig();
    const ticket = verifiedTicket(r);
    expect(Object.keys(ticket).sort()).toEqual(["send", "state", "verify"]);
    r.gate.turnOff();
    const refused = ticket.send();
    expectRefused(refused, "ACCESS_OFF");
    expect(JSON.stringify([refused, r.gate.status()])).toBe(
      JSON.stringify([{ status: "REFUSED", code: "ACCESS_OFF" }, { access: "OFF", epoch: 2, reason: "HUMAN_OFF" }]),
    );
    expect(r.responses).toHaveLength(1);
    expect(r.transport.calls()).toBe(0);
  });
});
