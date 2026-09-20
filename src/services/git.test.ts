import { describe, expect, it } from "vitest";
import type { GitObservation } from "../domain/git";
import { observeSequentially, type GitObserver, type ObservationTarget } from "./git";

/** Phase 2: Refresh All must observe one project at a time (no parallel Git processes). */

function observation(head: string | null): GitObservation {
  return { status: "OK", head, branch: "main", detached: false, dirty: false, observedAt: "2026-09-20T00:00:00.000Z" };
}

/** Records how many observations overlap and in which order they were requested. */
function trackingObserver(delayMs = 0): GitObserver & { order: string[]; maxConcurrent: number } {
  let running = 0;
  const tracker = {
    order: [] as string[],
    maxConcurrent: 0,
    async observe(localRoot: string | null): Promise<GitObservation> {
      running += 1;
      tracker.maxConcurrent = Math.max(tracker.maxConcurrent, running);
      tracker.order.push(localRoot ?? "(none)");
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      running -= 1;
      return observation(localRoot === null ? null : "1".repeat(40));
    },
  };
  return tracker;
}

const targets: readonly ObservationTarget[] = [
  { projectId: "project-alpha", localRoot: "C:\\repos\\alpha" },
  { projectId: "project-beta", localRoot: "C:\\repos\\beta" },
  { projectId: "project-gamma", localRoot: null },
];

describe("observeSequentially", () => {
  it("observes one project at a time, in order", async () => {
    const observer = trackingObserver(5);
    await observeSequentially(observer, targets);
    expect(observer.maxConcurrent).toBe(1);
    expect(observer.order).toEqual(["C:\\repos\\alpha", "C:\\repos\\beta", "(none)"]);
  });

  it("returns one observation per project and reports each as it finishes", async () => {
    const observer = trackingObserver();
    const reported: string[] = [];
    const observations = await observeSequentially(observer, targets, (projectId) => reported.push(projectId));
    expect(Object.keys(observations)).toEqual(["project-alpha", "project-beta", "project-gamma"]);
    expect(reported).toEqual(["project-alpha", "project-beta", "project-gamma"]);
    expect(observations["project-alpha"].head).toBe("1".repeat(40));
  });

  it("does nothing when there is no project to observe", async () => {
    const observer = trackingObserver();
    const observations = await observeSequentially(observer, []);
    expect(observations).toEqual({});
    expect(observer.order).toEqual([]);
  });
});
