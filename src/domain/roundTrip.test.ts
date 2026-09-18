import { describe, expect, it } from "vitest";
import { createProject, emptyProjectForm, updateProject, type ProjectFormInput } from "./project";
import { createReviewSession, emptyReviewForm, type ReviewFormInput } from "./review";
import { parseProjectsFile, parseSessionFile, serializeProjectsFile, serializeSession } from "./schema";
import { applyReviewAction } from "./transitions";
import {
  normalizeChatgptThreadUrl,
  normalizeHead,
  normalizeLocalRoot,
  normalizeRepositoryUrl,
} from "./validation";

/**
 * F-1: anything the app accepts and writes must be accepted again when it is read back.
 * These tests use only the public normalize / create / serialize / parse functions.
 */

const NOW = "2026-02-01T00:00:00.000Z";
const LATER = "2026-02-02T00:00:00.000Z";

// [input, expected canonical form or null when the input must be rejected]
const REPOSITORY_CASES: [string, string | null][] = [
  ["https://github.com/example-org/project-alpha", "https://github.com/example-org/project-alpha"],
  ["https://github.com/example-org/project-alpha.git", "https://github.com/example-org/project-alpha"],
  ["https://github.com/example-org/project-alpha.git.git", "https://github.com/example-org/project-alpha"],
  ["https://github.com/example-org/project-alpha.GIT", "https://github.com/example-org/project-alpha"],
  ["https://github.com/example-org/project-alpha.git.GIT.git", "https://github.com/example-org/project-alpha"],
  ["https://github.com/example-org/project-alpha/", "https://github.com/example-org/project-alpha"],
  ["https://github.com/example-org/project-alpha.git/", "https://github.com/example-org/project-alpha"],
  ["https://github.com//example-org//project-alpha//", "https://github.com/example-org/project-alpha"],
  ["  https://github.com/example-org/project-alpha  ", "https://github.com/example-org/project-alpha"],
  ["HTTPS://GitHub.COM/example-org/project-alpha", "https://github.com/example-org/project-alpha"],
  ["https://github.com/Example-Org/Project.Alpha_1", "https://github.com/Example-Org/Project.Alpha_1"],
  ["https://github.com:443/example-org/project-alpha", "https://github.com/example-org/project-alpha"],
  ["https://github.com/example-org/a.b.git", "https://github.com/example-org/a.b"],
  // rejected: userinfo
  ["https://user@github.com/example-org/project-alpha", null],
  ["https://user:pass@github.com/example-org/project-alpha", null],
  ["https://github.com@evil.example/example-org/project-alpha", null],
  // rejected: host
  ["https://evil.example/example-org/project-alpha", null],
  ["https://github.com.evil.example/example-org/project-alpha", null],
  ["https://api.github.com/example-org/project-alpha", null],
  ["https://github.com./example-org/project-alpha", null],
  // rejected: scheme
  ["http://github.com/example-org/project-alpha", null],
  ["git@github.com:example-org/project-alpha.git", null],
  ["ssh://git@github.com/example-org/project-alpha.git", null],
  ["javascript:alert(1)", null],
  // rejected: shape
  ["https://github.com/example-org", null],
  ["https://github.com/example-org/.git", null],
  ["https://github.com/example-org/.git.git", null],
  ["https://github.com/example-org/project-alpha/pull/1", null],
  ["https://github.com/example-org/project-alpha?tab=readme", null],
  ["https://github.com/example-org/project-alpha#readme", null],
  ["https://github.com/-bad-owner/project-alpha", null],
  ["https://github.com/example-org/pro%20ject", null],
  ["https://github.com:8443/example-org/project-alpha", null],
];

describe("repository URL normalization (F-1)", () => {
  it.each(REPOSITORY_CASES)("%s → %s", (input, expected) => {
    const first = normalizeRepositoryUrl(input);
    if (expected === null) {
      expect(first.ok).toBe(false);
      return;
    }
    expect(first).toEqual({ ok: true, value: expected });
  });

  it.each(REPOSITORY_CASES.filter(([, expected]) => expected !== null))("is idempotent for %s", (input) => {
    const first = normalizeRepositoryUrl(input);
    if (!first.ok) throw new Error(first.error);
    expect(normalizeRepositoryUrl(first.value)).toEqual(first);
  });

  it("regression: .git.git is stored as the bare repository and reloads", () => {
    const created = createProject(
      { ...emptyProjectForm(), projectId: "project-alpha", displayName: "Project Alpha", repositoryUrl: "https://github.com/example-org/beta.git.git" },
      new Set(),
      NOW,
    );
    if (!created.ok) throw new Error(JSON.stringify(created.error));
    expect(created.value.repositoryUrl).toBe("https://github.com/example-org/beta");
    expect(parseProjectsFile(serializeProjectsFile([created.value]))).toEqual({ status: "ok", value: [created.value] });
  });
});

describe("other normalizers are idempotent", () => {
  it.each([
    "https://chatgpt.com/c/example-thread-alpha",
    "https://CHATGPT.com/c/example-thread-alpha/",
    "https://chat.openai.com/c/example-thread-beta?model=x#frag",
    "https://chatgpt.com:443/g/example-gpt",
  ])("chatgpt thread URL %s", (input) => {
    const first = normalizeChatgptThreadUrl(input);
    if (!first.ok) throw new Error(first.error);
    expect(normalizeChatgptThreadUrl(first.value)).toEqual(first);
  });

  it.each(["  C:\\example\\project-alpha  ", "d:/example/project", "C:\\"])("local root %s", (input) => {
    const first = normalizeLocalRoot(input);
    if (!first.ok) throw new Error(first.error);
    expect(normalizeLocalRoot(first.value)).toEqual(first);
  });

  it.each([" ABCDEF1 ", "0123456789ABCDEF0123456789abcdef01234567"])("HEAD %s", (input) => {
    const first = normalizeHead(input);
    if (!first.ok) throw new Error(first.error);
    expect(normalizeHead(first.value)).toEqual(first);
  });
});

const PROJECT_INPUTS: ProjectFormInput[] = REPOSITORY_CASES.filter(([, expected]) => expected !== null).map(([repositoryUrl], index) => ({
  projectId: `project-${index + 1}`,
  displayName: `  Project ${index + 1}  `,
  repositoryUrl,
  localRoot: index % 2 === 0 ? `  C:\\example\\project-${index}  ` : "",
  developmentIde: index % 3 === 0 ? "  Claude Code  " : "",
  nextAction: "  next  ",
  notes: index % 2 === 0 ? "note with 日本語 and \"quotes\"" : "",
}));

describe("save → reload → validate round-trip for every accepted input (F-1 / AC-18)", () => {
  it("projects created from accepted form input reload unchanged", () => {
    const projects = PROJECT_INPUTS.map((input) => {
      const created = createProject(input, new Set(), NOW);
      if (!created.ok) throw new Error(`${input.repositoryUrl}: ${JSON.stringify(created.error)}`);
      return created.value;
    });
    const reloaded = parseProjectsFile(serializeProjectsFile(projects));
    expect(reloaded).toEqual({ status: "ok", value: projects });

    // Editing with the reloaded values as form input also round-trips (edit → save → reload).
    if (reloaded.status !== "ok") return;
    const edited = reloaded.value.map((project, index) => {
      const updated = updateProject(project, { ...PROJECT_INPUTS[index], repositoryUrl: project.repositoryUrl ?? "" }, LATER);
      if (!updated.ok) throw new Error(JSON.stringify(updated.error));
      return updated.value;
    });
    expect(parseProjectsFile(serializeProjectsFile(edited))).toEqual({ status: "ok", value: edited });
  });

  const REVIEW_INPUTS: Partial<ReviewFormInput>[] = [
    {},
    { prNumber: " 45 ", expectedHead: " ABCDEF1234567 ", chatgptThreadTitle: "  Alpha  ", chatgptThreadUrl: "https://CHATGPT.com/c/example-thread-alpha/" },
    { reviewType: "  Re-review  ", chatgptThreadUrl: "https://chat.openai.com/c/example-thread-beta?x=1", resourceState: "COLD" },
    { nextAction: "日本語の次アクション\nline 2", resourceState: "WARM" },
  ];

  it.each(REVIEW_INPUTS.map((input, index) => [index, input] as const))("review input #%s reloads unchanged through a lifecycle", (_index, input) => {
    const created = createReviewSession({ ...emptyReviewForm("project-1"), ...input }, new Set(["project-1"]), "rv-20260201-rtrip1", NOW);
    if (!created.ok) throw new Error(JSON.stringify(created.error));
    let session = created.value.session;
    expect(parseSessionFile(serializeSession(session), "rv-20260201-rtrip1")).toEqual({ status: "ok", value: session });
    const actions = [
      { type: "markReady" },
      { type: "startReview" },
      { type: "captureResult", reviewedHead: "abcdef1234567" },
      { type: "confirmVerdict", verdict: "FIX_REQUIRED", note: "  note  ", confirmedByHuman: true },
      { type: "suspend", resourceState: "COLD", checkpoint: "cp" },
      { type: "resume" },
      { type: "startNextRound", expectedHead: "1234567" },
    ] as const;
    for (const action of actions) {
      const out = applyReviewAction(session, action, LATER);
      if (!out.ok) throw new Error(`${action.type}: ${out.error}`);
      session = out.value.session;
      expect(parseSessionFile(serializeSession(session), "rv-20260201-rtrip1")).toEqual({ status: "ok", value: session });
    }
  });
});
