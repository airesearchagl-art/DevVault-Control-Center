import { err, ok, type Result } from "./result";

export const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
export const REVIEW_ID_PATTERN = /^rv-\d{8}-[a-z0-9]{6}$/;
const HEAD_PATTERN = /^[0-9a-f]{7,40}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export const GITHUB_HOSTS: readonly string[] = ["github.com"];
export const CHATGPT_HOSTS: readonly string[] = ["chatgpt.com", "chat.openai.com"];
/** Hosts the Rust launcher accepts. Kept in sync with `src-tauri/src/launcher.rs`. */
export const LAUNCHER_HOSTS: readonly string[] = [...GITHUB_HOSTS, ...CHATGPT_HOSTS];

export function isValidProjectId(value: string): boolean {
  return PROJECT_ID_PATTERN.test(value);
}

export function isValidReviewId(value: string): boolean {
  return REVIEW_ID_PATTERN.test(value);
}

export function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_TIMESTAMP_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

/**
 * Security decision by URL parsing (never by string prefix): https only, no credentials,
 * no explicit port, exact host match.
 */
export function parseAllowedHttpsUrl(raw: string, allowedHosts: readonly string[]): Result<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return err("Not a valid absolute URL");
  }
  if (url.protocol !== "https:") return err("Only https URLs are allowed");
  if (url.username !== "" || url.password !== "") return err("URLs with embedded credentials are not allowed");
  if (url.port !== "") return err("URLs with an explicit port are not allowed");
  if (!allowedHosts.includes(url.hostname)) return err(`Host must be one of: ${allowedHosts.join(", ")}`);
  return ok(url);
}

/** Normalizes to `https://github.com/<owner>/<repo>`. */
export function normalizeRepositoryUrl(raw: string): Result<string> {
  const parsed = parseAllowedHttpsUrl(raw, GITHUB_HOSTS);
  if (!parsed.ok) return parsed;
  const url = parsed.value;
  if (url.search !== "" || url.hash !== "") return err("Repository URL must not contain a query or fragment");
  const segments = url.pathname.split("/").filter((segment) => segment !== "");
  if (segments.length !== 2) return err("Repository URL must look like https://github.com/<owner>/<repo>");
  const owner = segments[0];
  const repo = segments[1].endsWith(".git") ? segments[1].slice(0, -4) : segments[1];
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner) || !/^[A-Za-z0-9._-]{1,100}$/.test(repo)) {
    return err("Repository URL must look like https://github.com/<owner>/<repo>");
  }
  return ok(`https://github.com/${owner}/${repo}`);
}

export function normalizeChatgptThreadUrl(raw: string): Result<string> {
  const parsed = parseAllowedHttpsUrl(raw, CHATGPT_HOSTS);
  return parsed.ok ? ok(parsed.value.href) : parsed;
}

export function pullRequestUrl(repositoryUrl: string, prNumber: number): string {
  return `${repositoryUrl}/pull/${prNumber}`;
}

/** Commit SHA (7–40 hex). Normalized to lowercase. */
export function normalizeHead(raw: string): Result<string> {
  const value = raw.trim().toLowerCase();
  return HEAD_PATTERN.test(value) ? ok(value) : err("HEAD must be a 7–40 character hexadecimal commit SHA");
}

export function isValidHead(value: unknown): value is string {
  return typeof value === "string" && HEAD_PATTERN.test(value);
}

export function parsePrNumber(raw: string): Result<number> {
  const value = raw.trim();
  return /^[1-9]\d{0,6}$/.test(value) ? ok(Number(value)) : err("PR number must be a positive integer");
}

/**
 * Format-only check for a local project root. Existence is verified by the Rust launcher when
 * the folder is opened.
 */
export function normalizeLocalRoot(raw: string): Result<string> {
  const value = raw.trim();
  if (/^(\\\\|\/\/)/.test(value)) return err("UNC / network paths are not supported");
  if (!/^[A-Za-z]:[\\/]/.test(value)) return err("Local root must be an absolute drive path such as C:\\work\\project");
  return ok(value);
}

export function suggestProjectId(displayName: string): string {
  const slug = displayName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 64)
    .replace(/-+$/, "");
  return isValidProjectId(slug) ? slug : "";
}

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function cryptoRandomIndex(max: number): number {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return buffer[0] % max;
}

/** `rv-YYYYMMDD-xxxxxx` using the UTC date. */
export function generateReviewId(now: Date, randomIndex: (max: number) => number = cryptoRandomIndex): string {
  const date = [
    now.getUTCFullYear().toString().padStart(4, "0"),
    (now.getUTCMonth() + 1).toString().padStart(2, "0"),
    now.getUTCDate().toString().padStart(2, "0"),
  ].join("");
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    suffix += ID_ALPHABET[randomIndex(ID_ALPHABET.length) % ID_ALPHABET.length];
  }
  return `rv-${date}-${suffix}`;
}
