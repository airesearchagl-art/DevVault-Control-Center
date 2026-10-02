import type { DiscoveredIdeSession } from "./ideSessionDiscovery";

/**
 * Phase 4b-2a: Human-selected Resume Handoff (copy-only). DVCC turns one already-discovered session
 * into one provider command line for the Human to run themselves; it never runs it.
 *
 * Identity is the provider plus the FULL discovered `sessionId`. A display label (`sessionIdLabels`),
 * row index, title or name never reaches this module's output: the renderer only accepts a
 * `ResumeIntent`, whose `sessionId` can only come from `parseSessionId`.
 */

declare const validatedSessionId: unique symbol;
/** A session ID that passed `parseSessionId`. Constructed nowhere else. */
export type ValidatedSessionId = string & { readonly [validatedSessionId]: true };

/**
 * Lowercase RFC 9562 UUID layout (versions 1-8, variant 10xx). Every character is `[0-9a-f-]` and the
 * first is a hex digit, so the value can never be read as a flag, path, name, quote or shell
 * operator. Provider metadata is untrusted: a value that does not already match is rejected, never
 * lowercased, trimmed or otherwise normalized into validity. JavaScript `$` (no `m` flag) matches
 * only at the true end of input, so a trailing newline is rejected too.
 */
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function parseSessionId(raw: unknown): ValidatedSessionId | null {
  return typeof raw === "string" && SESSION_ID_PATTERN.test(raw) ? (raw as ValidatedSessionId) : null;
}

export type ResumeRefusal =
  | "STALE_DISCOVERY"
  | "NOT_MATCHED"
  | "ALREADY_ACTIVE"
  | "ARCHIVED"
  | "INVALID_SESSION_ID"
  | "PROVIDER_NOT_SUPPORTED";

/** Codex is the only provider that can be eligible in Phase 4b-2a (HD-4B2-01). */
export interface ResumeIntent {
  provider: "CODEX";
  sessionId: ValidatedSessionId;
  projectId: string;
}

export type ResumeEligibility = { eligible: true; intent: ResumeIntent } | { eligible: false; reason: ResumeRefusal };

/**
 * Deterministic, in this fixed order: stale discovery; the row's binding (MATCHED to exactly the
 * selected Project); provider/source policy; archived; the ID itself. A provider scan that was
 * incomplete does not enter into it: a row's MATCHED evidence depends only on its own metadata and
 * the full Project registry, so a truncated scan cannot have produced it.
 */
export function evaluateResume(session: DiscoveredIdeSession, selectedProjectId: string, stale: boolean): ResumeEligibility {
  if (stale) return { eligible: false, reason: "STALE_DISCOVERY" };
  if (session.binding !== "MATCHED" || session.matchedProjectId !== selectedProjectId) {
    return { eligible: false, reason: "NOT_MATCHED" };
  }
  if (session.provider === "CLAUDE_CODE") {
    // Resuming a running Claude Code session interleaves both terminals into one transcript
    // (official docs); a historical one is never MATCHED by the current model. No Claude command
    // is produced in this phase either way (HD-4B2-01), even for an impossible MATCHED history row.
    return { eligible: false, reason: session.sourceKind === "LIVE" ? "ALREADY_ACTIVE" : "PROVIDER_NOT_SUPPORTED" };
  }
  if (session.provider !== "CODEX") return { eligible: false, reason: "PROVIDER_NOT_SUPPORTED" };
  // Fail closed: only a Codex row known to be NOT archived can proceed (an archived thread needs
  // `codex unarchive` first, which would modify provider state; DVCC never suggests it).
  if (session.archived !== false) return { eligible: false, reason: "ARCHIVED" };
  const sessionId = parseSessionId(session.sessionId);
  if (sessionId === null) return { eligible: false, reason: "INVALID_SESSION_ID" };
  return { eligible: true, intent: { provider: "CODEX", sessionId, projectId: selectedProjectId } };
}

/**
 * Phase 4b-2b "Resume in Codex": every Phase 4b-2a condition, unchanged and evaluated first, plus
 * what an actual launch needs — the selected Project's local folder and a Human-configured Codex
 * executable. This is the frontend half only; the native command re-validates every fact
 * independently (the executable, the ID, the thread, the folder) and is the real boundary.
 */
export type LaunchRefusal = ResumeRefusal | "NO_LOCAL_ROOT" | "CODEX_EXECUTABLE_NOT_CONFIGURED";

export interface LaunchIntent extends ResumeIntent {
  projectRoot: string;
  codexExecutablePath: string;
}

export type LaunchEligibility = { eligible: true; intent: LaunchIntent } | { eligible: false; reason: LaunchRefusal };

export interface LaunchProject {
  projectId: string;
  localRoot: string | null;
}

export function evaluateLaunch(
  session: DiscoveredIdeSession,
  project: LaunchProject | null,
  stale: boolean,
  codexExecutablePath: string | null,
): LaunchEligibility {
  if (project === null) return { eligible: false, reason: "NOT_MATCHED" };
  const resume = evaluateResume(session, project.projectId, stale);
  if (!resume.eligible) return resume;
  if (project.localRoot === null || project.localRoot.trim() === "") return { eligible: false, reason: "NO_LOCAL_ROOT" };
  if (codexExecutablePath === null || codexExecutablePath.trim() === "") return { eligible: false, reason: "CODEX_EXECUTABLE_NOT_CONFIGURED" };
  return { eligible: true, intent: { ...resume.intent, projectRoot: project.localRoot, codexExecutablePath } };
}

/**
 * Exactly one line, `codex resume <uuid>`: no quoting (the validated ID cannot need any), no path,
 * no `-C`, no `cd`, no compound shell expression, no project or repository information.
 */
export function renderResumeCommand(intent: ResumeIntent): string {
  return `codex resume ${intent.sessionId}`;
}
