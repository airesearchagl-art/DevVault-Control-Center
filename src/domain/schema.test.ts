import { describe, expect, it } from "vitest";
import { fixture } from "../test/fixtures";
import { createProject, emptyProjectForm } from "./project";
import { createReviewSession, emptyReviewForm } from "./review";
import {
  parseEventLine,
  parseEventsFile,
  parseProjectsFile,
  parseSessionFile,
  serializeEvent,
  serializeProjectsFile,
  serializeSession,
} from "./schema";
import { applyReviewAction } from "./transitions";

const ALPHA = "rv-20260101-alpha1";

describe("valid fixtures", () => {
  it("parses projects.json", () => {
    const result = parseProjectsFile(fixture("valid/projects.json"));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.value.map((p) => p.displayName)).toEqual(["Project Alpha", "Project Beta", "Project Gamma"]);
    expect(result.value[2]).toMatchObject({ repositoryUrl: null, localRoot: null, developmentIde: null });
  });

  it("parses a suspended session with its round history", () => {
    const result = parseSessionFile(fixture(`valid/reviews/${ALPHA}/session.json`), ALPHA);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.value).toMatchObject({
      reviewState: "SUSPENDED",
      suspendedFrom: "FIX_REQUIRED",
      resourceState: "WARM",
      prNumber: 45,
      reviewRound: 1,
    });
    expect(result.value.rounds[0].verdict).toBe("FIX_REQUIRED");
  });

  it("parses the beta session and every alpha event", () => {
    expect(parseSessionFile(fixture("valid/reviews/rv-20260102-beta01/session.json"), "rv-20260102-beta01").status).toBe("ok");
    const events = parseEventsFile(fixture(`valid/reviews/${ALPHA}/events.jsonl`));
    expect(events.skippedLines).toBe(0);
    expect(events.events.map((e) => e.type)).toEqual([
      "review_created",
      "review_ready",
      "request_saved",
      "review_started",
      "result_captured",
      "verdict_confirmed",
      "suspended",
    ]);
  });
});

describe("malformed fixtures", () => {
  it("reports truncated JSON as malformed", () => {
    const result = parseProjectsFile(fixture("malformed/projects.truncated.json"));
    expect(result.status).toBe("malformed");
  });

  it("reports a newer schema version as unsupported (read-only)", () => {
    expect(parseProjectsFile(fixture("malformed/projects.future-version.json"))).toEqual({
      status: "unsupported_version",
      version: 2,
    });
  });

  it("rejects an unknown review state", () => {
    const result = parseSessionFile(fixture("malformed/session.unknown-state.json"), "rv-20260103-gamma1");
    expect(result).toMatchObject({ status: "malformed" });
  });

  it("skips broken or unknown event lines without failing", () => {
    const events = parseEventsFile(fixture("malformed/events.partial-line.jsonl"));
    expect(events.events.map((e) => e.type)).toEqual(["review_created", "review_ready"]);
    expect(events.skippedLines).toBe(2);
  });
});

describe("contract violations", () => {
  const session = JSON.parse(fixture(`valid/reviews/${ALPHA}/session.json`)) as Record<string, unknown>;
  const variant = (patch: Record<string, unknown>) => JSON.stringify({ ...session, ...patch });

  it.each([
    ["folder mismatch", variant({}), "rv-20260101-other1"],
    ["missing schemaVersion", variant({ schemaVersion: undefined }), ALPHA],
    ["SUSPENDED without suspendedFrom", variant({ suspendedFrom: null }), ALPHA],
    ["suspendedFrom while not suspended", variant({ reviewState: "REVIEWING" }), ALPHA],
    ["suspendedFrom = CLOSED", variant({ suspendedFrom: "CLOSED" }), ALPHA],
    ["unknown resource", variant({ resourceState: "LUKEWARM" }), ALPHA],
    ["reviewRound mismatch", variant({ reviewRound: 2 }), ALPHA],
    ["empty rounds", variant({ rounds: [], reviewRound: 0 }), ALPHA],
    ["uppercase HEAD", variant({ rounds: [{ ...(session.rounds as object[])[0], expectedHead: "ABCDEF1" }] }), ALPHA],
    ["non-ChatGPT thread URL", variant({ chatgptThreadUrl: "https://evil.example/c/x" }), ALPHA],
    ["negative PR", variant({ prNumber: -3 }), ALPHA],
    ["bad timestamp", variant({ updatedAt: "yesterday" }), ALPHA],
    ["array top-level", "[]", ALPHA],
  ])("rejects %s", (_name, text, id) => {
    expect(parseSessionFile(text, id).status).toBe("malformed");
  });

  it("rejects duplicate project ids and non-normalized repository URLs", () => {
    const base = JSON.parse(fixture("valid/projects.json")) as { projects: Record<string, unknown>[] };
    const dup = { schemaVersion: 1, projects: [base.projects[0], base.projects[0]] };
    expect(parseProjectsFile(JSON.stringify(dup)).status).toBe("malformed");
    const trailing = { schemaVersion: 1, projects: [{ ...base.projects[0], repositoryUrl: "https://github.com/example-org/project-alpha/" }] };
    expect(parseProjectsFile(JSON.stringify(trailing)).status).toBe("malformed");
  });

  it("rejects event lines with unknown state names", () => {
    const line = '{"v":1,"ts":"2026-01-01T10:00:00.000Z","type":"resumed","reviewSessionId":"rv-20260101-alpha1","round":1,"reviewState":{"from":"SUSPENDED","to":"LATER"},"resourceState":null,"note":null}';
    expect(parseEventLine(line)).toBeNull();
  });
});

describe("serialize → parse round trip", () => {
  const now = "2026-02-01T00:00:00.000Z";

  it("round-trips projects", () => {
    const created = createProject(
      { ...emptyProjectForm(), projectId: "project-alpha", displayName: "Project Alpha", repositoryUrl: "https://github.com/example-org/project-alpha", localRoot: "C:\\example\\project-alpha" },
      new Set(),
      now,
    );
    if (!created.ok) throw new Error("fixture invalid");
    expect(parseProjectsFile(serializeProjectsFile([created.value]))).toEqual({ status: "ok", value: [created.value] });
  });

  it("round-trips sessions and events", () => {
    const created = createReviewSession(
      { ...emptyReviewForm("project-alpha"), prNumber: "7", chatgptThreadUrl: "https://chatgpt.com/c/example-thread-alpha" },
      new Set(["project-alpha"]),
      ALPHA,
      now,
    );
    if (!created.ok) throw new Error("fixture invalid");
    const suspended = applyReviewAction(created.value.session, { type: "suspend", resourceState: "COLD", checkpoint: "cp" }, now);
    if (!suspended.ok) throw new Error(JSON.stringify(suspended.error));
    expect(parseSessionFile(serializeSession(suspended.value.session), ALPHA)).toEqual({ status: "ok", value: suspended.value.session });
    expect(parseEventLine(serializeEvent(suspended.value.event))).toEqual(suspended.value.event);
    expect(serializeEvent(suspended.value.event)).not.toContain("\n");
  });
});
