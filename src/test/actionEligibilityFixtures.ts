import { expect } from "vitest";
import { assessActionEligibility } from "../domain/actionEligibility/assessEligibility";
import {
  ACTION_ELIGIBILITY_CONTRACT,
  type ActionEligibilityEnv,
  type ActionEligibilityEnvelopeV1,
  type ActionEligibilityError,
  type ActionEligibilityResult,
} from "../domain/actionEligibility/contract";
import type { ControlReadSource, ControlReadSourceProject, ControlReadSourceReview, SourceHealthStatus } from "../domain/controlRead/contract";
import type { GitObservation, ObservedGitState } from "../domain/git";
import { SAME_HEAD_INVALIDATION_REASONS } from "../domain/revalidation";
import { newRound, type ReviewSession, type RoundRecord } from "../domain/review";

/**
 * Synthetic fixtures for Action Eligibility v1 (Phase 5B Task Packet rev 3 MVP, Annex B1).
 * Every value is invented; no real path, repository, session or provider identifier is used.
 */

export const PROJECT_ID = "project-alpha";
export const H = "0123456789abcdef0123456789abcdef01234567";
export const H2 = "fedcba9876543210fedcba9876543210fedcba98";
export const T = "2026-10-11T00:59:30.000Z";

/** Target review. */
export const ID_A = "rv-20261011-a1b2c3";
/** Mismatching inner id. */
export const ID_B = "rv-20261011-b1b2b3";
/** Another review. */
export const ID_X = "rv-20261011-c1c2c3";
/** Distractor review (readable). */
export const ID_D = "rv-20261011-d1d2d3";
/** Distractor review (unreadable). */
export const ID_E = "rv-20261011-e1e2e3";

export const NOW = "2026-10-11T01:00:00.000Z";
export const ASSESSMENT_ID = "assess-00000000-0000-4000-8000-000000000001";
export const ENV: ActionEligibilityEnv = { now: () => NOW, newAssessmentId: () => ASSESSMENT_ID };

const CREATED = "2026-10-10T00:00:00.000Z";
const REQUEST_AT = "2026-10-11T00:10:00.000Z";
const RESULT_AT = "2026-10-11T00:30:00.000Z";
const FOLLOWUP_AT = "2026-10-11T00:35:00.000Z";
const JUDGMENT_AT = "2026-10-11T00:38:00.000Z";
const VERDICT_AT = "2026-10-11T00:40:00.000Z";

/** Lower-case token present in every sentinel value; it must never reach an output. */
export const SENTINEL = "zqxsentinel";
export const BRANCH_SENTINEL = `${SENTINEL}-branch`;

export function project(overrides: Partial<ControlReadSourceProject> = {}): ControlReadSourceProject {
  return {
    projectId: PROJECT_ID,
    repositoryUrl: "https://github.com/example-owner/example-repo",
    localRoot: "/synthetic/alpha",
    createdAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

/** `O(x)`: a clean OK observation of head `x`, taken for project P as it is. */
export function observed(head: string | null, overrides: Partial<GitObservation> = {}, of: ControlReadSourceProject = project()): ObservedGitState {
  return {
    localRoot: of.localRoot,
    projectCreatedAt: of.createdAt,
    observation: { status: "OK", head, dirty: false, branch: BRANCH_SENTINEL, detached: false, observedAt: T, ...overrides },
  };
}

export function round(number: number, overrides: Partial<RoundRecord> = {}): RoundRecord {
  return { ...newRound(number, null), ...overrides };
}

export function session(overrides: Partial<ReviewSession> = {}): ReviewSession {
  return {
    schemaVersion: 1,
    reviewSessionId: ID_A,
    projectId: PROJECT_ID,
    prNumber: null,
    reviewType: "PR review",
    reviewRound: 1,
    resourceState: "HOT",
    reviewState: "READY_FOR_REVIEW",
    suspendedFrom: null,
    chatgptThreadTitle: null,
    chatgptThreadUrl: null,
    nextAction: "",
    rounds: [round(1, { expectedHead: H })],
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

/** F-READY: READY_FOR_REVIEW, R1 expected H, no result. */
export function fReady(roundOverrides: Partial<RoundRecord> = {}, overrides: Partial<ReviewSession> = {}): ReviewSession {
  return session({ reviewState: "READY_FOR_REVIEW", rounds: [round(1, { expectedHead: H, requestSavedAt: REQUEST_AT, ...roundOverrides })], ...overrides });
}

/** F-REV: REVIEWING, R1 expected = reviewed = H, result captured, no follow-up. */
export function fRev(roundOverrides: Partial<RoundRecord> = {}, overrides: Partial<ReviewSession> = {}): ReviewSession {
  return session({
    reviewState: "REVIEWING",
    rounds: [round(1, { expectedHead: H, reviewedHead: H, requestSavedAt: REQUEST_AT, resultCapturedAt: RESULT_AT, ...roundOverrides })],
    ...overrides,
  });
}

/** F-FIX: FIX_REQUIRED, R1 verdict FIX_REQUIRED with its confirmation time. */
export function fFix(roundOverrides: Partial<RoundRecord> = {}, overrides: Partial<ReviewSession> = {}): ReviewSession {
  return session({
    reviewState: "FIX_REQUIRED",
    rounds: [
      round(1, {
        expectedHead: H,
        reviewedHead: H,
        requestSavedAt: REQUEST_AT,
        resultCapturedAt: RESULT_AT,
        verdict: "FIX_REQUIRED",
        verdictConfirmedAt: VERDICT_AT,
        ...roundOverrides,
      }),
    ],
    ...overrides,
  });
}

/** F-FIX with `count` rounds; earlier rounds are decided FIX_REQUIRED rounds. */
export function fFixWithRounds(count: number): ReviewSession {
  const rounds = Array.from({ length: count }, (_, index) =>
    round(index + 1, {
      expectedHead: H,
      reviewedHead: H,
      requestSavedAt: REQUEST_AT,
      resultCapturedAt: RESULT_AT,
      verdict: "FIX_REQUIRED",
      verdictConfirmedAt: VERDICT_AT,
    }),
  );
  return session({ reviewState: "FIX_REQUIRED", reviewRound: count, rounds });
}

export const TIMES = { REQUEST_AT, RESULT_AT, FOLLOWUP_AT, JUDGMENT_AT, VERDICT_AT } as const;

export function entry(value: ReviewSession | null, status: SourceHealthStatus = "ok", reviewId: string = value?.reviewSessionId ?? ID_A): ControlReadSourceReview {
  return { reviewId, session: value, health: { status } };
}

/** A ready source holding one review, project P and the observation `O(H)` of P. */
export function sourceOf(value: ReviewSession, parts: Partial<ControlReadSource> = {}): ControlReadSource {
  return {
    phase: "ready",
    projects: [project()],
    projectsHealth: { status: "ok" },
    reviews: [entry(value)],
    gitObservations: { [PROJECT_ID]: observed(H) },
    ...parts,
  };
}

export function request(reviewSessionId: unknown = ID_A, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { contract: ACTION_ELIGIBILITY_CONTRACT, version: 1, operation: "assess_review_actions", review_session_id: reviewSessionId, ...extra };
}

export interface CountingEnv extends ActionEligibilityEnv {
  calls: string[];
}

export function countingEnv(now = NOW, id = ASSESSMENT_ID): CountingEnv {
  const calls: string[] = [];
  return {
    calls,
    now: () => {
      calls.push("now");
      return now;
    },
    newAssessmentId: () => {
      calls.push("newAssessmentId");
      return id;
    },
  };
}

export function isErrorResult(result: ActionEligibilityResult): result is ActionEligibilityError {
  return "error" in result;
}

/**
 * Shared error-path assertion (Annex D): an error consumes the caller's environment zero times,
 * carries no data, and is a bare versioned error object.
 */
export function expectErrorShape(result: ActionEligibilityResult, env: CountingEnv): ActionEligibilityError["error"] {
  expect(env.calls).toEqual([]);
  expect(isErrorResult(result)).toBe(true);
  expect(Object.keys(result).sort()).toEqual(["contract", "error", "version"]);
  expect(result).not.toHaveProperty("data");
  expect(result.contract).toBe(ACTION_ELIGIBILITY_CONTRACT);
  expect(result.version).toBe(1);
  return (result as ActionEligibilityError).error;
}

export function assessError(req: unknown, source: ControlReadSource): ActionEligibilityError["error"] {
  const env = countingEnv();
  return expectErrorShape(assessActionEligibility(req, source, env), env);
}

export function assessOk(source: ControlReadSource, env: ActionEligibilityEnv = ENV, req: unknown = request()): ActionEligibilityEnvelopeV1 {
  const result = assessActionEligibility(req, source, env);
  if (isErrorResult(result)) throw new Error(`expected an assessment, got ${JSON.stringify(result.error)}`);
  return result;
}

// ---------------------------------------------------------------------------------------------
// Named decision-table sources (Annex D DT / S rows). Each returns a fresh source.
// ---------------------------------------------------------------------------------------------

const movedRoot = () => project({ localRoot: "/synthetic/alpha-moved" });
const recreated = () => project({ createdAt: "2026-10-05T00:00:00.000Z" });
const noObservation = { gitObservations: {} };
const dirtyObservation = { gitObservations: { [PROJECT_ID]: observed(H, { dirty: true }) } };
const badTime = { gitObservations: { [PROJECT_ID]: observed(H, { observedAt: "not-a-time" }) } };

export const DECISION_SOURCES = {
  "F-READY": () => sourceOf(fReady()),
  "F-REV": () => sourceOf(fRev()),
  "F-FIX": () => sourceOf(fFix()),
  "DT-03-01": () => sourceOf(fReady(), { gitObservations: { [PROJECT_ID]: observed(H2) } }),
  "DT-03-02": () => sourceOf(fRev({ reviewedHead: H2 }), { gitObservations: { [PROJECT_ID]: observed(H2) } }),
  "DT-04-01": () => sourceOf(fReady(), dirtyObservation),
  "DT-04-02": () => sourceOf(fRev(), dirtyObservation),
  "DT-04-03": () => sourceOf(fFix(), dirtyObservation),
  "DT-05-01": () => sourceOf(fReady(), noObservation),
  "DT-05-02": () => sourceOf(fRev(), noObservation),
  "DT-05-03": () => sourceOf(fFix(), noObservation),
  "DT-06-01": () => sourceOf(fReady(), { projects: [movedRoot()] }),
  "DT-06-02": () => sourceOf(fRev(), { projects: [movedRoot()] }),
  "DT-06-03": () => sourceOf(fRev(), { projects: [recreated()] }),
  "DT-07-01": () => sourceOf(fRev(), { projects: [] }),
  "DT-07-02": () => sourceOf(fFix(), { projects: [] }),
  "DT-08-01": () => sourceOf(fRev({}, { reviewState: "SUSPENDED", suspendedFrom: "REVIEWING" })),
  "DT-08-02": () => sourceOf(fRev({ resultCapturedAt: null, reviewedHead: null })),
  "DT-08-03": () => sourceOf(fRev({ followupSavedAt: FOLLOWUP_AT, judgmentCapturedAt: null })),
  "DT-08-04": () => sourceOf(fRev()),
  "DT-08-05": () => sourceOf(fRev({ followupSavedAt: FOLLOWUP_AT, judgmentCapturedAt: JUDGMENT_AT })),
  "DT-08-06": () => sourceOf(fRev({ resultCapturedAt: "2026-01-01T11:00:00.000Z" })),
  "DT-10-01": () => sourceOf(fFix({ verdictConfirmedAt: null })),
  "DT-10-02": () => sourceOf(fFix({ verdict: null, verdictConfirmedAt: null }, { reviewState: "REVIEW_PASS" })),
  "DT-10-03": () => sourceOf(fFix({ verdict: "REVIEW_PASS" }, { reviewState: "FIX_REQUIRED" })),
  "DT-12": () => sourceOf(fRev({}, { prNumber: 42 })),
  "DT-14-01": () => sourceOf(fReady(), badTime),
  "DT-14-02": () => sourceOf(fRev(), badTime),
  "S-01": () => sourceOf(fReady({ expectedHead: "0123456" })),
  "S-02": () => sourceOf(fReady({ expectedHead: null })),
  "S-03": () => sourceOf(fRev({ reviewedHead: null })),
  "S-04": () => sourceOf(fRev({ reviewedHead: "0123456" })),
  "S-05": () => sourceOf(fRev(), { gitObservations: { [PROJECT_ID]: observed(H2) } }),
  "S-06-01": () => sourceOf(fFixWithRounds(999)),
  "S-06-02": () => sourceOf(fFixWithRounds(998)),
} satisfies Record<string, () => ControlReadSource>;

export type DecisionSourceName = keyof typeof DECISION_SOURCES;

/** Every source of the decision table; each yields a success envelope ("every success output of the suite"). */
export function successCorpus(): { name: string; source: ControlReadSource }[] {
  return Object.entries(DECISION_SOURCES).map(([name, build]) => ({ name, source: build() }));
}

// ---------------------------------------------------------------------------------------------
// Disclosure sentinels (Annex A8): every field 5B can reach holds the sentinel token.
// ---------------------------------------------------------------------------------------------

export function withSentinels(value: ReviewSession): ControlReadSource {
  const sentinelProject = project({
    repositoryUrl: `https://github.com/example-owner/${SENTINEL}-repo`,
    localRoot: `/synthetic/${SENTINEL}-local-root`,
  });
  const rounds = value.rounds.map((record) => ({
    ...record,
    verdictNote: `${SENTINEL}-verdict-note`,
    riskTierSubjects: [`${SENTINEL}-subject`] as unknown as RoundRecord["riskTierSubjects"],
    revalidation: { reason: SAME_HEAD_INVALIDATION_REASONS[0], priorReviews: [], explanation: `${SENTINEL}-explanation` },
    archivedResults: [`${SENTINEL}-archived-result`],
    archivedJudgments: [`${SENTINEL}-archived-judgment`],
  }));
  const sentinelSession: ReviewSession = {
    ...value,
    reviewType: `${SENTINEL}-review-type`,
    nextAction: `${SENTINEL}-next-action`,
    chatgptThreadTitle: `${SENTINEL}-thread-title`,
    chatgptThreadUrl: `https://chatgpt.com/c/example-${SENTINEL}`,
    rounds,
  };
  const health = { status: "ok", detail: `${SENTINEL}-health` } as unknown as ControlReadSourceReview["health"];
  return {
    phase: "ready",
    projects: [sentinelProject],
    projectsHealth: { status: "ok" },
    reviews: [{ reviewId: sentinelSession.reviewSessionId, session: sentinelSession, health }],
    gitObservations: {
      [PROJECT_ID]: observed(H, { branch: `${SENTINEL}-branch`, errorMessage: `${SENTINEL}-error-message` }, sentinelProject),
    },
  };
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}
