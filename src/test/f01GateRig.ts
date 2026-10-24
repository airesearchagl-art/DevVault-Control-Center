import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "vitest";
import {
  REFUSAL_CODES,
  createAccessGate,
  createRecordingTransport,
  type AccessGate,
  type AccessGateOptions,
  type RecordingTransport,
  type StageResult,
  type Ticket,
} from "../../scripts/lib/f01-access-gate-harness.mjs";
import {
  DATA_ROOT,
  FIXTURE,
  FIXTURE_DIR,
  TEMP_COPY_PREFIX,
  readManifest,
  verifyDataRoot,
  type VerifyResult,
} from "../../scripts/lib/f01-synthetic-fixture.mjs";
import { appReducer, initialAppState, type AppState } from "../app/appState";
import { controlReadSourceFrom } from "../app/controlReadSource";
import { CONTROL_READ_CONTRACT, type ControlReadSource } from "../domain/controlRead/contract";
import { readControl } from "../domain/controlRead/readControl";
import type { ProjectFormInput } from "../domain/project";
import { loadAll } from "../services/persistence";
import { MemoryStorage } from "./memoryStorage";
import { HeldStorage, SyntheticApp, verifyMemoryStorage, wireServices, type ServiceWiring, type Tracking } from "./f01ServiceWiring";

/**
 * Shared set-up for the F01 tests that run the gate over DVCC's real services
 * (`f01ServiceIntegration.test.ts`, `f01CandidateComplete.test.ts`). Test-only; nothing in the product
 * imports it. The store is a `MemoryStorage` seeded with the committed synthetic fixture; disk is used
 * only for `dvcc-f01-*` temp copies, which `removeTemps` deletes.
 */

/** SHA-256 of fixtures/f01-synthetic/v1/manifest.json (the same pin as the other F01 tests). */
export const MANIFEST_SHA256 = "9c7696259730769f353fbd458b44cb83bf45ed4c56fa2b415c8f32e2bc43d23d";
export const NOW = "2026-10-20T02:00:00.000Z";
export const NEW_REVIEW_ID = "rv-20261020-synth2";
/** A fictional path, stored as a string only: nothing looks for it or starts it. */
export const CODEX_PATH = "X:\\SENTINEL_CODEX\\codex.exe";
export const REVIEW_DIR = `reviews/${FIXTURE.reviewId}`;
const ENV = { now: () => "2026-10-20T01:00:00.000Z", newSnapshotId: () => "snap-f0100000-0000-4000-8000-000000000001" };
const OPERATIONS = {
  get_control_snapshot: { project_id: FIXTURE.projectId },
  get_project_state: { project_id: FIXTURE.projectId },
  get_review_state: { review_session_id: FIXTURE.reviewId },
} as const;
export type Operation = keyof typeof OPERATIONS;
export const OPERATION_NAMES = Object.keys(OPERATIONS) as Operation[];

export const request = (operation: Operation): Record<string, unknown> => ({
  contract: CONTROL_READ_CONTRACT,
  version: 1,
  operation,
  ...OPERATIONS[operation],
});
export const SNAPSHOT_REQUEST = request("get_control_snapshot");
export const expected = (operation: Operation): unknown =>
  JSON.parse(readFileSync(path.join(FIXTURE_DIR, "expected", `${operation}.json`), "utf8"));

/** The committed fixture's bytes, verified against the pinned manifest (read-only). */
export const BASELINE: ReadonlyMap<string, string> = (() => {
  const result = verifyDataRoot(DATA_ROOT, readManifest());
  if (!result.ok) throw new Error("committed fixture rejected");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  return new Map([...result.files].map(([rel, bytes]) => [rel, decoder.decode(bytes)]));
})();
export const baseline = (rel: string): string => {
  const text = BASELINE.get(rel);
  if (text === undefined) throw new Error(`not in the fixture: ${rel}`);
  return text;
};

/** The app's own loading path over verified bytes: `loadAll` → `loaded` → `controlReadSourceFrom`. */
export async function sourceFromVerified(files: Map<string, Buffer>): Promise<ControlReadSource> {
  const memory = new MemoryStorage();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (const [rel, bytes] of files) memory.files.set(rel, decoder.decode(bytes));
  const data = await loadAll(memory);
  return controlReadSourceFrom(appReducer(initialAppState, { type: "loaded", storage: await memory.info(), data }));
}

/** The app's own response path, as T1 calls it. */
export const respondWith = (req: unknown, source: unknown): unknown => readControl(req, source as ControlReadSource, ENV);

const temps: string[] = [];

/** Deletes every temp copy made by `materialize` (call from `afterEach`). */
export function removeTemps(): void {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
}

/** Writes the in-memory files out to a new `dvcc-f01-*` temp folder, byte for byte. */
export function materialize(memory: { readonly files: ReadonlyMap<string, string> }): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), TEMP_COPY_PREFIX));
  temps.push(dir);
  for (const [rel, text] of memory.files) {
    const file = path.join(dir, ...rel.split("/"));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text, "utf8");
  }
  return dir;
}

export const findings = (result: VerifyResult): string[] => result.findings.map(({ code, path: rel }) => `${code} ${rel}`);
export const memoryFindings = (memory: MemoryStorage): string[] => findings(verifyMemoryStorage(memory, readManifest()));

/** Records what the wiring reports, then forwards it to the real gate. */
export function recordingGate(gate: AccessGate, log: string[]): AccessGate {
  return {
    ...gate,
    notify(event) {
      log.push(`notify ${event}`);
      gate.notify(event);
    },
    beginWrite(event) {
      log.push(`begin ${event}`);
      const token = gate.beginWrite(event);
      return {
        end() {
          log.push(`end ${event}`);
          token.end();
        },
      };
    },
    beginOperation(name) {
      log.push(`call ${name}`);
      const token = gate.beginOperation(name);
      return {
        end() {
          log.push(`settle ${name}`);
          token.end();
        },
      };
    },
  };
}

export interface Rig {
  memory: MemoryStorage;
  held: HeldStorage;
  app: SyntheticApp;
  gate: AccessGate;
  wiring: ServiceWiring;
  transport: RecordingTransport;
  /** Every response T1 built; only the transport ever receives one. */
  responses: unknown[];
  /** What the wiring reported to the gate after start-up. */
  log: string[];
}

/** `undecided` is required: each test states whether undecided events turn access OFF. */
export async function rig(
  undecided: "OFF" | "KEEP",
  overrides: Partial<AccessGateOptions<unknown>> = {},
  tracking: Tracking = "STORAGE",
): Promise<Rig> {
  const memory = new MemoryStorage();
  for (const [rel, text] of BASELINE) memory.files.set(rel, text);
  const held = new HeldStorage(memory);
  const app = new SyntheticApp(initialAppState);
  const transport = createRecordingTransport();
  const responses: unknown[] = [];
  const log: string[] = [];
  const gate = createAccessGate<unknown>({
    verifyStorage: (manifest) => verifyMemoryStorage(memory, manifest),
    pinnedManifestSha256: MANIFEST_SHA256,
    sourceFromFiles: sourceFromVerified,
    readSource: () => controlReadSourceFrom(app.state),
    respond: (req, source) => {
      const response = respondWith(req, source);
      responses.push(response);
      return response;
    },
    transport,
    undecidedEvents: undecided,
    ...overrides,
  });
  const wiring = wireServices(held, recordingGate(gate, log), app, { now: () => NOW, newReviewId: () => NEW_REVIEW_ID }, tracking);
  await wiring.reload();
  await wiring.loadSettings();
  log.length = 0;
  return { memory, held, app, gate, wiring, transport, responses, log };
}

export async function onRig(
  undecided: "OFF" | "KEEP",
  overrides: Partial<AccessGateOptions<unknown>> = {},
  tracking: Tracking = "STORAGE",
): Promise<Rig> {
  const r = await rig(undecided, overrides, tracking);
  expect(await r.gate.turnOn()).toEqual({ access: "ON" });
  return r;
}

export function projectInput(state: AppState, nextAction: string): ProjectFormInput {
  const project = state.projects[0];
  return {
    projectId: project.projectId,
    displayName: project.displayName,
    repositoryUrl: project.repositoryUrl ?? "",
    localRoot: project.localRoot ?? "",
    developmentIde: project.developmentIde ?? "",
    nextAction,
    notes: project.notes,
  };
}

export const editProject = (r: Rig) =>
  r.wiring.hub.editProject(FIXTURE.projectId, projectInput(r.app.state, "SENTINEL_PROJECT_NEXT_ACTION_EDITED"));

/** A refusal is exactly `{ status, code }`: no response, no message, no path. */
export function expectRefused(result: StageResult, code: string): void {
  expect(result).toEqual({ status: "REFUSED", code });
  expect(Object.keys(result).sort()).toEqual(["code", "status"]);
  expect(REFUSAL_CODES).toContain(code);
}

export function verifiedTicket(r: { gate: AccessGate }, operation: Operation = "get_control_snapshot"): Ticket {
  const ticket = r.gate.receive(request(operation));
  expect(ticket.verify()).toEqual({ status: "VERIFIED" });
  expect(Object.keys(ticket).sort()).toEqual(["send", "state", "verify"]);
  return ticket;
}

/** Lets pending promise callbacks run, a bounded number of turns. Not a timer. */
export async function until(condition: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 500; i += 1) {
    if (condition()) return;
    await Promise.resolve();
  }
  throw new Error(`not reached: ${what}`);
}

export async function flush(): Promise<void> {
  for (let i = 0; i < 500; i += 1) await Promise.resolve();
}

export function releasePath(r: Rig, file: string): void {
  const index = r.held.waiting.findIndex((call) => call.path === file);
  if (index < 0) throw new Error(`no held call on ${file}`);
  r.held.release(index);
}

export function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export const writesIn = (log: readonly string[]): string[] => log.filter((entry) => entry.startsWith("begin ") || entry.startsWith("end "));
