import { describe, expect, it } from "vitest";
import { MAX_REVIEW_ROUNDS } from "../limits";
import {
  EVIDENCE_REF_KINDS,
  REVIEW_FIELDS,
  REVIEW_ROUND_FIELDS,
  gitObservationRef,
  projectLocalRootRef,
  projectRef,
  projectRepositoryRef,
  reviewFieldRef,
  reviewRef,
  reviewRoundFieldRef,
  type ReviewField,
  type ReviewRoundField,
} from "./evidenceRef";

/**
 * The seven approved EvidenceRef variants as a test oracle (written from the Task Packet grammar,
 * not read off the implementation). Every reference the contract emits must match exactly one.
 */
const EVIDENCE_REF_ORACLE: readonly RegExp[] = [
  /^dvcc:project\/[a-z0-9][a-z0-9-]{1,63}$/,
  /^dvcc:project\/[a-z0-9][a-z0-9-]{1,63}\/repository$/,
  /^dvcc:project\/[a-z0-9][a-z0-9-]{1,63}\/local-root$/,
  /^dvcc:review\/rv-\d{8}-[a-z0-9]{6}$/,
  /^dvcc:review\/rv-\d{8}-[a-z0-9]{6}\/field\/(review-state|resource-state|pr-number)$/,
  /^dvcc:review\/rv-\d{8}-[a-z0-9]{6}\/round\/[1-9]\d{0,2}\/(expected-head|reviewed-head|result|verdict|judgment|risk-tier)$/,
  /^dvcc:git-observation\/[a-z0-9][a-z0-9-]{1,63}\/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/,
];

const PROJECT = "project-alpha";
const REVIEW = "rv-20261004-alpha1";
const OBSERVED_AT = "2026-10-04T01:02:00.123Z";

/** Inputs that must never become part of a reference. */
const HOSTILE = [
  "",
  "C:\\SENTINEL-ROOT\\alpha",
  "/home/sentinel/alpha",
  "../escape",
  "a/b",
  "with space",
  "UPPER-CASE",
  "line\nbreak",
  "Example App Display Name",
  "ghp_SENTINELTOKEN000000000000000000000000",
  "sk-SENTINEL-KEY",
];

describe("EvidenceRef builders", () => {
  it("build exactly the seven approved variants from valid inputs", () => {
    const built = [
      projectRef(PROJECT),
      projectRepositoryRef(PROJECT),
      projectLocalRootRef(PROJECT),
      reviewRef(REVIEW),
      reviewFieldRef(REVIEW, "review-state"),
      reviewRoundFieldRef(REVIEW, 2, "expected-head"),
      gitObservationRef(PROJECT, OBSERVED_AT),
    ];
    expect(built).toEqual([
      "dvcc:project/project-alpha",
      "dvcc:project/project-alpha/repository",
      "dvcc:project/project-alpha/local-root",
      "dvcc:review/rv-20261004-alpha1",
      "dvcc:review/rv-20261004-alpha1/field/review-state",
      "dvcc:review/rv-20261004-alpha1/round/2/expected-head",
      "dvcc:git-observation/project-alpha/2026-10-04T01:02:00.123Z",
    ]);
    built.forEach((ref, index) => {
      const matches = EVIDENCE_REF_ORACLE.filter((pattern) => pattern.test(ref ?? ""));
      expect(matches, `${ref}`).toEqual([EVIDENCE_REF_ORACLE[index]]);
    });
    expect(EVIDENCE_REF_KINDS).toHaveLength(7);
  });

  it("cover every closed field name", () => {
    for (const field of REVIEW_FIELDS) expect(reviewFieldRef(REVIEW, field)).toBe(`dvcc:review/${REVIEW}/field/${field}`);
    for (const field of REVIEW_ROUND_FIELDS) {
      expect(reviewRoundFieldRef(REVIEW, 1, field)).toBe(`dvcc:review/${REVIEW}/round/1/${field}`);
    }
  });

  it("refuse any project or review ID the existing validators refuse", () => {
    for (const hostile of HOSTILE) {
      expect(projectRef(hostile), JSON.stringify(hostile)).toBeNull();
      expect(projectRepositoryRef(hostile)).toBeNull();
      expect(projectLocalRootRef(hostile)).toBeNull();
      expect(reviewRef(hostile)).toBeNull();
      expect(reviewFieldRef(hostile, "review-state")).toBeNull();
      expect(reviewRoundFieldRef(hostile, 1, "verdict")).toBeNull();
      expect(gitObservationRef(hostile, OBSERVED_AT)).toBeNull();
    }
    // A project ID is not a review ID.
    expect(reviewRef(PROJECT)).toBeNull();
  });

  it("refuse a round outside 1..MAX_REVIEW_ROUNDS or not an integer", () => {
    for (const round of [0, -1, 1.5, MAX_REVIEW_ROUNDS + 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(reviewRoundFieldRef(REVIEW, round, "result"), String(round)).toBeNull();
    }
    expect(reviewRoundFieldRef(REVIEW, "1" as unknown as number, "result")).toBeNull();
    expect(reviewRoundFieldRef(REVIEW, MAX_REVIEW_ROUNDS, "result")).toBe(`dvcc:review/${REVIEW}/round/${MAX_REVIEW_ROUNDS}/result`);
  });

  it("refuse a field name outside the closed set even when cast past the type", () => {
    for (const field of ["notes", "local-root", "../x", "verdict/extra", ""]) {
      expect(reviewFieldRef(REVIEW, field as ReviewField)).toBeNull();
      expect(reviewRoundFieldRef(REVIEW, 1, field as ReviewRoundField)).toBeNull();
    }
  });

  it("refuse an observation time that is not an ISO-8601 UTC timestamp", () => {
    for (const time of ["", "not-a-time", "2026-10-04 01:02:00", "2026-10-04T01:02:00", "2026-13-45T99:99:99Z", ...HOSTILE]) {
      expect(gitObservationRef(PROJECT, time), JSON.stringify(time)).toBeNull();
    }
  });
});
