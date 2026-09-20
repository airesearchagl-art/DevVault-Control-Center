import { describe, expect, it } from "vitest";
import { asGitObservation, failedObservation, isGitStatus, observationForProject } from "./git";

/** Phase 2: an observation is accepted fail closed — anything unexpected carries no facts. */

const OBSERVED_AT = "2026-09-20T00:00:00.000Z";

describe("asGitObservation", () => {
  it("keeps the observed facts", () => {
    const observation = asGitObservation(
      {
        status: "OK",
        head: "1".repeat(40),
        branch: "main",
        detached: false,
        dirty: true,
        observedAt: "2026-09-20T10:11:12.345Z",
      },
      OBSERVED_AT,
    );
    expect(observation).toEqual({
      status: "OK",
      head: "1".repeat(40),
      branch: "main",
      detached: false,
      dirty: true,
      observedAt: "2026-09-20T10:11:12.345Z",
    });
  });

  it("carries an error code and message when the observation failed", () => {
    const observation = asGitObservation(
      { status: "ERROR", head: null, branch: null, detached: null, dirty: null, observedAt: OBSERVED_AT, errorCode: "NETWORK_TARGET", errorMessage: "UNC target" },
      OBSERVED_AT,
    );
    expect(observation.status).toBe("ERROR");
    expect(observation.errorCode).toBe("NETWORK_TARGET");
    expect(observation.errorMessage).toBe("UNC target");
    expect(observation.head).toBeNull();
  });

  it.each([
    ["an unknown status", { status: "SOMETHING_ELSE", head: "1".repeat(40), dirty: false }],
    ["a missing status", { head: "1".repeat(40), dirty: false }],
    ["a non-object", "OK"],
    ["null", null],
  ])("refuses %s", (_label, value) => {
    const observation = asGitObservation(value, OBSERVED_AT);
    expect(observation.status).toBe("ERROR");
    expect(observation.errorCode).toBe("MALFORMED_OBSERVATION");
    expect(observation.head).toBeNull();
    expect(observation.dirty).toBeNull();
    expect(observation.observedAt).toBe(OBSERVED_AT);
  });

  it("never guesses a missing or wrongly typed fact", () => {
    const observation = asGitObservation({ status: "OK", head: 12345, branch: "", detached: "yes", dirty: "true" }, OBSERVED_AT);
    expect(observation.status).toBe("OK");
    expect(observation.head).toBeNull();
    expect(observation.branch).toBeNull();
    expect(observation.detached).toBeNull();
    expect(observation.dirty).toBeNull();
    expect(observation.observedAt).toBe(OBSERVED_AT);
  });
});

describe("observationForProject", () => {
  const observation = {
    status: "OK" as const,
    head: "1".repeat(40),
    branch: "main",
    detached: false,
    dirty: false,
    observedAt: OBSERVED_AT,
  };
  const CREATED = "2026-09-01T00:00:00.000Z";
  const observed = { localRoot: "C:\\repos\\alpha", projectCreatedAt: CREATED, observation };

  it("returns the observation while it still describes the same project and folder", () => {
    expect(observationForProject(observed, { localRoot: "C:\\repos\\alpha", createdAt: CREATED })).toEqual(observation);
    expect(
      observationForProject({ localRoot: null, projectCreatedAt: CREATED, observation }, { localRoot: null, createdAt: CREATED }),
    ).toEqual(observation);
  });

  it("drops it once the recorded root changed, rather than showing facts about another folder", () => {
    expect(observationForProject(observed, { localRoot: "C:\\repos\\beta", createdAt: CREATED })).toBeUndefined();
    expect(observationForProject(observed, { localRoot: null, createdAt: CREATED })).toBeUndefined();
  });

  it("drops it for a different project instance under the same id", () => {
    expect(observationForProject(observed, { localRoot: "C:\\repos\\alpha", createdAt: "2026-09-20T00:00:00.000Z" })).toBeUndefined();
  });

  it("is undefined when nothing was observed or the project is gone", () => {
    expect(observationForProject(undefined, { localRoot: "C:\\repos\\alpha", createdAt: CREATED })).toBeUndefined();
    expect(observationForProject(observed, undefined)).toBeUndefined();
  });
});

describe("failedObservation / isGitStatus", () => {
  it("produces an ERROR observation without facts", () => {
    const observation = failedObservation(OBSERVED_AT, "OBSERVATION_FAILED", "invoke rejected");
    expect(observation).toEqual({
      status: "ERROR",
      head: null,
      branch: null,
      detached: null,
      dirty: null,
      observedAt: OBSERVED_AT,
      errorCode: "OBSERVATION_FAILED",
      errorMessage: "invoke rejected",
    });
  });

  it("recognizes only the contracted statuses", () => {
    expect(isGitStatus("OK")).toBe(true);
    expect(isGitStatus("TIMEOUT")).toBe(true);
    expect(isGitStatus("ok")).toBe(false);
    expect(isGitStatus("UNKNOWN")).toBe(false);
  });
});
