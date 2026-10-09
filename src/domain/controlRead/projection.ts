import { deriveFreshness } from "../freshness";
import { unknownCause } from "../freshnessCause";
import { observationForProject, type GitObservation, type GitStatus } from "../git";
import { headBinding } from "../headBinding";
import type { ReviewSession, RoundRecord } from "../review";
import { normalizeRepositoryUrl } from "../validation";
import {
  MAX_SNAPSHOT_REVIEWS,
  MAX_SNAPSHOT_ROUNDS,
  type BlockedFact,
  type BlockedReason,
  type ControlReadSource,
  type ControlReadSourceProject,
  type ControlReadSourceReview,
  type ControlSnapshotV1,
  type Fact,
  type FreshnessValue,
  type HumanConfirmation,
  type LimitKind,
  type LocalRootV1,
  type PresenceFact,
  type ProjectStateV1,
  type ReadableHealth,
  type RepositoryIdentity,
  type ReviewStateV1,
  type RoundStateV1,
  type RuleId,
  type SourceHealthStatus,
  type UnknownFact,
  type UnknownReason,
} from "./contract";
import {
  gitObservationRef,
  projectLocalRootRef,
  projectRepositoryRef,
  reviewFieldRef,
  reviewRoundFieldRef,
  type EvidenceRef,
  type ReviewRoundField,
} from "./evidenceRef";

/**
 * Control Read v1 projection (Phase 5A). Pure: no I/O, no clock, no randomness, no writes.
 *
 * Every fact is taken from the same domain sources the Human UI uses and passed through the same
 * domain functions (`observationForProject`, `deriveFreshness`, `unknownCause`, `headBinding`,
 * `normalizeRepositoryUrl`); no rule is re-implemented here. Field-level timestamps are used only
 * where the persisted model has an exact one; otherwise `recorded_at` is `null`.
 */

export interface Projected<T> {
  value: T;
  limits: ReadonlySet<LimitKind>;
}

const NO_LIMITS: ReadonlySet<LimitKind> = new Set();

function unknown(reason: UnknownReason): UnknownFact {
  return { class: "UNKNOWN", unknown_reason: reason };
}

function blocked(reason: BlockedReason): BlockedFact {
  return { class: "BLOCKED", blocked_reason: reason };
}

/** `ok` / `restored_from_backup` are readable; every other status is not. */
export function readableHealth(status: SourceHealthStatus): ReadableHealth | null {
  return status === "ok" || status === "restored_from_backup" ? status : null;
}

/** A review whose session was read from a readable file: the only kind that is attributable. */
export interface ReadableReview {
  session: ReviewSession;
  health: ReadableHealth;
}

/** `null` unless `session !== null` AND the file health is readable (fail closed on any mismatch). */
export function readableReview(review: ControlReadSourceReview): ReadableReview | null {
  const health = readableHealth(review.health.status);
  return review.session !== null && health !== null ? { session: review.session, health } : null;
}

function readableReviews(source: ControlReadSource): ReadableReview[] {
  return source.reviews.map(readableReview).filter((review): review is ReadableReview => review !== null);
}

function lastRound(session: ReviewSession): RoundRecord | undefined {
  return session.rounds.length > 0 ? session.rounds[session.rounds.length - 1] : undefined;
}

// ---------------------------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------------------------

function repositoryIdentity(canonical: string): RepositoryIdentity | null {
  let url: URL;
  try {
    url = new URL(canonical);
  } catch {
    return null;
  }
  if (url.hostname !== "github.com") return null;
  const segments = url.pathname.split("/").filter((segment) => segment !== "");
  if (segments.length !== 2) return null;
  return { host: "github.com", owner: segments[0], name: segments[1] };
}

export function repositoryFact(project: ControlReadSourceProject): Fact<RepositoryIdentity> {
  if (project.repositoryUrl === null) return unknown("NOTHING_RECORDED");
  const ref = projectRepositoryRef(project.projectId);
  const normalized = normalizeRepositoryUrl(project.repositoryUrl);
  if (ref === null || !normalized.ok) return blocked("INVALID_SOURCE_VALUE");
  const identity = repositoryIdentity(normalized.value);
  if (identity === null) return blocked("INVALID_SOURCE_VALUE");
  return { class: "HUMAN_CONFIRMED", value: identity, confirmation: "ENTERED", recorded_at: null, evidence_ref: ref };
}

const LOCAL_ROOT_RULE: RuleId = "project.local-root-presence@1";

export function localRootFact(project: ControlReadSourceProject): LocalRootV1 {
  const ref = projectLocalRootRef(project.projectId);
  const derivedFrom: EvidenceRef[] = ref === null ? [] : [ref];
  const configured = typeof project.localRoot === "string" && project.localRoot.trim() !== "";
  if (configured) {
    return {
      class: "DERIVED",
      value: true,
      rule: LOCAL_ROOT_RULE,
      derived_from: derivedFrom,
      basis_observed_at: null,
      basis_recorded_at: null,
      path: { class: "BLOCKED", blocked_reason: "WITHHELD_BY_POLICY" },
    };
  }
  return { class: "DERIVED", value: false, rule: LOCAL_ROOT_RULE, derived_from: derivedFrom, basis_observed_at: null, basis_recorded_at: null };
}

/** The observation the Human UI would show for this project, and whether a raw one was dropped. */
export interface EffectiveObservation {
  observation: GitObservation | undefined;
  /** A raw observation exists AND `observationForProject(...)` dropped it. */
  invalidated: boolean;
}

export function effectiveObservation(source: ControlReadSource, project: ControlReadSourceProject): EffectiveObservation {
  const raw = source.gitObservations[project.projectId];
  if (raw === undefined) return { observation: undefined, invalidated: false };
  const observation = observationForProject(raw, project);
  return { observation, invalidated: observation === undefined };
}

function statusReason(status: Exclude<GitStatus, "OK">): UnknownReason {
  switch (status) {
    case "NO_LOCAL_ROOT":
      return "NO_LOCAL_ROOT";
    case "NOT_A_GIT_REPOSITORY":
      return "NOT_A_GIT_REPOSITORY";
    case "GIT_UNAVAILABLE":
      return "GIT_UNAVAILABLE";
    default:
      return "OBSERVATION_FAILED";
  }
}

export function gitFacts(projectId: string, effective: EffectiveObservation): ProjectStateV1["git"] {
  const all = (fact: UnknownFact | BlockedFact) => ({ head: fact, dirty: fact, detached: fact });
  if (effective.invalidated) return all(unknown("OBSERVATION_INVALIDATED"));
  const observation = effective.observation;
  if (observation === undefined) return all(unknown("NOT_OBSERVED"));
  if (observation.status !== "OK") return all(unknown(statusReason(observation.status)));
  const ref = gitObservationRef(projectId, observation.observedAt);
  if (ref === null) return all(blocked("INVALID_SOURCE_VALUE"));
  const observed = <T>(value: T): Fact<T> => ({
    class: "OBSERVED",
    value,
    observed_at: observation.observedAt,
    source: "GIT_OBSERVATION",
    evidence_ref: ref,
  });
  return {
    // Only a full commit SHA is a comparable observed HEAD (the same test the workflow uses).
    head: observation.head !== null && headBinding(observation.head) === "EXACT" ? observed(observation.head) : unknown("HEAD_NOT_COMPARABLE"),
    dirty: observation.dirty === null ? unknown("OBSERVATION_FAILED") : observed(observation.dirty),
    detached: observation.detached === null ? unknown("OBSERVATION_FAILED") : observed(observation.detached),
  };
}

function compareIdsDescending(left: string, right: string): number {
  return left < right ? 1 : left > right ? -1 : 0;
}

/** Readable reviews of one project, split into the listed (non-CLOSED, capped) and CLOSED ones. */
function projectReviews(source: ControlReadSource, projectId: string) {
  const readable = readableReviews(source).filter((review) => review.session.projectId === projectId);
  const open = readable
    .filter((review) => review.session.reviewState !== "CLOSED")
    .sort((left, right) => compareIdsDescending(left.session.reviewSessionId, right.session.reviewSessionId));
  const closedCount = readable.length - open.length;
  const listed = open.slice(0, MAX_SNAPSHOT_REVIEWS);
  return { listed, closedCount, truncated: open.length > listed.length };
}

export function projectState(
  source: ControlReadSource,
  project: ControlReadSourceProject,
  registryHealth: ReadableHealth,
): Projected<ProjectStateV1> {
  const reviews = projectReviews(source, project.projectId);
  return {
    value: {
      project_id: project.projectId,
      registry_health: registryHealth,
      repository: repositoryFact(project),
      local_root: localRootFact(project),
      git: gitFacts(project.projectId, effectiveObservation(source, project)),
      review_session_ids: reviews.listed.map((review) => review.session.reviewSessionId),
      closed_review_count: reviews.closedCount,
    },
    limits: reviews.truncated ? new Set<LimitKind>(["MAX_REVIEWS"]) : NO_LIMITS,
  };
}

// ---------------------------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------------------------

/**
 * HD-5A-09 (option A): durable-record-based conservative classification. The confirmation is never
 * inferred from the state name alone, from `suspendedFrom`, or from event history.
 */
export function reviewStateConfirmation(session: ReviewSession): HumanConfirmation {
  const state = session.reviewState;
  if (state === "CLOSED") return "EXPLICIT";
  if (state === "FIX_REQUIRED" || state === "REVIEW_PASS" || state === "BLOCKED") {
    const round = lastRound(session);
    return round !== undefined && round.verdict === state && round.verdictConfirmedAt !== null ? "EXPLICIT" : "ENTERED";
  }
  return "ENTERED";
}

function presence(rule: RuleId, ref: EvidenceRef | null, recordedAt: string | null): PresenceFact {
  return {
    class: "DERIVED",
    value: recordedAt !== null,
    rule,
    derived_from: ref === null ? [] : [ref],
    basis_observed_at: null,
    basis_recorded_at: recordedAt,
  };
}

function enteredOrUnknown<T>(value: T | null, ref: EvidenceRef | null, recordedAt: string | null, confirmation: HumanConfirmation): Fact<T> {
  if (value === null) return unknown("NOTHING_RECORDED");
  if (ref === null) return blocked("INVALID_SOURCE_VALUE");
  return { class: "HUMAN_CONFIRMED", value, confirmation, recorded_at: recordedAt, evidence_ref: ref };
}

export function roundState(reviewSessionId: string, round: RoundRecord): RoundStateV1 {
  const ref = (field: ReviewRoundField) => reviewRoundFieldRef(reviewSessionId, round.round, field);
  const expected = enteredOrUnknown(round.expectedHead, ref("expected-head"), null, "ENTERED");
  return {
    round: round.round,
    expected_head: expected.class === "HUMAN_CONFIRMED" ? { ...expected, binding: headBinding(round.expectedHead) } : expected,
    reviewed_head: enteredOrUnknown(round.reviewedHead, ref("reviewed-head"), round.resultCapturedAt, "ENTERED"),
    result_captured: presence("round.result-presence@1", ref("result"), round.resultCapturedAt),
    // RF-5A-IR-01: a stored verdict is EXPLICIT only with its durable confirmation time; a verdict
    // without one is ENTERED (the schema accepts that combination, so it is represented as it is).
    verdict: enteredOrUnknown(
      round.verdict,
      ref("verdict"),
      round.verdictConfirmedAt,
      round.verdictConfirmedAt !== null ? "EXPLICIT" : "ENTERED",
    ),
    judgment_captured: presence("round.judgment-presence@1", ref("judgment"), round.judgmentCapturedAt),
    risk_tier: enteredOrUnknown(round.riskTier, ref("risk-tier"), null, "EXPLICIT"),
  };
}

export function freshnessFact(
  session: ReviewSession,
  project: ControlReadSourceProject | undefined,
  effective: EffectiveObservation | undefined,
): Fact<FreshnessValue> {
  if (project === undefined || effective === undefined) return unknown("PROJECT_NOT_REGISTERED");
  if (effective.invalidated) return unknown("OBSERVATION_INVALIDATED");
  const round = lastRound(session);
  const result = deriveFreshness({
    observation: effective.observation,
    expectedHead: round?.expectedHead ?? null,
    reviewedHead: round?.reviewedHead ?? null,
  });
  if (result.status === "UNKNOWN") return unknown(unknownCause(result) ?? "OBSERVATION_FAILED");
  const observation = effective.observation;
  // A decided status always comes from an OK observation; anything else stays unknown (fail closed).
  if (observation === undefined || round === undefined) return unknown("OBSERVATION_FAILED");
  const refs: (EvidenceRef | null)[] = [gitObservationRef(project.projectId, observation.observedAt)];
  if (round.expectedHead !== null) refs.push(reviewRoundFieldRef(session.reviewSessionId, round.round, "expected-head"));
  if (round.reviewedHead !== null) refs.push(reviewRoundFieldRef(session.reviewSessionId, round.round, "reviewed-head"));
  const derivedFrom = refs.filter((ref): ref is EvidenceRef => ref !== null);
  if (derivedFrom.length !== refs.length) return blocked("INVALID_SOURCE_VALUE");
  return {
    class: "DERIVED",
    value: result.status,
    rule: "freshness.derive@1",
    derived_from: derivedFrom,
    basis_observed_at: observation.observedAt,
  };
}

export function reviewState(source: ControlReadSource, review: ReadableReview): Projected<ReviewStateV1> {
  const session = review.session;
  const id = session.reviewSessionId;
  const project = source.projects.find((candidate) => candidate.projectId === session.projectId);
  const effective = project === undefined ? undefined : effectiveObservation(source, project);
  const newestFirst = [...session.rounds].reverse();
  const rounds = newestFirst.slice(0, MAX_SNAPSHOT_ROUNDS);
  const stateRef = reviewFieldRef(id, "review-state");
  const resourceRef = reviewFieldRef(id, "resource-state");
  const last = lastRound(session);
  return {
    value: {
      review_session_id: id,
      project_id: session.projectId,
      file_health: review.health,
      review_state:
        stateRef === null
          ? blocked("INVALID_SOURCE_VALUE")
          : { class: "HUMAN_CONFIRMED", value: session.reviewState, confirmation: reviewStateConfirmation(session), recorded_at: null, evidence_ref: stateRef },
      resource_state:
        resourceRef === null
          ? blocked("INVALID_SOURCE_VALUE")
          : { class: "HUMAN_CONFIRMED", value: session.resourceState, confirmation: "ENTERED", recorded_at: null, evidence_ref: resourceRef },
      pr_number: enteredOrUnknown(session.prNumber, reviewFieldRef(id, "pr-number"), null, "ENTERED"),
      current_round: last === undefined ? null : last.round,
      rounds: rounds.map((round) => roundState(id, round)),
      freshness: freshnessFact(session, project, effective),
    },
    limits: newestFirst.length > rounds.length ? new Set<LimitKind>(["MAX_ROUNDS"]) : NO_LIMITS,
  };
}

// ---------------------------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------------------------

export function controlSnapshot(
  source: ControlReadSource,
  project: ControlReadSourceProject,
  registryHealth: ReadableHealth,
): Projected<ControlSnapshotV1> {
  const projected = projectState(source, project, registryHealth);
  const limits = new Set<LimitKind>(projected.limits);
  const byId = new Map(readableReviews(source).map((review) => [review.session.reviewSessionId, review] as const));
  const reviews: ReviewStateV1[] = [];
  for (const id of projected.value.review_session_ids) {
    const review = byId.get(id);
    if (review === undefined) continue;
    const state = reviewState(source, review);
    for (const limit of state.limits) limits.add(limit);
    reviews.push(state.value);
  }
  return {
    value: {
      project: projected.value,
      reviews,
      unattributable_review_count: source.reviews.filter((review) => readableReview(review) === null).length,
      external_gates: { class: "UNKNOWN", unknown_reason: "NOT_TRACKED_BY_DVCC" },
    },
    limits,
  };
}
