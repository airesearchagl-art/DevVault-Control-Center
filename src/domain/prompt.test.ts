import { describe, expect, it } from "vitest";
import type { Project } from "./project";
import { buildReviewRequest } from "./prompt";
import { createReviewSession, emptyReviewForm } from "./review";
import { applyReviewAction } from "./transitions";

const NOW = "2026-01-01T00:00:00.000Z";
const project: Project = {
  projectId: "project-alpha",
  displayName: "Project Alpha",
  repositoryUrl: "https://github.com/example-org/project-alpha",
  localRoot: "C:\\example\\secret-local-root",
  developmentIde: "Claude Code",
  nextAction: "PRIVATE-NEXT-ACTION",
  notes: "PRIVATE-NOTES",
  createdAt: NOW,
  updatedAt: NOW,
};

function session(overrides: Partial<ReturnType<typeof emptyReviewForm>> = {}) {
  const created = createReviewSession(
    { ...emptyReviewForm("project-alpha"), nextAction: "SESSION-NEXT-ACTION", ...overrides },
    new Set(["project-alpha"]),
    "rv-20260101-alpha1",
    NOW,
  );
  if (!created.ok) throw new Error(JSON.stringify(created.error));
  return created.value.session;
}

describe("buildReviewRequest", () => {
  it("includes the Artifact facts", () => {
    const text = buildReviewRequest(project, session({ prNumber: "45", expectedHead: "abcdef1234567" }));
    expect(text).toContain("# Independent Review Request — Project Alpha / R1");
    expect(text).toContain("- Repository: https://github.com/example-org/project-alpha");
    expect(text).toContain("- Pull Request: #45 — https://github.com/example-org/project-alpha/pull/45");
    expect(text).toContain("- Expected HEAD: abcdef1234567");
    expect(text).toContain("- Review Round: R1");
    expect(text).toContain("- Previous round verdict: なし（初回Round）");
    expect(text).toContain("## Stage 2 — Fresh Assessment");
  });

  it("marks missing facts as 未記録 instead of guessing", () => {
    const text = buildReviewRequest({ ...project, repositoryUrl: null }, session());
    expect(text).toContain("- Repository: 未記録");
    expect(text).toContain("- Pull Request: 未記録");
    expect(text).toContain("- Expected HEAD: 未記録");
  });

  it("excludes local root, notes and next actions", () => {
    const text = buildReviewRequest(project, session({ prNumber: "45" }));
    expect(text).not.toContain("secret-local-root");
    expect(text).not.toContain("PRIVATE-NOTES");
    expect(text).not.toContain("PRIVATE-NEXT-ACTION");
    expect(text).not.toContain("SESSION-NEXT-ACTION");
  });

  it("reports the previous round verdict on re-review", () => {
    let s = session();
    for (const action of [
      { type: "markReady" },
      { type: "startReview" },
      { type: "captureResult", reviewedHead: null },
      { type: "confirmVerdict", verdict: "FIX_REQUIRED", note: null, confirmedByHuman: true },
      { type: "startNextRound", expectedHead: null },
    ] as const) {
      const out = applyReviewAction(s, action, NOW);
      if (!out.ok) throw new Error(out.error);
      s = out.value.session;
    }
    const text = buildReviewRequest(project, s);
    expect(text).toContain("/ R2");
    expect(text).toContain("- Previous round verdict: R1: FIX_REQUIRED");
  });
});
