import { invoke } from "@tauri-apps/api/core";

/** Mirrors `StorageTarget` in `src-tauri/src/storage.rs`. */
export type StorageTarget = { kind: "projects" } | { kind: "review"; reviewId: string; file: string };

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
  write(target: StorageTarget, content: string): Promise<void>;
  appendLine(target: StorageTarget, line: string): Promise<void>;
  listReviews(): Promise<string[]>;
  /** Renames a JSON file aside and returns the new file name. */
  quarantine(target: StorageTarget): Promise<string>;
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
  write: (target, content) => call<void>("storage_write", { target, content }),
  appendLine: (target, line) => call<void>("storage_append_line", { target, line }),
  listReviews: () => call<string[]>("storage_list_reviews"),
  quarantine: (target) => call<string>("storage_quarantine", { target }),
};

export { call as invokeCommand };
