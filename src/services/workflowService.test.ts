import { beforeEach, describe, expect, it } from "vitest";
import { emptyProjectForm, type Project } from "../domain/project";
import { emptyReviewForm, type ReviewSession } from "../domain/review";
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
