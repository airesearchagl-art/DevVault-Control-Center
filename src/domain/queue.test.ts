import { describe, expect, it } from "vitest";
import type { Project } from "./project";
import { buildQueue, type QueueSource } from "./queue";
import { createReviewSession, emptyReviewForm, type ReviewSession } from "./review";
import type { ResourceState, ReviewState } from "./states";

const NOW = "2026-01-01T00:00:00.000Z";

const projects: Project[] = ["alpha", "beta"].map((name) => ({
  projectId: `project-${name}`,
  displayName: `Project ${name[0].toUpperCase()}${name.slice(1)}`,
  repositoryUrl: null,
  localRoot: null,
  developmentIde: null,
  nextAction: "",
  notes: "",
  createdAt: NOW,
  updatedAt: NOW,
}));

let counter = 0;
function source(projectId: string, reviewState: ReviewState, resourceState: ResourceState, updatedAt = NOW, pr: string = ""): QueueSource {
  counter += 1;
  const id = `rv-20260101-q${counter.toString().padStart(5, "0")}`;
  const created = createReviewSession({ ...emptyReviewForm(projectId), prNumber: pr }, new Set([projectId]), id, NOW);
  if (!created.ok) throw new Error("bad");
  const session: ReviewSession = {
    ...created.value.session,
    reviewState,
    resourceState,
    suspendedFrom: reviewState === "SUSPENDED" ? "NEW" : null,
    updatedAt,
  };
  return { reviewId: id, session, problem: null };
}

describe("buildQueue", () => {
  it("orders by review attention, then resource, then most recent update, unreadable first", () => {
    const items = [
      source("project-alpha", "SUSPENDED", "HOT"),
      source("project-alpha", "FIX_REQUIRED", "COLD"),
      source("project-beta", "FIX_REQUIRED", "WARM"),
      source("project-beta", "REVIEWING", "COLD"),
      source("project-alpha", "NEW", "HOT", "2026-01-01T00:00:00.000Z"),
      source("project-alpha", "NEW", "HOT", "2026-01-02T00:00:00.000Z"),
      { reviewId: "rv-20260101-broken", session: null, problem: "invalid JSON" },
    ];
    const queue = buildQueue(items, projects, { text: "", showClosed: true });
    expect(queue.map((i) => (i.session ? `${i.session.reviewState}/${i.session.resourceState}/${i.session.updatedAt.slice(8, 10)}` : "UNREADABLE"))).toEqual([
      "UNREADABLE",
      "REVIEWING/COLD/01",
      "FIX_REQUIRED/WARM/01",
      "FIX_REQUIRED/COLD/01",
      "NEW/HOT/02",
      "NEW/HOT/01",
      "SUSPENDED/HOT/01",
    ]);
    expect(queue[1].project?.displayName).toBe("Project Beta");
  });

  it("hides CLOSED reviews unless requested", () => {
    const items = [source("project-alpha", "CLOSED", "COLD"), source("project-alpha", "NEW", "HOT")];
    expect(buildQueue(items, projects, { text: "", showClosed: false })).toHaveLength(1);
    expect(buildQueue(items, projects, { text: "", showClosed: true })).toHaveLength(2);
  });

  it("filters by project name and PR tokens", () => {
    const items = [source("project-alpha", "NEW", "HOT", NOW, "45"), source("project-beta", "NEW", "HOT", NOW, "12")];
    expect(buildQueue(items, projects, { text: "beta", showClosed: false }).map((i) => i.session?.projectId)).toEqual(["project-beta"]);
    expect(buildQueue(items, projects, { text: "#45", showClosed: false }).map((i) => i.session?.projectId)).toEqual(["project-alpha"]);
    expect(buildQueue(items, projects, { text: "alpha pr45", showClosed: false })).toHaveLength(1);
    expect(buildQueue(items, projects, { text: "gamma", showClosed: false })).toHaveLength(0);
  });

  it("keeps reviews whose project is missing, with project = null", () => {
    const items = [source("project-gone", "NEW", "HOT")];
    const queue = buildQueue(items, projects, { text: "", showClosed: false });
    expect(queue).toHaveLength(1);
    expect(queue[0].project).toBeNull();
  });
});
