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

function card(locale: Locale, claude: ProviderScanResult, codex: ProviderScanResult, stale = false): string {
  return render(
    locale,
    createElement(ReviewIdeSessions, {
      project,
      ideSessions: { status: "loaded", scan: { claude, codex }, fingerprint: [] as unknown as never },
      stale,
      busy: false,
      onRefresh: () => undefined,
      onCopyResume: () => undefined,
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

    it(`(${locale}): with no session row, no resume control is rendered at all`, () => {
      const markup = card(locale, ok([], false), ok([], false));
      expect(markup).not.toContain('data-testid="action-copy-resume"');
      expect(markup).not.toContain('data-testid="resume-notes"');
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

describe("ReviewIdeSessions — copy-only Resume Handoff (Phase 4b-2a, LRP-20260929-DVCC-008)", () => {
  const CODEX_ID = "019c1a2b-3c4d-7e5f-8a9b-0c1d2e3f4a5b";
  const CLAUDE_ID = "3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f";

  function row(overrides: Partial<DiscoveredIdeSession>): DiscoveredIdeSession {
    return {
      provider: "CODEX",
      sessionId: CODEX_ID,
      sourceKind: "HISTORICAL",
      binding: "MATCHED",
      matchedProjectId: "project-alpha",
      candidateProjectIds: [],
      createdAt: null,
      updatedAt: null,
      providerVersion: null,
      archived: false,
      reason: { key: "ideSessions.reason.matchedRepositoryIdentity" },
      ...overrides,
    };
  }

  function resumeStates(markup: string): string[] {
    return [...markup.matchAll(/data-testid="ide-session-resume" data-resume="([A-Z_]+)"/g)].map((m) => m[1]);
  }

  for (const locale of LOCALES) {
    const t = createTranslator(locale);

    it(`(${locale}): an eligible Codex MATCHED row has an enabled Copy Resume Command and the three UI-only notes`, () => {
      const markup = card(locale, ok([], true), ok([row({})], true));
      expect(resumeStates(markup)).toEqual(["ELIGIBLE"]);
      const button = markup.match(/<button[^>]*data-testid="action-copy-resume"[^>]*>([^<]*)<\/button>/)!;
      expect(button[0]).not.toContain("disabled");
      expect(button[0]).not.toContain("aria-disabled");
      expect(button[1]).toBe(t("resume.action.copy"));
      for (const [id, key] of [
        ["resume-note-copy-only", "resume.note.copyOnly"],
        ["resume-note-run-from-workspace", "resume.note.runFromWorkspace"],
        ["resume-note-codex-may-be-open", "resume.note.codexMayBeOpen"],
      ] as const) {
        expect(markup).toContain(`data-testid="${id}">${t(key)}</p>`);
      }
    });

    it(`(${locale}): the notes carry no path, and no full session ID appears as visible text`, () => {
      const markup = card(locale, ok([], true), ok([row({})], true));
      const notesMarkup = markup.slice(markup.indexOf('data-testid="resume-notes"'), markup.indexOf('data-testid="ide-session-row"'));
      const notes = notesMarkup.slice(notesMarkup.indexOf(">") + 1).replace(/<[^>]+>/g, " ");
      expect(notes.trim().length).toBeGreaterThan(0);
      expect(notes).not.toMatch(/[A-Za-z]:\|\\|\/|\.codex|\.claude/);
      expect(markup).not.toContain(`>${CODEX_ID}<`);
    });

    const DISABLED: [string, DiscoveredIdeSession, "claude" | "codex", string, string][] = [
      ["AMBIGUOUS Codex", row({ binding: "AMBIGUOUS", matchedProjectId: null, candidateProjectIds: ["project-alpha", "other"] }), "codex", "NOT_MATCHED", "resume.refusal.notMatched"],
      ["archived Codex", row({ archived: true }), "codex", "ARCHIVED", "resume.refusal.archived"],
      ["invalid-ID Codex", row({ sessionId: "019c1a2b; calc" }), "codex", "INVALID_SESSION_ID", "resume.refusal.invalidSessionId"],
      ["Claude LIVE MATCHED", row({ provider: "CLAUDE_CODE", sourceKind: "LIVE", sessionId: CLAUDE_ID, archived: null, reason: { key: "ideSessions.reason.matchedExactWorkspace" } }), "claude", "ALREADY_ACTIVE", "resume.refusal.alreadyActive"],
      ["Claude historical AMBIGUOUS", row({ provider: "CLAUDE_CODE", sessionId: CLAUDE_ID, binding: "AMBIGUOUS", matchedProjectId: null, candidateProjectIds: ["project-alpha"], archived: null }), "claude", "NOT_MATCHED", "resume.refusal.notMatched"],
    ];

    for (const [name, session, where, state, key] of DISABLED) {
      it(`(${locale}): ${name} -> disabled action with the localized ${state} reason, and no notes`, () => {
        const markup = where === "codex" ? card(locale, ok([], true), ok([session], true)) : card(locale, ok([session], true), ok([], true));
        expect(resumeStates(markup)).toEqual([state]);
        expect(markup).toMatch(/<button[^>]*aria-disabled="true"[^>]*data-testid="action-copy-resume"/);
        expect(markup).toContain(`data-testid="action-copy-resume-reason">${t(key as never)}</span>`);
        expect(markup).not.toContain('data-testid="resume-notes"');
      });
    }

    it(`(${locale}): stale discovery renders no session row and no resume action at all`, () => {
      const markup = card(locale, ok([], true), ok([row({})], true), true);
      expect(markup).toContain('data-testid="ide-sessions-stale"');
      expect(markup).not.toContain('data-testid="action-copy-resume"');
    });

    it(`(${locale}): an incomplete scan keeps its warning AND leaves an individually MATCHED row eligible`, () => {
      const markup = card(locale, ok([], true), ok([row({})], false));
      expect(markup).toContain('data-provider-status="incompleteWithResults"');
      expect(markup).toContain('data-testid="ide-sessions-incomplete-note"');
      expect(resumeStates(markup)).toEqual(["ELIGIBLE"]);
    });

    it(`(${locale}): the card's controls are Refresh plus one Copy Resume Command per row — nothing that runs, attaches or forks`, () => {
      const markup = card(locale, ok([row({ provider: "CLAUDE_CODE", sourceKind: "LIVE", sessionId: CLAUDE_ID, archived: null })], true), ok([row({})], true));
      const buttons = [...markup.matchAll(/<button[^>]*data-testid="([^"]+)"/g)].map((m) => m[1]);
      expect(buttons).toEqual(["action-refresh-ide-sessions", "action-copy-resume", "action-copy-resume"]);
      expect(markup).not.toMatch(/codex resume|claude --resume|attach|fork/i);
    });
  }
});
