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
  it("includes the Artifact facts in English", () => {
    const text = buildReviewRequest(project, session({ prNumber: "45", expectedHead: "abcdef1234567" }), "en");
    expect(text).toContain("# Independent Review Request — Project Alpha / R1");
    expect(text).toContain("- Repository: https://github.com/example-org/project-alpha");
    expect(text).toContain("- Pull Request: #45 — https://github.com/example-org/project-alpha/pull/45");
    expect(text).toContain("- Expected HEAD: abcdef1234567");
    expect(text).toContain("- Review Round: R1");
    expect(text).toContain("- Previous round verdict: none (first round)");
    expect(text).toContain("## Stage 2 — Fresh Assessment");
  });

  it("includes the same Artifact facts in Japanese, which is the default", () => {
    const input = session({ prNumber: "45", expectedHead: "abcdef1234567" });
    const text = buildReviewRequest(project, input);
    expect(text).toBe(buildReviewRequest(project, input, "ja"));
    expect(text).toContain("# 独立レビュー依頼 — Project Alpha / R1");
    expect(text).toContain("- リポジトリ: https://github.com/example-org/project-alpha");
    expect(text).toContain("- Pull Request: #45 — https://github.com/example-org/project-alpha/pull/45");
    expect(text).toContain("- レビュー予定HEAD: abcdef1234567");
    expect(text).toContain("- ラウンド: R1");
    expect(text).toContain("- 前ラウンドの判定: なし（初回Round）");
    expect(text).toContain("## Stage 2 — Fresh Assessment（独立評価）");
  });

  it("carries the same values in both languages", () => {
    const input = session({ prNumber: "45", expectedHead: "abcdef1234567" });
    const ja = buildReviewRequest(project, input, "ja");
    const en = buildReviewRequest(project, input, "en");
    for (const value of [
      "Project Alpha (project-alpha)",
      "https://github.com/example-org/project-alpha",
      "#45 — https://github.com/example-org/project-alpha/pull/45",
      "abcdef1234567",
    ]) {
      expect(ja).toContain(value);
      expect(en).toContain(value);
    }
    // Same number of lines in the same order: the two versions differ in words, not in structure.
    expect(ja.split("\n").length).toBe(en.split("\n").length);
  });

  it("marks missing facts as not recorded instead of guessing", () => {
    const ja = buildReviewRequest({ ...project, repositoryUrl: null }, session(), "ja");
    expect(ja).toContain("- リポジトリ: 未記録");
    expect(ja).toContain("- Pull Request: 未記録");
    expect(ja).toContain("- レビュー予定HEAD: 未記録");

    const en = buildReviewRequest({ ...project, repositoryUrl: null }, session(), "en");
    expect(en).toContain("- Repository: not recorded");
    expect(en).toContain("- Pull Request: not recorded");
    expect(en).toContain("- Expected HEAD: not recorded");
  });

  it.each(["ja", "en"] as const)("excludes local root, notes and next actions (%s)", (locale) => {
    const text = buildReviewRequest(project, session({ prNumber: "45" }), locale);
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
      if (!out.ok) throw new Error(JSON.stringify(out.error));
      s = out.value.session;
    }
    expect(buildReviewRequest(project, s)).toContain("- 前ラウンドの判定: R1: FIX_REQUIRED");
    const text = buildReviewRequest(project, s, "en");
    expect(text).toContain("/ R2");
    // The verdict is a stored value: it is reported as it is, in either language.
    expect(text).toContain("- Previous round verdict: R1: FIX_REQUIRED");
  });
});
