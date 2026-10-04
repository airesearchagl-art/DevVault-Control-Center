import { describe, expect, it } from "vitest";
import type { Project } from "../project";
import { createReviewSession, emptyReviewForm, newRound, type ReviewSession } from "../review";
import { CONTROL_READ_CONTRACT, type ControlReadSource, type ControlSnapshotV1, type Envelope } from "./contract";
import { readControl } from "./readControl";

/**
 * Truthful provenance (Task Packet rev 3.2 §8 / RF-5A-02): a `recorded_at` is an exact source
 * timestamp of that value or `null`; entity-level `createdAt` / `updatedAt` never stand in for it.
 * Presence is DERIVED, and an absence is never a Human confirmation.
 */

const PROJECT_ID = "project-alpha";
const REVIEW_ID = "rv-20261004-alpha1";
const ENTITY_TIMES = {
  projectCreated: "2001-01-01T01:01:01.001Z",
  projectUpdated: "2002-02-02T02:02:02.002Z",
  sessionCreated: "2003-03-03T03:03:03.003Z",
  sessionUpdated: "2004-04-04T04:04:04.004Z",
  requestSaved: "2005-05-05T05:05:05.005Z",
  followupSaved: "2006-06-06T06:06:06.006Z",
};
const RESULT_AT = "2026-10-04T01:10:00.000Z";
const VERDICT_AT = "2026-10-04T01:20:00.000Z";
const JUDGMENT_AT = "2026-10-04T01:15:00.000Z";
const OBSERVED_AT = "2026-10-04T01:30:00.123Z";
const HEAD = "1111111111111111111111111111111111111111";
const ENV = { now: () => "2026-10-04T02:00:00.000Z", newSnapshotId: () => "snap-00000000-0000-4000-8000-000000000000" };

function project(): Project {
  return {
    projectId: PROJECT_ID,
    displayName: "Alpha",
    repositoryUrl: "https://github.com/example-org/example-app",
    localRoot: "C:\\example\\alpha",
    developmentIde: null,
    nextAction: "",
    notes: "",
    createdAt: ENTITY_TIMES.projectCreated,
    updatedAt: ENTITY_TIMES.projectUpdated,
  };
}

function session(): ReviewSession {
  const created = createReviewSession({ ...emptyReviewForm(PROJECT_ID), prNumber: "42" }, new Set([PROJECT_ID]), REVIEW_ID, ENTITY_TIMES.sessionCreated);
  if (!created.ok) throw new Error("fixture session");
  const decided = {
    ...newRound(1, HEAD),
    reviewedHead: HEAD,
    requestSavedAt: ENTITY_TIMES.requestSaved,
    resultCapturedAt: RESULT_AT,
    followupSavedAt: ENTITY_TIMES.followupSaved,
    judgmentCapturedAt: JUDGMENT_AT,
    verdict: "FIX_REQUIRED" as const,
    verdictConfirmedAt: VERDICT_AT,
    riskTier: "TIER_1" as const,
  };
  return {
    ...created.value.session,
    reviewState: "FIX_REQUIRED",
    reviewRound: 2,
    rounds: [decided, newRound(2, "2222222")],
    updatedAt: ENTITY_TIMES.sessionUpdated,
  };
}

function snapshot(): Envelope<ControlSnapshotV1> {
  const p = project();
  const src: ControlReadSource = {
    phase: "ready",
    projects: [p],
    projectsHealth: { status: "ok" },
    reviews: [{ reviewId: REVIEW_ID, session: session(), health: { status: "ok" } }],
    gitObservations: {
      [PROJECT_ID]: {
        localRoot: p.localRoot,
        projectCreatedAt: p.createdAt,
        observation: { status: "OK", head: HEAD, branch: "main", detached: false, dirty: false, observedAt: OBSERVED_AT },
      },
    },
  };
  return readControl({ contract: CONTROL_READ_CONTRACT, version: 1, operation: "get_control_snapshot", project_id: PROJECT_ID }, src, ENV) as Envelope<ControlSnapshotV1>;
}

describe("Control Read provenance", () => {
  it("never substitutes an entity-level or unrelated timestamp", () => {
    const text = JSON.stringify(snapshot());
    for (const [name, time] of Object.entries(ENTITY_TIMES)) expect(text.includes(time), name).toBe(false);
  });

  it("uses only exact field timestamps, and null where the model has none", () => {
    const data = snapshot().data;
    const review = data.reviews[0];
    const [current, decided] = review.rounds;
    expect(review.rounds.map((round) => round.round)).toEqual([2, 1]);

    expect(decided.reviewed_head).toMatchObject({ class: "HUMAN_CONFIRMED", confirmation: "ENTERED", recorded_at: RESULT_AT });
    expect(decided.verdict).toMatchObject({ class: "HUMAN_CONFIRMED", confirmation: "EXPLICIT", value: "FIX_REQUIRED", recorded_at: VERDICT_AT });
    expect(decided.result_captured).toEqual({
      class: "DERIVED",
      value: true,
      rule: "round.result-presence@1",
      derived_from: [`dvcc:review/${REVIEW_ID}/round/1/result`],
      basis_observed_at: null,
      basis_recorded_at: RESULT_AT,
    });
    expect(decided.judgment_captured).toMatchObject({ class: "DERIVED", value: true, basis_recorded_at: JUDGMENT_AT });
    expect(decided.risk_tier).toMatchObject({ class: "HUMAN_CONFIRMED", confirmation: "EXPLICIT", value: "TIER_1", recorded_at: null });
    expect(decided.expected_head).toMatchObject({ class: "HUMAN_CONFIRMED", recorded_at: null, binding: "EXACT" });

    expect(data.project.repository).toMatchObject({ class: "HUMAN_CONFIRMED", recorded_at: null });
    expect(review.review_state).toMatchObject({ class: "HUMAN_CONFIRMED", recorded_at: null });
    expect(review.resource_state).toMatchObject({ class: "HUMAN_CONFIRMED", confirmation: "ENTERED", recorded_at: null });
    expect(review.pr_number).toMatchObject({ class: "HUMAN_CONFIRMED", confirmation: "ENTERED", value: 42, recorded_at: null });
    expect(current.expected_head).toMatchObject({ class: "HUMAN_CONFIRMED", value: "2222222", recorded_at: null, binding: "SHORT" });
  });

  it("represents absence as a DERIVED false or UNKNOWN NOTHING_RECORDED, never as a Human confirmation", () => {
    const current = snapshot().data.reviews[0].rounds[0];
    expect(current.result_captured).toEqual({
      class: "DERIVED",
      value: false,
      rule: "round.result-presence@1",
      derived_from: [`dvcc:review/${REVIEW_ID}/round/2/result`],
      basis_observed_at: null,
      basis_recorded_at: null,
    });
    expect(current.judgment_captured).toMatchObject({ class: "DERIVED", value: false, basis_recorded_at: null });
    for (const fact of [current.reviewed_head, current.verdict, current.risk_tier]) {
      expect(fact).toEqual({ class: "UNKNOWN", unknown_reason: "NOTHING_RECORDED" });
    }
  });

  it("dates observations by their own observedAt and derivations by the observation they rest on", () => {
    const data = snapshot().data;
    expect(data.project.git.head).toMatchObject({ class: "OBSERVED", observed_at: OBSERVED_AT });
    // The current round (2) records a short expected head that differs from the observed HEAD.
    expect(data.reviews[0].freshness).toMatchObject({ class: "DERIVED", value: "HEAD_CHANGED", basis_observed_at: OBSERVED_AT });
  });
});
