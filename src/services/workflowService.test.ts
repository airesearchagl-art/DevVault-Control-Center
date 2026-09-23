import { beforeEach, describe, expect, it } from "vitest";
import { emptyProjectForm, type Project } from "../domain/project";
import { buildReviewRequest } from "../domain/prompt";
import { emptyReviewForm, type ReviewSession } from "../domain/review";
import { narrativeOf } from "../features/reviews/ReviewDialogs";
import { MemoryStorage } from "../test/memoryStorage";
import {
  captureFinalJudgment,
  captureReviewResult,
  performReviewAction,
  saveFollowupRequest,
  saveNewProject,
  saveNewReview,
  saveReviewRequest,
} from "./reviewService";

/**
 * Turn 2 and the Final Judgment, at the service layer: which file is written, what survives a
 * replacement, and that the protocol invariant is asked before anything reaches disk. The
 * invariant itself is the domain's (`workflowActions.test.ts`); here it is only observed.
 */

const HEAD = "0123456789abcdef0123456789abcdef01234567";
const REVIEW_ID = "rv-20260101-alpha1";
let clock = 0;
const now = () => new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)).toISOString();

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

let storage: MemoryStorage;
let project: Project;

function file(name: string): string | undefined {
  return storage.files.get(`reviews/${REVIEW_ID}/${name}`);
}

async function act(session: ReviewSession, action: Parameters<typeof performReviewAction>[2]) {
  return unwrap(await performReviewAction(storage, session, action, now())).session;
}

/** A session in REVIEWING whose Turn 1 request is saved: the state Turn 2 is reached from. */
async function reviewing(): Promise<ReviewSession> {
  const projects = unwrap(
    await saveNewProject(
      storage,
      [],
      { status: "missing" },
      {
        ...emptyProjectForm(),
        projectId: "project-alpha",
        displayName: "Project Alpha",
        repositoryUrl: "https://github.com/example-org/project-alpha",
        localRoot: "C:\\example\\project-alpha",
        developmentIde: "Claude Code",
      },
      now(),
    ),
  );
  project = projects[0];
  let session = unwrap(
    await saveNewReview(
      storage,
      projects,
      { ...emptyReviewForm("project-alpha"), prNumber: "45", expectedHead: HEAD },
      REVIEW_ID,
      now(),
    ),
  ).session;
  session = await act(session, { type: "markReady" });
  session = await act(session, { type: "startReview" });
  return unwrap(await saveReviewRequest(storage, project, session, now())).session;
}

beforeEach(async () => {
  storage = new MemoryStorage();
  clock = 0;
});

describe("saving Turn 2", () => {
  it("writes nothing before the Fresh Assessment has come back", async () => {
    const session = await reviewing();
    const refused = await saveFollowupRequest(storage, project, session, now());
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.key).toBe("action.followup.assessmentRequired");
    expect(file("followup-r1.md")).toBeUndefined();
  });

  it("writes followup-r1.md and records the round once the assessment is in", async () => {
    let session = await reviewing();
    session = unwrap(await captureReviewResult(storage, session, "Reviewed HEAD: x\n\n## 修正必須\n1. fix", HEAD, false, now())).session;
    const saved = unwrap(await saveFollowupRequest(storage, project, session, now()));
    expect(saved.session.rounds[0].followupSavedAt).not.toBeNull();
    expect(file("followup-r1.md")).toBe(`${saved.text}`);
    expect(saved.text).toContain("## Stage 3 — Resolution Context");
    expect(saved.text).toContain("## Stage 4 — Final Judgment");
    // Turn 1 and its answer are untouched.
    expect(file("request-r1.md")).toBeDefined();
    expect(file("result-r1.md")).toContain("## 修正必須");
  });

  it("writes the follow-up in the language asked for, and never rewrites a saved one", async () => {
    let session = await reviewing();
    session = unwrap(await captureReviewResult(storage, session, "first assessment", HEAD, false, now())).session;
    session = unwrap(await saveFollowupRequest(storage, project, session, now(), "en")).session;
    expect(file("followup-r1.md")).toContain("# Resolution Follow-up (Turn 2)");
    const english = file("followup-r1.md");
    // Re-saving while the follow-up is still unanswered is allowed; the language follows the ask.
    unwrap(await saveFollowupRequest(storage, project, session, now(), "ja"));
    expect(file("followup-r1.md")).toContain("# 解決フォローアップ（Turn 2）");
    expect(file("followup-r1.md")).not.toBe(english);
  });
});

describe("Turn 2 carries the Human's narrative (RF-WF-01)", () => {
  const narrative = {
    background: "BACKGROUND-MARKER: 背景は「移行の安全性」です。\n二行目 — second line",
    decisions: 'DECISIONS-MARKER: keep schemaVersion 1; <tags> & "quotes" stay as typed',
    tradeoffs: "TRADEOFF-MARKER: 速度より可読性",
  };
  const markers = [
    "BACKGROUND-MARKER: 背景は「移行の安全性」です。",
    "二行目 — second line",
    'DECISIONS-MARKER: keep schemaVersion 1; <tags> & "quotes" stay as typed',
    "TRADEOFF-MARKER: 速度より可読性",
  ];

  async function assessed(): Promise<ReviewSession> {
    const session = await reviewing();
    return unwrap(await captureReviewResult(storage, session, "the fresh assessment", HEAD, false, now())).session;
  }

  it.each(["ja", "en"] as const)("stores the Human's words verbatim, and returns exactly the stored text (%s)", async (locale) => {
    const saved = unwrap(await saveFollowupRequest(storage, project, await assessed(), now(), locale, narrative));
    for (const marker of markers) expect(file("followup-r1.md")).toContain(marker);
    // The copied text and the artifact are one and the same string.
    expect(file("followup-r1.md")).toBe(saved.text);
    expect(saved.text.endsWith("\n")).toBe(true);
    // Only inside Stage 3.
    const stage4 = saved.text.slice(saved.text.indexOf("## Stage 4"));
    for (const marker of ["BACKGROUND-MARKER", "DECISIONS-MARKER", "TRADEOFF-MARKER"]) expect(stage4).not.toContain(marker);
  });

  it.each(["ja", "en"] as const)("blank fields leave the canonical placeholder (%s)", async (locale) => {
    const blank = narrativeOf({ background: "", decisions: "   ", tradeoffs: "TRADEOFF-MARKER" });
    const saved = unwrap(await saveFollowupRequest(storage, project, await assessed(), now(), locale, blank));
    const placeholder = locale === "ja" ? "<!-- Humanが記入 -->" : "<!-- filled in by the Human -->";
    expect(saved.text.split(placeholder).length - 1).toBe(2);
    expect(saved.text).toContain("TRADEOFF-MARKER");
  });

  it("each dialog field reaches its own narrative item", () => {
    expect(narrativeOf({ background: "A", decisions: "B", tradeoffs: "C" })).toEqual({ background: "A", decisions: "B", tradeoffs: "C" });
    expect(narrativeOf({ background: "", decisions: "", tradeoffs: "" })).toEqual({ background: null, decisions: null, tradeoffs: null });
  });

  it("the narrative never reaches Turn 1, before or after Turn 2", async () => {
    const session = unwrap(await saveFollowupRequest(storage, project, await assessed(), now(), "ja", narrative)).session;
    for (const text of [file("request-r1.md")!, buildReviewRequest(project, session, "ja"), buildReviewRequest(project, session, "en")]) {
      for (const marker of ["BACKGROUND-MARKER", "DECISIONS-MARKER", "TRADEOFF-MARKER"]) expect(text).not.toContain(marker);
    }
  });

  it("once the Final Judgment is in, no narrative and no language can rewrite the follow-up", async () => {
    let session = unwrap(await saveFollowupRequest(storage, project, await assessed(), now(), "ja", narrative)).session;
    session = unwrap(await captureFinalJudgment(storage, session, "final judgment", false, now())).session;
    const stored = file("followup-r1.md");
    const events = file("events.jsonl");
    for (const locale of ["ja", "en"] as const) {
      const refused = await saveFollowupRequest(storage, project, session, now(), locale, { background: "REWRITE-ATTEMPT" });
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error.key).toBe("action.followup.judgmentCaptured");
    }
    expect(file("followup-r1.md")).toBe(stored);
    expect(file("events.jsonl")).toBe(events);
  });
});

describe("capturing the Final Judgment", () => {
  async function awaitingJudgment(): Promise<ReviewSession> {
    let session = await reviewing();
    session = unwrap(await captureReviewResult(storage, session, "the fresh assessment", HEAD, false, now())).session;
    return unwrap(await saveFollowupRequest(storage, project, session, now())).session;
  }

  it("refuses before Turn 2 has gone out, and writes nothing", async () => {
    let session = await reviewing();
    session = unwrap(await captureReviewResult(storage, session, "the fresh assessment", HEAD, false, now())).session;
    const refused = await captureFinalJudgment(storage, session, "final judgment", false, now());
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.key).toBe("action.judgment.followupRequired");
    expect(file("judgment-r1.md")).toBeUndefined();
  });

  it("refuses an empty judgment", async () => {
    const session = await awaitingJudgment();
    const refused = await captureFinalJudgment(storage, session, "   ", false, now());
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.key).toBe("service.judgmentRequired");
  });

  it("keeps both reviewer responses of the round", async () => {
    const session = await awaitingJudgment();
    const saved = unwrap(await captureFinalJudgment(storage, session, "the final judgment", false, now()));
    expect(file("judgment-r1.md")).toBe("the final judgment\n");
    expect(file("result-r1.md")).toBe("the fresh assessment\n");
    expect(saved.session.rounds[0].judgmentCapturedAt).not.toBeNull();
    expect(saved.session.rounds[0].resultCapturedAt).not.toBeNull();
    expect(saved.archivedAs).toBeNull();
  });

  it("refuses to replace a recorded judgment without an explicit confirmation", async () => {
    let session = await awaitingJudgment();
    session = unwrap(await captureFinalJudgment(storage, session, "first judgment", false, now())).session;
    const refused = await captureFinalJudgment(storage, session, "second judgment", false, now());
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.key).toBe("action.judgment.replaceConfirmationRequired");
    expect(file("judgment-r1.md")).toBe("first judgment\n");
  });

  it("archives the replaced judgment under its own name, apart from the results", async () => {
    let session = await awaitingJudgment();
    session = unwrap(await captureFinalJudgment(storage, session, "first judgment", false, now())).session;
    const replaced = unwrap(await captureFinalJudgment(storage, session, "second judgment", true, now()));
    const archivedAs = replaced.archivedAs;
    expect(archivedAs).toMatch(/^judgment-r1-previous-\d+\.md$/);
    expect(file(archivedAs!)).toBe("first judgment\n");
    expect(file("judgment-r1.md")).toBe("second judgment\n");
    expect(replaced.session.rounds[0].archivedJudgments).toEqual([archivedAs]);
    // The Fresh Assessment and its own archive list are untouched by a judgment replacement.
    expect(replaced.session.rounds[0].archivedResults).toEqual([]);
    expect(file("result-r1.md")).toBe("the fresh assessment\n");
  });

  it("still archives a replaced result under the result names", async () => {
    let session = await awaitingJudgment();
    session = unwrap(await captureFinalJudgment(storage, session, "first judgment", false, now())).session;
    const replaced = unwrap(await captureReviewResult(storage, session, "second assessment", HEAD, true, now()));
    expect(replaced.archivedAs).toMatch(/^result-r1-previous-\d+\.md$/);
    expect(replaced.session.rounds[0].archivedJudgments).toEqual([]);
    expect(file("judgment-r1.md")).toBe("first judgment\n");
  });
});
