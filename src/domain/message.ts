import type { TranslationKey, TranslationParams } from "../i18n/types";

/**
 * What to say, not the words for it.
 *
 * The domain and the services decide which message applies; the interface decides in which language
 * it is read. The key is typed against the dictionaries, so a message that names a key nobody
 * translated is a compile error — and because this import is types only, no dictionary is pulled
 * into the domain at runtime.
 */
export interface Message {
  key: TranslationKey;
  params?: TranslationParams;
  /** Parameters that are messages themselves, so a label inside a sentence is translated too. */
  messageParams?: Record<string, Message>;
}

export function message(key: TranslationKey, params?: TranslationParams): Message {
  return params === undefined ? { key } : { key, params };
}
