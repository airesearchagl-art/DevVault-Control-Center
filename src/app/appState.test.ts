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

  it("replaces an existing review or appends a new one on save", () => {
    const a = session("rv-20260101-alpha1");
    let state = loaded({ reviews: [{ reviewId: a.reviewSessionId, session: null, health: { status: "unreadable", reason: "x", setAside: [] } }] });
    const updated = { ...a, nextAction: "changed" };
    state = appReducer(state, { type: "reviewSaved", session: updated });
    expect(state.reviews).toEqual([{ reviewId: a.reviewSessionId, session: updated, health: { status: "ok" } }]);
    const b = session("rv-20260101-beta01");
    state = appReducer(state, { type: "reviewSaved", session: b });
    expect(state.reviews.map((r) => r.reviewId)).toEqual([a.reviewSessionId, b.reviewSessionId]);
  });

  it("marks projects healthy after a successful save unless told otherwise", () => {
    let state = loaded({ projectsHealth: { status: "restored_from_backup", cause: "corrupt_primary", quarantinedAs: "x" } });
    state = appReducer(state, { type: "projectsSaved", projects: [] });
    expect(state.projectsHealth).toEqual({ status: "ok" });
    state = appReducer(state, { type: "projectsSaved", projects: [], health: { status: "missing" } });
    expect(state.projectsHealth).toEqual({ status: "missing" });
  });

  it("caps toasts and dismisses by id", () => {
    let state = initialAppState;
    for (let i = 0; i < MAX_TOASTS + 2; i += 1) state = appReducer(state, { type: "toast", kind: "info", message: `m${i}` });
    expect(state.toasts).toHaveLength(MAX_TOASTS);
    expect(state.toasts[0].message).toBe("m2");
    const id = state.toasts[0].id;
    expect(appReducer(state, { type: "dismissToast", id }).toasts.some((t) => t.id === id)).toBe(false);
  });

  it("merges filter updates and records fatal errors", () => {
    const state = appReducer(initialAppState, { type: "filterChanged", filter: { showClosed: true } });
    expect(state.filter).toEqual({ text: "", showClosed: true });
    expect(appReducer(state, { type: "fatal", message: "boom" })).toMatchObject({ phase: "fatal", fatalMessage: "boom" });
  });
});
