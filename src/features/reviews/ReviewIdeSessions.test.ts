import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DiscoveredIdeSession, ProviderScanResult } from "../../domain/ideSessionDiscovery";
import type { Project } from "../../domain/project";
import { createTranslator, type Locale } from "../../i18n";
import { I18nContext } from "../../i18n/context";
import { ReviewIdeSessions } from "./ReviewIdeSessions";

/**
 * Independent Review RF-P4B1-02 final closure, regression tests E and F (Task Packet §8):
 *
 * E: an incomplete provider scan with no relevant session must never render as a normal "No match"
 *    conclusion — a cap or timeout stopped enumeration, so absence was never actually confirmed.
 * F: a complete provider scan with no relevant session must still render as a normal "No match" — the
 *    completeness signal must not suppress a real, fully-confirmed negative result.
 */

const NOW = "2026-01-01T00:00:00.000Z";
const LOCALES: readonly Locale[] = ["ja", "en"];

const project: Project = {
  projectId: "project-alpha",
  displayName: "Project Alpha",
  repositoryUrl: null,
  localRoot: "C:\\work\\alpha",
  developmentIde: null,
  nextAction: "",
  notes: "",
  createdAt: NOW,
  updatedAt: NOW,
};

function render(locale: Locale, element: ReactElement): string {
  return renderToStaticMarkup(
    createElement(I18nContext.Provider, { value: { locale, t: createTranslator(locale), setLocale: () => undefined } }, element),
  );
}

function ok(sessions: DiscoveredIdeSession[], complete: boolean): ProviderScanResult {
  return { status: "ok", sessions, complete };
}

function card(locale: Locale, claude: ProviderScanResult, codex: ProviderScanResult): string {
  return render(
    locale,
    createElement(ReviewIdeSessions, {
      project,
      ideSessions: { status: "loaded", scan: { claude, codex }, fingerprint: [] as unknown as never },
      stale: false,
      busy: false,
      onRefresh: () => undefined,
    }),
  );
}

describe("ReviewIdeSessions — incomplete-scan semantics (RF-P4B1-02 final closure)", () => {
  for (const locale of LOCALES) {
    it(`E (${locale}): incomplete scan + no relevant session never renders as a normal NO_MATCH`, () => {
      const markup = card(locale, ok([], false), ok([], true));
      // The CLAUDE_CODE provider (incomplete, empty) must carry the incomplete marker, never the
      // normal empty/no-match marker — even though the CODEX provider alongside it (complete, empty)
      // legitimately does say "empty" (regression F, exercised together to prove no cross-talk).
      const claudeSection = markup.slice(
        markup.indexOf('data-testid="ide-sessions-provider-CLAUDE_CODE"'),
        markup.indexOf('data-testid="ide-sessions-provider-CODEX"'),
      );
      expect(claudeSection).toContain('data-provider-status="incomplete"');
      expect(claudeSection).not.toContain('data-provider-status="empty"');
    });

    it(`F (${locale}): a complete scan + no relevant session still produces the normal NO_MATCH result`, () => {
      const markup = card(locale, ok([], true), ok([], true));
      expect(markup).toContain('data-provider-status="empty"');
      expect(markup).not.toContain('data-provider-status="incomplete"');
    });

    it(`(${locale}): an incomplete scan that DID find a relevant session shows the sessions plus a visible incomplete note`, () => {
      const session: DiscoveredIdeSession = {
        provider: "CLAUDE_CODE",
        sessionId: "s-1",
        sourceKind: "LIVE",
        binding: "MATCHED",
        matchedProjectId: "project-alpha",
        candidateProjectIds: [],
        createdAt: null,
        updatedAt: null,
        providerVersion: null,
        archived: false,
        reason: { key: "ideSessions.reason.matchedExactWorkspace" },
      };
      const markup = card(locale, ok([session], false), ok([], true));
      expect(markup).toContain('data-provider-status="incompleteWithResults"');
      expect(markup).toContain('data-testid="ide-sessions-incomplete-note"');
      expect(markup).toContain('data-testid="ide-session-row"');
    });

    it(`(${locale}): no Resume action is ever rendered on the IDE Sessions card`, () => {
      const markup = card(locale, ok([], false), ok([], false));
      expect(markup.toLowerCase()).not.toContain("resume");
    });
  }
});
