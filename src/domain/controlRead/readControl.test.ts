import { describe, expect, it } from "vitest";
import type { Project } from "../project";
import { createReviewSession, emptyReviewForm, type ReviewSession } from "../review";
import { isValidProjectId, isValidReviewId } from "../validation";
import { MemoryStorage } from "../../test/memoryStorage";
import { loadAll } from "../../services/persistence";
import {
  CONTROL_READ_CONTRACT,
  OMITTED_SECTIONS,
  type ControlReadError,
  type ControlReadResult,
  type ControlReadSource,
  type ControlReadSourceReview,
  type ControlSnapshotV1,
  type Envelope,
  type ReviewStateV1,
  type SourceHealthStatus,
} from "./contract";
import { readControl } from "./readControl";

const PROJECT_ID = "project-alpha";
const REVIEW_ID = "rv-20261004-alpha1";
const NOW = "2026-10-04T02:00:00.000Z";
const ENV = { now: () => NOW, newSnapshotId: () => "snap-00000000-0000-4000-8000-000000000000" };

function project(overrides: Partial<Project> = {}): Project {
  return {
    projectId: PROJECT_ID,
    displayName: "Alpha",
    repositoryUrl: "https://github.com/example-org/example-app",
    localRoot: "C:\\example\\alpha",
    developmentIde: null,
    nextAction: "",
    notes: "",
    createdAt: "2026-09-20T03:00:00.000Z",
    updatedAt: "2026-09-20T03:00:00.000Z",
    ...overrides,
  };
}

function newSession(id = REVIEW_ID, projectId = PROJECT_ID): ReviewSession {
  const created = createReviewSession(emptyReviewForm(projectId), new Set([projectId]), id, "2026-10-04T01:00:00.000Z");
  if (!created.ok) throw new Error("fixture session");
  return created.value.session;
}

function loaded(session: ReviewSession | null, status: SourceHealthStatus = "ok", reviewId = session?.reviewSessionId ?? REVIEW_ID): ControlReadSourceReview {
  return { reviewId, session, health: { status } };
}

function source(parts: Partial<ControlReadSource> = {}): ControlReadSource {
  return { phase: "ready", projects: [project()], projectsHealth: { status: "ok" }, reviews: [loaded(newSession())], gitObservations: {}, ...parts };
}

const request = <F extends Record<string, unknown>>(fields: F) => ({ contract: CONTROL_READ_CONTRACT, version: 1, ...fields });
const snapshotRequest = request({ operation: "get_control_snapshot", project_id: PROJECT_ID });

function errorOf(result: ControlReadResult): ControlReadError["error"] {
  if (!("error" in result)) throw new Error(`expected an error, got ${JSON.stringify(result).slice(0, 120)}`);
  expect(result.contract).toBe("dvcc.control-read");
  expect(result.version).toBe(1);
  return result.error;
}

describe("readControl — envelope", () => {
  it("returns a versioned envelope with injected time and identifier", () => {
    const result = readControl(snapshotRequest, source(), ENV) as Envelope<ControlSnapshotV1>;
    expect(result).toMatchObject({
      contract: "dvcc.control-read",
      version: 1,
      operation: "get_control_snapshot",
      snapshot_id: "snap-00000000-0000-4000-8000-000000000000",
      generated_at: NOW,
      complete: true,
      limits_applied: [],
      omitted_sections: [...OMITTED_SECTIONS],
    });
    expect(result.data.project.project_id).toBe(PROJECT_ID);
    expect(result.data.reviews.map((review) => review.review_session_id)).toEqual([REVIEW_ID]);
  });

  it("reports truncation in the envelope: complete false with the applied limits", () => {
    const many = Array.from({ length: 53 }, (_, index) => loaded(newSession(`rv-202610${String(index).padStart(2, "0")}-aaaaaa`)));
    const result = readControl(snapshotRequest, source({ reviews: many }), ENV) as Envelope<ControlSnapshotV1>;
    expect(result.complete).toBe(false);
    expect(result.limits_applied).toEqual(["MAX_REVIEWS"]);
    const projectResult = readControl(request({ operation: "get_project_state", project_id: PROJECT_ID }), source({ reviews: many }), ENV);
    expect(projectResult).toMatchObject({ complete: false, limits_applied: ["MAX_REVIEWS"] });
  });

  it("identifies a project by its projectId only — never by display name, folder name or repository name", () => {
    const named = project({ displayName: "other-name", localRoot: "C:\\example\\folder-name", repositoryUrl: "https://github.com/example-org/repo-name" });
    for (const alias of ["other-name", "folder-name", "repo-name", "example-org"]) {
      expect(errorOf(readControl(request({ operation: "get_project_state", project_id: alias }), source({ projects: [named] }), ENV)), alias).toEqual({
        code: "TARGET_NOT_FOUND",
      });
    }
    expect("error" in readControl(request({ operation: "get_project_state", project_id: PROJECT_ID }), source({ projects: [named] }), ENV)).toBe(false);
  });

  it("serves get_project_state and get_review_state from the same projection", () => {
    const snapshot = readControl(snapshotRequest, source(), ENV) as Envelope<ControlSnapshotV1>;
    const projectResult = readControl(request({ operation: "get_project_state", project_id: PROJECT_ID }), source(), ENV);
    expect(projectResult).toMatchObject({ operation: "get_project_state", data: snapshot.data.project });
    const reviewResult = readControl(request({ operation: "get_review_state", review_session_id: REVIEW_ID }), source(), ENV) as Envelope<ReviewStateV1>;
    expect(reviewResult.operation).toBe("get_review_state");
    expect(reviewResult.data).toEqual(snapshot.data.reviews[0]);
  });
});

describe("readControl — validation order (Task Packet rev 3.2 §6)", () => {
  it("1. refuses anything that is not a plain object", () => {
    for (const bad of [null, undefined, 1, "x", [], [snapshotRequest], new Date(), Object.create({ contract: CONTROL_READ_CONTRACT })]) {
      expect(errorOf(readControl(bad, source(), ENV))).toEqual({ code: "INVALID_REQUEST", reason: "NOT_AN_OBJECT" });
    }
  });

  it("2. refuses another contract", () => {
    for (const contract of [undefined, "", "dvcc.control.read", "DVCC.CONTROL-READ", 1]) {
      expect(errorOf(readControl({ ...snapshotRequest, contract }, source(), ENV))).toEqual({ code: "UNSUPPORTED_CONTRACT" });
    }
  });

  it("3. refuses every version but the number 1, without negotiation", () => {
    for (const version of [undefined, "1", 2, 0, 1.5, -1, null]) {
      expect(errorOf(readControl({ ...snapshotRequest, version }, source(), ENV))).toEqual({
        code: "UNSUPPORTED_CONTRACT_VERSION",
        reason: "REQUESTED_VERSION_NOT_SUPPORTED",
        supported_versions: [1],
      });
    }
  });

  it("4. refuses unknown operations, and get_run_state for lack of an authoritative run source", () => {
    for (const operation of [undefined, "", "get_everything", "evaluate_action", "launch_codex_resume"]) {
      expect(errorOf(readControl(request({ operation, project_id: PROJECT_ID }), source(), ENV))).toEqual({ code: "UNSUPPORTED_OPERATION" });
    }
    expect(errorOf(readControl(request({ operation: "get_run_state", run_id: "anything" }), source(), ENV))).toEqual({
      code: "UNSUPPORTED_OPERATION",
      reason: "NO_AUTHORITATIVE_RUN_SOURCE",
    });
  });

  it("5. refuses unrecognized fields: safe names listed, unsafe names only counted (RF-5A-R3-01)", () => {
    // safe unknown key only
    expect(errorOf(readControl({ ...snapshotRequest, include_paths: true }, source(), ENV))).toEqual({
      code: "INVALID_REQUEST",
      reason: "UNRECOGNIZED_FIELD",
      fields: ["include_paths"],
    });
    // unsafe unknown key only
    const unsafeOnly = errorOf(readControl({ ...snapshotRequest, "C:\\SENTINEL-KEY": 1 }, source(), ENV));
    expect(unsafeOnly).toEqual({ code: "INVALID_REQUEST", reason: "UNRECOGNIZED_FIELD", unlisted_field_count: 1 });
    // mixed: one safe, two unsafe
    const mixed = errorOf(readControl({ ...snapshotRequest, extra_field: 1, "Bad Name": 2, "ghp_SENTINEL": 3 }, source(), ENV));
    expect(mixed).toEqual({ code: "INVALID_REQUEST", reason: "UNRECOGNIZED_FIELD", fields: ["extra_field"], unlisted_field_count: 2 });
    // keys of another operation are unrecognized too
    expect(errorOf(readControl({ ...snapshotRequest, review_session_id: REVIEW_ID }, source(), ENV))).toMatchObject({ fields: ["review_session_id"] });
  });

  it("6. refuses a missing or mistyped target field", () => {
    expect(errorOf(readControl(request({ operation: "get_project_state" }), source(), ENV))).toEqual({
      code: "INVALID_REQUEST",
      reason: "MISSING_FIELD",
      fields: ["project_id"],
    });
    for (const value of [1, null, ["project-alpha"], { id: PROJECT_ID }]) {
      expect(errorOf(readControl(request({ operation: "get_project_state", project_id: value }), source(), ENV))).toEqual({
        code: "INVALID_REQUEST",
        reason: "INVALID_FIELD_TYPE",
        fields: ["project_id"],
      });
    }
  });

  it("7. judges the target format exactly as the existing validators do", () => {
    const projectIds = [PROJECT_ID, "ab", "a", "A-b", "a_b", "a b", "-ab", "a".repeat(64), "a".repeat(65), "C:\\x", "../x", "Alpha", "x/y", "rv-20261004-alpha1"];
    for (const id of projectIds) {
      const result = readControl(request({ operation: "get_project_state", project_id: id }), source({ projects: [] }), ENV);
      const code = "error" in result ? result.error.code : "OK";
      expect(code === "INVALID_TARGET", id).toBe(!isValidProjectId(id));
    }
    const reviewIds = [REVIEW_ID, "rv-2026100-alpha1", "rv-20261004-ALPHA1", "rv-20261004-alpha", "RV-20261004-alpha1", "rv-20261004-alpha1 ", "project-alpha"];
    for (const id of reviewIds) {
      const result = readControl(request({ operation: "get_review_state", review_session_id: id }), source({ reviews: [] }), ENV);
      const code = "error" in result ? result.error.code : "OK";
      expect(code === "INVALID_TARGET", id).toBe(!isValidReviewId(id));
    }
  });

  it("8. refuses while the app is not loaded", () => {
    for (const phase of ["loading", "fatal"] as const) {
      expect(errorOf(readControl(snapshotRequest, source({ phase }), ENV))).toEqual({ code: "SOURCE_UNAVAILABLE", reason: "APP_NOT_READY" });
    }
  });

  it("keeps the order: version before unknown fields, format before source, registry before lookup", () => {
    expect(errorOf(readControl({ ...snapshotRequest, version: 2, extra_field: 1 }, source(), ENV)).code).toBe("UNSUPPORTED_CONTRACT_VERSION");
    expect(errorOf(readControl(request({ operation: "get_project_state", project_id: "Bad Id" }), source({ projectsHealth: { status: "unreadable" } }), ENV)).code).toBe("INVALID_TARGET");
    expect(
      errorOf(readControl(request({ operation: "get_project_state", project_id: "project-absent" }), source({ projects: [], projectsHealth: { status: "io_error" } }), ENV)),
    ).toEqual({ code: "SOURCE_UNAVAILABLE", reason: "REGISTRY_IO_ERROR" });
  });
});

describe("readControl — unreadable sources fail closed (RF-5A-R2-02)", () => {
  const operations = [
    request({ operation: "get_control_snapshot", project_id: PROJECT_ID }),
    request({ operation: "get_project_state", project_id: PROJECT_ID }),
    request({ operation: "get_review_state", review_session_id: REVIEW_ID }),
  ];
  const gates: [SourceHealthStatus, string | null][] = [
    ["ok", null],
    ["restored_from_backup", null],
    ["missing", null],
    ["unreadable", "REGISTRY_UNREADABLE"],
    ["io_error", "REGISTRY_IO_ERROR"],
    ["unsupported_version", "REGISTRY_UNSUPPORTED_VERSION"],
  ];

  it.each(gates)("registry %s", (status, reason) => {
    for (const op of operations) {
      // An unreadable registry looks empty in memory; that emptiness must never read as "not found".
      const src = source({ projectsHealth: { status }, projects: reason === null && status !== "missing" ? [project()] : [] });
      const result = readControl(op, src, ENV);
      if (reason !== null) {
        expect(errorOf(result)).toEqual({ code: "SOURCE_UNAVAILABLE", reason });
      } else if (status === "missing" && op.operation !== "get_review_state") {
        expect(errorOf(result)).toEqual({ code: "TARGET_NOT_FOUND" });
      } else {
        expect("error" in result, `${status} ${String(op.operation)}`).toBe(false);
      }
    }
  });

  it("reports registry_health as read", () => {
    const restored = readControl(snapshotRequest, source({ projectsHealth: { status: "restored_from_backup" } }), ENV) as Envelope<ControlSnapshotV1>;
    expect(restored.data.project.registry_health).toBe("restored_from_backup");
  });

  it("separates a missing review from an unreadable one", () => {
    const reviewRequest = request({ operation: "get_review_state", review_session_id: REVIEW_ID });
    expect(errorOf(readControl(reviewRequest, source({ reviews: [] }), ENV))).toEqual({ code: "TARGET_NOT_FOUND" });
    const mapping: [SourceHealthStatus, string][] = [
      ["unreadable", "UNREADABLE"],
      ["io_error", "IO_ERROR"],
      ["unsupported_version", "UNSUPPORTED_VERSION"],
      ["missing", "MISSING"],
    ];
    for (const [status, reason] of mapping) {
      expect(errorOf(readControl(reviewRequest, source({ reviews: [loaded(null, status)] }), ENV)), status).toEqual({ code: "TARGET_UNAVAILABLE", reason });
    }
  });

  it("keeps unreadable reviews out of the snapshot and only counts them", () => {
    const result = readControl(snapshotRequest, source({ reviews: [loaded(newSession()), loaded(null, "unreadable", "rv-20261005-broken")] }), ENV) as Envelope<ControlSnapshotV1>;
    expect(result.data.unattributable_review_count).toBe(1);
    expect(result.data.reviews.map((review) => review.review_session_id)).toEqual([REVIEW_ID]);
    expect(result.data.project.review_session_ids).toEqual([REVIEW_ID]);
  });

  it("answers get_review_state for a readable review whose project is not registered", () => {
    const orphan = newSession("rv-20261004-orphan", "project-gone");
    const result = readControl(request({ operation: "get_review_state", review_session_id: "rv-20261004-orphan" }), source({ reviews: [loaded(orphan)] }), ENV) as Envelope<ReviewStateV1>;
    expect(result.data.freshness).toEqual({ class: "UNKNOWN", unknown_reason: "PROJECT_NOT_REGISTERED" });
  });
});

describe("persistence invariant: session !== null ⇔ health.status ∈ {ok, restored_from_backup}", () => {
  it("holds for every file state loadAll produces", async () => {
    const storage = new MemoryStorage();
    const valid = newSession("rv-20261004-valid1");
    storage.files.set("projects.json", JSON.stringify({ schemaVersion: 1, projects: [project()] }));
    storage.files.set(`reviews/${valid.reviewSessionId}/session.json`, JSON.stringify(valid));
    storage.files.set("reviews/rv-20261004-broken/session.json", "{ not json");
    storage.files.set("reviews/rv-20261004-future/session.json", JSON.stringify({ ...newSession("rv-20261004-future"), schemaVersion: 99 }));
    storage.files.set("reviews/rv-20261004-nofile/checkpoint.md", "only a checkpoint");
    storage.files.set("reviews/rv-20261004-ioerr1/session.json", JSON.stringify(newSession("rv-20261004-ioerr1")));
    storage.failingReads.set("reviews/rv-20261004-ioerr1/session.json", "READ_FAILED");
    const restored = newSession("rv-20261004-restor");
    storage.files.set(`reviews/${restored.reviewSessionId}/session.json`, "{ corrupt");
    storage.files.set(`reviews/${restored.reviewSessionId}/session.json.bak`, JSON.stringify(restored));

    const data = await loadAll(storage);
    const statuses = new Map(data.reviews.map((review) => [review.reviewId, review.health.status]));
    expect(statuses.get("rv-20261004-valid1")).toBe("ok");
    expect(statuses.get("rv-20261004-broken")).toBe("unreadable");
    expect(statuses.get("rv-20261004-future")).toBe("unsupported_version");
    expect(statuses.get("rv-20261004-nofile")).toBe("unreadable");
    expect(statuses.get("rv-20261004-ioerr1")).toBe("io_error");
    expect(statuses.get("rv-20261004-restor")).toBe("restored_from_backup");
    for (const review of data.reviews) {
      const readable = review.health.status === "ok" || review.health.status === "restored_from_backup";
      expect(review.session !== null, review.reviewId).toBe(readable);
    }

    // And Control Read over that real load: readable reviews project, the rest is only counted.
    const src: ControlReadSource = { phase: "ready", projects: data.projects, projectsHealth: data.projectsHealth, reviews: data.reviews, gitObservations: {} };
    const before = new Map(storage.files);
    const result = readControl(snapshotRequest, src, ENV) as Envelope<ControlSnapshotV1>;
    expect(result.data.project.review_session_ids.sort()).toEqual(["rv-20261004-restor", "rv-20261004-valid1"]);
    expect(result.data.unattributable_review_count).toBe(4);
    expect(new Map(storage.files)).toEqual(before);
  });
});
