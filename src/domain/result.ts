import { message, type Message } from "./message";
import type { TranslationKey, TranslationParams } from "../i18n/types";

export type Result<T, E = Message> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function err<E>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}

/** The common failure: a named message with its parameters. */
export function invalid(key: TranslationKey, params?: TranslationParams): { ok: false; error: Message } {
  return err(message(key, params));
}

/** Field name → what is wrong with it. `_form` is used for errors not tied to one field. */
export type FieldErrors = Record<string, Message>;
