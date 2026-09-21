/**
 * Supported interface languages (Localization Foundation v0.2.1).
 *
 * The locale is a UI preference only: it never reaches persisted project or review data, and every
 * stored value (review state, resource state, freshness, event type, schema field, file name, error
 * code) stays language-neutral.
 */

export const LOCALES = ["ja", "en"] as const;

export type Locale = (typeof LOCALES)[number];

/** Japanese is the standard interface language; English is chosen explicitly by the Human. */
export const DEFAULT_LOCALE: Locale = "ja";

/** Shown in the language selector, in their own language so the current UI language cannot hide it. */
export const LOCALE_NATIVE_NAMES: Record<Locale, string> = {
  ja: "日本語",
  en: "English",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
