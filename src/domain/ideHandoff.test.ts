import { describe, expect, it } from "vitest";
import { createTranslator, type Locale } from "../i18n";
import type { Project } from "./project";
import { buildIdeHandoff, renderIdeHandoff, type IdeHandoff } from "./ideHandoff";
import { newRound, type ReviewSession, type RoundRecord } from "./review";

const NOW = "2026-09-27T00:00:00.000Z";
const LOCAL_ROOT_SENTINEL = "C:\\Users\\forbidden-account\\projects\\alpha";
const NOTES_SENTINEL = "PRIVATE_NOTES_MUST_NOT_LEAK";
const THREAD_TITLE_SENTINEL = "PRIVATE_CHATGPT_THREAD_TITLE";
const THREAD_URL_SENTINEL = "https://chatgpt.com/c/forbidden-thread";
const VERDICT_NOTE_SENTINEL = "PRIVATE_VERDICT_NOTE_MUST_NOT_LEAK";
const PROJECT_NEXT_ACTION_SENTINEL = "PROJECT_LEVEL_NEXT_ACTION_MUST_NOT_BE_USED";
const REVIEW_NEXT_ACTION_SENTINEL = "  Review-level next action, verbatim — 次のアクション  ";

function project(overrides: Partial<Project> = {}): Project {
  return {
    projectId: "project-alpha",
    displayName: "Project Alpha",
    repositoryUrl: "https://github.com/example-org/project-alpha",
    localRoot: LOCAL_ROOT_SENTINEL,
    developmentIde: "Claude Code",
    nextAction: PROJECT_NEXT_ACTION_SENTINEL,
    notes: NOTES_SENTINEL,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function round(overrides: Partial<RoundRecord> = {}): RoundRecord {
  return {
    ...newRound(1, "0123456789abcdef0123456789abcdef01234567"),
    reviewedHead: "fedcba9876543210fedcba9876543210fedcba98",
    verdict: "FIX_REQUIRED",
    verdictConfirmedAt: NOW,
    verdictNote: VERDICT_NOTE_SENTINEL,
    ...overrides,
  };
}

function session(overrides: Partial<ReviewSession> = {}, r: RoundRecord = round()): ReviewSession {
  return {
    schemaVersion: 1,
    reviewSessionId: "rv-20260927-001",
    projectId: "project-alpha",
    prNumber: 4,
    reviewType: "PR review",
    reviewRound: r.round,
    resourceState: "HOT",
    reviewState: "FIX_REQUIRED",
    suspendedFrom: null,
    chatgptThreadTitle: THREAD_TITLE_SENTINEL,
    chatgptThreadUrl: THREAD_URL_SENTINEL,
    nextAction: REVIEW_NEXT_ACTION_SENTINEL,
    rounds: [r],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const LOCALES: readonly Locale[] = ["ja", "en"];

describe("buildIdeHandoff / renderIdeHandoff (Phase 4a)", () => {
  it("A: complete recorded facts produce the expected deterministic handoff text", () => {
    const p = project();
    const r = round();
    const s = session({}, r);
    const handoff = buildIdeHandoff(p, s, r, true);
    const t = createTranslator("en");
    const text = renderIdeHandoff(t, handoff);

    expect(text).toBe(
      [
        "# IDE Handoff",
        "",
        "Project",
        "Project Alpha",
        "",
        "Project ID",
        "project-alpha",
        "",
        "Repository",
        "https://github.com/example-org/project-alpha",
        "",
        "Review type",
        "PR review",
        "",
        "PR",
        "#4",
        "",
        "Round",
        "R1",
        "",
        "Review state",
        "Fix required (FIX_REQUIRED)",
        "",
        "Expected HEAD (recorded)",
        "0123456789abcdef0123456789abcdef01234567",
        "",
        "Reviewed HEAD (recorded)",
        "fedcba9876543210fedcba9876543210fedcba98",
        "",
        "Next action",
        REVIEW_NEXT_ACTION_SENTINEL,
        "",
        "Checkpoint",
        "checkpoint.md",
        "",
        "## Boundary",
        "This is a Human-operated handoff.\nDVCC has not opened, resumed or controlled an IDE/session.\nMerge, release and Production require separate authorization.",
      ].join("\n"),
    );
  });

  it("B: JA and EN carry the same fact set and ordering", () => {
    const p = project();
    const r = round();
    const s = session({}, r);
    const handoff = buildIdeHandoff(p, s, r, true);
    const facts = [
      handoff.displayName,
      handoff.projectId,
      handoff.repositoryUrl!,
      String(handoff.prNumber),
      handoff.expectedHead!,
      handoff.reviewedHead!,
      handoff.nextAction,
    ];
    for (const locale of LOCALES) {
      const text = renderIdeHandoff(createTranslator(locale), handoff);
      let cursor = -1;
      for (const fact of facts) {
        const index = text.indexOf(fact);
        expect(index, `${locale}: "${fact}" should appear`).toBeGreaterThan(-1);
        expect(index, `${locale}: "${fact}" should appear in the fixed order`).toBeGreaterThan(cursor);
        cursor = index;
      }
    }
  });

  it("C: the Human's next action is preserved verbatim, including leading/trailing whitespace", () => {
    const p = project();
    const r = round();
    const s = session({ nextAction: REVIEW_NEXT_ACTION_SENTINEL }, r);
    const handoff = buildIdeHandoff(p, s, r, false);
    expect(handoff.nextAction).toBe(REVIEW_NEXT_ACTION_SENTINEL);
    const text = renderIdeHandoff(createTranslator("en"), handoff);
    expect(text).toContain(REVIEW_NEXT_ACTION_SENTINEL);
  });

  it("D: Project.localRoot is absent even when the Project has one", () => {
    const handoff = buildIdeHandoff(project(), session(), round(), true);
    expect(Object.values(handoff)).not.toContain(LOCAL_ROOT_SENTINEL);
    expect(JSON.stringify(handoff)).not.toContain("forbidden-account");
    for (const locale of LOCALES) {
      expect(renderIdeHandoff(createTranslator(locale), handoff)).not.toContain(LOCAL_ROOT_SENTINEL);
    }
  });

  it("E: Project.notes is absent", () => {
    const handoff = buildIdeHandoff(project(), session(), round(), true);
    expect(JSON.stringify(handoff)).not.toContain(NOTES_SENTINEL);
    for (const locale of LOCALES) {
      expect(renderIdeHandoff(createTranslator(locale), handoff)).not.toContain(NOTES_SENTINEL);
    }
  });

  it("F: the ChatGPT thread title/URL are absent", () => {
    const handoff = buildIdeHandoff(project(), session(), round(), true);
    expect(JSON.stringify(handoff)).not.toContain(THREAD_TITLE_SENTINEL);
    expect(JSON.stringify(handoff)).not.toContain(THREAD_URL_SENTINEL);
    for (const locale of LOCALES) {
      const text = renderIdeHandoff(createTranslator(locale), handoff);
      expect(text).not.toContain(THREAD_TITLE_SENTINEL);
      expect(text).not.toContain(THREAD_URL_SENTINEL);
    }
  });

  it("G: review response bodies and the verdict note are absent", () => {
    const handoff = buildIdeHandoff(project(), session(), round(), true);
    expect(JSON.stringify(handoff)).not.toContain(VERDICT_NOTE_SENTINEL);
    for (const locale of LOCALES) {
      expect(renderIdeHandoff(createTranslator(locale), handoff)).not.toContain(VERDICT_NOTE_SENTINEL);
    }
  });

  it("H: missing repository / HEADs / next action / checkpoint follow the same 'not recorded' rule", () => {
    const p = project({ repositoryUrl: null });
    const r: RoundRecord = { ...round(), expectedHead: null, reviewedHead: null };
    const s = session({ nextAction: "", prNumber: null }, r);
    const handoff = buildIdeHandoff(p, s, r, false);
    const t = createTranslator("en");
    const text = renderIdeHandoff(t, handoff);
    const notRecorded = t("detail.value.unrecorded");
    // repository, PR, expected HEAD, reviewed HEAD, next action, checkpoint: six missing facts.
    expect(text.split(notRecorded).length - 1).toBe(6);
    expect(text).not.toContain("checkpoint.md");
  });

  it("I: checkpoint content is never included; only the relative reference may appear when known", () => {
    const withCheckpoint = buildIdeHandoff(project(), session(), round(), true);
    const withoutCheckpoint = buildIdeHandoff(project(), session(), round(), false);
    expect(JSON.stringify(withCheckpoint)).not.toMatch(/checkpoint[\s\S]{0,40}(text|body|content)/i);
    const t = createTranslator("en");
    expect(renderIdeHandoff(t, withCheckpoint)).toContain("checkpoint.md");
    expect(renderIdeHandoff(t, withoutCheckpoint)).not.toContain("checkpoint.md");
  });

  it("J: the builder does not mutate Project, ReviewSession or RoundRecord", () => {
    const p = project();
    const r = round();
    const s = session({}, r);
    const pBefore = structuredClone(p);
    const sBefore = structuredClone(s);
    const rBefore = structuredClone(r);
    const handoff = buildIdeHandoff(p, s, r, true);
    renderIdeHandoff(createTranslator("en"), handoff);
    renderIdeHandoff(createTranslator("ja"), handoff);
    expect(p).toEqual(pBefore);
    expect(s).toEqual(sBefore);
    expect(r).toEqual(rBefore);
  });

  it("K: a locale switch changes only the rendered text, never the underlying IdeHandoff facts", () => {
    const handoff = buildIdeHandoff(project(), session(), round(), true);
    const before: IdeHandoff = structuredClone(handoff);
    renderIdeHandoff(createTranslator("ja"), handoff);
    renderIdeHandoff(createTranslator("en"), handoff);
    expect(handoff).toEqual(before);
    // The two renders differ (they are actually localized) but are built from the same facts (test B).
    expect(renderIdeHandoff(createTranslator("ja"), handoff)).not.toBe(renderIdeHandoff(createTranslator("en"), handoff));
  });
});
