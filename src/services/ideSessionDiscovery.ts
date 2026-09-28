import {
  bindClaudeSessions,
  bindCodexSessions,
  isCodexManagedMirrorPath,
  type CanonicalPaths,
  type ClaudeDiscoveryRaw,
  type CodexDiscoveryRaw,
  type ProviderScanResult,
} from "../domain/ideSessionDiscovery";
import type { Project } from "../domain/project";
import { invokeCommand } from "./storage";

export interface IdeSessionScan {
  claude: ProviderScanResult;
  codex: ProviderScanResult;
}

type CanonicalOutcome = { status: "ok"; canonical: string } | { status: "unavailable"; reason: string };

async function canonicalize(path: string): Promise<string | undefined> {
  const outcome = await invokeCommand<CanonicalOutcome>("canonicalize_local_path", { path });
  return outcome.status === "ok" ? outcome.canonical : undefined;
}

/**
 * Canonicalizes every distinct path either side of the binding decision might need, once each
 * (Task Packet §17: native path access is this service's job; `bindClaudeSessions`/`bindCodexSessions`
 * themselves never call `invoke`). A Codex-managed sandbox mirror path is never canonicalized: it is
 * never authoritative for workspace binding regardless of what it would resolve to.
 */
async function buildCanonicalPaths(candidates: Iterable<string>): Promise<CanonicalPaths> {
  const distinct = [...new Set(candidates)];
  const map = new Map<string, string>();
  for (const path of distinct) {
    const canonical = await canonicalize(path);
    if (canonical !== undefined) map.set(path, canonical);
  }
  return map;
}

function projectRoots(projects: readonly Project[]): string[] {
  return projects.flatMap((project) => (project.localRoot === null ? [] : [project.localRoot]));
}

/**
 * Human-triggered discovery only (Task Packet §4): this function is called from exactly one place,
 * the "Refresh IDE Sessions" button handler. Nothing here runs on startup, on a timer or in a
 * background watcher.
 */
export async function scanIdeSessions(projects: readonly Project[]): Promise<IdeSessionScan> {
  const [claudeRaw, codexRaw] = await Promise.all([
    invokeCommand<ClaudeDiscoveryRaw>("discover_claude_sessions"),
    invokeCommand<CodexDiscoveryRaw>("discover_codex_sessions"),
  ]);

  const claudeCandidates = new Set<string>(projectRoots(projects));
  if (claudeRaw.status === "ok") {
    for (const live of claudeRaw.live) claudeCandidates.add(live.cwd);
  }

  const codexCandidates = new Set<string>(projectRoots(projects));
  if (codexRaw.status === "ok") {
    for (const thread of codexRaw.threads) {
      if (!isCodexManagedMirrorPath(thread.cwd)) codexCandidates.add(thread.cwd);
    }
  }

  const [claudePaths, codexPaths] = await Promise.all([buildCanonicalPaths(claudeCandidates), buildCanonicalPaths(codexCandidates)]);

  return {
    claude: bindClaudeSessions(claudeRaw, projects, claudePaths),
    codex: bindCodexSessions(codexRaw, projects, codexPaths),
  };
}
