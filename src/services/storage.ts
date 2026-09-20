import { invoke } from "@tauri-apps/api/core";

/** Mirrors `StorageTarget` in `src-tauri/src/storage.rs`. */
export type StorageTarget = { kind: "projects" } | { kind: "review"; reviewId: string; file: string };

/**
 * Optimistic-concurrency precondition for a write (mirrors `WritePrecondition` in Rust): the
 * file must be absent, or still contain exactly what this process last read / wrote.
 * A mismatch is refused with code `CONFLICT` and nothing is overwritten.
 */
export type WritePrecondition = { kind: "absent" } | { kind: "matches"; content: string };

export interface StorageInfo {
  dataDir: string;
  source: "env" | "default";
  debugBuild: boolean;
}

export class StorageError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "StorageError";
    this.code = code;
  }
}

/**
 * Storage port. The Tauri implementation delegates to Rust commands; tests use an in-memory
 * implementation with the same semantics (atomic replace, `.bak`, append-only events,
 * quarantine, corrupt-primary protection).
 */
export interface StorageBackend {
  info(): Promise<StorageInfo>;
  /** Returns `null` when the file does not exist. `backup: true` reads `<file>.bak` (JSON only). */
  read(target: StorageTarget, options?: { backup?: boolean }): Promise<string | null>;
  write(target: StorageTarget, content: string, precondition?: WritePrecondition): Promise<void>;
  appendLine(target: StorageTarget, line: string): Promise<void>;
  listReviews(): Promise<string[]>;
  /** Renames a JSON file (or its `.bak` with `backup: true`) aside and returns the new file name. */
  quarantine(target: StorageTarget, options?: { backup?: boolean }): Promise<string>;
  /** Restores a missing JSON primary from its `.bak`; the backup is kept. */
  restoreBackup(target: StorageTarget): Promise<void>;
  /**
   * Throws `CONFLICT` when `target` no longer holds the content this backend last read or wrote
   * (E-3). Optional: a backend that does not track content has nothing to compare against.
   */
  assertUnchanged?(target: StorageTarget): Promise<void>;
}

export const PROJECTS_TARGET: StorageTarget = { kind: "projects" };

export function reviewTarget(reviewId: string, file: string): StorageTarget {
  return { kind: "review", reviewId, file };
}

export const requestFileName = (round: number): string => `request-r${round}.md`;
export const resultFileName = (round: number): string => `result-r${round}.md`;

export function toStorageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  if (typeof error === "object" && error !== null) {
    const candidate = error as { code?: unknown; message?: unknown };
    if (typeof candidate.code === "string" && typeof candidate.message === "string") {
      return new StorageError(candidate.code, candidate.message);
    }
    if (typeof candidate.message === "string") return new StorageError("UNKNOWN", candidate.message);
  }
  return new StorageError("UNKNOWN", String(error));
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toStorageError(error);
  }
}

export const tauriStorage: StorageBackend = {
  info: () => call<StorageInfo>("storage_info"),
  read: (target, options) => call<string | null>("storage_read", { target, backup: options?.backup ?? false }),
  write: (target, content, precondition) => call<void>("storage_write", { target, content, precondition: precondition ?? null }),
  appendLine: (target, line) => call<void>("storage_append_line", { target, line }),
  listReviews: () => call<string[]>("storage_list_reviews"),
  quarantine: (target, options) => call<string>("storage_quarantine", { target, backup: options?.backup ?? false }),
  restoreBackup: (target) => call<void>("storage_restore_backup", { target }),
};

export { call as invokeCommand };
