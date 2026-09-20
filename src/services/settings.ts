import { DEFAULT_LOCALE, isLocale, type Locale } from "../i18n/locale";
import { createSerialQueue } from "./serialQueue";
import { SETTINGS_TARGET, toStorageError, type StorageBackend, type StorageError } from "./storage";

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

/** Writes the chosen language. Nothing else in the data folder is touched. */
export async function saveLocale(backend: StorageBackend, locale: Locale): Promise<void> {
  await writeQueueFor(backend)(() => backend.write(SETTINGS_TARGET, serializeSettings(locale)));
}

export interface SaveLocaleResult {
  /** `false` when the file could not be written, so the choice is not stored. */
  ok: boolean;
  /** The language that is actually stored now; the interface must not show any other. */
  locale: Locale;
  /** `true` when a later choice arrived while this write was in flight: that one decides. */
  superseded: boolean;
  error?: StorageError;
}

/**
 * Keeps the interface and the file in step. The caller may follow a choice immediately, but a
 * failed write reports the language that is still stored, so the interface can go back to it
 * instead of showing one that the next start-up would not restore.
 */
export interface LocaleStore {
  /** The language last written successfully (or adopted from the file at start-up). */
  readonly persisted: Locale;
  /** Records the language that was read from the file; no write happens. */
  adopt(locale: Locale): void;
  save(locale: Locale): Promise<SaveLocaleResult>;
}

export function createLocaleStore(backend: StorageBackend, persisted: Locale = DEFAULT_LOCALE): LocaleStore {
  let stored = persisted;
  let latest = persisted;
  return {
    get persisted() {
      return stored;
    },
    adopt(locale: Locale) {
      stored = locale;
      latest = locale;
    },
    async save(locale: Locale): Promise<SaveLocaleResult> {
      latest = locale;
      try {
        // Serialized by `saveLocale`, so these continuations also resolve in the order they were
        // requested: the last choice is the one left in the file and in `stored`.
        await saveLocale(backend, locale);
        stored = locale;
        return { ok: true, locale, superseded: latest !== locale };
      } catch (error) {
        return { ok: false, locale: stored, superseded: latest !== locale, error: toStorageError(error) };
      }
    },
  };
}
