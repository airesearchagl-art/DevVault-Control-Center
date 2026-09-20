import type { StorageBackend, StorageInfo, StorageTarget, WritePrecondition } from "../services/storage";

/** Deterministic pseudo-random generator so race tests are reproducible. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Wraps a backend and delays every operation by a random 0–maxDelayMs, so operations started
 * close together finish in an unpredictable order (simulates real I/O interleaving).
 */
export class DelayedStorage implements StorageBackend {
  constructor(
    private readonly inner: StorageBackend,
    private readonly random: () => number,
    private readonly maxDelayMs = 6,
  ) {}

  private async delay<T>(operation: () => Promise<T>): Promise<T> {
    await new Promise((resolve) => setTimeout(resolve, Math.floor(this.random() * this.maxDelayMs)));
    return operation();
  }

  info(): Promise<StorageInfo> {
    return this.delay(() => this.inner.info());
  }
  read(target: StorageTarget, options?: { backup?: boolean }): Promise<string | null> {
    return this.delay(() => this.inner.read(target, options));
  }
  write(target: StorageTarget, content: string, precondition?: WritePrecondition): Promise<void> {
    return this.delay(() => this.inner.write(target, content, precondition));
  }
  appendLine(target: StorageTarget, line: string): Promise<void> {
    return this.delay(() => this.inner.appendLine(target, line));
  }
  listReviews(): Promise<string[]> {
    return this.delay(() => this.inner.listReviews());
  }
  quarantine(target: StorageTarget, options?: { backup?: boolean }): Promise<string> {
    return this.delay(() => this.inner.quarantine(target, options));
  }
  restoreBackup(target: StorageTarget): Promise<void> {
    return this.delay(() => this.inner.restoreBackup(target));
  }
}
