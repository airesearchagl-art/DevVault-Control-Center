import { describe, expect, it } from "vitest";
import type { GitObservation } from "./git";
import { exactHeadReadiness, headBinding, isExactHeadBound } from "./headBinding";
import type { Project } from "./project";
import { buildReviewRequest } from "./prompt";
import { createReviewSession, emptyReviewForm, type ReviewSession } from "./review";

/**
 * Exact-head readiness: a Turn 1 request is an exact-head request only for a full 40-character
 * recorded HEAD. The expected answers are written out by hand; nothing is derived from the module.
 */

const NOW = "2026-01-01T00:00:00.000Z";
const FULL = "0123456789abcdef0123456789abcdef01234567";
const OTHER = "fedcba9876543210fedcba9876543210fedcba98";

const project: Project = {
  projectId: "project-alpha",
  displayName: "Project Alpha",
  repositoryUrl: "https://github.com/example-org/project-alpha",
  localRoot: null,
  developmentIde: null,
  nextAction: "",
  notes: "",
  createdAt: NOW,
  updatedAt: NOW,
};

function observed(head: string | null, status: GitObservation["status"] = "OK"): GitObservation {
  return { status, head, branch: "main", detached: false, dirty: false, observedAt: "2026-01-02T03:04:05.000Z" };
}

function session(expectedHead: string): ReviewSession {
  const created = createReviewSession(
    { ...emptyReviewForm("project-alpha"), expectedHead },
    new Set(["project-alpha"]),
    "rv-20260101-alpha1",
    NOW,
  );
  if (!created.ok) throw new Error(JSON.stringify(created.error));
  return created.value.session;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

describe("headBinding", () => {
  it.each([
    [FULL, "EXACT"],
    [FULL.toUpperCase(), "EXACT"],
    ["0123456", "SHORT"],
    [FULL.slice(0, 39), "SHORT"],
    [null, "MISSING"],
    ["", "MISSING"],
    ["   ", "MISSING"],
  ] as const)("%s → %s", (recorded, expected) => {
    expect(headBinding(recorded)).toBe(expected);
    expect(isExactHeadBound(recorded)).toBe(expected === "EXACT");
  });

  it("a 41-character value is not a full head", () => {
    expect(headBinding(`${FULL}0`)).not.toBe("EXACT");
  });
});

describe("exactHeadReadiness", () => {
  it("full head, observation matches", () => {
    expect(exactHeadReadiness(FULL, observed(FULL))).toEqual({
      binding: "EXACT",
      recordedHead: FULL,
      observedHead: FULL,
      observed: "MATCHES",
      observedAt: "2026-01-02T03:04:05.000Z",
    });
  });

  it("full head, observation differs: still EXACT, the difference is only reported", () => {
    const readiness = exactHeadReadiness(FULL, observed(OTHER));
    expect(readiness.binding).toBe("EXACT");
    expect(readiness.observed).toBe("DIFFERS");
    expect(readiness.recordedHead).toBe(FULL);
  });

  it("short head: never EXACT, even when the observation extends it", () => {
    const readiness = exactHeadReadiness("0123456", observed(FULL));
    expect(readiness.binding).toBe("SHORT");
    expect(readiness.observed).toBe("MATCHES");
    // The observed full head is a candidate, not the recorded value.
    expect(readiness.recordedHead).toBe("0123456");
    expect(readiness.observedHead).toBe(FULL);
  });

  it("missing head: the observation cannot be compared with nothing", () => {
    const readiness = exactHeadReadiness(null, observed(FULL));
    expect(readiness.binding).toBe("MISSING");
    expect(readiness.observed).toBe("UNDECIDABLE");
    expect(readiness.recordedHead).toBeNull();
  });

  it.each([
    ["never observed", undefined],
    ["Git unavailable", observed(null, "GIT_UNAVAILABLE")],
    ["no local root", observed(null, "NO_LOCAL_ROOT")],
    ["no commit yet", observed(null)],
    ["a malformed head", observed("not-a-sha")],
  ] as const)("observation unavailable: %s", (_name, observation) => {
    const readiness = exactHeadReadiness(FULL, observation);
    expect(readiness.observed).toBe("UNAVAILABLE");
    expect(readiness.observedHead).toBeNull();
    expect(readiness.binding).toBe("EXACT");
  });
});

describe("no auto-write, no completion", () => {
  it("reading readiness leaves the session exactly as it was", () => {
    const frozen = deepFreeze(session("0123456"));
    const before = JSON.stringify(frozen);
    exactHeadReadiness(frozen.rounds[0].expectedHead, observed(FULL));
    expect(JSON.stringify(frozen)).toBe(before);
    expect(frozen.rounds[0].expectedHead).toBe("0123456");
  });

  it.each(["ja", "en"] as const)("a short-head request says it is not exact and never completes the head (%s)", (locale) => {
    const text = buildReviewRequest(project, deepFreeze(session("0123456")), locale);
    expect(text).toMatch(/^- HEAD binding: NOT EXACT — /m);
    expect(text).not.toContain(FULL);
    expect(text).toContain("0123456");
  });

  it.each(["ja", "en"] as const)("a missing-head request says it is not exact (%s)", (locale) => {
    const created = createReviewSession(emptyReviewForm("project-alpha"), new Set(["project-alpha"]), "rv-20260101-alpha1", NOW);
    if (!created.ok) throw new Error("fixture");
    expect(buildReviewRequest(project, created.value.session, locale)).toMatch(/^- HEAD binding: NOT EXACT — /m);
  });

  it.each(["ja", "en"] as const)("a full-head request is bound (%s)", (locale) => {
    const text = buildReviewRequest(project, session(FULL), locale);
    expect(text).toMatch(/^- HEAD binding: EXACT — /m);
    expect(text).toContain(FULL);
  });
});
