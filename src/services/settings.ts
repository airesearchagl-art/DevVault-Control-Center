import { DEFAULT_LOCALE, isLocale, type Locale } from "../i18n/locale";
import { SETTINGS_TARGET, toStorageError, type StorageBackend } from "./storage";

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
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
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

/** Writes the chosen language. Nothing else in the data folder is touched. */
export async function saveLocale(backend: StorageBackend, locale: Locale): Promise<void> {
  await backend.write(SETTINGS_TARGET, serializeSettings(locale));
}
