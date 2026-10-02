import { describe, expect, it, vi } from "vitest";
import type { DiscoveredIdeSession } from "../domain/ideSessionDiscovery";
import { evaluateLaunch } from "../domain/resumeIntent";
import { createTranslator, LAUNCH_ERROR_KEYS, type Locale } from "../i18n";
import { LAUNCH_ERROR_CODES, type CodexLauncher } from "../services/codexLauncher";
import type { ToastKind } from "./appState";
import { confirmResumeLaunch, requestResumeLaunch, type LaunchContext, type ResumeLaunchRequest } from "./launchCodexResumeAction";

/** Phase 4b-2b (LRP-20261002-DVCC-010 §13-§15, §19, §22, §26). Synthetic values only. */

const FULL_ID = "019c1a2b-3c4d-7e5f-8a9b-0c1d2e3f4a5b";
const ROOT = "C:\\synthetic\\workspace";
const EXE = "C:\\synthetic\\tools\\codex.exe";
const PROJECT: { projectId: string; displayName: string; localRoot: string | null } = { projectId: "project-alpha", displayName: "Project Alpha", localRoot: ROOT };

function session(overrides: Partial<DiscoveredIdeSession> = {}): DiscoveredIdeSession {
  return {
    provider: "CODEX",
    sessionId: FULL_ID,
    sourceKind: "HISTORICAL",
    binding: "MATCHED",
    matchedProjectId: PROJECT.projectId,
    candidateProjectIds: [],
    createdAt: null,
    updatedAt: null,
    providerVersion: "0.153.4",
    archived: false,
    reason: { key: "ideSessions.reason.matchedRepositoryIdentity" },
    ...overrides,
  };
}

function context(overrides: Partial<LaunchContext> = {}): LaunchContext {
  return { session: session(), project: PROJECT, stale: false, codexExecutablePath: EXE, ...overrides };
}

function harness(options: { workspaceWarning?: boolean; preflightError?: unknown; launchError?: unknown } = {}) {
  const preflight = vi.fn(async () => {
    if (options.preflightError !== undefined) throw options.preflightError;
    return { workspaceWarning: options.workspaceWarning ?? false };
  });
  const launch = vi.fn(async () => {
    if (options.launchError !== undefined) throw options.launchError;
  });
  const launcher: CodexLauncher = { validateExecutable: vi.fn(async () => undefined), preflight, launch };
  const toasts: { kind: ToastKind; message: string }[] = [];
  const notify = (kind: ToastKind, message: string) => toasts.push({ kind, message });
  return { launcher, preflight, launch, toasts, notify };
}

const request: ResumeLaunchRequest = {
  sessionId: FULL_ID as ResumeLaunchRequest["sessionId"],
  projectId: PROJECT.projectId,
  projectDisplayName: PROJECT.displayName,
  sessionLabel: "019c1a2b…4a5b",
  workspaceWarning: false,
};

describe("evaluateLaunch", () => {
  it("keeps every Phase 4b-2a condition and adds a local root and a configured executable", () => {
    expect(evaluateLaunch(session(), PROJECT, false, EXE)).toMatchObject({ eligible: true, intent: { sessionId: FULL_ID, projectRoot: ROOT, codexExecutablePath: EXE } });
    const refusal = (s: DiscoveredIdeSession, p: typeof PROJECT | null, stale: boolean, exe: string | null) => {
      const result = evaluateLaunch(s, p, stale, exe);
      return result.eligible ? "ELIGIBLE" : result.reason;
    };
    expect(refusal(session(), PROJECT, true, EXE)).toBe("STALE_DISCOVERY");
    expect(refusal(session({ binding: "AMBIGUOUS", matchedProjectId: null }), PROJECT, false, EXE)).toBe("NOT_MATCHED");
    expect(refusal(session({ matchedProjectId: "project-beta" }), PROJECT, false, EXE)).toBe("NOT_MATCHED");
    expect(refusal(session(), null, false, EXE)).toBe("NOT_MATCHED");
    expect(refusal(session({ archived: true }), PROJECT, false, EXE)).toBe("ARCHIVED");
    expect(refusal(session({ archived: null }), PROJECT, false, EXE)).toBe("ARCHIVED");
    expect(refusal(session({ sessionId: FULL_ID.toUpperCase() }), PROJECT, false, EXE)).toBe("INVALID_SESSION_ID");
    expect(refusal(session({ provider: "CLAUDE_CODE", sourceKind: "LIVE" }), PROJECT, false, EXE)).toBe("ALREADY_ACTIVE");
    expect(refusal(session(), { ...PROJECT, localRoot: null }, false, EXE)).toBe("NO_LOCAL_ROOT");
    expect(refusal(session(), PROJECT, false, null)).toBe("CODEX_EXECUTABLE_NOT_CONFIGURED");
    expect(refusal(session(), PROJECT, false, "  ")).toBe("CODEX_EXECUTABLE_NOT_CONFIGURED");
  });
});

describe("requestResumeLaunch (step 1: confirmation only)", () => {
  it("an eligible row runs the read-only preflight and returns a confirmation request — it never launches", async () => {
    const h = harness({ workspaceWarning: true });
    const result = await requestResumeLaunch(context(), "019c1a2b…4a5b", createTranslator("en"), h.launcher, h.notify);
    expect(h.preflight).toHaveBeenCalledWith(EXE, FULL_ID, ROOT);
    expect(h.launch).not.toHaveBeenCalled();
    expect(result).toEqual({ ...request, workspaceWarning: true });
    // What the dialog can show carries no path, no executable and no repository.
    expect(JSON.stringify({ ...result, sessionId: undefined })).not.toMatch(/synthetic|codex\.exe|github/);
  });

  it.each([
    ["stale", { stale: true }],
    ["archived", { session: session({ archived: true }) }],
    ["invalid id", { session: session({ sessionId: "not-a-uuid" }) }],
    ["Claude", { session: session({ provider: "CLAUDE_CODE", sourceKind: "LIVE" }) }],
    ["no local root", { project: { ...PROJECT, localRoot: null } }],
    ["no executable", { codexExecutablePath: null }],
    ["not matched", { session: session({ binding: "AMBIGUOUS", matchedProjectId: null }) }],
  ])("%s: refuses at click time without any native call", async (_label, overrides) => {
    const h = harness();
    const result = await requestResumeLaunch(context(overrides as Partial<LaunchContext>), "x", createTranslator("en"), h.launcher, h.notify);
    expect(result).toBeNull();
    expect(h.preflight).not.toHaveBeenCalled();
    expect(h.launch).not.toHaveBeenCalled();
    expect(h.toasts).toHaveLength(1);
    expect(h.toasts[0].kind).toBe("warning");
  });

  it("a native preflight refusal opens no confirmation", async () => {
    const h = harness({ preflightError: { code: "CWD_MISMATCH", message: "C:\\synthetic\\elsewhere differs" } });
    const t = createTranslator("en");
    expect(await requestResumeLaunch(context(), "x", t, h.launcher, h.notify)).toBeNull();
    expect(h.launch).not.toHaveBeenCalled();
    expect(h.toasts).toEqual([{ kind: "warning", message: t("resume.launch.error.CWD_MISMATCH") }]);
    // The native message (which may name a path) is never shown.
    expect(h.toasts[0].message).not.toContain("synthetic");
  });
});

describe("confirmResumeLaunch (step 2: the only path to a process)", () => {
  it("launches exactly once with the full ID, the root and the workspace acknowledgement it was shown", async () => {
    const h = harness();
    const t = createTranslator("en");
    const warned = { ...request, workspaceWarning: true };
    expect(await confirmResumeLaunch(warned, context(), true, t, h.launcher, h.notify)).toBe(true);
    expect(h.launch).toHaveBeenCalledTimes(1);
    expect(h.launch).toHaveBeenCalledWith(EXE, FULL_ID, ROOT, true);
    expect(h.toasts).toEqual([{ kind: "info", message: t("resume.launch.toast.started") }]);
  });

  it("success wording says only that the process started", () => {
    for (const locale of ["en", "ja"] as Locale[]) {
      const text = createTranslator(locale)("resume.launch.toast.started");
      expect(text).not.toMatch(/resumed successfully|再開しました/i);
    }
    expect(createTranslator("en")("resume.launch.toast.started")).toBe("Codex process started. Confirm the resume result in Codex.");
  });

  it("without the acknowledgement nothing is launched", async () => {
    const h = harness();
    expect(await confirmResumeLaunch(request, context(), false, createTranslator("en"), h.launcher, h.notify)).toBe(false);
    expect(h.launch).not.toHaveBeenCalled();
  });

  it.each([
    ["the discovery became stale", { stale: true }],
    ["the session became archived", { session: session({ archived: true }) }],
    ["the session is no longer MATCHED", { session: session({ binding: "NO_MATCH", matchedProjectId: null }) }],
    ["another Project is selected now", { project: { ...PROJECT, projectId: "project-beta" } }],
    ["the executable setting was cleared", { codexExecutablePath: null }],
    ["the Project lost its folder", { project: { ...PROJECT, localRoot: null } }],
  ])("re-evaluated at confirmation: %s -> no launch", async (_label, overrides) => {
    const h = harness();
    expect(await confirmResumeLaunch(request, context(overrides as Partial<LaunchContext>), true, createTranslator("en"), h.launcher, h.notify)).toBe(false);
    expect(h.launch).not.toHaveBeenCalled();
  });

  it("a session that disappeared, or a different session, is refused", async () => {
    const h = harness();
    const t = createTranslator("en");
    expect(await confirmResumeLaunch(request, null, true, t, h.launcher, h.notify)).toBe(false);
    const other = context({ session: session({ sessionId: "019c1a2b-3c4d-7e5f-8a9b-0c1d2e3f4a5c" }) });
    expect(await confirmResumeLaunch(request, other, true, t, h.launcher, h.notify)).toBe(false);
    expect(h.launch).not.toHaveBeenCalled();
  });

  it("maps every native code to its own localized wording and anything unknown to a launch failure", async () => {
    for (const locale of ["en", "ja"] as Locale[]) {
      const t = createTranslator(locale);
      for (const code of LAUNCH_ERROR_CODES) {
        const h = harness({ launchError: { code, message: "C:\\synthetic\\path in a native message" } });
        expect(await confirmResumeLaunch(request, context(), true, t, h.launcher, h.notify)).toBe(false);
        expect(h.toasts).toEqual([{ kind: "error", message: t(LAUNCH_ERROR_KEYS[code]) }]);
        expect(h.toasts[0].message).not.toContain("synthetic");
      }
      const h = harness({ launchError: new Error("boom") });
      await confirmResumeLaunch(request, context(), true, t, h.launcher, h.notify);
      expect(h.toasts[0].message).toBe(t("resume.launch.error.PROCESS_LAUNCH_FAILED"));
    }
  });
});
