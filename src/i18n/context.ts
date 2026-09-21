import { createContext, useContext } from "react";
import { createTranslator } from "./index";
import { DEFAULT_LOCALE, type Locale } from "./locale";
import type { Translator } from "./types";

/**
 * The interface language for the running app. It is UI state only: nothing here is persisted except
 * through `services/settings.ts`, and changing it touches no project or review data.
 */
export interface I18n {
  locale: Locale;
  t: Translator;
  setLocale: (locale: Locale) => void;
}

export const I18nContext = createContext<I18n>({
  locale: DEFAULT_LOCALE,
  t: createTranslator(DEFAULT_LOCALE),
  setLocale: () => undefined,
});

export function useI18n(): I18n {
  return useContext(I18nContext);
}

/** The common case: a component only needs to translate. */
export function useT(): Translator {
  return useContext(I18nContext).t;
}
