import { describe, expect, it } from "vitest";
import type { Project } from "./project";
import { buildResolutionFollowup, buildReviewRequest } from "./prompt";
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
    expect(text).toContain("# Independent Review Request (Turn 1 — Initial Review Request) — Project Alpha / R1");
    expect(text).toContain("- Repository: https://github.com/example-org/project-alpha");
    expect(text).toContain("- Pull Request: #45 — https://github.com/example-org/project-alpha/pull/45");
    expect(text).toContain("- Target HEAD: abcdef1234567");
    expect(text).toContain("- Review Round: R1");
    expect(text).toContain("- Previous round: none (first round)");
    expect(text).toContain("## Stage 2 — Fresh Assessment");
  });

  it("includes the same Artifact facts in Japanese, which is the default", () => {
    const input = session({ prNumber: "45", expectedHead: "abcdef1234567" });
    const text = buildReviewRequest(project, input);
    expect(text).toBe(buildReviewRequest(project, input, "ja"));
    expect(text).toContain("# 独立レビュー依頼（Turn 1 — Initial Review Request） — Project Alpha / R1");
    expect(text).toContain("- リポジトリ: https://github.com/example-org/project-alpha");
    expect(text).toContain("- Pull Request: #45 — https://github.com/example-org/project-alpha/pull/45");
    expect(text).toContain("- レビュー対象HEAD: abcdef1234567");
    expect(text).toContain("- ラウンド: R1");
    expect(text).toContain("- 前ラウンド: なし（初回Round）");
    expect(text).toContain("## Stage 2 — Fresh Assessment（Reviewerへの指示）");
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
    expect(ja).toContain("- レビュー対象HEAD: 未記録");

    const en = buildReviewRequest({ ...project, repositoryUrl: null }, session(), "en");
    expect(en).toContain("- Repository: not recorded");
    expect(en).toContain("- Pull Request: not recorded");
    expect(en).toContain("- Target HEAD: not recorded");
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
    expect(buildReviewRequest(project, s)).toContain("- 前ラウンドのHuman確定判定: FIX_REQUIRED");
    const text = buildReviewRequest(project, s, "en");
    expect(text).toContain("/ R2");
    // The verdict is a stored value: it is reported as it is, in either language.
    expect(text).toContain("- Previous round: R1");
    expect(text).toContain("- Verdict the Human confirmed for the previous round: FIX_REQUIRED");
  });
});

describe("buildResolutionFollowup", () => {
  const input = session({ prNumber: "45", expectedHead: "abcdef1234567" });

  it("carries the Stage 3 context and asks for the Stage 4 judgment", () => {
    const text = buildResolutionFollowup(project, input, "en");
    expect(text).toContain("# Resolution Follow-up (Turn 2) — Project Alpha / R1");
    expect(text).toContain("## Stage 3 — Resolution Context");
    expect(text).toContain("## Stage 4 — Final Judgment");
    expect(text).toContain("- Reviewed HEAD: abcdef1234567");
  });

  it("states the two rules the added context comes with", () => {
    const en = buildResolutionFollowup(project, input, "en");
    expect(en).toContain("which added Evidence changed them");
    expect(en).toContain("the Artifact's Evidence wins");
    const ja = buildResolutionFollowup(project, input);
    expect(ja).toContain("どの追加Evidenceによって変わったのか");
    expect(ja).toContain("ArtifactのEvidenceを優先");
  });

  it("carries the same values in both languages", () => {
    const ja = buildResolutionFollowup(project, input, "ja");
    const en = buildResolutionFollowup(project, input, "en");
    for (const value of ["Project Alpha (project-alpha)", "abcdef1234567", "R1"]) {
      expect(ja).toContain(value);
      expect(en).toContain(value);
    }
    expect(ja.split("\n").length).toBe(en.split("\n").length);
  });

  it("never volunteers the local, private context", () => {
    for (const locale of ["ja", "en"] as const) {
      const text = buildResolutionFollowup(project, input, locale);
      // The background is the Human's to write; DVCC does not fill it from the project record.
      expect(text).not.toContain("secret-local-root");
      expect(text).not.toContain("PRIVATE-NOTES");
      expect(text).not.toContain("PRIVATE-NEXT-ACTION");
      expect(text).not.toContain("SESSION-NEXT-ACTION");
    }
  });

  it("marks an unrecorded HEAD instead of guessing", () => {
    expect(buildResolutionFollowup(project, session(), "en")).toContain("- Reviewed HEAD: not recorded");
    expect(buildResolutionFollowup(project, session())).toContain("- レビュー対象HEAD: 未記録");
  });
});
