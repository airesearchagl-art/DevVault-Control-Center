import { beforeEach, describe, expect, it } from "vitest";
import { emptyProjectForm, type ProjectFormInput } from "../domain/project";
import { emptyReviewForm, type ReviewSession } from "../domain/review";
import { parseEventsFile } from "../domain/schema";
import { MemoryStorage } from "../test/memoryStorage";
import { fixture } from "../test/fixtures";
import { isWritable, loadAll, loadReviewArtifacts, setAsideProjectsFile, type FileHealth } from "./persistence";
import {
  captureReviewResult,
  performReviewAction,
  saveEditedProject,
  saveNewProject,
  saveNewReview,
  saveReviewRequest,
} from "./reviewService";
import { StorageError, type StorageBackend } from "./storage";

const HEAD = "0123456789abcdef0123456789abcdef01234567";
const ALPHA_ID = "rv-20260101-alpha1";
const BETA_ID = "rv-20260102-beta01";
let clock = 0;
const now = () => new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)).toISOString();

function projectForm(id: string, name: string): ProjectFormInput {
  return {
    ...emptyProjectForm(),
    projectId: id,
    displayName: name,
    repositoryUrl: `https://github.com/example-org/${id}`,
    localRoot: `C:\\example\\${id}`,
    developmentIde: "Claude Code",
    nextAction: `${name} next`,
  };
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

async function seed(storage: MemoryStorage) {
  let projects = unwrap(await saveNewProject(storage, [], { status: "missing" }, projectForm("project-alpha", "Project Alpha"), now()));
  projects = unwrap(await saveNewProject(storage, projects, { status: "ok" }, projectForm("project-beta", "Project Beta"), now()));
  const alpha = unwrap(
    await saveNewReview(
      storage,
      projects,
      {
        ...emptyReviewForm("project-alpha"),
        prNumber: "45",
        expectedHead: HEAD,
        chatgptThreadTitle: "Project Alpha PR45",
        chatgptThreadUrl: "https://chatgpt.com/c/example-thread-alpha",
        nextAction: "Review R1",
      },
      ALPHA_ID,
      now(),
    ),
  ).session;
  const beta = unwrap(await saveNewReview(storage, projects, { ...emptyReviewForm("project-beta"), resourceState: "COLD" }, BETA_ID, now())).session;
  return { projects, alpha, beta };
}

async function act(storage: MemoryStorage, session: ReviewSession, action: Parameters<typeof performReviewAction>[2]) {
  return unwrap(await performReviewAction(storage, session, action, now())).session;
}

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
  clock = 0;
});

describe("round trip across restart (AC-18)", () => {
  it("reloads projects and sessions exactly as saved", async () => {
    const { projects, alpha, beta } = await seed(storage);
    const loaded = await loadAll(storage);
    expect(loaded.projectsHealth).toEqual({ status: "ok" });
    expect(loaded.projects).toEqual(projects);
    expect(loaded.reviews).toEqual([
      { reviewId: ALPHA_ID, session: alpha, health: { status: "ok" } },
      { reviewId: BETA_ID, session: beta, health: { status: "ok" } },
    ]);
  });

  it("Create → review → WARM / FIX_REQUIRED → Suspend → restart → Resume restores metadata (AC-09)", async () => {
    const { projects } = await seed(storage);
    let alpha = (await loadAll(storage)).reviews[0].session!;
    alpha = await act(storage, alpha, { type: "setResource", resourceState: "WARM" });
    alpha = await act(storage, alpha, { type: "markReady" });
    const request = unwrap(await saveReviewRequest(storage, projects[0], alpha, now()));
    alpha = request.session;
    alpha = await act(storage, alpha, { type: "startReview" });
    alpha = unwrap(await captureReviewResult(storage, alpha, "Reviewed HEAD: x\n\n## 修正必須\n1. fix", HEAD, false, now())).session;
    expect(alpha.reviewState).toBe("REVIEWING");
    alpha = await act(storage, alpha, { type: "confirmVerdict", verdict: "FIX_REQUIRED", note: null, confirmedByHuman: true });
    expect(alpha).toMatchObject({ reviewState: "FIX_REQUIRED", resourceState: "WARM" });
    alpha = await act(storage, alpha, { type: "suspend", resourceState: "WARM", checkpoint: "Stopped after R1 verdict" });
    const beforeRestart = alpha;

    // restart: only persisted files are used
    const restarted = await loadAll(storage);
    const reloaded = restarted.reviews.find((r) => r.reviewId === ALPHA_ID)!.session!;
    expect(reloaded).toEqual(beforeRestart);
    expect(reloaded).toMatchObject({ reviewState: "SUSPENDED", suspendedFrom: "FIX_REQUIRED", resourceState: "WARM" });

    const artifacts = await loadReviewArtifacts(storage, reloaded);
    expect(artifacts.checkpoint).toBe("Stopped after R1 verdict\n");
    expect(artifacts.latestResult).toEqual({ round: 1, text: "Reviewed HEAD: x\n\n## 修正必須\n1. fix\n" });
    expect(artifacts.errors).toEqual([]);

    const resumed = await act(storage, reloaded, { type: "resume" });
    expect(resumed).toMatchObject({
      reviewState: "FIX_REQUIRED",
      resourceState: "HOT",
      suspendedFrom: null,
      prNumber: 45,
      chatgptThreadTitle: "Project Alpha PR45",
      chatgptThreadUrl: "https://chatgpt.com/c/example-thread-alpha",
      nextAction: "Review R1",
    });
    expect(resumed.rounds[0]).toMatchObject({ expectedHead: HEAD, reviewedHead: HEAD, verdict: "FIX_REQUIRED" });

    const events = parseEventsFile(storage.files.get(`reviews/${ALPHA_ID}/events.jsonl`)!);
    expect(events.skippedLines).toBe(0);
    expect(events.events.map((e) => e.type)).toEqual([
      "review_created",
      "resource_changed",
      "review_ready",
      "request_saved",
      "review_started",
      "result_captured",
      "verdict_confirmed",
      "suspended",
      "resumed",
    ]);
    expect(request.text).toContain("Project Alpha");
    expect(storage.files.get(`reviews/${ALPHA_ID}/request-r1.md`)).toBe(request.text);
  });

  it("keeps per-round request/result artifacts (AC-08)", async () => {
    const { projects } = await seed(storage);
    let s = (await loadAll(storage)).reviews[0].session!;
    for (let round = 1; round <= 2; round += 1) {
      if (round === 1) s = await act(storage, s, { type: "markReady" });
      else s = await act(storage, s, { type: "startNextRound", expectedHead: null });
      s = unwrap(await saveReviewRequest(storage, projects[0], s, now())).session;
      s = await act(storage, s, { type: "startReview" });
      s = unwrap(await captureReviewResult(storage, s, `result of round ${round}`, null, false, now())).session;
      s = await act(storage, s, { type: "confirmVerdict", verdict: "FIX_REQUIRED", note: null, confirmedByHuman: true });
    }
    expect(storage.files.get(`reviews/${ALPHA_ID}/result-r1.md`)).toBe("result of round 1\n");
    expect(storage.files.get(`reviews/${ALPHA_ID}/result-r2.md`)).toBe("result of round 2\n");
    expect(storage.files.get(`reviews/${ALPHA_ID}/request-r1.md`)).toContain("/ R1");
    expect(storage.files.get(`reviews/${ALPHA_ID}/request-r2.md`)).toContain("/ R2");
    expect([...storage.files.keys()].some((k) => k.endsWith("/request.md") || k.endsWith("/result.md"))).toBe(false);
    expect((await loadReviewArtifacts(storage, s)).latestResult).toEqual({ round: 2, text: "result of round 2\n" });
  });
});

describe("malformed input safety (AC-17)", () => {
  it("restores projects.json from a valid backup and keeps the corrupt file", async () => {
    const { projects } = await seed(storage);
    // A later write produced a corrupt primary (simulated), backup holds the previous valid state.
    storage.files.set("projects.json.bak", storage.files.get("projects.json")!);
    storage.files.set("projects.json", fixture("malformed/projects.truncated.json"));

    const loaded = await loadAll(storage);
    expect(loaded.projectsHealth).toEqual({ status: "restored_from_backup", cause: "corrupt_primary", quarantinedAs: "projects.json.corrupt-1" });
    expect(loaded.projects).toEqual(projects);
    expect(storage.files.get("projects.json.corrupt-1")).toBe(fixture("malformed/projects.truncated.json"));
    expect(storage.files.get("projects.json")).toBe(storage.files.get("projects.json.bak"));
    expect(loaded.reviews.every((r) => r.health.status === "ok")).toBe(true);
  });

  it("sets aside and restores a schema-invalid primary that is still valid JSON (F-5 test gap)", async () => {
    const { projects } = await seed(storage);
    storage.files.set("projects.json.bak", storage.files.get("projects.json")!);
    const schemaInvalid = '{"schemaVersion":1,"projects":"not an array"}';
    storage.files.set("projects.json", schemaInvalid);

    const loaded = await loadAll(storage);
    expect(loaded.projectsHealth).toEqual({ status: "restored_from_backup", cause: "corrupt_primary", quarantinedAs: "projects.json.corrupt-1" });
    expect(loaded.projects).toEqual(projects);
    expect(storage.files.get("projects.json.corrupt-1")).toBe(schemaInvalid);
    expect(storage.files.get("projects.json")).toBe(storage.files.get("projects.json.bak"));
  });

  it("marks projects.json unreadable without a valid backup and refuses writes", async () => {
    await seed(storage);
    storage.files.delete("projects.json.bak");
    storage.files.set("projects.json", "{ broken");

    const loaded = await loadAll(storage);
    expect(loaded.projectsHealth.status).toBe("unreadable");
    expect(isWritable(loaded.projectsHealth)).toBe(false);
    expect(loaded.projects).toEqual([]);
    expect(loaded.reviews).toHaveLength(2);
    expect(loaded.reviews.every((r) => r.session !== null)).toBe(true);

    const attempt = await saveNewProject(storage, loaded.projects, loaded.projectsHealth, projectForm("project-gamma", "Project Gamma"), now());
    expect(attempt.ok).toBe(false);
    expect(storage.files.get("projects.json")).toBe("{ broken");
    expect([...storage.files.keys()].some((k) => k.startsWith("projects.json.corrupt"))).toBe(false);

    // The storage layer itself also refuses to overwrite a corrupt primary.
    await expect(storage.write({ kind: "projects" }, '{"schemaVersion":1,"projects":[]}')).rejects.toMatchObject({ code: "PRIMARY_UNREADABLE" });
  });

  it("lets the Human set an unreadable projects.json aside, then start empty", async () => {
    storage.files.set("projects.json", "{ broken");
    const loaded = await loadAll(storage);
    expect(loaded.projectsHealth.status).toBe("unreadable");
    const [aside] = await setAsideProjectsFile(storage, loaded.projectsHealth);
    expect(storage.files.get(`${aside}`)).toBe("{ broken");
    const health: FileHealth = { status: "missing" };
    const saved = await saveNewProject(storage, [], health, projectForm("project-alpha", "Project Alpha"), now());
    expect(saved.ok).toBe(true);
    expect(storage.files.get(aside)).toBe("{ broken");
  });

  it("treats a newer schema version as read-only (no restore, no quarantine, no write)", async () => {
    await seed(storage);
    const future = fixture("malformed/projects.future-version.json");
    storage.files.set("projects.json", future);
    const loaded = await loadAll(storage);
    expect(loaded.projectsHealth).toEqual({ status: "unsupported_version", version: 2 });
    expect(storage.files.get("projects.json")).toBe(future);
    expect([...storage.files.keys()].some((k) => k.includes("corrupt"))).toBe(false);
    const attempt = await saveEditedProject(storage, [], loaded.projectsHealth, "project-alpha", projectForm("project-alpha", "X"), now());
    expect(attempt.ok).toBe(false);
    expect(storage.files.get("projects.json")).toBe(future);
  });

  it("isolates one malformed session from other reviews and projects", async () => {
    const { projects, beta } = await seed(storage);
    storage.files.delete(`reviews/${ALPHA_ID}/session.json.bak`);
    storage.files.set(`reviews/${ALPHA_ID}/session.json`, fixture("malformed/session.unknown-state.json"));

    const loaded = await loadAll(storage);
    expect(loaded.projects).toEqual(projects);
    const alpha = loaded.reviews.find((r) => r.reviewId === ALPHA_ID)!;
    expect(alpha.session).toBeNull();
    expect(alpha.health.status).toBe("unreadable");
    expect(loaded.reviews.find((r) => r.reviewId === BETA_ID)).toEqual({ reviewId: BETA_ID, session: beta, health: { status: "ok" } });
    expect(storage.files.get(`reviews/${ALPHA_ID}/session.json`)).toBe(fixture("malformed/session.unknown-state.json"));
  });

  it("restores a session from backup after a bad write", async () => {
    await seed(storage);
    let alpha = (await loadAll(storage)).reviews[0].session!;
    alpha = await act(storage, alpha, { type: "markReady" });
    storage.files.set(`reviews/${ALPHA_ID}/session.json`, '{"schemaVersion":1,"reviewSessionId":"rv-20260101-alpha1"');
    const loaded = await loadAll(storage);
    const entry = loaded.reviews.find((r) => r.reviewId === ALPHA_ID)!;
    expect(entry.health.status).toBe("restored_from_backup");
    expect(entry.session?.reviewState).toBe("NEW");
  });

  it("recovers from invalid UTF-8 via backup but never quarantines on plain read errors", async () => {
    await seed(storage);
    storage.files.set("projects.json.bak", storage.files.get("projects.json")!);
    storage.failingReads.set("projects.json", "INVALID_UTF8");
    let loaded = await loadAll(storage);
    storage.failingReads.clear();
    expect(loaded.projectsHealth.status).toBe("restored_from_backup");

    storage.failingReads.set("projects.json", "READ_FAILED");
    const before = new Map(storage.files);
    loaded = await loadAll(storage);
    expect(loaded.projectsHealth).toMatchObject({ status: "io_error", code: "READ_FAILED" });
    expect(storage.files).toEqual(before);
  });

  it("reports a review folder without session.json as unreadable", async () => {
    storage.files.set(`reviews/${ALPHA_ID}/checkpoint.md`, "orphan checkpoint");
    const loaded = await loadAll(storage);
    expect(loaded.reviews).toEqual([{ reviewId: ALPHA_ID, session: null, health: { status: "unreadable", reason: "session.json is missing", setAside: [] } }]);
    expect(loaded.projectsHealth).toEqual({ status: "missing" });
  });

  it("counts broken event lines and never rewrites events.jsonl", async () => {
    await seed(storage);
    const alpha = (await loadAll(storage)).reviews[0].session!;
    const path = `reviews/${ALPHA_ID}/events.jsonl`;
    storage.files.set(path, `${storage.files.get(path)!}{"v":1,"type":"trunc`);
    const artifacts = await loadReviewArtifacts(storage, alpha);
    expect(artifacts.events).toHaveLength(1);
    expect(artifacts.skippedEventLines).toBe(1);
    const next = await act(storage, alpha, { type: "markReady" });
    const lines = storage.files.get(path)!.split("\n");
    expect(lines[1]).toBe('{"v":1,"type":"trunc');
    expect(parseEventsFile(storage.files.get(path)!).events.map((e) => e.type)).toEqual(["review_created", "review_ready"]);
    expect(next.reviewState).toBe("READY_FOR_REVIEW");
  });
});

describe("missing primary with a backup — RECOVERY REQUIRED (F-2)", () => {
  const ids = (text: string | undefined) => (JSON.parse(text ?? "{}").projects ?? []).map((p: { projectId: string }) => p.projectId);

  it("restores a missing projects.json from its valid backup and never loses the backup data on later saves", async () => {
    const { projects } = await seed(storage);
    storage.files.set("projects.json.bak", storage.files.get("projects.json")!);
    storage.files.delete("projects.json");
    const backup = storage.files.get("projects.json.bak");

    const loaded = await loadAll(storage);
    expect(loaded.projectsHealth).toEqual({ status: "restored_from_backup", cause: "missing_primary", quarantinedAs: null });
    expect(loaded.projects).toEqual(projects);
    expect(storage.files.get("projects.json")).toBe(backup);
    expect(storage.files.get("projects.json.bak")).toBe(backup);

    let current = loaded.projects;
    current = unwrap(await saveNewProject(storage, current, loaded.projectsHealth, projectForm("project-gamma", "Project Gamma"), now()));
    current = unwrap(await saveNewProject(storage, current, { status: "ok" }, projectForm("project-delta", "Project Delta"), now()));
    expect(ids(storage.files.get("projects.json"))).toEqual(["project-alpha", "project-beta", "project-gamma", "project-delta"]);
    expect(ids(storage.files.get("projects.json.bak"))).toEqual(["project-alpha", "project-beta", "project-gamma"]);
  });

  it("protects the only valid copy at the storage layer (normal write refused)", async () => {
    storage.files.set("projects.json.bak", '{"schemaVersion":1,"projects":[]}');
    await expect(storage.write({ kind: "projects" }, '{"schemaVersion":1,"projects":[]}')).rejects.toMatchObject({ code: "RECOVERY_REQUIRED" });
    expect(storage.files.has("projects.json")).toBe(false);
    expect(storage.files.get("projects.json.bak")).toBe('{"schemaVersion":1,"projects":[]}');
  });

  it("keeps the backup and blocks writes when the restore write fails, then recovers on the next load", async () => {
    const { projects } = await seed(storage);
    storage.files.set("projects.json.bak", storage.files.get("projects.json")!);
    storage.files.delete("projects.json");
    const backup = storage.files.get("projects.json.bak");
    storage.failingWrites.add("projects.json");

    const failed = await loadAll(storage);
    expect(failed.projectsHealth).toMatchObject({ status: "io_error", code: "WRITE_FAILED" });
    expect(isWritable(failed.projectsHealth)).toBe(false);
    expect(storage.files.has("projects.json")).toBe(false);
    expect(storage.files.get("projects.json.bak")).toBe(backup);
    expect((await saveNewProject(storage, [], failed.projectsHealth, projectForm("project-x", "X"), now())).ok).toBe(false);
    expect(storage.files.get("projects.json.bak")).toBe(backup);

    storage.failingWrites.clear();
    const retried = await loadAll(storage);
    expect(retried.projectsHealth).toMatchObject({ status: "restored_from_backup", cause: "missing_primary" });
    expect(retried.projects).toEqual(projects);
  });

  it("recovers across two loads when the primary was set aside but the restore write failed", async () => {
    const { projects } = await seed(storage);
    storage.files.set("projects.json.bak", storage.files.get("projects.json")!);
    storage.files.set("projects.json", "{ corrupt");
    storage.failingWrites.add("projects.json");

    const first = await loadAll(storage);
    expect(first.projectsHealth.status).toBe("io_error");
    expect(storage.files.get("projects.json.corrupt-1")).toBe("{ corrupt");
    expect(storage.files.has("projects.json")).toBe(false);

    storage.failingWrites.clear();
    const second = await loadAll(storage);
    expect(second.projectsHealth).toMatchObject({ status: "restored_from_backup", cause: "missing_primary" });
    expect(second.projects).toEqual(projects);
    expect(storage.files.get("projects.json.corrupt-1")).toBe("{ corrupt");
  });

  it("restores a missing session.json from session.json.bak", async () => {
    await seed(storage);
    let alpha = (await loadAll(storage)).reviews[0].session!;
    alpha = await act(storage, alpha, { type: "markReady" });
    const path = `reviews/${ALPHA_ID}/session.json`;
    storage.files.delete(path);
    const entry = (await loadAll(storage)).reviews.find((r) => r.reviewId === ALPHA_ID)!;
    expect(entry.health).toEqual({ status: "restored_from_backup", cause: "missing_primary", quarantinedAs: null });
    expect(entry.session?.reviewState).toBe("NEW");
    expect(storage.files.has(path)).toBe(true);
  });

  it("marks missing primary + invalid backup unreadable; set-aside keeps the backup and allows a fresh start", async () => {
    storage.files.set("projects.json.bak", "{ truncated backup");
    const loaded = await loadAll(storage);
    expect(loaded.projectsHealth).toMatchObject({ status: "unreadable", setAside: ["backup"] });
    expect((await saveNewProject(storage, [], loaded.projectsHealth, projectForm("project-alpha", "A"), now())).ok).toBe(false);
    const kept = await setAsideProjectsFile(storage, loaded.projectsHealth);
    expect(kept).toEqual(["projects.json.bak.corrupt-1"]);
    expect(storage.files.get("projects.json.bak.corrupt-1")).toBe("{ truncated backup");
    expect((await saveNewProject(storage, [], { status: "missing" }, projectForm("project-alpha", "A"), now())).ok).toBe(true);
  });

  it("sets aside both corrupt primary and corrupt backup when neither is usable", async () => {
    storage.files.set("projects.json", "{ bad primary");
    storage.files.set("projects.json.bak", "{ bad backup");
    const loaded = await loadAll(storage);
    expect(loaded.projectsHealth).toMatchObject({ status: "unreadable", setAside: ["primary", "backup"] });
    const kept = await setAsideProjectsFile(storage, loaded.projectsHealth);
    expect(kept).toEqual(["projects.json.corrupt-1", "projects.json.bak.corrupt-2"]);
    expect(storage.files.get("projects.json.corrupt-1")).toBe("{ bad primary");
    expect(storage.files.get("projects.json.bak.corrupt-2")).toBe("{ bad backup");
    expect((await loadAll(storage)).projectsHealth).toEqual({ status: "missing" });
  });

  it("never restores a backup written by a newer schema version", async () => {
    storage.files.set("projects.json.bak", fixture("malformed/projects.future-version.json"));
    const loaded = await loadAll(storage);
    expect(loaded.projectsHealth).toEqual({ status: "unsupported_version", version: 2 });
    expect(storage.files.has("projects.json")).toBe(false);
  });
});

describe("corrupt content vs ordinary I/O failure (F-8)", () => {
  it("offers set-aside only for corrupt content, never for I/O errors", async () => {
    await seed(storage);
    storage.files.delete("projects.json.bak");
    for (const code of ["READ_FAILED", "DATA_DIR_UNAVAILABLE", "UNKNOWN"]) {
      storage.failingReads.set("projects.json", code);
      const before = new Map(storage.files);
      const loaded = await loadAll(storage);
      expect(loaded.projectsHealth).toMatchObject({ status: "io_error", code });
      expect(isWritable(loaded.projectsHealth)).toBe(false);
      await expect(setAsideProjectsFile(storage, loaded.projectsHealth)).rejects.toMatchObject({ code: "NOT_RECOVERABLE" });
      expect(storage.files).toEqual(before);
    }
    storage.failingReads.clear();

    storage.files.set("projects.json", "{ corrupt");
    const corrupt = await loadAll(storage);
    expect(corrupt.projectsHealth).toMatchObject({ status: "unreadable", setAside: ["primary"] });
  });

  it("treats an I/O error on the backup as io_error without writing anything", async () => {
    storage.files.set("projects.json.bak", '{"schemaVersion":1,"projects":[]}');
    storage.failingReads.set("projects.json.bak", "READ_FAILED");
    const before = new Map(storage.files);
    const loaded = await loadAll(storage);
    expect(loaded.projectsHealth).toMatchObject({ status: "io_error", code: "READ_FAILED" });
    expect(storage.files).toEqual(before);
  });

  it("reports review session I/O errors as io_error, not unreadable", async () => {
    await seed(storage);
    storage.failingReads.set(`reviews/${ALPHA_ID}/session.json`, "READ_FAILED");
    const loaded = await loadAll(storage);
    expect(loaded.reviews.find((r) => r.reviewId === ALPHA_ID)?.health).toMatchObject({ status: "io_error", code: "READ_FAILED" });
    expect(loaded.reviews.find((r) => r.reviewId === BETA_ID)?.health).toEqual({ status: "ok" });
  });
});

describe("re-capture preserves the previous result (F-6)", () => {
  async function capturedAlpha() {
    await seed(storage);
    let alpha = (await loadAll(storage)).reviews[0].session!;
    alpha = await act(storage, alpha, { type: "markReady" });
    alpha = await act(storage, alpha, { type: "startReview" });
    alpha = unwrap(await captureReviewResult(storage, alpha, "first result", null, false, now())).session;
    alpha = await act(storage, alpha, { type: "confirmVerdict", verdict: "FIX_REQUIRED", note: null, confirmedByHuman: true });
    return alpha;
  }
  const resultPath = `reviews/${ALPHA_ID}/result-r1.md`;

  it("refuses to replace a recorded result without explicit Human confirmation and changes nothing", async () => {
    const alpha = await capturedAlpha();
    const before = new Map(storage.files);
    const attempt = await captureReviewResult(storage, alpha, "second result", null, false, now());
    expect(attempt.ok).toBe(false);
    expect(storage.files).toEqual(before);
  });

  it("keeps the previous text as result-r<N>-previous-<ms>.md and records it on the round", async () => {
    const alpha = await capturedAlpha();
    const firstCapturedAt = alpha.rounds[0].resultCapturedAt!;
    const out = unwrap(await captureReviewResult(storage, alpha, "second result", HEAD, true, now()));
    const archive = `result-r1-previous-${Date.parse(firstCapturedAt)}.md`;
    expect(out.archivedAs).toBe(archive);
    expect(storage.files.get(`reviews/${ALPHA_ID}/${archive}`)).toBe("first result\n");
    expect(storage.files.get(resultPath)).toBe("second result\n");
    expect(out.session.rounds[0]).toMatchObject({ archivedResults: [archive], verdict: "FIX_REQUIRED", reviewedHead: HEAD });
    expect(out.session.reviewState).toBe("FIX_REQUIRED");

    // A third capture keeps both earlier results.
    const third = unwrap(await captureReviewResult(storage, out.session, "third result", null, true, now()));
    const secondArchive = `result-r1-previous-${Date.parse(out.session.rounds[0].resultCapturedAt!)}.md`;
    expect(third.session.rounds[0].archivedResults).toEqual([archive, secondArchive]);
    expect(storage.files.get(`reviews/${ALPHA_ID}/${secondArchive}`)).toBe("second result\n");
    expect((await loadReviewArtifacts(storage, third.session)).latestResult).toEqual({ round: 1, text: "third result\n" });

    const reloaded = (await loadAll(storage)).reviews.find((r) => r.reviewId === ALPHA_ID)!.session!;
    expect(reloaded).toEqual(third.session);
    const events = parseEventsFile(storage.files.get(`reviews/${ALPHA_ID}/events.jsonl`)!).events;
    expect(events.filter((e) => e.type === "result_captured").at(-1)?.note).toContain(secondArchive);
  });

  it("never overwrites an unrecorded archive file; records it and keeps the result under the next free name (E-2)", async () => {
    const alpha = await capturedAlpha();
    const base = `result-r1-previous-${Date.parse(alpha.rounds[0].resultCapturedAt!)}`;
    storage.files.set(`reviews/${ALPHA_ID}/${base}.md`, "someone else's archive");
    const out = unwrap(await captureReviewResult(storage, alpha, "second result", null, true, now()));
    expect(out.archivedAs).toBe(`${base}-1.md`);
    expect(out.session.rounds[0].archivedResults).toEqual([`${base}.md`, `${base}-1.md`]);
    expect(storage.files.get(`reviews/${ALPHA_ID}/${base}.md`)).toBe("someone else's archive");
    expect(storage.files.get(`reviews/${ALPHA_ID}/${base}-1.md`)).toBe("first result\n");
    expect(storage.files.get(resultPath)).toBe("second result\n");
  });

  it("refuses to replace a result that changed between reading and writing it (E-6)", async () => {
    const alpha = await capturedAlpha();
    const sessionPath = `reviews/${ALPHA_ID}/session.json`;
    const sessionBefore = storage.files.get(sessionPath);
    // Another writer edits result-r1.md right after the archive is written.
    const interleaved: StorageBackend = {
      info: () => storage.info(),
      read: (target, options) => storage.read(target, options),
      write: async (target, content, precondition) => {
        await storage.write(target, content, precondition);
        if (target.kind === "review" && target.file.startsWith("result-r1-previous-")) {
          storage.files.set(resultPath, "edited externally\n");
        }
      },
      appendLine: (target, line) => storage.appendLine(target, line),
      listReviews: () => storage.listReviews(),
      quarantine: (target, options) => storage.quarantine(target, options),
      restoreBackup: (target) => storage.restoreBackup(target),
    };
    await expect(captureReviewResult(interleaved, alpha, "second result", null, true, now())).rejects.toMatchObject({ code: "CONFLICT" });
    expect(storage.files.get(resultPath)).toBe("edited externally\n");
    expect(storage.files.get(sessionPath)).toBe(sessionBefore);
  });

  it("never overwrites an archive file that appeared after DVCC chose that name (F-3)", async () => {
    const alpha = await capturedAlpha();
    const archive = `result-r1-previous-${Date.parse(alpha.rounds[0].resultCapturedAt!)}.md`;
    const archivePath = `reviews/${ALPHA_ID}/${archive}`;
    const sessionPath = `reviews/${ALPHA_ID}/session.json`;
    const sessionBefore = storage.files.get(sessionPath);
    // Another writer creates that file in the moment between "this name is free" and the write.
    const interleaved: StorageBackend = {
      info: () => storage.info(),
      read: async (target, options) => {
        const text = await storage.read(target, options);
        if (target.kind === "review" && target.file === archive && text === null) {
          storage.files.set(archivePath, "written by another program\n");
        }
        return text;
      },
      write: (target, content, precondition) => storage.write(target, content, precondition),
      appendLine: (target, line) => storage.appendLine(target, line),
      listReviews: () => storage.listReviews(),
      quarantine: (target, options) => storage.quarantine(target, options),
      restoreBackup: (target) => storage.restoreBackup(target),
    };
    await expect(captureReviewResult(interleaved, alpha, "second result", null, true, now())).rejects.toMatchObject({ code: "CONFLICT" });
    expect(storage.files.get(archivePath)).toBe("written by another program\n");
    expect(storage.files.get(resultPath)).toBe("first result\n");
    expect(storage.files.get(sessionPath)).toBe(sessionBefore);
  });

  it("can retry after the session write failed: the unrecorded archive is recorded, nothing is lost (E-2)", async () => {
    const alpha = await capturedAlpha();
    const base = `result-r1-previous-${Date.parse(alpha.rounds[0].resultCapturedAt!)}`;
    const sessionPath = `reviews/${ALPHA_ID}/session.json`;
    storage.failingWrites.add(sessionPath);
    await expect(captureReviewResult(storage, alpha, "second result", null, true, now())).rejects.toMatchObject({ code: "WRITE_FAILED" });
    storage.failingWrites.delete(sessionPath);
    expect(storage.files.get(`reviews/${ALPHA_ID}/${base}.md`)).toBe("first result\n");
    expect(storage.files.get(resultPath)).toBe("second result\n");

    const reloaded = (await loadAll(storage)).reviews.find((r) => r.reviewId === ALPHA_ID)!.session!;
    expect(reloaded.rounds[0].archivedResults).toEqual([]);
    const out = unwrap(await captureReviewResult(storage, reloaded, "third result", null, true, now()));
    expect(out.session.rounds[0].archivedResults).toEqual([`${base}.md`, `${base}-1.md`]);
    expect(storage.files.get(`reviews/${ALPHA_ID}/${base}.md`)).toBe("first result\n");
    expect(storage.files.get(`reviews/${ALPHA_ID}/${base}-1.md`)).toBe("second result\n");
    expect(storage.files.get(resultPath)).toBe("third result\n");
  });

  it("can retry after the result write failed: the archive already holding the text is reused (E-2)", async () => {
    const alpha = await capturedAlpha();
    const base = `result-r1-previous-${Date.parse(alpha.rounds[0].resultCapturedAt!)}`;
    storage.failingWrites.add(resultPath);
    await expect(captureReviewResult(storage, alpha, "second result", null, true, now())).rejects.toMatchObject({ code: "WRITE_FAILED" });
    storage.failingWrites.delete(resultPath);
    expect(storage.files.get(resultPath)).toBe("first result\n");

    const out = unwrap(await captureReviewResult(storage, alpha, "second result", null, true, now()));
    expect(out.archivedAs).toBe(`${base}.md`);
    expect(out.session.rounds[0].archivedResults).toEqual([`${base}.md`]);
    expect(storage.files.has(`reviews/${ALPHA_ID}/${base}-1.md`)).toBe(false);
    expect(storage.files.get(`reviews/${ALPHA_ID}/${base}.md`)).toBe("first result\n");
    expect(storage.files.get(resultPath)).toBe("second result\n");
  });

  it("can capture again after session.json went back to an older state (e.g. restored from .bak) (E-2)", async () => {
    const alpha = await capturedAlpha();
    const base = `result-r1-previous-${Date.parse(alpha.rounds[0].resultCapturedAt!)}`;
    const sessionPath = `reviews/${ALPHA_ID}/session.json`;
    const older = storage.files.get(sessionPath)!;
    unwrap(await captureReviewResult(storage, alpha, "second result", null, true, now()));
    storage.files.set(sessionPath, older);

    const restored = (await loadAll(storage)).reviews.find((r) => r.reviewId === ALPHA_ID)!.session!;
    const out = unwrap(await captureReviewResult(storage, restored, "third result", null, true, now()));
    expect(out.session.rounds[0].archivedResults).toEqual([`${base}.md`, `${base}-1.md`]);
    expect(storage.files.get(`reviews/${ALPHA_ID}/${base}.md`)).toBe("first result\n");
    expect(storage.files.get(`reviews/${ALPHA_ID}/${base}-1.md`)).toBe("second result\n");
    expect(storage.files.get(resultPath)).toBe("third result\n");
  });

  it("archives an orphan result file (written but never recorded) instead of overwriting it", async () => {
    await seed(storage);
    let alpha = (await loadAll(storage)).reviews[0].session!;
    alpha = await act(storage, alpha, { type: "markReady" });
    alpha = await act(storage, alpha, { type: "startReview" });
    storage.files.set(resultPath, "orphan text from an interrupted capture\n");
    const out = unwrap(await captureReviewResult(storage, alpha, "new result", null, false, now()));
    expect(out.archivedAs).toMatch(/^result-r1-previous-\d+\.md$/);
    expect(storage.files.get(`reviews/${ALPHA_ID}/${out.archivedAs}`)).toBe("orphan text from an interrupted capture\n");
    expect(storage.files.get(resultPath)).toBe("new result\n");
  });
});

describe("write failures", () => {
  it("does not report success when a write fails", async () => {
    const { projects, alpha } = await seed(storage);
    storage.failingWrites.add("projects.json");
    await expect(saveNewProject(storage, projects, { status: "ok" }, projectForm("project-gamma", "Project Gamma"), now())).rejects.toBeInstanceOf(StorageError);
    storage.failingWrites.add(`reviews/${ALPHA_ID}/session.json`);
    await expect(performReviewAction(storage, alpha, { type: "markReady" }, now())).rejects.toMatchObject({ code: "WRITE_FAILED" });
    const loaded = await loadAll(storage);
    expect(loaded.projects).toEqual(projects);
    expect(loaded.reviews[0].session).toEqual(alpha);
  });

  it("does not suspend when the checkpoint cannot be written", async () => {
    const { alpha } = await seed(storage);
    storage.failingWrites.add(`reviews/${ALPHA_ID}/checkpoint.md`);
    await expect(
      performReviewAction(storage, alpha, { type: "suspend", resourceState: "COLD", checkpoint: "cp" }, now()),
    ).rejects.toMatchObject({ code: "WRITE_FAILED" });
    expect((await loadAll(storage)).reviews[0].session?.reviewState).toBe("NEW");
  });

  it("returns a warning (not a failure) when only the event append fails", async () => {
    const { alpha } = await seed(storage);
    storage.failAppends = true;
    const out = unwrap(await performReviewAction(storage, alpha, { type: "markReady" }, now()));
    expect(out.warning?.key).toBe("service.eventAppendFailed");
    expect((await loadAll(storage)).reviews[0].session?.reviewState).toBe("READY_FOR_REVIEW");
  });

  it("validates before writing artifacts", async () => {
    const { alpha } = await seed(storage);
    const notAllowed = await captureReviewResult(storage, alpha, "text", null, false, now());
    expect(notAllowed.ok).toBe(false);
    const reviewing = await act(storage, await act(storage, alpha, { type: "markReady" }), { type: "startReview" });
    expect((await captureReviewResult(storage, reviewing, "   ", null, false, now())).ok).toBe(false);
    expect((await captureReviewResult(storage, reviewing, "text", "zzz", false, now())).ok).toBe(false);
    expect(storage.files.has(`reviews/${ALPHA_ID}/result-r1.md`)).toBe(false);
  });
});
