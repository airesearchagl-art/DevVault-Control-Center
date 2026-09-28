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

describe("ReviewIdeSessions — session ID labels (DF-03, LRP-20260929-DVCC-007)", () => {
  // Synthetic UUIDv7-shaped IDs (timestamp first): all share their first 8 hex characters, and two
  // also share their last 8 — the collision shape seen in the post-merge dogfood. No real ID is used.
  const IDS = [
    "019c1a2b-0001-7aaa-8aaa-000000000001",
    "019c1a2b-3c4d-7bbb-8bbb-000000000002",
    "019c1a2b-9f00-7ccc-8ccc-0000cafe0003",
    "019c1a2b-9f00-7ddd-8ddd-0000cafe0003",
  ];

  function codexMatched(sessionId: string): DiscoveredIdeSession {
    return {
      provider: "CODEX",
      sessionId,
      sourceKind: "HISTORICAL",
      binding: "MATCHED",
      matchedProjectId: "project-alpha",
      candidateProjectIds: [],
      createdAt: null,
      updatedAt: null,
      providerVersion: null,
      archived: false,
      reason: { key: "ideSessions.reason.matchedRepositoryIdentity" },
    };
  }

  function renderedIds(markup: string): string[] {
    return [...markup.matchAll(/data-testid="ide-session-id">([^<]*)</g)].map((m) => m[1]);
  }

  it("IDs sharing their first 8 characters render as distinct labels", () => {
    const labels = renderedIds(card("en", ok([], true), ok(IDS.map(codexMatched), true)));
    expect(labels).toHaveLength(IDS.length);
    expect(new Set(labels).size).toBe(IDS.length);
    for (const label of labels) expect(label).not.toMatch(/^019c1a2b…$/);
  });

  it("labels are deterministic across renders and identical in JA and EN", () => {
    const codex = ok(IDS.map(codexMatched), true);
    const en1 = renderedIds(card("en", ok([], true), codex));
    const en2 = renderedIds(card("en", ok([], true), codex));
    const ja = renderedIds(card("ja", ok([], true), codex));
    expect(en2).toEqual(en1);
    expect(ja).toEqual(en1);
  });

  it("a single short ID remains readable as-is", () => {
    expect(renderedIds(card("en", ok([], true), ok([codexMatched("t-1")], true)))).toEqual(["t-1"]);
  });

  it("the underlying session ID is unchanged by labelling (full ID never altered, label derived from it)", () => {
    const labels = renderedIds(card("en", ok([], true), ok(IDS.map(codexMatched), true)));
    IDS.forEach((id, i) => {
      const [head, tail] = labels[i].split("…");
      expect(id.startsWith(head)).toBe(true);
      expect(id.endsWith(tail)).toBe(true);
    });
  });
});
