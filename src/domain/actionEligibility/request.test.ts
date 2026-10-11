import { describe, expect, it } from "vitest";
import { assessError, entry, fRev, ID_A, ID_X, request, sourceOf } from "../../test/actionEligibilityFixtures";
import type { ControlReadSource } from "../controlRead/contract";

/** Annex D: REQ (request validation, steps 1–6 and precedence) and DEL (delegated basis errors). */

const omit = (field: string) => {
  const value = request();
  delete value[field];
  return value;
};

const fRevSource = () => sourceOf(fRev());
const unreadableRegistry = (parts: Partial<ControlReadSource> = {}) => sourceOf(fRev(), { projectsHealth: { status: "unreadable" }, ...parts });
const duplicateA = () => [entry(fRev()), entry(fRev())];

describe("REQ — request validation", () => {
  it.each([
    { case_id: "REQ-01-01", input: null },
    { case_id: "REQ-01-02", input: undefined },
    { case_id: "REQ-01-03", input: 42 },
    { case_id: "REQ-01-04", input: "s" },
    { case_id: "REQ-01-05", input: true },
    { case_id: "REQ-01-06", input: [] },
    { case_id: "REQ-01-07", input: new Date(0) },
    { case_id: "REQ-01-08", input: Object.create({}) },
  ])("$case_id a non-plain-object request is NOT_AN_OBJECT", ({ input }) => {
    expect(assessError(input, fRevSource())).toEqual({ code: "INVALID_REQUEST", reason: "NOT_AN_OBJECT" });
  });

  it.each([
    { case_id: "REQ-02-01", input: request(ID_A, { contract: "dvcc.control-read" }) },
    { case_id: "REQ-02-02", input: request(ID_A, { contract: "dvcc.action-eligibility " }) },
    { case_id: "REQ-02-03", input: omit("contract") },
    { case_id: "REQ-02-04", input: request(ID_A, { contract: 1 }) },
  ])("$case_id another contract is UNSUPPORTED_CONTRACT", ({ input }) => {
    expect(assessError(input, fRevSource())).toEqual({ code: "UNSUPPORTED_CONTRACT" });
  });

  it.each([
    { case_id: "REQ-03-01", input: request(ID_A, { version: 2 }) },
    { case_id: "REQ-03-02", input: request(ID_A, { version: "1" }) },
    { case_id: "REQ-03-03", input: request(ID_A, { version: 0 }) },
    { case_id: "REQ-03-04", input: omit("version") },
    { case_id: "REQ-03-05", input: request(ID_A, { version: 1.5 }) },
    { case_id: "REQ-03-06", input: request(ID_A, { version: null }) },
  ])("$case_id another version is UNSUPPORTED_CONTRACT_VERSION with supported_versions [1]", ({ input }) => {
    expect(assessError(input, fRevSource())).toEqual({
      code: "UNSUPPORTED_CONTRACT_VERSION",
      reason: "REQUESTED_VERSION_NOT_SUPPORTED",
      supported_versions: [1],
    });
  });

  it.each([
    { case_id: "REQ-04-01", input: request(ID_A, { operation: "get_review_state" }) },
    { case_id: "REQ-04-02", input: request(ID_A, { operation: "assess" }) },
    { case_id: "REQ-04-03", input: omit("operation") },
    { case_id: "REQ-04-04", input: request(ID_A, { operation: 1 }) },
  ])("$case_id another operation is UNSUPPORTED_OPERATION without a reason", ({ input }) => {
    expect(assessError(input, fRevSource())).toEqual({ code: "UNSUPPORTED_OPERATION" });
  });

  it.each([
    { case_id: "REQ-05-01", extra: { actor: "x" }, expected: { fields: ["actor"] } },
    { case_id: "REQ-05-02", extra: { permission: 1, actor: "x", grant: true }, expected: { fields: ["actor", "grant", "permission"] } },
    { case_id: "REQ-05-03", extra: { "Bad Key": 1 }, expected: { unlisted_field_count: 1 } },
    { case_id: "REQ-05-04", extra: { actor: "x", "Bad Key": 1 }, expected: { fields: ["actor"], unlisted_field_count: 1 } },
    { case_id: "REQ-05-05", extra: { verdict: "REVIEW_PASS" }, expected: { fields: ["verdict"] } },
    { case_id: "REQ-05-06", extra: { note: "n" }, expected: { fields: ["note"] } },
    { case_id: "REQ-05-07", extra: { expected_head: "0123456" }, expected: { fields: ["expected_head"] } },
    { case_id: "REQ-05-08", extra: { confirmed_by_human: true }, expected: { fields: ["confirmed_by_human"] } },
    { case_id: "REQ-05-09", extra: { action_id: "review.start_review" }, expected: { fields: ["action_id"] } },
    { case_id: "REQ-05-10", extra: { actions: [] }, expected: { fields: ["actions"] } },
  ])("$case_id unrecognized fields are named (echoable) or counted, never carried", ({ extra, expected }) => {
    expect(assessError(request(ID_A, extra), fRevSource())).toEqual({ code: "INVALID_REQUEST", reason: "UNRECOGNIZED_FIELD", ...expected });
  });

  it("REQ-06-01 a missing review_session_id is MISSING_FIELD", () => {
    expect(assessError(omit("review_session_id"), fRevSource())).toEqual({
      code: "INVALID_REQUEST",
      reason: "MISSING_FIELD",
      fields: ["review_session_id"],
    });
  });

  it.each([
    { case_id: "REQ-06-02", value: 123 },
    { case_id: "REQ-06-03", value: null },
    { case_id: "REQ-06-04", value: {} },
  ])("$case_id a non-string review_session_id is INVALID_FIELD_TYPE", ({ value }) => {
    expect(assessError(request(value), fRevSource())).toEqual({
      code: "INVALID_REQUEST",
      reason: "INVALID_FIELD_TYPE",
      fields: ["review_session_id"],
    });
  });

  it("REQ-07-01 version is decided before unknown fields", () => {
    expect(assessError(request(ID_A, { version: 2, actor: "x" }), fRevSource())).toMatchObject({ code: "UNSUPPORTED_CONTRACT_VERSION" });
  });

  it("REQ-07-02 contract is decided before version", () => {
    expect(assessError(request(ID_A, { contract: "dvcc.control-read", version: 2 }), fRevSource())).toEqual({ code: "UNSUPPORTED_CONTRACT" });
  });

  it("REQ-07-03 operation is decided before unknown fields", () => {
    expect(assessError(request(ID_A, { operation: "assess", actor: "x" }), fRevSource())).toEqual({ code: "UNSUPPORTED_OPERATION" });
  });

  it("REQ-07-04 unknown fields are decided before a missing review_session_id", () => {
    const input = omit("review_session_id");
    input.actor = "x";
    expect(assessError(input, fRevSource())).toMatchObject({ code: "INVALID_REQUEST", reason: "UNRECOGNIZED_FIELD" });
  });

  it("REQ-07-05 an invalid id format is decided before an unreadable registry", () => {
    expect(assessError(request("rv-bad"), unreadableRegistry())).toEqual({ code: "INVALID_TARGET" });
  });

  it("REQ-07-06 an unreadable registry is decided before a duplicated review id", () => {
    expect(assessError(request(), unreadableRegistry({ reviews: duplicateA() }))).toEqual({
      code: "SOURCE_UNAVAILABLE",
      reason: "REGISTRY_UNREADABLE",
    });
  });

  it("REQ-07-07 a loading app is decided before a duplicated review id", () => {
    expect(assessError(request(), sourceOf(fRev(), { phase: "loading", reviews: duplicateA() }))).toEqual({
      code: "SOURCE_UNAVAILABLE",
      reason: "APP_NOT_READY",
    });
  });

  it("REQ-07-08 an unreadable registry is never reported as not found", () => {
    expect(assessError(request(ID_X), unreadableRegistry())).toEqual({ code: "SOURCE_UNAVAILABLE", reason: "REGISTRY_UNREADABLE" });
  });
});

describe("DEL — delegated basis errors", () => {
  it.each([
    { case_id: "DEL-01-01", id: "rv-bad" },
    { case_id: "DEL-01-02", id: "RV-20261011-A1B2C3" },
    { case_id: "DEL-01-03", id: "" },
  ])("$case_id an invalid review id format is INVALID_TARGET", ({ id }) => {
    expect(assessError(request(id), fRevSource())).toEqual({ code: "INVALID_TARGET" });
  });

  it.each([
    { case_id: "DEL-02-01", phase: "loading" as const },
    { case_id: "DEL-02-02", phase: "fatal" as const },
  ])("$case_id an app that is not ready is APP_NOT_READY", ({ phase }) => {
    expect(assessError(request(), sourceOf(fRev(), { phase }))).toEqual({ code: "SOURCE_UNAVAILABLE", reason: "APP_NOT_READY" });
  });

  it.each([
    { case_id: "DEL-03-01", status: "unreadable" as const, reason: "REGISTRY_UNREADABLE" },
    { case_id: "DEL-03-02", status: "io_error" as const, reason: "REGISTRY_IO_ERROR" },
    { case_id: "DEL-03-03", status: "unsupported_version" as const, reason: "REGISTRY_UNSUPPORTED_VERSION" },
  ])("$case_id an unreadable registry is SOURCE_UNAVAILABLE / $reason", ({ status, reason }) => {
    expect(assessError(request(), sourceOf(fRev(), { projectsHealth: { status } }))).toEqual({ code: "SOURCE_UNAVAILABLE", reason });
  });

  it("DEL-04-01 an unknown, valid review id is TARGET_NOT_FOUND", () => {
    expect(assessError(request(ID_X), fRevSource())).toEqual({ code: "TARGET_NOT_FOUND" });
  });

  it.each([
    { case_id: "DEL-05-01", status: "unreadable" as const, reason: "UNREADABLE" },
    { case_id: "DEL-05-02", status: "io_error" as const, reason: "IO_ERROR" },
    { case_id: "DEL-05-03", status: "unsupported_version" as const, reason: "UNSUPPORTED_VERSION" },
    { case_id: "DEL-05-04", status: "missing" as const, reason: "MISSING" },
  ])("$case_id an unreadable review file is TARGET_UNAVAILABLE / $reason", ({ status, reason }) => {
    expect(assessError(request(), sourceOf(fRev(), { reviews: [entry(null, status, ID_A)] }))).toEqual({ code: "TARGET_UNAVAILABLE", reason });
  });
});
