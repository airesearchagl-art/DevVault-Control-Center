import type { AccessGate } from "../../scripts/lib/f01-access-gate-harness.mjs";
import { LIMITS, evaluateEntries, parseManifest, type ListedEntry, type VerifyResult } from "../../scripts/lib/f01-synthetic-fixture.mjs";
import { appReducer, type AppAction, type AppState } from "../app/appState";
import { ReviewHub, type ReviewHubOptions } from "../services/reviewHub";
import { createLocaleStore, loadSettings, type LocaleStore } from "../services/settings";
import type { StorageBackend, StorageInfo, StorageTarget, WritePrecondition } from "../services/storage";
import { MemoryStorage } from "./memoryStorage";

/**
 * Test-only wiring between DVCC's real services and the F01 access gate
 * (DVCC-F01-SERVICE-INTEGRATION-01, docs/f01-synthetic-data-boundary.md §6.8).
 *
 * A candidate for how the product could connect the gate, used only against an in-memory store
 * seeded with the synthetic fixture. Nothing in the product imports this file, and nothing here
 * calls Tauri, the network or another process. It does not implement or reproduce
 * `DataRoot::exclusive`: the pending-write count lives in the gate, in this process only.
 */

const WRITE_EVENTS: Readonly<Record<string, string>> = {
  write: "storage.write",
  appendLine: "storage.appendLine",
  quarantine: "storage.quarantine",
  restoreBackup: "storage.restoreBackup",
};
const READ_OPERATIONS: ReadonlySet<string> = new Set(["info", "read", "listReviews", "assertUnchanged"]);

const isSettingsTarget = (value: unknown): boolean =>
  typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "settings";

/**
 * How a storage operation is reported to the gate. Reads are undecided events (§6.5). Everything
 * else is a write, including an operation this table does not know: fail closed.
 */
export function storageEventOf(operation: string, args: readonly unknown[]): { kind: "read" | "write"; event: string } {
  if (READ_OPERATIONS.has(operation)) return { kind: "read", event: `storage.${operation}` };
  if (operation === "write" && isSettingsTarget(args[0])) return { kind: "write", event: "settings.write" };
  return { kind: "write", event: WRITE_EVENTS[operation] ?? `storage.${operation}` };
}

/**
 * Reports every operation on `inner` to the gate. A write turns access OFF as it starts, before
 * `inner` is called, and its token ends when the operation settles: resolved, rejected or thrown.
 */
export function observeStorage<B extends StorageBackend>(inner: B, gate: AccessGate): B {
  return new Proxy(inner, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== "function" || typeof property !== "string" || property === "constructor") return value;
      const operation = value as (...args: unknown[]) => unknown;
      return (...args: unknown[]): unknown => {
        const { kind, event } = storageEventOf(property, args);
        if (kind === "read") {
          gate.notify(event);
          return operation.apply(target, args);
        }
        const token = gate.beginWrite(event);
        let result: unknown;
        try {
          result = operation.apply(target, args);
        } catch (error) {
          token.end();
          throw error;
        }
        return Promise.resolve(result).finally(() => token.end());
      };
    },
  });
}

export interface HeldCall {
  readonly operation: string;
  readonly path: string;
  release(): void;
}

/**
 * Lets a test hold writes in progress. While `holding` is set, every write waits in `waiting` until
 * the test releases it, in any order; reads pass straight through. No timer is involved.
 */
export class HeldStorage implements StorageBackend {
  holding = false;
  readonly waiting: HeldCall[] = [];

  constructor(private readonly inner: StorageBackend) {}

  /** Releases the held write at `index` of `waiting`. */
  release(index = 0): void {
    const [call] = this.waiting.splice(index, 1);
    if (call === undefined) throw new Error("no write is held");
    call.release();
  }

  private async held<T>(operation: string, target: StorageTarget, run: () => Promise<T>): Promise<T> {
    if (this.holding) {
      await new Promise<void>((release) => this.waiting.push({ operation, path: MemoryStorage.pathOf(target), release }));
    }
    return run();
  }

  info(): Promise<StorageInfo> {
    return this.inner.info();
  }
  read(target: StorageTarget, options?: { backup?: boolean }): Promise<string | null> {
    return this.inner.read(target, options);
  }
  listReviews(): Promise<string[]> {
    return this.inner.listReviews();
  }
  write(target: StorageTarget, content: string, precondition?: WritePrecondition): Promise<void> {
    return this.held("write", target, () => this.inner.write(target, content, precondition));
  }
  appendLine(target: StorageTarget, line: string): Promise<void> {
    return this.held("appendLine", target, () => this.inner.appendLine(target, line));
  }
  quarantine(target: StorageTarget, options?: { backup?: boolean }): Promise<string> {
    return this.held("quarantine", target, () => this.inner.quarantine(target, options));
  }
  restoreBackup(target: StorageTarget): Promise<void> {
    return this.held("restoreBackup", target, () => this.inner.restoreBackup(target));
  }
}

/**
 * Verifies an in-memory store against a manifest with the reference verifier's own decision function
 * (`evaluateEntries`): the same file set, sizes, SHA-256 values and transient-name rules as on disk.
 * It reads `memory.files` directly, so verifying never reaches the observed backend. There are no
 * links, handles or reparse points in memory, so V-F01-09 to V-F01-11 do not apply here.
 */
export function verifyMemoryStorage(memory: MemoryStorage, manifestValue: unknown): VerifyResult {
  const manifest = parseManifest(manifestValue);
  if (manifest === null) return { ok: false, findings: [{ code: "MANIFEST_INVALID", path: null }], files: null };
  const entries = new Map<string, ListedEntry>();
  for (const [rel, text] of memory.files) {
    const parts = rel.split("/");
    for (let i = 1; i < parts.length; i += 1) {
      const dir = parts.slice(0, i).join("/");
      if (!entries.has(dir)) entries.set(dir, { path: dir, kind: "dir", size: 0, redirected: false });
    }
    entries.set(rel, { path: rel, kind: "file", size: Buffer.byteLength(text, "utf8"), redirected: false });
  }
  if (entries.size > LIMITS.maxEntries) return { ok: false, findings: [{ code: "LIMIT_EXCEEDED", path: null }], files: null };
  const listed = [...entries.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return evaluateEntries(listed, manifest, (entry) => {
    const text = memory.files.get(entry.path);
    return text === undefined ? null : Buffer.from(text, "utf8");
  });
}

/** The application side (App.tsx's reducer and dispatch), with a record of what was dispatched. */
export class SyntheticApp {
  state: AppState;
  readonly dispatched: AppAction["type"][] = [];
  private readonly listeners = new Set<(type: AppAction["type"]) => void>();

  constructor(state: AppState) {
    this.state = state;
  }

  listen(listener: (type: AppAction["type"]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispatch(action: AppAction): void {
    this.state = appReducer(this.state, action);
    this.dispatched.push(action.type);
    for (const listener of this.listeners) listener(action.type);
  }
}

export interface ServiceWiring {
  /** The observed backend every service below writes through. */
  readonly backend: StorageBackend;
  readonly hub: ReviewHub;
  readonly settings: LocaleStore;
  /** App.tsx `reload`: storage info, `hub.load()`, then a `loaded` dispatch. */
  reload(): Promise<void>;
  /** App.tsx start-up: the preferences are read and adopted by the settings store. */
  loadSettings(): Promise<void>;
  /** An effect clean-up: hub commits stop reaching the app. Storage writes still reach the gate. */
  unsubscribe(): void;
  /** Tears the wiring down: nothing is delivered any more, so the gate is closed for good. */
  dispose(): void;
}

/**
 * Connects the real services to the gate, the way App.tsx connects them to the reducer:
 * - every storage operation of the hub and of the settings store goes through `observeStorage`;
 * - `hub.subscribe` feeds `hubCommitted` to the app, as in App.tsx;
 * - every app dispatch is reported to the gate by its action type.
 */
export function wireServices(inner: StorageBackend, gate: AccessGate, app: SyntheticApp, options: ReviewHubOptions = {}): ServiceWiring {
  const backend = observeStorage(inner, gate);
  const hub = new ReviewHub(backend, options);
  const stopApp = app.listen((type) => gate.notify(type));
  const stopHub = hub.subscribe((snapshot) => app.dispatch({ type: "hubCommitted", snapshot }));
  const settings = createLocaleStore(backend);
  return {
    backend,
    hub,
    settings,
    async reload() {
      const storage = await hub.info();
      const data = await hub.load();
      app.dispatch({ type: "loaded", storage, data });
    },
    async loadSettings() {
      settings.adopt(await loadSettings(backend));
    },
    unsubscribe() {
      stopHub();
    },
    dispose() {
      stopHub();
      stopApp();
      gate.close();
    },
  };
}
