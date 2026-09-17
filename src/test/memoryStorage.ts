import { StorageError, type StorageBackend, type StorageInfo, type StorageTarget } from "../services/storage";

const REVIEW_ID = /^rv-\d{8}-[a-z0-9]{6}$/;
const REVIEW_FILE = /^(session\.json|checkpoint\.md|events\.jsonl|(request|result)-r[1-9]\d{0,2}\.md)$/;

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * In-memory StorageBackend mirroring the Rust storage semantics (see `src-tauri/src/storage.rs`):
 * target validation, JSON-only content checks, corrupt-primary protection, `.bak` of the
 * previous primary, append-only `events.jsonl` with partial-line repair, and quarantine.
 */
export class MemoryStorage implements StorageBackend {
  readonly files = new Map<string, string>();
  /** Paths whose next writes fail with WRITE_FAILED. */
  readonly failingWrites = new Set<string>();
  /** Paths whose reads fail with the given error code. */
  readonly failingReads = new Map<string, string>();
  failAppends = false;
  private quarantineCounter = 0;

  static pathOf(target: StorageTarget): string {
    if (target.kind === "projects") return "projects.json";
    if (!REVIEW_ID.test(target.reviewId) || !REVIEW_FILE.test(target.file)) {
      throw new StorageError("INVALID_TARGET", `invalid target ${target.reviewId}/${target.file}`);
    }
    return `reviews/${target.reviewId}/${target.file}`;
  }

  async info(): Promise<StorageInfo> {
    return { dataDir: "memory://dvcc", source: "env", debugBuild: true };
  }

  async read(target: StorageTarget, options?: { backup?: boolean }): Promise<string | null> {
    let path = MemoryStorage.pathOf(target);
    if (options?.backup) {
      if (!path.endsWith(".json")) throw new StorageError("INVALID_TARGET", "backups exist only for JSON files");
      path = `${path}.bak`;
    }
    const failure = this.failingReads.get(path);
    if (failure) throw new StorageError(failure, `${path}: injected read failure`);
    return this.files.get(path) ?? null;
  }

  async write(target: StorageTarget, content: string): Promise<void> {
    const path = MemoryStorage.pathOf(target);
    if (path.endsWith("events.jsonl")) throw new StorageError("APPEND_ONLY", "events.jsonl can only be appended");
    if (this.failingWrites.has(path)) throw new StorageError("WRITE_FAILED", `${path}: injected write failure`);
    const json = path.endsWith(".json");
    if (json && !isJson(content)) throw new StorageError("INVALID_CONTENT", "not valid JSON");
    const existing = this.files.get(path);
    if (json && existing !== undefined) {
      if (!isJson(existing)) throw new StorageError("PRIMARY_UNREADABLE", `${path}: existing file is not valid JSON`);
      this.files.set(`${path}.bak`, existing);
    }
    if (json && existing === undefined && this.files.has(`${path}.bak`)) {
      throw new StorageError("RECOVERY_REQUIRED", `${path}: the file is missing but its backup exists`);
    }
    this.files.set(path, content);
  }

  async restoreBackup(target: StorageTarget): Promise<void> {
    const path = MemoryStorage.pathOf(target);
    if (!path.endsWith(".json")) throw new StorageError("INVALID_TARGET", "backups exist only for JSON files");
    if (this.files.has(path)) throw new StorageError("PRIMARY_EXISTS", `${path}: primary exists`);
    const backup = this.files.get(`${path}.bak`);
    if (backup === undefined) throw new StorageError("NOT_FOUND", `${path}.bak: backup does not exist`);
    if (!isJson(backup)) throw new StorageError("BACKUP_INVALID", `${path}.bak: backup is not valid JSON`);
    if (this.failingWrites.has(path)) throw new StorageError("WRITE_FAILED", `${path}: injected write failure`);
    this.files.set(path, backup);
  }

  async appendLine(target: StorageTarget, line: string): Promise<void> {
    const path = MemoryStorage.pathOf(target);
    if (!path.endsWith("events.jsonl")) throw new StorageError("NOT_APPENDABLE", "only events.jsonl accepts lines");
    if (this.failAppends) throw new StorageError("WRITE_FAILED", `${path}: injected append failure`);
    if (/[\r\n]/.test(line) || !isJson(line)) throw new StorageError("INVALID_CONTENT", "invalid event line");
    let existing = this.files.get(path) ?? "";
    if (existing !== "" && !existing.endsWith("\n")) existing += "\n";
    this.files.set(path, `${existing}${line}\n`);
  }

  async listReviews(): Promise<string[]> {
    const ids = new Set<string>();
    for (const path of this.files.keys()) {
      const match = /^reviews\/([^/]+)\//.exec(path);
      if (match && REVIEW_ID.test(match[1])) ids.add(match[1]);
    }
    return [...ids].sort();
  }

  async quarantine(target: StorageTarget, options?: { backup?: boolean }): Promise<string> {
    const primary = MemoryStorage.pathOf(target);
    if (!primary.endsWith(".json")) throw new StorageError("INVALID_TARGET", "only JSON files can be set aside");
    const path = options?.backup ? `${primary}.bak` : primary;
    const content = this.files.get(path);
    if (content === undefined) throw new StorageError("NOT_FOUND", `${path}: file does not exist`);
    this.quarantineCounter += 1;
    const aside = `${path}.corrupt-${this.quarantineCounter}`;
    this.files.set(aside, content);
    this.files.delete(path);
    return aside.split("/").pop() ?? aside;
  }
}
