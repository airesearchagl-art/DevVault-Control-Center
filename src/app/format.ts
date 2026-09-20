import type { Translator } from "../i18n";
import { toStorageError } from "../services/storage";

export function nowIso(): string {
  return new Date().toISOString();
}

/** A storage failure in the Human's language; the code stays literal because it is not a word. */
export function describeError(t: Translator, error: unknown): string {
  const storageError = toStorageError(error);
  return storageError.code === "UNKNOWN"
    ? storageError.message
    : t("error.withCode", { message: storageError.message, code: storageError.code });
}

export function excerpt(text: string, maxLines: number): { text: string; truncated: boolean } {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return { text, truncated: false };
  return { text: lines.slice(0, maxLines).join("\n"), truncated: true };
}
