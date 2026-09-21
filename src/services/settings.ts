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
 * This file holds the chosen language and nothing else: no project or review data is read or
 * written on this path. A missing file is the normal case for a fresh install and means Japanese;
 * a file that cannot be read or understood also means Japanese, is reported so the Human sees it,
 * and is left on disk exactly as it was.
 */

export const SETTINGS_SCHEMA_VERSION = 1;

export interface Settings {
  schemaVersion: number;
  locale: Locale;
}

export type SettingsProblem = "unreadable" | "invalid";

export interface LoadedSettings {
  locale: Locale;
  /** `null` when the file was absent (a fresh install) or valid. */
  problem: SettingsProblem | null;
  /** The raw text that was read, so a save can refuse to overwrite a file it did not understand. */
  raw: string | null;
}

export function parseSettings(text: string): Locale | null {
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
  return isLocale(record.locale) ? record.locale : null;
}

export function serializeSettings(locale: Locale): string {
  const settings: Settings = { schemaVersion: SETTINGS_SCHEMA_VERSION, locale };
  return `${JSON.stringify(settings, null, 2)}\n`;
}

export async function loadSettings(backend: StorageBackend): Promise<LoadedSettings> {
  let raw: string | null;
  try {
    raw = await backend.read(SETTINGS_TARGET);
  } catch (error) {
    // An unreadable preferences file must not stop the app or touch any other file.
    void toStorageError(error);
    return { locale: DEFAULT_LOCALE, problem: "unreadable", raw: null };
  }
  if (raw === null) return { locale: DEFAULT_LOCALE, problem: null, raw: null };
  const locale = parseSettings(raw);
  if (locale === null) return { locale: DEFAULT_LOCALE, problem: "invalid", raw };
  return { locale, problem: null, raw };
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
  /** `false` when the file on disk must not be replaced by this version of DVCC. */
  readonly writable: boolean;
  /** Records what was read from the file at start-up; no write happens. */
  adopt(settings: LoadedSettings): void;
  save(locale: Locale): Promise<SaveLocaleResult>;
}

export function createLocaleStore(backend: StorageBackend, persisted: Locale = DEFAULT_LOCALE): LocaleStore {
  let stored = persisted;
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
    get writable() {
      return writable;
    },
    adopt(settings: LoadedSettings) {
      stored = settings.locale;
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

      const content = serializeSettings(locale);
      try {
        await queued(backend, async () => {
          // Judged against what the file held when this write's turn came, not when it was asked
          // for: two choices in quick succession are still one write after another.
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
  };
}
