import { describe, expect, it } from "vitest";
import { emptyProjectForm } from "../domain/project";
import { emptyReviewForm } from "../domain/review";
import { parseEventsFile, parseProjectsFile, parseSessionFile } from "../domain/schema";
import { DelayedStorage, seededRandom } from "../test/delayedStorage";
import { MemoryStorage } from "../test/memoryStorage";
import { performReviewAction } from "./reviewService";
import { ReviewHub } from "./reviewHub";
import type { LoadedData } from "./persistence";

let tick = 0;
const clock = () => new Date(Date.UTC(2026, 0, 1, 0, 0, 0, tick++)).toISOString();
const ids = ["rv-20260101-hubaa1", "rv-20260101-hubbb2", "rv-20260101-hubcc3"];

async function seededHub(backend: MemoryStorage | DelayedStorage) {
  let next = 0;
  const hub = new ReviewHub(backend, { now: clock, newReviewId: () => ids[next++] });
  await hub.load();
  const project = await hub.createProject({ ...emptyProjectForm(), projectId: "project-alpha", displayName: "Project Alpha" });
  if (!project.ok) throw new Error(JSON.stringify(project.error));
  const review = await hub.createReview({ ...emptyReviewForm("project-alpha"), resourceState: "HOT" });
  if (!review.ok) throw new Error(JSON.stringify(review.error));
  return { hub, reviewId: review.value.session.reviewSessionId };
}

function unwrapOk<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

describe("ReviewHub operation ordering (F-4)", () => {
  it.each([1, 2, 3, 4, 5])("rapid mutations commit in operation order and disk equals application state (seed %i)", async (seed) => {
    const memory = new MemoryStorage();
    const { hub, reviewId } = await seededHub(new DelayedStorage(memory, seededRandom(seed)));
    const snapshots: LoadedData[] = [];
    hub.subscribe((snapshot) => snapshots.push(snapshot));

    // Fired in the same tick, without awaiting each other (like two fast clicks).
    const results = await Promise.all([
      hub.apply(reviewId, { type: "setResource", resourceState: "WARM" }),
      hub.apply(reviewId, { type: "setResource", resourceState: "COLD" }),
      hub.apply(reviewId, { type: "setNextAction", nextAction: "after cold" }),
      hub.editProject("project-alpha", { ...emptyProjectForm(), projectId: "project-alpha", displayName: "Project Alpha", nextAction: "edited" }),
      hub.apply(reviewId, { type: "markReady" }),
      hub.apply(reviewId, { type: "setResource", resourceState: "HOT" }),
    ]);
    results.forEach((result) => expect(result.ok).toBe(true));

    const session = hub.session(reviewId)!;
    expect(session).toMatchObject({ resourceState: "HOT", reviewState: "READY_FOR_REVIEW", nextAction: "after cold" });

    const disk = parseSessionFile(memory.files.get(`reviews/${reviewId}/session.json`)!, reviewId);
    expect(disk).toEqual({ status: "ok", value: session });
    expect(parseProjectsFile(memory.files.get("projects.json")!)).toEqual({ status: "ok", value: hub.snapshot().projects });

    const events = parseEventsFile(memory.files.get(`reviews/${reviewId}/events.jsonl`)!).events;
    expect(events.map((e) => e.type)).toEqual([
      "review_created",
      "resource_changed",
      "resource_changed",
      "next_action_updated",
      "review_ready",
      "resource_changed",
    ]);
    expect(events.filter((e) => e.resourceState).map((e) => `${e.resourceState!.from}->${e.resourceState!.to}`)).toEqual([
      "null->HOT",
      "HOT->WARM",
      "WARM->COLD",
      "COLD->HOT",
    ]);

    // UI snapshots follow commit order and the last one equals the committed state.
    expect(snapshots).toHaveLength(6);
    expect(snapshots.at(-1)).toEqual(hub.snapshot());

    // A fresh process reading the same files sees exactly the same state.
    const reloaded = await new ReviewHub(memory).load();
    expect(reloaded.reviews.find((r) => r.reviewId === reviewId)?.session).toEqual(session);
  });

  it("control: without the hub queue, the same interleaving loses an update (race is real)", async () => {
    const memory = new MemoryStorage();
    const { hub, reviewId } = await seededHub(memory);
    const stale = hub.session(reviewId)!;
    const delayed = new DelayedStorage(memory, seededRandom(7), 10);
    const [first, second] = await Promise.all([
      performReviewAction(delayed, stale, { type: "setResource", resourceState: "WARM" }, clock()),
      performReviewAction(delayed, stale, { type: "setNextAction", nextAction: "lost?" }, clock()),
    ]);
    expect(first.ok && second.ok).toBe(true);
    const disk = parseSessionFile(memory.files.get(`reviews/${reviewId}/session.json`)!, reviewId);
    if (disk.status !== "ok") throw new Error("disk unreadable");
    // One of the two changes is missing on disk although both "succeeded".
    const lost = disk.value.resourceState !== "WARM" || disk.value.nextAction !== "lost?";
    expect(lost).toBe(true);
  });
});

describe("no silent overwrite of external changes (F-3)", () => {
  it("refuses to overwrite a session.json changed by another process, then works after reload", async () => {
    const memory = new MemoryStorage();
    const { hub, reviewId } = await seededHub(memory);
    const path = `reviews/${reviewId}/session.json`;
    const external = memory.files.get(path)!.replace('"nextAction": ""', '"nextAction": "edited in another process"');
    memory.files.set(path, external);
    const eventsBefore = memory.files.get(`reviews/${reviewId}/events.jsonl`);
    const before = hub.session(reviewId);

    await expect(hub.apply(reviewId, { type: "setResource", resourceState: "COLD" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(memory.files.get(path)).toBe(external);
    expect(memory.files.get(`reviews/${reviewId}/events.jsonl`)).toBe(eventsBefore);
    expect(hub.session(reviewId)).toEqual(before);

    await hub.load();
    expect(hub.session(reviewId)?.nextAction).toBe("edited in another process");
    unwrapOk(await hub.apply(reviewId, { type: "setResource", resourceState: "COLD" }));
    const disk = parseSessionFile(memory.files.get(path)!, reviewId);
    expect(disk).toMatchObject({ status: "ok", value: { resourceState: "COLD", nextAction: "edited in another process" } });
  });

  it("refuses to overwrite projects.json changed by another process", async () => {
    const memory = new MemoryStorage();
    const { hub } = await seededHub(memory);
    const external = '{"schemaVersion":1,"projects":[]}';
    memory.files.set("projects.json", external);
    await expect(
      hub.createProject({ ...emptyProjectForm(), projectId: "project-beta", displayName: "Project Beta" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(memory.files.get("projects.json")).toBe(external);
  });

  it("never replaces an existing session.json when creating a review (id collision)", async () => {
    const memory = new MemoryStorage();
    const { hub } = await seededHub(memory);
    memory.files.set(`reviews/${ids[1]}/session.json`, '{"foreign":true}');
    await expect(hub.createReview(emptyReviewForm("project-alpha"))).rejects.toMatchObject({ code: "CONFLICT" });
    expect(memory.files.get(`reviews/${ids[1]}/session.json`)).toBe('{"foreign":true}');
  });

  it("keeps processing queued operations after a conflict", async () => {
    const memory = new MemoryStorage();
    const { hub, reviewId } = await seededHub(memory);
    memory.files.set("projects.json", '{"schemaVersion":1,"projects":[]}');
    const [conflict, applied] = await Promise.allSettled([
      hub.createProject({ ...emptyProjectForm(), projectId: "project-beta", displayName: "B" }),
      hub.apply(reviewId, { type: "markReady" }),
    ]);
    expect(conflict.status).toBe("rejected");
    expect(applied.status === "fulfilled" && applied.value.ok).toBe(true);
  });
});
