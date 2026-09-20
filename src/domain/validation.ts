import { invalid, ok, type Result } from "./result";

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
 * no non-default port, exact host match. An explicit `:443` is the https default: the URL parser
 * normalizes it away (`url.port === ""`), so it is accepted and never kept in the canonical form.
 */
export function parseAllowedHttpsUrl(raw: string, allowedHosts: readonly string[]): Result<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return invalid("validation.url.notAbsolute");
  }
  if (url.protocol !== "https:") return invalid("validation.url.httpsOnly");
  if (url.username !== "" || url.password !== "") return invalid("validation.url.credentials");
  if (url.port !== "") return invalid("validation.url.port");
  if (!allowedHosts.includes(url.hostname)) return invalid("validation.url.host", { hosts: allowedHosts.join(", ") });
  return ok(url);
}

const REPOSITORY_URL_SHAPE = "validation.repositoryUrl.shape" as const;
const GITHUB_OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const GITHUB_REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * Normalizes to the canonical `https://github.com/<owner>/<repo>`.
 *
 * Idempotent by construction (`normalize(normalize(x)) === normalize(x)`): every trailing
 * `.git` suffix is removed and the canonical form is re-checked, so the persisted value is
 * always accepted again when the file is loaded (F-1).
 */
export function normalizeRepositoryUrl(raw: string): Result<string> {
  const parsed = parseAllowedHttpsUrl(raw, GITHUB_HOSTS);
  if (!parsed.ok) return parsed;
  const url = parsed.value;
  if (url.search !== "" || url.hash !== "") return invalid("validation.repositoryUrl.query");
  const segments = url.pathname.split("/").filter((segment) => segment !== "");
  if (segments.length !== 2) return invalid(REPOSITORY_URL_SHAPE);
  const owner = segments[0];
  let repo = segments[1];
  while (repo.toLowerCase().endsWith(".git")) repo = repo.slice(0, -4);
  if (!GITHUB_OWNER_PATTERN.test(owner) || !GITHUB_REPO_PATTERN.test(repo) || repo === "." || repo === "..") {
    return invalid(REPOSITORY_URL_SHAPE);
  }
  const canonical = `https://github.com/${owner}/${repo}`;
  // Defensive self-check: the canonical form must parse back to itself.
  const reparsed = parseAllowedHttpsUrl(canonical, GITHUB_HOSTS);
  if (!reparsed.ok || reparsed.value.pathname !== `/${owner}/${repo}`) return invalid(REPOSITORY_URL_SHAPE);
  return ok(canonical);
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
  return HEAD_PATTERN.test(value) ? ok(value) : invalid("validation.head.format");
}

export function isValidHead(value: unknown): value is string {
  return typeof value === "string" && HEAD_PATTERN.test(value);
}

export function parsePrNumber(raw: string): Result<number> {
  const value = raw.trim();
  return /^[1-9]\d{0,6}$/.test(value) ? ok(Number(value)) : invalid("validation.prNumber.format");
}

/**
 * Format-only check for a local project root. Existence is verified by the Rust launcher when
 * the folder is opened.
 */
export function normalizeLocalRoot(raw: string): Result<string> {
  const value = raw.trim();
  if (/^(\\\\|\/\/)/.test(value)) return invalid("validation.localRoot.unc");
  if (!/^[A-Za-z]:[\\/]/.test(value)) return invalid("validation.localRoot.absolute");
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
