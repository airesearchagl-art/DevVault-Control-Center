import type { StorageBackend, StorageInfo, StorageTarget, WritePrecondition } from "./storage";

function keyOf(target: StorageTarget): string {
  return target.kind === "projects" ? "projects.json" : `reviews/${target.reviewId}/${target.file}`;
}

/**
 * Storage decorator that remembers the last content this process read or wrote for every
 * target and turns it into a write precondition (F-3). If another process or an editor changed
 * a file after it was loaded, the next write is refused with `CONFLICT` instead of silently
 * overwriting it. Explicit preconditions passed by callers take priority.
 */
export class TrackedStorage implements StorageBackend {
  private readonly known = new Map<string, string | null>();

  constructor(private readonly inner: StorageBackend) {}

  info(): Promise<StorageInfo> {
    return this.inner.info();
  }

  async read(target: StorageTarget, options?: { backup?: boolean }): Promise<string | null> {
    const text = await this.inner.read(target, options);
    if (!options?.backup) this.known.set(keyOf(target), text);
    return text;
  }

  /** The precondition a write to `target` would use, or `undefined` when nothing is known. */
  preconditionFor(target: StorageTarget): WritePrecondition | undefined {
    const key = keyOf(target);
    if (!this.known.has(key)) return undefined;
    const content = this.known.get(key) ?? null;
    return content === null ? { kind: "absent" } : { kind: "matches", content };
  }

  async write(target: StorageTarget, content: string, precondition?: WritePrecondition): Promise<void> {
    await this.inner.write(target, content, precondition ?? this.preconditionFor(target));
    this.known.set(keyOf(target), content);
  }

  appendLine(target: StorageTarget, line: string): Promise<void> {
    return this.inner.appendLine(target, line);
  }

  listReviews(): Promise<string[]> {
    return this.inner.listReviews();
  }

  async quarantine(target: StorageTarget, options?: { backup?: boolean }): Promise<string> {
    const name = await this.inner.quarantine(target, options);
    if (!options?.backup) this.known.set(keyOf(target), null);
    return name;
  }

  async restoreBackup(target: StorageTarget): Promise<void> {
    await this.inner.restoreBackup(target);
    // Re-read so the restored content becomes the known state for later preconditions.
    await this.read(target);
  }
}
