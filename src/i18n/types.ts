import type { ja } from "./ja";

/**
 * The Japanese dictionary defines the key set; `en` is typed as a full record of the same keys, so
 * a missing or unknown translation is a compile error before any test runs.
 */
export type TranslationKey = keyof typeof ja;

export type Dictionary = Record<TranslationKey, string>;

/** Values substituted into `{placeholders}`; Human content is passed in, never stored in a dictionary. */
export type TranslationParams = Record<string, string | number>;

export type Translator = (key: TranslationKey, params?: TranslationParams) => string;
