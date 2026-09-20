import { describe, expect, it } from "vitest";
import { createReviewSession, emptyReviewForm, type ReviewSession } from "../domain/review";
import type { LoadedData } from "../services/persistence";
import { MAX_TOASTS, appReducer, initialAppState, type AppState } from "./appState";

const NOW = "2026-01-01T00:00:00.000Z";
const storage = { dataDir: "memory://dvcc", source: "env" as const, debugBuild: true };

function session(id: string): ReviewSession {
  const created = createReviewSession(emptyReviewForm("project-alpha"), new Set(["project-alpha"]), id, NOW);
  if (!created.ok) throw new Error("bad fixture");
  return created.value.session;
}

function loaded(data: Partial<LoadedData>, from: AppState = initialAppState): AppState {
  return appReducer(from, {
    type: "loaded",
    storage,
    data: { projects: [], projectsHealth: { status: "ok" }, reviews: [], ...data },
  });
}

describe("appReducer", () => {
  it("enters ready state and builds recovery notices", () => {
    const state = loaded({
      projectsHealth: { status: "restored_from_backup", cause: "corrupt_primary", quarantinedAs: "projects.json.corrupt-1" },
      reviews: [
        { reviewId: "rv-20260101-alpha1", session: session("rv-20260101-alpha1"), health: { status: "restored_from_backup", cause: "missing_primary", quarantinedAs: null } },
        { reviewId: "rv-20260101-beta01", session: null, health: { status: "unreadable", reason: "bad", setAside: [] } },
      ],
    });
    expect(state.phase).toBe("ready");
    expect(state.notices.map((n) => n.id)).toEqual(["projects-restored", "review-restored-rv-20260101-alpha1"]);
    expect(state.notices[0].message).toContain("projects.json.corrupt-1");
    expect(state.notices[1].message).toContain("was missing and was restored from its backup");
    expect(appReducer(state, { type: "dismissNotice", id: "projects-restored" }).notices).toHaveLength(1);
  });

  it("keeps the selection across reloads only when the review still exists", () => {
    const a = session("rv-20260101-alpha1");
    let state = loaded({ reviews: [{ reviewId: a.reviewSessionId, session: a, health: { status: "ok" } }] });
    state = appReducer(state, { type: "selectReview", reviewId: a.reviewSessionId });
    expect(loaded({ reviews: [{ reviewId: a.reviewSessionId, session: a, health: { status: "ok" } }] }, state).selectedReviewId).toBe(a.reviewSessionId);
    expect(loaded({ reviews: [] }, state).selectedReviewId).toBeNull();
  });

  it("replaces data slices with the hub's committed snapshot and keeps UI state", () => {
    const a = session("rv-20260101-alpha1");
    let state = loaded({
      projectsHealth: { status: "restored_from_backup", cause: "corrupt_primary", quarantinedAs: "x" },
      reviews: [{ reviewId: a.reviewSessionId, session: a, health: { status: "ok" } }],
    });
    state = appReducer(state, { type: "selectReview", reviewId: a.reviewSessionId });
    state = appReducer(state, { type: "filterChanged", filter: { text: "alpha" } });
    const updated = { ...a, nextAction: "changed" };
    const b = session("rv-20260101-beta01");
    const next = appReducer(state, {
      type: "hubCommitted",
      snapshot: {
        projects: [],
        projectsHealth: { status: "ok" },
        reviews: [
          { reviewId: a.reviewSessionId, session: updated, health: { status: "ok" } },
          { reviewId: b.reviewSessionId, session: b, health: { status: "ok" } },
        ],
      },
    });
    expect(next.reviews.map((r) => r.session?.nextAction)).toEqual(["changed", ""]);
    expect(next.projectsHealth).toEqual({ status: "ok" });
    expect(next.selectedReviewId).toBe(a.reviewSessionId);
    expect(next.filter.text).toBe("alpha");
    expect(next.notices).toEqual(state.notices);

    const vanished = appReducer(next, { type: "hubCommitted", snapshot: { projects: [], projectsHealth: { status: "missing" }, reviews: [] } });
    expect(vanished.selectedReviewId).toBeNull();
  });

  it("caps toasts and dismisses by id", () => {
    let state = initialAppState;
    for (let i = 0; i < MAX_TOASTS + 2; i += 1) state = appReducer(state, { type: "toast", kind: "info", message: `m${i}` });
    expect(state.toasts).toHaveLength(MAX_TOASTS);
    expect(state.toasts[0].message).toBe("m2");
    const id = state.toasts[0].id;
    expect(appReducer(state, { type: "dismissToast", id }).toasts.some((t) => t.id === id)).toBe(false);
  });

  it("keeps an observed Git state out of every review and project slice (Phase 2)", () => {
    const before = loaded({
      projects: [
        {
          projectId: "project-alpha",
          displayName: "Project Alpha",
          repositoryUrl: null,
          localRoot: "C:\\repos\\alpha",
          developmentIde: null,
          nextAction: "",
          notes: "",
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
      reviews: [{ reviewId: "rv-20260101-alpha1", session: session("rv-20260101-alpha1"), health: { status: "ok" } }],
    });
    const observation = {
      status: "OK" as const,
      head: "1".repeat(40),
      branch: "main",
      detached: false,
      dirty: true,
      observedAt: "2026-09-20T00:00:00.000Z",
    };

    const after = appReducer(before, {
      type: "gitObserved",
      projectId: "project-alpha",
      localRoot: "C:\\repos\\alpha",
      observation,
    });

    // Only the observation slice changes: a refresh can never move a Review State (AC2-09) or
    // rewrite a recorded HEAD (AC2-07).
    expect(after.gitObservations["project-alpha"]).toEqual({ localRoot: "C:\\repos\\alpha", observation });
    expect(after.reviews).toBe(before.reviews);
    expect(after.projects).toBe(before.projects);
    expect(after.artifacts).toBe(before.artifacts);
    expect(after.selectedReviewId).toBe(before.selectedReviewId);
    expect({ ...after, gitObservations: before.gitObservations }).toEqual(before);
  });

  it("starts without any observation, so a restart shows UNKNOWN until a refresh (Phase 2)", () => {
    expect(initialAppState.gitObservations).toEqual({});
    // A reload inside the running app keeps what was observed; only a restart clears it.
    const observed = appReducer(initialAppState, {
      type: "gitObserved",
      projectId: "project-alpha",
      localRoot: "C:\\repos\\alpha",
      observation: {
        status: "NOT_A_GIT_REPOSITORY" as const,
        head: null,
        branch: null,
        detached: null,
        dirty: null,
        observedAt: "2026-09-20T00:00:00.000Z",
      },
    });
    expect(loaded({}, observed).gitObservations).toBe(observed.gitObservations);
  });

  it("merges filter updates and records fatal errors", () => {
    const state = appReducer(initialAppState, { type: "filterChanged", filter: { showClosed: true } });
    expect(state.filter).toEqual({ text: "", showClosed: true });
    expect(appReducer(state, { type: "fatal", message: "boom" })).toMatchObject({ phase: "fatal", fatalMessage: "boom" });
  });
});
