import { describe, expect, it } from "vitest";
import { initialAppState, type AppState } from "./appState";
import { controlReadSourceFrom, newControlSnapshotId } from "./controlReadSource";

describe("controlReadSourceFrom", () => {
  it("passes exactly the five read keys, by reference, and nothing else", () => {
    const state: AppState = {
      ...initialAppState,
      phase: "ready",
      ideSessions: { status: "error", message: "discovery text" },
      artifacts: { "rv-20261004-alpha1": { checkpoint: "c", latestResult: null, events: [], skippedEventLines: 0, errors: [] } },
    };
    const source = controlReadSourceFrom(state);
    expect(Object.keys(source).sort()).toEqual(["gitObservations", "phase", "projects", "projectsHealth", "reviews"]);
    expect(source.projects).toBe(state.projects);
    expect(source.reviews).toBe(state.reviews);
    expect(source.gitObservations).toBe(state.gitObservations);
    expect(source.projectsHealth).toBe(state.projectsHealth);
    expect(source.phase).toBe("ready");
  });
});

describe("newControlSnapshotId", () => {
  it("is 'snap-' plus a version-4 UUID", () => {
    expect(newControlSnapshotId()).toMatch(/^snap-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const zeros = newControlSnapshotId((bytes) => bytes.fill(0));
    expect(zeros).toBe("snap-00000000-0000-4000-8000-000000000000");
    expect(newControlSnapshotId()).not.toBe(newControlSnapshotId());
  });
});
