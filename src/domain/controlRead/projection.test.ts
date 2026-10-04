import { describe, expect, it } from "vitest";
import { deriveFreshness } from "../freshness";
import type { GitObservation, GitStatus, ObservedGitState } from "../git";
import type { Project } from "../project";
import { createReviewSession, emptyReviewForm, newRound, type ReviewSession } from "../review";
import { applyReviewAction, type ReviewAction } from "../transitions";
import { FRESHNESS_CONTRACT } from "../../test/freshnessContract";
import {
  MAX_SNAPSHOT_REVIEWS,
  MAX_SNAPSHOT_ROUNDS,
  type ControlReadSource,
  type ControlReadSourceReview,
  type SourceHealthStatus,
} from "./contract";
import {
  controlSnapshot,
  effectiveObservation,
  freshnessFact,
  gitFacts,
  localRootFact,
  projectState,
  readableReview,
  repositoryFact,
  reviewState,
  reviewStateConfirmation,
} from "./projection";

// ---------------------------------------------------------------------------------------------
// Synthetic fixtures (no real path, project, session or provider data)
// ---------------------------------------------------------------------------------------------

const PROJECT_ID = "project-alpha";
const CREATED = "2026-09-20T03:00:00.000Z";
const T = (minute: number) => `2026-10-04T01:${String(minute).padStart(2, "0")}:00.000Z`;
const HEAD_A = "1111111111111111111111111111111111111111";

function project(overrides: Partial<Project> = {}): Project {
  return {
    projectId: PROJECT_ID,
    displayName: "Alpha",
    repositoryUrl: "https://github.com/example-org/example-app",
    localRoot: "C:\\example\\alpha",
    developmentIde: null,
    nextAction: "",
    notes: "",
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

function newSession(id = "rv-20261004-alpha1", projectId = PROJECT_ID): ReviewSession {
  const created = createReviewSession(emptyReviewForm(projectId), new Set([projectId]), id, T(0));
  if (!created.ok) throw new Error("fixture session");
  return created.value.session;
}

/** Walks a session through the EXISTING transitions; `transitions.ts` is never modified. */
function walk(session: ReviewSession, ...actions: ReviewAction[]): ReviewSession {
  let current = session;
  actions.forEach((action, index) => {
    const result = applyReviewAction(current, action, T(index + 1));
    if (!result.ok) throw new Error(`fixture transition ${action.type} failed`);
    current = result.value.session;
  });
  return current;
}

const markReady: ReviewAction = { type: "markReady" };
const startReview: ReviewAction = { type: "startReview" };
const capture: ReviewAction = { type: "captureResult", reviewedHead: HEAD_A };
const verdict = (value: "FIX_REQUIRED" | "REVIEW_PASS"): ReviewAction => ({ type: "confirmVerdict", verdict: value, note: null, confirmedByHuman: true });
const block: ReviewAction = { type: "block", reason: "synthetic block reason", confirmedByHuman: true };
const suspend: ReviewAction = { type: "suspend", resourceState: "WARM", checkpoint: "synthetic checkpoint" };
const resume: ReviewAction = { type: "resume" };
const close: ReviewAction = { type: "close", confirmedByHuman: true };

function loaded(session: ReviewSession | null, status: SourceHealthStatus = "ok", reviewId = session?.reviewSessionId ?? "rv-20261004-broken"): ControlReadSourceReview {
  return { reviewId, session, health: { status } };
}

function observed(observation: Partial<GitObservation> = {}, target: Project = project()): ObservedGitState {
  return {
    localRoot: target.localRoot,
    projectCreatedAt: target.createdAt,
    observation: { status: "OK", head: HEAD_A, branch: "main", detached: false, dirty: false, observedAt: "2026-10-04T01:30:00.123Z", ...observation },
  };
}

function source(parts: Partial<ControlReadSource> = {}): ControlReadSource {
  return {
    phase: "ready",
    projects: [project()],
    projectsHealth: { status: "ok" },
    reviews: [],
    gitObservations: {},
    ...parts,
  };
}

// ---------------------------------------------------------------------------------------------

describe("HD-5A-09 review_state confirmation (durable-record-based conservative classification)", () => {
  const cases: [string, () => ReviewSession, "EXPLICIT" | "ENTERED"][] = [
    ["FIX_REQUIRED via confirmVerdict", () => walk(newSession(), markReady, startReview, capture, verdict("FIX_REQUIRED")), "EXPLICIT"],
    ["FIX_REQUIRED after suspend / resume", () => walk(newSession(), markReady, startReview, capture, verdict("FIX_REQUIRED"), suspend, resume), "EXPLICIT"],
    ["REVIEW_PASS via confirmVerdict", () => walk(newSession(), markReady, startReview, capture, verdict("REVIEW_PASS")), "EXPLICIT"],
    ["REVIEW_PASS after suspend / resume", () => walk(newSession(), markReady, startReview, capture, verdict("REVIEW_PASS"), suspend, resume), "EXPLICIT"],
    ["BLOCKED from REVIEWING via block", () => walk(newSession(), markReady, startReview, block), "EXPLICIT"],
    ["BLOCKED after suspend / resume from a confirmed BLOCKED", () => walk(newSession(), markReady, startReview, block, suspend, resume), "EXPLICIT"],
    ["BLOCKED from NEW", () => walk(newSession(), block), "ENTERED"],
    ["BLOCKED from READY_FOR_REVIEW", () => walk(newSession(), markReady, block), "ENTERED"],
    [
      "BLOCKED from FIX_REQUIRED (current verdict remains FIX_REQUIRED)",
      () => walk(newSession(), markReady, startReview, capture, verdict("FIX_REQUIRED"), block),
      "ENTERED",
    ],
    ["CLOSED", () => walk(newSession(), close), "EXPLICIT"],
    ["NEW", () => newSession(), "ENTERED"],
    ["READY_FOR_REVIEW", () => walk(newSession(), markReady), "ENTERED"],
    ["REVIEWING", () => walk(newSession(), markReady, startReview), "ENTERED"],
    ["SUSPENDED", () => walk(newSession(), markReady, startReview, capture, verdict("FIX_REQUIRED"), suspend), "ENTERED"],
  ];

  it.each(cases)("%s", (_label, build, expected) => {
    const session = build();
    expect(reviewStateConfirmation(session)).toBe(expected);
    const projected = reviewState(source({ reviews: [loaded(session)] }), { session, health: "ok" }).value.review_state;
    expect(projected).toMatchObject({ class: "HUMAN_CONFIRMED", value: session.reviewState, confirmation: expected, recorded_at: null });
  });

  it("checks the precondition of each case against the real transitions", () => {
    const blockedFromFix = walk(newSession(), markReady, startReview, capture, verdict("FIX_REQUIRED"), block);
    expect(blockedFromFix.reviewState).toBe("BLOCKED");
    expect(blockedFromFix.rounds.at(-1)?.verdict).toBe("FIX_REQUIRED");
    const resumed = walk(newSession(), markReady, startReview, capture, verdict("REVIEW_PASS"), suspend, resume);
    expect(resumed.reviewState).toBe("REVIEW_PASS");
  });

  it("never infers EXPLICIT from suspendedFrom alone (durable-record test)", () => {
    // A synthetic session whose suspendedFrom claims a verdict state the current round never confirmed.
    const crafted: ReviewSession = { ...newSession(), reviewState: "SUSPENDED", suspendedFrom: "FIX_REQUIRED" };
    const resumed = walk(crafted, resume);
    expect(resumed.reviewState).toBe("FIX_REQUIRED");
    expect(resumed.rounds.at(-1)?.verdictConfirmedAt).toBeNull();
    expect(reviewStateConfirmation(resumed)).toBe("ENTERED");
    expect(reviewStateConfirmation(crafted)).toBe("ENTERED");
  });

  it("is ENTERED for a verdict state when the session has no round at all", () => {
    const empty: ReviewSession = { ...newSession(), reviewState: "REVIEW_PASS", rounds: [] };
    expect(reviewStateConfirmation(empty)).toBe("ENTERED");
  });
});

describe("Project facts", () => {
  it("projects the repository through normalizeRepositoryUrl into {host, owner, name}", () => {
    expect(repositoryFact(project())).toEqual({
      class: "HUMAN_CONFIRMED",
      value: { host: "github.com", owner: "example-org", name: "example-app" },
      confirmation: "ENTERED",
      recorded_at: null,
      evidence_ref: "dvcc:project/project-alpha/repository",
    });
    expect(repositoryFact(project({ repositoryUrl: null }))).toEqual({ class: "UNKNOWN", unknown_reason: "NOTHING_RECORDED" });
    for (const bad of ["http://github.com/example-org/x", "https://gitlab.com/example-org/x", "https://github.com/example-org", "not a url"]) {
      expect(repositoryFact(project({ repositoryUrl: bad })), bad).toEqual({ class: "BLOCKED", blocked_reason: "INVALID_SOURCE_VALUE" });
    }
    // The same canonicalization the registry uses: a trailing .git is removed, not exposed.
    expect(repositoryFact(project({ repositoryUrl: "https://github.com/example-org/example-app.git" }))).toMatchObject({
      value: { host: "github.com", owner: "example-org", name: "example-app" },
    });
  });

  it("reports the local root as presence only; an unconfigured root has no path", () => {
    expect(localRootFact(project())).toEqual({
      class: "DERIVED",
      value: true,
      rule: "project.local-root-presence@1",
      derived_from: ["dvcc:project/project-alpha/local-root"],
      basis_observed_at: null,
      basis_recorded_at: null,
      path: { class: "BLOCKED", blocked_reason: "WITHHELD_BY_POLICY" },
    });
    const absent = localRootFact(project({ localRoot: null }));
    expect(absent).toMatchObject({ class: "DERIVED", value: false });
    expect("path" in absent).toBe(false);
  });
});

describe("Git observation states", () => {
  it("is NOT_OBSERVED when no raw observation exists", () => {
    const git = gitFacts(PROJECT_ID, effectiveObservation(source(), project()));
    expect(git).toEqual({
      head: { class: "UNKNOWN", unknown_reason: "NOT_OBSERVED" },
      dirty: { class: "UNKNOWN", unknown_reason: "NOT_OBSERVED" },
      detached: { class: "UNKNOWN", unknown_reason: "NOT_OBSERVED" },
    });
  });

  it("is OBSERVATION_INVALIDATED only when a raw observation exists AND observationForProject drops it", () => {
    const moved = project({ localRoot: "C:\\example\\moved" });
    const effective = effectiveObservation(source({ projects: [moved], gitObservations: { [PROJECT_ID]: observed() } }), moved);
    expect(effective).toEqual({ observation: undefined, invalidated: true });
    expect(gitFacts(PROJECT_ID, effective).head).toEqual({ class: "UNKNOWN", unknown_reason: "OBSERVATION_INVALIDATED" });
    // A recreated project (same id, new createdAt) also drops it.
    const recreated = project({ createdAt: "2026-10-01T00:00:00.000Z" });
    expect(effectiveObservation(source({ projects: [recreated], gitObservations: { [PROJECT_ID]: observed() } }), recreated).invalidated).toBe(true);
  });

  it("projects an OK observation as OBSERVED with observed_at and a git-observation reference", () => {
    const git = gitFacts(PROJECT_ID, effectiveObservation(source({ gitObservations: { [PROJECT_ID]: observed() } }), project()));
    expect(git.head).toEqual({
      class: "OBSERVED",
      value: HEAD_A,
      observed_at: "2026-10-04T01:30:00.123Z",
      source: "GIT_OBSERVATION",
      evidence_ref: "dvcc:git-observation/project-alpha/2026-10-04T01:30:00.123Z",
    });
    expect(git.dirty).toMatchObject({ class: "OBSERVED", value: false });
    expect(git.detached).toMatchObject({ class: "OBSERVED", value: false });
  });

  it("maps every non-OK status to its reason, and unknown fields stay UNKNOWN", () => {
    const reasons: [GitStatus, string][] = [
      ["NO_LOCAL_ROOT", "NO_LOCAL_ROOT"],
      ["NOT_A_GIT_REPOSITORY", "NOT_A_GIT_REPOSITORY"],
      ["GIT_UNAVAILABLE", "GIT_UNAVAILABLE"],
      ["TIMEOUT", "OBSERVATION_FAILED"],
      ["ERROR", "OBSERVATION_FAILED"],
    ];
    for (const [status, reason] of reasons) {
      const git = gitFacts(PROJECT_ID, effectiveObservation(source({ gitObservations: { [PROJECT_ID]: observed({ status, head: null }) } }), project()));
      expect(git.head, status).toEqual({ class: "UNKNOWN", unknown_reason: reason });
    }
    const partial = gitFacts(PROJECT_ID, effectiveObservation(source({ gitObservations: { [PROJECT_ID]: observed({ head: null, dirty: null, detached: null }) } }), project()));
    expect(partial.head).toEqual({ class: "UNKNOWN", unknown_reason: "HEAD_NOT_COMPARABLE" });
    expect(partial.dirty).toEqual({ class: "UNKNOWN", unknown_reason: "OBSERVATION_FAILED" });
    expect(partial.detached).toEqual({ class: "UNKNOWN", unknown_reason: "OBSERVATION_FAILED" });
  });
});

describe("Freshness — oracle parity with the existing domain", () => {
  it.each(FRESHNESS_CONTRACT.map((row) => [row.label, row] as const))("%s", (_label, row) => {
    const session: ReviewSession = { ...newSession(), rounds: [{ ...newRound(1, row.expectedHead), reviewedHead: row.reviewedHead }] };
    const gitObservations: Record<string, ObservedGitState | undefined> =
      row.observation === null
        ? {}
        : {
            [PROJECT_ID]: observed({
              status: row.observation.status as GitStatus,
              head: row.observation.head,
              dirty: row.observation.dirty,
              ...(row.observation.errorMessage === undefined ? {} : { errorMessage: row.observation.errorMessage }),
            }),
          };
    const src = source({ gitObservations, reviews: [loaded(session)] });
    const fact = freshnessFact(session, project(), effectiveObservation(src, project()));
    const domain = deriveFreshness({
      observation: effectiveObservation(src, project()).observation,
      expectedHead: row.expectedHead,
      reviewedHead: row.reviewedHead,
    }).status;
    expect(domain).toBe(row.expected);
    if (row.expected === "UNKNOWN") expect(fact.class).toBe("UNKNOWN");
    else expect(fact).toMatchObject({ class: "DERIVED", value: row.expected, rule: "freshness.derive@1", basis_observed_at: "2026-10-04T01:30:00.123Z" });
  });

  it("is OBSERVATION_INVALIDATED or PROJECT_NOT_REGISTERED where the domain cannot see the facts", () => {
    const session = newSession();
    const moved = project({ localRoot: "C:\\example\\moved" });
    const src = source({ projects: [moved], gitObservations: { [PROJECT_ID]: observed() } });
    expect(freshnessFact(session, moved, effectiveObservation(src, moved))).toEqual({ class: "UNKNOWN", unknown_reason: "OBSERVATION_INVALIDATED" });
    expect(freshnessFact(session, undefined, undefined)).toEqual({ class: "UNKNOWN", unknown_reason: "PROJECT_NOT_REGISTERED" });
  });

  it("references the observation and the recorded heads it was derived from", () => {
    const session: ReviewSession = { ...newSession(), rounds: [{ ...newRound(1, HEAD_A), reviewedHead: HEAD_A }] };
    const src = source({ gitObservations: { [PROJECT_ID]: observed() } });
    expect(freshnessFact(session, project(), effectiveObservation(src, project()))).toEqual({
      class: "DERIVED",
      value: "ALIGNED",
      rule: "freshness.derive@1",
      derived_from: [
        "dvcc:git-observation/project-alpha/2026-10-04T01:30:00.123Z",
        "dvcc:review/rv-20261004-alpha1/round/1/expected-head",
        "dvcc:review/rv-20261004-alpha1/round/1/reviewed-head",
      ],
      basis_observed_at: "2026-10-04T01:30:00.123Z",
    });
  });
});

describe("Snapshot composition", () => {
  it("lists readable non-CLOSED reviews by ID (descending), counts CLOSED and unattributable ones", () => {
    const a = newSession("rv-20261001-aaaaaa");
    const b = newSession("rv-20261003-bbbbbb");
    const closed = walk(newSession("rv-20261002-cccccc"), close);
    const other = newSession("rv-20261004-dddddd", "project-beta");
    const reviews = [loaded(a), loaded(closed), loaded(b), loaded(other), loaded(null, "unreadable"), loaded(null, "unsupported_version", "rv-20261005-eeeeee")];
    const snapshot = controlSnapshot(
      source({ projects: [project(), project({ projectId: "project-beta" })], reviews }),
      project(),
      "ok",
    ).value;
    expect(snapshot.project.review_session_ids).toEqual(["rv-20261003-bbbbbb", "rv-20261001-aaaaaa"]);
    expect(snapshot.reviews.map((review) => review.review_session_id)).toEqual(["rv-20261003-bbbbbb", "rv-20261001-aaaaaa"]);
    expect(snapshot.project.closed_review_count).toBe(1);
    expect(snapshot.unattributable_review_count).toBe(2);
    expect(snapshot.external_gates).toEqual({ class: "UNKNOWN", unknown_reason: "NOT_TRACKED_BY_DVCC" });
  });

  it("does not depend on queue order, filters or resource state", () => {
    const hot = newSession("rv-20261001-aaaaaa");
    const cold: ReviewSession = { ...newSession("rv-20261002-bbbbbb"), resourceState: "COLD", updatedAt: "2026-10-05T00:00:00.000Z" };
    const first = controlSnapshot(source({ reviews: [loaded(hot), loaded(cold)] }), project(), "ok").value;
    const second = controlSnapshot(source({ reviews: [loaded(cold), loaded(hot)] }), project(), "ok").value;
    expect(first.project.review_session_ids).toEqual(["rv-20261002-bbbbbb", "rv-20261001-aaaaaa"]);
    expect(second).toEqual(first);
  });

  it("caps reviews and rounds and reports the limits", () => {
    const many = Array.from({ length: MAX_SNAPSHOT_REVIEWS + 3 }, (_, index) => loaded(newSession(`rv-202610${String(index).padStart(2, "0")}-aaaaaa`)));
    const capped = controlSnapshot(source({ reviews: many }), project(), "ok");
    expect(capped.value.project.review_session_ids).toHaveLength(MAX_SNAPSHOT_REVIEWS);
    expect([...capped.limits]).toEqual(["MAX_REVIEWS"]);

    const rounds = Array.from({ length: MAX_SNAPSHOT_ROUNDS + 2 }, (_, index) => newRound(index + 1, null));
    const longSession: ReviewSession = { ...newSession(), reviewRound: rounds.length, rounds };
    const long = reviewState(source({ reviews: [loaded(longSession)] }), { session: longSession, health: "ok" });
    expect(long.value.rounds).toHaveLength(MAX_SNAPSHOT_ROUNDS);
    expect(long.value.rounds[0].round).toBe(rounds.length);
    expect(long.value.current_round).toBe(rounds.length);
    expect([...long.limits]).toEqual(["MAX_ROUNDS"]);
    expect([...controlSnapshot(source({ reviews: [loaded(longSession)] }), project(), "ok").limits]).toEqual(["MAX_ROUNDS"]);

    const small = controlSnapshot(source({ reviews: [loaded(newSession())] }), project(), "ok");
    expect([...small.limits]).toEqual([]);
  });

  it("treats only session !== null with a readable status as readable (fail closed)", () => {
    const session = newSession();
    expect(readableReview(loaded(session, "ok"))).toEqual({ session, health: "ok" });
    expect(readableReview(loaded(session, "restored_from_backup"))).toEqual({ session, health: "restored_from_backup" });
    for (const status of ["unreadable", "io_error", "unsupported_version", "missing"] as const) {
      expect(readableReview(loaded(session, status)), status).toBeNull();
      expect(readableReview(loaded(null, status)), status).toBeNull();
    }
  });

  it("is deterministic and never mutates its source", () => {
    const session = walk(newSession(), markReady, startReview, capture, verdict("FIX_REQUIRED"));
    const src = deepFreeze(source({ reviews: [loaded(session)], gitObservations: { [PROJECT_ID]: observed() } }));
    const first = controlSnapshot(src, src.projects[0], "ok");
    const second = controlSnapshot(src, src.projects[0], "ok");
    expect(second.value).toEqual(first.value);
    expect(projectState(src, src.projects[0], "ok").value).toEqual(first.value.project);
  });
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}
