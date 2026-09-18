import { toStorageError } from "../services/storage";

export function nowIso(): string {
  return new Date().toISOString();
}

/** Local `YYYY-MM-DD HH:mm`; `—` for null. */
export function formatTimestamp(iso: string | null): string {
  if (iso === null) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function describeError(error: unknown): string {
  const storageError = toStorageError(error);
  return storageError.code === "UNKNOWN" ? storageError.message : `${storageError.message} (${storageError.code})`;
}

export function excerpt(text: string, maxLines: number): { text: string; truncated: boolean } {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return { text, truncated: false };
  return { text: lines.slice(0, maxLines).join("\n"), truncated: true };
}
