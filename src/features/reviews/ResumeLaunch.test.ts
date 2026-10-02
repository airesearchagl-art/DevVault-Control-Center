import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ResumeLaunchRequest } from "../../app/launchCodexResumeAction";
import type { DiscoveredIdeSession, ProviderScanResult } from "../../domain/ideSessionDiscovery";
import type { Project } from "../../domain/project";
import { createTranslator, LAUNCH_REFUSAL_KEYS, type Locale } from "../../i18n";
import { I18nContext } from "../../i18n/context";
import { CodexExecutableDialog } from "../settings/CodexExecutableDialog";
import { ResumeLaunchDialog } from "./ResumeLaunchDialog";
import { ReviewIdeSessions } from "./ReviewIdeSessions";

/** Phase 4b-2b UI (LRP-20261002-DVCC-010 §6/§14/§15/§26). Synthetic values only. */

const NOW = "2026-10-02T00:00:00.000Z";
const LOCALES: readonly Locale[] = ["ja", "en"];
const FULL_ID = "019c1a2b-3c4d-7e5f-8a9b-0c1d2e3f4a5b";
const ROOT = "C:\\synthetic\\workspace";
const EXE = "C:\\synthetic\\tools\\codex.exe";

const project: Project = {
  projectId: "project-alpha",
  displayName: "Project Alpha",
  repositoryUrl: "https://github.com/example-org/alpha",
  localRoot: ROOT,
  developmentIde: null,
  nextAction: "",
  notes: "",
  createdAt: NOW,
  updatedAt: NOW,
};

function render(locale: Locale, element: ReactElement): string {
  return renderToStaticMarkup(createElement(I18nContext.Provider, { value: { locale, t: createTranslator(locale), setLocale: () => undefined } }, element));
}

function session(overrides: Partial<DiscoveredIdeSession> = {}): DiscoveredIdeSession {
  return {
    provider: "CODEX",
    sessionId: FULL_ID,
    sourceKind: "HISTORICAL",
    binding: "MATCHED",
    matchedProjectId: project.projectId,
    candidateProjectIds: [],
    createdAt: null,
    updatedAt: null,
    providerVersion: "0.153.4",
    archived: false,
    reason: { key: "ideSessions.reason.matchedRepositoryIdentity" },
    ...overrides,
  };
}

function ok(sessions: DiscoveredIdeSession[]): ProviderScanResult {
  return { status: "ok", sessions, complete: true };
}

function card(locale: Locale, options: { codex?: readonly DiscoveredIdeSession[]; claude?: readonly DiscoveredIdeSession[]; stale?: boolean; exe?: string | null; proj?: Project } = {}) {
  return render(
    locale,
    createElement(ReviewIdeSessions, {
      project: options.proj ?? project,
      ideSessions: { status: "loaded", scan: { claude: ok([...(options.claude ?? [])]), codex: ok([...(options.codex ?? [session()])]) }, fingerprint: [] as unknown as never },
      stale: options.stale ?? false,
      busy: false,
      onRefresh: () => undefined,
      onCopyResume: () => undefined,
      resumeLaunch: { codexExecutablePath: options.exe === undefined ? EXE : options.exe, onRequest: () => undefined },
    }),
  );
}

function launchState(markup: string): string | null {
  return /data-testid="ide-session-launch" data-launch="([A-Z_]+)"/.exec(markup)?.[1] ?? null;
}

describe("ReviewIdeSessions — Resume in Codex button", () => {
  for (const locale of LOCALES) {
    const t = createTranslator(locale);

    it(`(${locale}) an eligible Codex row gets an enabled Resume in Codex, and Copy Resume Command stays available`, () => {
      const markup = card(locale);
      expect(launchState(markup)).toBe("ELIGIBLE");
      expect(markup).toContain(t("resume.action.launch"));
      expect(markup).toContain('data-testid="action-copy-resume"');
      expect(markup).toMatch(/data-resume="ELIGIBLE"/);
      // The row shows the abbreviated label, never the executable or the root.
      expect(markup).not.toContain(EXE);
      expect(markup).not.toContain(ROOT);
    });

    it.each([
      ["archived", { codex: [session({ archived: true })] }, "ARCHIVED"],
      ["invalid id", { codex: [session({ sessionId: "019C1A2B-3C4D-7E5F-8A9B-0C1D2E3F4A5B" })] }, "INVALID_SESSION_ID"],
      ["no local root", { proj: { ...project, localRoot: null } }, "NO_LOCAL_ROOT"],
      ["executable not configured", { exe: null }, "CODEX_EXECUTABLE_NOT_CONFIGURED"],
    ] as const)(`(${locale}) %s: the launch button is disabled with its reason`, (_label, options, reason) => {
      const markup = card(locale, options);
      expect(launchState(markup)).toBe(reason);
      expect(markup).toContain(t(LAUNCH_REFUSAL_KEYS[reason]));
    });

    it(`(${locale}) stale discovery renders no row and therefore no launch control at all`, () => {
      const markup = card(locale, { stale: true });
      expect(markup).toContain('data-testid="ide-sessions-stale"');
      expect(markup).not.toContain('data-testid="action-launch-resume"');
    });

    it(`(${locale}) Claude Code rows never get a launch button`, () => {
      const markup = card(locale, { codex: [], claude: [session({ provider: "CLAUDE_CODE", sourceKind: "LIVE" })] });
      expect(markup).toContain('data-testid="ide-session-row"');
      expect(markup).not.toContain('data-testid="action-launch-resume"');
    });
  }

  it("without the launch wiring the 4b-2a card renders exactly as before (no launch control)", () => {
    const markup = render(
      "en",
      createElement(ReviewIdeSessions, {
        project,
        ideSessions: { status: "loaded", scan: { claude: ok([]), codex: ok([session()]) }, fingerprint: [] as unknown as never },
        stale: false,
        busy: false,
        onRefresh: () => undefined,
        onCopyResume: () => undefined,
      }),
    );
    expect(markup).not.toContain('data-testid="action-launch-resume"');
    expect(markup).toContain('data-testid="action-copy-resume"');
  });
});

const request: ResumeLaunchRequest = {
  sessionId: FULL_ID as ResumeLaunchRequest["sessionId"],
  projectId: project.projectId,
  projectDisplayName: project.displayName,
  sessionLabel: "019c1a2b…4a5b",
  workspaceWarning: false,
};

function dialog(locale: Locale, workspaceWarning: boolean): string {
  return render(locale, createElement(ResumeLaunchDialog, { request: { ...request, workspaceWarning }, onConfirm: async () => undefined, onCancel: () => undefined }));
}

describe("ResumeLaunchDialog", () => {
  for (const locale of LOCALES) {
    const t = createTranslator(locale);

    it(`(${locale}) shows provider, Project name, abbreviated label and action — and no path, full ID, executable or repository`, () => {
      const markup = dialog(locale, false);
      expect(markup).toContain(t("ideSessions.provider.codex"));
      expect(markup).toContain("Project Alpha");
      expect(markup).toContain("019c1a2b…4a5b");
      expect(markup).toContain(t("resume.launch.dialog.actionValue"));
      for (const forbidden of [FULL_ID, ROOT, EXE, "codex.exe", "github.com", "synthetic", ".codex"]) expect(markup).not.toContain(forbidden);
    });

    it(`(${locale}) requires the already-open acknowledgement: the checkbox starts unchecked and confirm starts disabled`, () => {
      const markup = dialog(locale, false);
      expect(markup).toContain(t("resume.launch.dialog.warningAlreadyOpen"));
      expect(markup).toContain(t("resume.launch.dialog.acknowledge"));
      expect(markup).toMatch(/<input type="checkbox" data-testid="resume-launch-acknowledge"\/>/);
      expect(markup).toMatch(/<button type="button" class="primary" disabled="" data-testid="resume-launch-confirm">/);
      expect(markup).toContain(t("resume.launch.dialog.warningProcessOnly"));
    });

    it(`(${locale}) shows the workspace warning only when the native preflight asked for it`, () => {
      expect(dialog(locale, false)).not.toContain('data-testid="resume-launch-warning-workspace"');
      const warned = dialog(locale, true);
      expect(warned).toContain('data-testid="resume-launch-warning-workspace"');
      expect(warned).toContain(t("resume.launch.dialog.warningWorkspace"));
    });
  }

  it("uses the Task Packet's wording", () => {
    const en = createTranslator("en");
    expect(en("resume.launch.dialog.warningAlreadyOpen")).toBe(
      "DVCC cannot determine whether this Codex session is already open. Opening the same session in more than one client may cause conflicts.",
    );
    expect(en("resume.launch.dialog.warningWorkspace")).toBe("Codex may ask which workspace to use.");
    expect(en("resume.launch.dialog.acknowledge")).toBe("I understand and want to open a new Codex process.");
    expect(en("resume.launch.dialog.actionValue")).toBe("Open a new Codex process for this session");
  });
});

describe("CodexExecutableDialog", () => {
  for (const locale of LOCALES) {
    const t = createTranslator(locale);
    it(`(${locale}) shows Not configured, the input and Validate and save; the path appears only here`, () => {
      const empty = render(locale, createElement(CodexExecutableDialog, { storedPath: null, validate: async () => true, onSave: async () => true, onClose: () => undefined }));
      expect(empty).toContain(t("codexSettings.state.notConfigured"));
      expect(empty).toContain(t("codexSettings.action.save"));
      const configured = render(locale, createElement(CodexExecutableDialog, { storedPath: EXE, validate: async () => true, onSave: async () => true, onClose: () => undefined }));
      expect(configured).toContain(EXE.replace(/\\/g, "\\"));
      expect(configured).toContain('data-status="checking"');
    });
  }
});
