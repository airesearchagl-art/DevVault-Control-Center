import { message, type Message } from "./message";
import type { Project } from "./project";

/**
 * Phase 4b-1: deterministic, metadata-only binding of a locally discovered Claude Code / Codex
 * session to a registered DVCC Project. Never guesses: a binding is `MATCHED` only on exact,
 * provable identity (an exact canonical workspace path, or an exact repository identity that
 * resolves to exactly one Project). Everything here is a pure function of already-collected
 * metadata — no file, database or native call happens in this module (Human Decision HD-P4B-06 /
 * Task Packet §17: native access is the Rust readers' job; this module only decides).
 */

/**
 * A snapshot of every Project field a binding decision can depend on (Independent Review RF-P4B1-01).
 * Two registries with the same set of `(projectId, repositoryUrl, localRoot)` triples produce the
 * same fingerprint regardless of Project order; any edit — a changed `repositoryUrl`/`localRoot`, or
 * a Project added/removed/renamed — changes it. Never persisted: it exists only to answer "does a
 * runtime-only scan still match what the Project registry looks like right now."
 */
export type ProjectBindingFingerprint = string;

export function computeProjectBindingFingerprint(projects: readonly Project[]): ProjectBindingFingerprint {
  const relevant = projects
    .map((project) => ({ projectId: project.projectId, repositoryUrl: project.repositoryUrl, localRoot: project.localRoot }))
    .sort((a, b) => a.projectId.localeCompare(b.projectId));
  return JSON.stringify(relevant);
}

/**
 * True once the Project registry has changed (in any binding-relevant way) since `fingerprint` was
 * captured — whether that happened before a scan even started, or while one was still in flight. A
 * stale result must never be displayed as current (Task Packet RF-P4B1-01): the caller's job is to
 * check this before rendering `MATCHED`/`AMBIGUOUS` content, not to try to intercept every edit.
 */
export function isIdeSessionsStale(fingerprint: ProjectBindingFingerprint, currentProjects: readonly Project[]): boolean {
  return computeProjectBindingFingerprint(currentProjects) !== fingerprint;
}

export const PROVIDER_KINDS = ["CLAUDE_CODE", "CODEX"] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export const SESSION_SOURCE_KINDS = ["LIVE", "HISTORICAL"] as const;
export type SessionSourceKind = (typeof SESSION_SOURCE_KINDS)[number];

export const SESSION_BINDING_STATES = ["MATCHED", "NO_MATCH", "AMBIGUOUS", "UNAVAILABLE", "UNSUPPORTED_FORMAT"] as const;
export type SessionBindingState = (typeof SESSION_BINDING_STATES)[number];

/** No field for transcript, prompt, response, title or any provider display name (Task Packet §7). */
export interface DiscoveredIdeSession {
  provider: ProviderKind;
  sessionId: string;
  sourceKind: SessionSourceKind;
  createdAt: string | null;
  updatedAt: string | null;
  providerVersion: string | null;
  archived: boolean | null;
  binding: SessionBindingState;
  matchedProjectId: string | null;
  /** Populated only when `binding` is `AMBIGUOUS`: the registered Projects tied as candidates. */
  candidateProjectIds: string[];
  reason: Message;
}

export type ProviderScanResult =
  /**
   * `complete: false` (Independent Review RF-P4B1-02 §4/§7) means a session cap, directory cap or
   * wall-clock/query deadline stopped enumeration before it finished. `sessions` found under a
   * partial scan may still be shown — their own evidence is unaffected — but their *absence* proves
   * nothing: a renderer must never read an empty/short `sessions` list here as a confirmed
   * `NO_MATCH` for the whole provider.
   */
  | {
      status: "ok";
      sessions: DiscoveredIdeSession[];
      complete: boolean;
      /**
       * Claude only (HD-4B12-01): Projects whose `localRoot` has no supported historical key
       * (non-ASCII, or too long for the ordinary rule). Historical sessions can never be tied to
       * them, so a renderer must surface a warning rather than read "no historical row" as a
       * conclusive NO_MATCH. Live exact matching for these Projects is unaffected. Runtime only.
       */
      historicalBindingUnsupportedProjectIds?: string[];
    }
  | { status: "unavailable"; reason: Message }
  | { status: "unsupportedFormat"; reason: Message };

// --- raw provider facts, mirroring the Rust readers' JSON shape exactly ------------------------

export interface CodexThreadRaw {
  id: string;
  cwd: string;
  createdAt: number; // unix seconds
  updatedAt: number; // unix seconds
  cliVersion: string;
  archived: boolean;
  gitOriginUrl: string | null;
}

export type CodexDiscoveryRaw =
  | { status: "ok"; threads: CodexThreadRaw[]; complete: boolean }
  | { status: "unavailable"; reason: string }
  | { status: "unsupportedFormat"; reason: string };

export interface ClaudeHistoricalCandidateRaw {
  encodedDirName: string;
  sessionId: string;
  updatedAtMs: number | null;
}

export interface ClaudeLiveSessionRaw {
  sessionId: string;
  cwd: string;
  updatedAtMs: number | null;
  version: string | null;
}

export type ClaudeDiscoveryRaw =
  | { status: "ok"; historical: ClaudeHistoricalCandidateRaw[]; live: ClaudeLiveSessionRaw[]; complete: boolean }
  | { status: "unavailable"; reason: string };

/**
 * Paths this module needs canonicalized before it can compare them, collected by the service layer
 * via the Rust `canonicalize_local_path` command (never opened, never launched — see its doc
 * comment in `launcher.rs`). A path absent from this map could not be canonicalized (does not
 * exist, is a network/UNC target, etc.) and is treated as unusable for exact matching, never guessed.
 */
export type CanonicalPaths = ReadonlyMap<string, string>;

function canonicalKey(path: string): string {
  return path.replace(/[\\/]+$/, "").toLowerCase();
}

function projectIdsByCanonicalRoot(projects: readonly Project[], canonicalPaths: CanonicalPaths): Map<string, string> {
  const map = new Map<string, string>();
  for (const project of projects) {
    if (project.localRoot === null) continue;
    const canonical = canonicalPaths.get(project.localRoot);
    if (canonical !== undefined) map.set(project.projectId, canonicalKey(canonical));
  }
  return map;
}

function projectIdsMatchingCanonicalKey(byRoot: ReadonlyMap<string, string>, key: string): string[] {
  const out: string[] = [];
  for (const [projectId, root] of byRoot) if (root === key) out.push(projectId);
  return out;
}

// --- Claude Code: the lossy, non-reversible directory-name encoding ----------------------------

/**
 * Longest ordinary encoded directory name DVCC will use as a historical candidate key. Beyond it,
 * Claude Code switches to a truncated/hashed form DVCC does not know, so the key is unsupported —
 * never truncated or hash-guessed (HD-4B12-01).
 */
export const CLAUDE_HISTORICAL_KEY_MAX_LEN = 200;

export type ClaudeHistoricalKeyResult =
  | { status: "supported"; key: string }
  | { status: "unsupported"; reason: "NON_ASCII" | "LONG_NAME_HASH_UNKNOWN" };

/**
 * The ordinary naming rule of `<home>/.claude/projects/<encoded>/` (HD-4B12-01 / DF-05): every
 * ASCII character outside `[A-Za-z0-9]` becomes `-`; letters and digits are kept with their case.
 * Only the supported subset is implemented: a non-ASCII `localRoot`, or one whose ordinary encoded
 * form would exceed {@link CLAUDE_HISTORICAL_KEY_MAX_LEN}, is `unsupported` — no Unicode
 * classification, truncation, hash guess or normalization is attempted. The rule is lossy (two
 * different real paths can encode to the same string), so forward-encoding a registered
 * `Project.localRoot` and comparing is the only safe direction; a provider directory name is never
 * reverse-decoded to claim an exact path.
 */
export function claudeHistoricalProjectKey(localRoot: string): ClaudeHistoricalKeyResult {
  if (/[^\x00-\x7f]/.test(localRoot)) return { status: "unsupported", reason: "NON_ASCII" };
  const key = localRoot.replace(/[^A-Za-z0-9]/g, "-");
  if (key.length > CLAUDE_HISTORICAL_KEY_MAX_LEN) return { status: "unsupported", reason: "LONG_NAME_HASH_UNKNOWN" };
  return { status: "supported", key };
}

/**
 * The comparison key for a Claude historical directory name (provider side) or a supported
 * Project-side key: lowercased. Windows paths are case-insensitive, and Claude keeps whatever
 * casing the session's cwd had (a VS Code launch can record `c:\…`), so a case-sensitive comparison
 * would drop a real candidate to NO_MATCH (DF-02). Comparison only — the key is still a lossy
 * candidate signal, never decoded, and a match on it can only ever yield AMBIGUOUS.
 */
export function claudeHistoricalKey(encoded: string): string {
  return encoded.toLowerCase();
}

// --- Codex: repository-identity normalization ---------------------------------------------------

const GITHUB_HTTPS = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i;
const GITHUB_SSH = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i;

/**
 * Normalizes the small set of GitHub URL forms Task Packet §11 requires support for
 * (`https://github.com/<owner>/<repo>[.git]`, `git@github.com:<owner>/<repo>[.git]`) to one
 * lowercase identity string. Any other form (a different host, a malformed URL) returns `null`
 * rather than a guessed identity — no network request is made.
 */
export function normalizeRepositoryIdentity(url: string): string | null {
  const trimmed = url.trim();
  const https = GITHUB_HTTPS.exec(trimmed);
  if (https) return `github.com/${https[1].toLowerCase()}/${https[2].toLowerCase()}`;
  const ssh = GITHUB_SSH.exec(trimmed);
  if (ssh) return `github.com/${ssh[1].toLowerCase()}/${ssh[2].toLowerCase()}`;
  return null;
}

/**
 * `<codexHome>/project/<name>/...`: Codex's own sandboxed source mirror, not the real external
 * workspace. A path under it must never be treated as an authoritative `Project.localRoot`
 * candidate — not even by matching `<name>` against a Project's display name or folder basename
 * (Task Packet §12).
 */
export function isCodexManagedMirrorPath(cwd: string): boolean {
  return /\.codex[\\/]project[\\/]/i.test(cwd);
}

// --- binding ---------------------------------------------------------------------------------

export function bindClaudeSessions(raw: ClaudeDiscoveryRaw, projects: readonly Project[], canonicalPaths: CanonicalPaths): ProviderScanResult {
  if (raw.status === "unavailable") return { status: "unavailable", reason: message("ideSessions.reason.providerUnavailable") };

  const canonicalRootsByProject = projectIdsByCanonicalRoot(projects, canonicalPaths);
  const encodedToProjectIds = new Map<string, string[]>();
  const historicalBindingUnsupportedProjectIds: string[] = [];
  for (const project of projects) {
    if (project.localRoot === null) continue;
    const forward = claudeHistoricalProjectKey(project.localRoot);
    if (forward.status === "unsupported") {
      historicalBindingUnsupportedProjectIds.push(project.projectId);
      continue;
    }
    const key = claudeHistoricalKey(forward.key);
    const list = encodedToProjectIds.get(key) ?? [];
    list.push(project.projectId);
    encodedToProjectIds.set(key, list);
  }

  const liveSessionIds = new Set(raw.live.map((session) => session.sessionId));
  const sessions: DiscoveredIdeSession[] = [];

  for (const live of raw.live) {
    const canonicalCwd = canonicalPaths.get(live.cwd);
    let binding: SessionBindingState;
    let matchedProjectId: string | null = null;
    let candidateProjectIds: string[] = [];
    let reason: Message;
    if (canonicalCwd === undefined) {
      binding = "UNAVAILABLE";
      reason = message("ideSessions.reason.unavailable");
    } else {
      const matches = projectIdsMatchingCanonicalKey(canonicalRootsByProject, canonicalKey(canonicalCwd));
      if (matches.length === 1) {
        [matchedProjectId] = matches;
        binding = "MATCHED";
        reason = message("ideSessions.reason.matchedExactWorkspace");
      } else if (matches.length === 0) {
        binding = "NO_MATCH";
        reason = message("ideSessions.reason.noMatch");
      } else {
        binding = "AMBIGUOUS";
        candidateProjectIds = matches;
        reason = message("ideSessions.reason.ambiguousMultipleProjects");
      }
    }
    sessions.push({
      provider: "CLAUDE_CODE",
      sessionId: live.sessionId,
      sourceKind: "LIVE",
      createdAt: null,
      updatedAt: live.updatedAtMs === null ? null : new Date(live.updatedAtMs).toISOString(),
      providerVersion: live.version,
      archived: null,
      binding,
      matchedProjectId,
      candidateProjectIds,
      reason,
    });
  }

  for (const historical of raw.historical) {
    if (liveSessionIds.has(historical.sessionId)) continue; // the live entry above is authoritative
    const candidates = encodedToProjectIds.get(claudeHistoricalKey(historical.encodedDirName)) ?? [];
    let binding: SessionBindingState;
    let reason: Message;
    if (candidates.length === 0) {
      binding = "NO_MATCH";
      reason = message("ideSessions.reason.noMatch");
    } else if (candidates.length === 1) {
      // A single candidate is not proof: the encoding is lossy, so this can only be AMBIGUOUS.
      binding = "AMBIGUOUS";
      reason = message("ideSessions.reason.ambiguousHistoricalEncoding");
    } else {
      binding = "AMBIGUOUS";
      reason = message("ideSessions.reason.ambiguousEncodingCollision");
    }
    sessions.push({
      provider: "CLAUDE_CODE",
      sessionId: historical.sessionId,
      sourceKind: "HISTORICAL",
      createdAt: null,
      updatedAt: historical.updatedAtMs === null ? null : new Date(historical.updatedAtMs).toISOString(),
      providerVersion: null,
      archived: null,
      binding,
      matchedProjectId: null,
      candidateProjectIds: binding === "AMBIGUOUS" ? candidates : [],
      reason,
    });
  }

  return { status: "ok", sessions, complete: raw.complete, historicalBindingUnsupportedProjectIds };
}

export function bindCodexSessions(raw: CodexDiscoveryRaw, projects: readonly Project[], canonicalPaths: CanonicalPaths): ProviderScanResult {
  if (raw.status === "unavailable") return { status: "unavailable", reason: message("ideSessions.reason.providerUnavailable") };
  if (raw.status === "unsupportedFormat") return { status: "unsupportedFormat", reason: message("ideSessions.reason.unsupportedFormat") };

  const repositoryIdentityToProjectIds = new Map<string, string[]>();
  for (const project of projects) {
    const identity = project.repositoryUrl === null ? null : normalizeRepositoryIdentity(project.repositoryUrl);
    if (identity === null) continue;
    const list = repositoryIdentityToProjectIds.get(identity) ?? [];
    list.push(project.projectId);
    repositoryIdentityToProjectIds.set(identity, list);
  }
  const canonicalRootsByProject = projectIdsByCanonicalRoot(projects, canonicalPaths);

  const sessions: DiscoveredIdeSession[] = raw.threads.map((thread) => {
    const identity = thread.gitOriginUrl === null ? null : normalizeRepositoryIdentity(thread.gitOriginUrl);
    const repositoryMatches = identity === null ? [] : (repositoryIdentityToProjectIds.get(identity) ?? []);
    const isMirror = isCodexManagedMirrorPath(thread.cwd);
    const canonicalCwd = isMirror ? undefined : canonicalPaths.get(thread.cwd);
    const workspaceMatches = canonicalCwd === undefined ? [] : projectIdsMatchingCanonicalKey(canonicalRootsByProject, canonicalKey(canonicalCwd));

    let binding: SessionBindingState;
    let matchedProjectId: string | null = null;
    let candidateProjectIds: string[] = [];
    let reason: Message;

    if (repositoryMatches.length === 1) {
      [matchedProjectId] = repositoryMatches;
      binding = "MATCHED";
      reason = message("ideSessions.reason.matchedRepositoryIdentity");
    } else if (repositoryMatches.length > 1) {
      const disambiguated = workspaceMatches.filter((id) => repositoryMatches.includes(id));
      if (disambiguated.length === 1) {
        [matchedProjectId] = disambiguated;
        binding = "MATCHED";
        reason = message("ideSessions.reason.matchedRepositoryIdentity");
      } else {
        binding = "AMBIGUOUS";
        candidateProjectIds = repositoryMatches;
        reason = message("ideSessions.reason.ambiguousMultipleProjects");
      }
    } else if (identity !== null) {
      // A recognized repository identity that matches no registered Project.
      binding = "NO_MATCH";
      reason = message("ideSessions.reason.noMatch");
    } else if (!isMirror && workspaceMatches.length === 1) {
      [matchedProjectId] = workspaceMatches;
      binding = "MATCHED";
      reason = message("ideSessions.reason.matchedExactWorkspace");
    } else if (!isMirror && workspaceMatches.length > 1) {
      binding = "AMBIGUOUS";
      candidateProjectIds = workspaceMatches;
      reason = message("ideSessions.reason.ambiguousMultipleProjects");
    } else if (!isMirror && canonicalCwd !== undefined) {
      binding = "NO_MATCH";
      reason = message("ideSessions.reason.noMatch");
    } else {
      // Mirror cwd with no repository identity, or a path that could not be canonicalized: no
      // usable signal remains, and a mirror path is never treated as authoritative (Task Packet §12).
      binding = "UNAVAILABLE";
      reason = message("ideSessions.reason.unavailable");
    }

    return {
      provider: "CODEX",
      sessionId: thread.id,
      sourceKind: "HISTORICAL",
      createdAt: new Date(thread.createdAt * 1000).toISOString(),
      updatedAt: new Date(thread.updatedAt * 1000).toISOString(),
      providerVersion: thread.cliVersion,
      archived: thread.archived,
      binding,
      matchedProjectId,
      candidateProjectIds,
      reason,
    };
  });

  return { status: "ok", sessions, complete: raw.complete };
}
