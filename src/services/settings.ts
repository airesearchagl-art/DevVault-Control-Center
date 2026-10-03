import { DEFAULT_LOCALE, isLocale, type Locale } from "../i18n/locale";
import { createSerialQueue } from "./serialQueue";
import {
  SETTINGS_TARGET,
  toStorageError,
  type StorageBackend,
  type StorageError,
  type WritePrecondition,
} from "./storage";

/**
 * Interface preferences (`<data root>/settings.json`).
 *
 * This file holds the chosen language and, since Phase 4b-2b, the optional Human-configured Codex
 * executable path (local-machine configuration only) — nothing else: no project or review data is
 * read or written on this path. A missing file is the normal case for a fresh install and means
 * Japanese with no executable configured; a file that cannot be read or understood also means
 * that, is reported so the Human sees it, and is left on disk exactly as it was.
 *
 * Backward compatible within `schemaVersion` 1: a locale-only file stays valid, and the path is
 * written only once one is configured, so a file without it keeps exactly its old shape.
 */

export const SETTINGS_SCHEMA_VERSION = 1;

export interface Settings {
  schemaVersion: number;
  locale: Locale;
  codexExecutablePath?: string | null;
}

/** What a valid settings file says. `codexExecutablePath: null` means not configured. */
export interface SettingsValues {
  locale: Locale;
  codexExecutablePath: string | null;
}

export type SettingsProblem = "unreadable" | "invalid";

export interface LoadedSettings {
  locale: Locale;
  /** `null` when not configured — or when the file could not be used at all. */
  codexExecutablePath: string | null;
  /** `null` when the file was absent (a fresh install) or valid. */
  problem: SettingsProblem | null;
  /** The raw text that was read, so a save can refuse to overwrite a file it did not understand. */
  raw: string | null;
}

export function parseSettings(text: string): Locale | null {
  return parseSettingsValues(text)?.locale ?? null;
}

export function parseSettingsValues(text: string): SettingsValues | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  // Only this exact version is understood. A missing, mistyped, older or newer version means the
  // remaining fields may not mean what they say here, so the file is refused rather than guessed
  // at — and, because loading never writes, it survives untouched for whichever version owns it.
  if (record.schemaVersion !== SETTINGS_SCHEMA_VERSION) return null;
  if (!isLocale(record.locale)) return null;
  // Absent or null: not configured. Any other non-string value is a file this version does not
  // understand, so the whole file is refused (and therefore never overwritten) rather than guessed.
  const path = record.codexExecutablePath;
  if (path !== undefined && path !== null && typeof path !== "string") return null;
  return { locale: record.locale, codexExecutablePath: typeof path === "string" && path !== "" ? path : null };
}

export function serializeSettings(locale: Locale, codexExecutablePath: string | null = null): string {
  const settings: Settings = { schemaVersion: SETTINGS_SCHEMA_VERSION, locale };
  if (codexExecutablePath !== null) settings.codexExecutablePath = codexExecutablePath;
  return `${JSON.stringify(settings, null, 2)}\n`;
}

export async function loadSettings(backend: StorageBackend): Promise<LoadedSettings> {
  let raw: string | null;
  try {
    raw = await backend.read(SETTINGS_TARGET);
  } catch (error) {
    // An unreadable preferences file must not stop the app or touch any other file.
    void toStorageError(error);
    return { locale: DEFAULT_LOCALE, codexExecutablePath: null, problem: "unreadable", raw: null };
  }
  if (raw === null) return { locale: DEFAULT_LOCALE, codexExecutablePath: null, problem: null, raw: null };
  const values = parseSettingsValues(raw);
  if (values === null) return { locale: DEFAULT_LOCALE, codexExecutablePath: null, problem: "invalid", raw };
  return { ...values, problem: null, raw };
}

/**
 * One queue per backend: two saves of the preference never overlap, and they land in the order the
 * Human made the choices, however fast the switching is or however slow a single write turns out
 * to be. Keyed weakly so a backend that goes away takes its queue with it.
 */
const writeQueues = new WeakMap<StorageBackend, <T>(task: () => Promise<T>) => Promise<T>>();

function writeQueueFor(backend: StorageBackend): <T>(task: () => Promise<T>) => Promise<T> {
  const existing = writeQueues.get(backend);
  if (existing) return existing;
  const queue = createSerialQueue();
  writeQueues.set(backend, queue);
  return queue;
}

/**
 * Runs one settings write in this backend's queue. Everything the write depends on — the
 * precondition, and the record of what the file now holds — is computed inside the task, so a
 * burst of choices cannot have a later write judged against what an earlier one had seen.
 */
function queued<T>(backend: StorageBackend, task: () => Promise<T>): Promise<T> {
  return writeQueueFor(backend)(task);
}

/** Writes the chosen language. Nothing else in the data folder is touched. */
export async function saveLocale(backend: StorageBackend, locale: Locale, precondition?: WritePrecondition): Promise<void> {
  await queued(backend, () => backend.write(SETTINGS_TARGET, serializeSettings(locale), precondition));
}

/** Why a choice was not stored. `blocked` means the file itself has to be dealt with first. */
export type SaveRefusal = "blocked" | "write_failed";

export interface SaveCodexPathResult {
  ok: boolean;
  /** The path that is actually stored now (`null` = not configured). */
  codexExecutablePath: string | null;
  refusal?: SaveRefusal;
  error?: StorageError;
}

export interface SaveLocaleResult {
  /** `false` when the file could not be written, so the choice is not stored. */
  ok: boolean;
  /** The language that is actually stored now; the interface must not show any other. */
  locale: Locale;
  /** `true` when a later choice arrived while this write was in flight: that one decides. */
  superseded: boolean;
  refusal?: SaveRefusal;
  error?: StorageError;
}

/**
 * Keeps the interface and the file in step.
 *
 * Two rules live here. A file this version cannot understand — a later `schemaVersion`, a broken
 * one, or one that could not be read at all — puts the preference into a read-only state: the
 * language still changes on screen, but nothing is written, so a file belonging to another version
 * of DVCC survives byte for byte, with whatever else it holds, until the Human deals with it. And
 * a write that fails reports the language that is still stored, so the interface can go back to it
 * instead of showing one that the next start-up would not restore.
 */
export interface LocaleStore {
  /** The language last written successfully (or adopted from the file at start-up). */
  readonly persisted: Locale;
  /** The Codex executable path last written successfully (or adopted); `null` = not configured. */
  readonly codexExecutablePath: string | null;
  /** `false` when the file on disk must not be replaced by this version of DVCC. */
  readonly writable: boolean;
  /** Records what was read from the file at start-up; no write happens. */
  adopt(settings: LoadedSettings): void;
  /** Writes the language; the configured Codex path is carried over unchanged. */
  save(locale: Locale): Promise<SaveLocaleResult>;
  /** Writes the Codex path (`null` clears it); the stored language is carried over unchanged. */
  saveCodexExecutablePath(path: string | null): Promise<SaveCodexPathResult>;
}

export function createLocaleStore(backend: StorageBackend, persisted: Locale = DEFAULT_LOCALE): LocaleStore {
  let stored = persisted;
  let storedCodexPath: string | null = null;
  let writable = true;
  // The exact bytes this store last saw in the file. A write replaces only those, so a file that
  // changed underneath is refused instead of overwritten.
  let expected: string | null = null;
  let sequence = 0;
  let latest = 0;

  return {
    get persisted() {
      return stored;
    },
    get codexExecutablePath() {
      return storedCodexPath;
    },
    get writable() {
      return writable;
    },
    adopt(settings: LoadedSettings) {
      stored = settings.locale;
      storedCodexPath = settings.codexExecutablePath;
      // Absent or valid: this version owns the file. Anything else: hands off.
      writable = settings.problem === null;
      expected = settings.raw;
    },
    async save(locale: Locale): Promise<SaveLocaleResult> {
      const request = ++sequence;
      latest = request;
      // Identity, not value: choosing the same language again is still a later request, so an
      // older failure can never be mistaken for the newest one.
      const superseded = () => request !== latest;

      if (!writable) return { ok: false, locale: stored, superseded: superseded(), refusal: "blocked" };

      try {
        await queued(backend, async () => {
          // Judged against what the file held when this write's turn came, not when it was asked
          // for: two choices in quick succession are still one write after another. The Codex path
          // is read at the same moment, so a path saved just before is never dropped.
          const content = serializeSettings(locale, storedCodexPath);
          const precondition: WritePrecondition = expected === null ? { kind: "absent" } : { kind: "matches", content: expected };
          await backend.write(SETTINGS_TARGET, content, precondition);
          stored = locale;
          expected = content;
        });
        return { ok: true, locale, superseded: superseded() };
      } catch (error) {
        const failure = toStorageError(error);
        // The file is no longer what this store read: another program owns it now, so this run
        // stops writing to it rather than deciding whose content wins.
        if (failure.code === "CONFLICT") writable = false;
        return {
          ok: false,
          locale: stored,
          superseded: superseded(),
          refusal: failure.code === "CONFLICT" ? "blocked" : "write_failed",
          error: failure,
        };
      }
    },
    async saveCodexExecutablePath(path: string | null): Promise<SaveCodexPathResult> {
      if (!writable) return { ok: false, codexExecutablePath: storedCodexPath, refusal: "blocked" };
      const next = path === null || path.trim() === "" ? null : path.trim();
      try {
        await queued(backend, async () => {
          // The language is read when this write's turn comes, so a locale switch just before is kept.
          const content = serializeSettings(stored, next);
          const precondition: WritePrecondition = expected === null ? { kind: "absent" } : { kind: "matches", content: expected };
          await backend.write(SETTINGS_TARGET, content, precondition);
          storedCodexPath = next;
          expected = content;
        });
        return { ok: true, codexExecutablePath: next };
      } catch (error) {
        const failure = toStorageError(error);
        if (failure.code === "CONFLICT") writable = false;
        return {
          ok: false,
          codexExecutablePath: storedCodexPath,
          refusal: failure.code === "CONFLICT" ? "blocked" : "write_failed",
          error: failure,
        };
      }
    },
  };
}
