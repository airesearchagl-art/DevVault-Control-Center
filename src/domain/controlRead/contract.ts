import type { ObservedGitState } from "../git";
import type { ReviewSession } from "../review";
import type { RiskTier } from "../riskTier";
import type { ResourceState, ReviewState } from "../states";
import type { EvidenceRef } from "./evidenceRef";

/**
 * Control Read v1 — the versioned, transport-neutral, read-only machine contract of DVCC
 * (Phase 5A, Task Packet rev 3.2). It answers only "what is true now, as far as DVCC knows";
 * it never answers what an agent may do (Phase 5B). Nothing here is bound to MCP or any other
 * transport, and nothing here is persisted.
 */

export const CONTROL_READ_CONTRACT = "dvcc.control-read" as const;
export const CONTROL_READ_VERSION = 1 as const;

export const FACT_CLASSES = ["OBSERVED", "HUMAN_CONFIRMED", "DERIVED", "UNKNOWN", "BLOCKED"] as const;
export type FactClass = (typeof FACT_CLASSES)[number];

/** Closed set of derivation rules in v1 (no free-form rule strings). */
export const RULE_IDS = [
  "project.local-root-presence@1",
  "round.result-presence@1",
  "round.judgment-presence@1",
  "freshness.derive@1",
] as const;
export type RuleId = (typeof RULE_IDS)[number];

export const UNKNOWN_REASONS = [
  "NOT_OBSERVED",
  "OBSERVATION_INVALIDATED",
  "GIT_UNAVAILABLE",
  "NO_LOCAL_ROOT",
  "NOT_A_GIT_REPOSITORY",
  "OBSERVATION_FAILED",
  "HEAD_NOT_COMPARABLE",
  "NOTHING_RECORDED",
  "PROJECT_NOT_REGISTERED",
  "NOT_TRACKED_BY_DVCC",
] as const;
export type UnknownReason = (typeof UNKNOWN_REASONS)[number];

export const BLOCKED_REASONS = ["WITHHELD_BY_POLICY", "INVALID_SOURCE_VALUE"] as const;
export type BlockedReason = (typeof BLOCKED_REASONS)[number];

export const HUMAN_CONFIRMATIONS = ["EXPLICIT", "ENTERED"] as const;
export type HumanConfirmation = (typeof HUMAN_CONFIRMATIONS)[number];

export type UnknownFact = { class: "UNKNOWN"; unknown_reason: UnknownReason };
export type BlockedFact = { class: "BLOCKED"; blocked_reason: BlockedReason };

export type Fact<T> =
  | { class: "OBSERVED"; value: T; observed_at: string; source: "GIT_OBSERVATION"; evidence_ref: EvidenceRef }
  | {
      class: "HUMAN_CONFIRMED";
      value: T;
      confirmation: HumanConfirmation;
      /**
       * Exact source timestamp of THIS value, or `null` when the persisted model has no
       * authoritative field timestamp. Never substituted with an entity-level updatedAt / createdAt.
       */
      recorded_at: string | null;
      evidence_ref: EvidenceRef;
    }
  | { class: "DERIVED"; value: T; rule: RuleId; derived_from: EvidenceRef[]; basis_observed_at: string | null }
  | UnknownFact
  | BlockedFact;

/** Presence derived from persisted records. `false` is an absence, never a Human confirmation. */
export interface PresenceFact<V extends boolean = boolean> {
  class: "DERIVED";
  value: V;
  rule: RuleId;
  derived_from: EvidenceRef[];
  /** Derived from records, not from an observation. */
  basis_observed_at: null;
  /** Exact source timestamp when present (e.g. `resultCapturedAt`), else `null`. */
  basis_recorded_at: string | null;
}

export type WithheldPath = { class: "BLOCKED"; blocked_reason: "WITHHELD_BY_POLICY" };

/** A configured local root is withheld; an unconfigured one has no path, so nothing is "withheld". */
export type LocalRootV1 = (PresenceFact<true> & { path: WithheldPath }) | (PresenceFact<false> & { path?: never });

export interface RepositoryIdentity {
  host: "github.com";
  owner: string;
  name: string;
}

/** Only readable health can appear inside a returned fact set (unreadable sources fail closed). */
export type ReadableHealth = "ok" | "restored_from_backup";

export type HeadBindingValue = "EXACT" | "SHORT" | "MISSING";

export interface ProjectStateV1 {
  project_id: string;
  registry_health: ReadableHealth;
  repository: Fact<RepositoryIdentity>;
  local_root: LocalRootV1;
  git: { head: Fact<string>; dirty: Fact<boolean>; detached: Fact<boolean> };
  /** Readable, non-CLOSED reviews of this project; sorted by reviewSessionId descending; capped. */
  review_session_ids: string[];
  /** Readable CLOSED reviews of this project. */
  closed_review_count: number;
}

export interface RoundStateV1 {
  round: number;
  expected_head: Fact<string> & { binding?: HeadBindingValue };
  reviewed_head: Fact<string>;
  result_captured: PresenceFact;
  verdict: Fact<"FIX_REQUIRED" | "REVIEW_PASS" | "BLOCKED">;
  judgment_captured: PresenceFact;
  risk_tier: Fact<RiskTier>;
}

export type FreshnessValue = "ALIGNED" | "HEAD_CHANGED" | "REVIEW_STALE" | "WORKTREE_DIRTY";

/** Built only from a review whose session is readable (`session !== null`). */
export interface ReviewStateV1 {
  review_session_id: string;
  project_id: string;
  file_health: ReadableHealth;
  review_state: Fact<ReviewState>;
  resource_state: Fact<ResourceState>;
  pr_number: Fact<number>;
  current_round: number | null;
  /** Most recent first; capped. */
  rounds: RoundStateV1[];
  freshness: Fact<FreshnessValue>;
}

export const OMITTED_SECTIONS = ["ide_sessions", "runs", "action_eligibility", "queue_order"] as const;
export type OmittedSection = (typeof OMITTED_SECTIONS)[number];

export const CONTROL_READ_OPERATIONS = ["get_control_snapshot", "get_project_state", "get_review_state", "get_run_state"] as const;
export type ControlReadOperation = (typeof CONTROL_READ_OPERATIONS)[number];
export type ImplementedOperation = Exclude<ControlReadOperation, "get_run_state">;

export const LIMIT_KINDS = ["MAX_REVIEWS", "MAX_ROUNDS"] as const;
export type LimitKind = (typeof LIMIT_KINDS)[number];

/** Readable non-CLOSED reviews per project in one response. */
export const MAX_SNAPSHOT_REVIEWS = 50;
/** Rounds per review in one response (the most recent ones). */
export const MAX_SNAPSHOT_ROUNDS = 20;

export interface Envelope<TData> {
  contract: typeof CONTROL_READ_CONTRACT;
  version: typeof CONTROL_READ_VERSION;
  operation: ImplementedOperation;
  /** Identifier only — never an authority, lock or concurrency token. */
  snapshot_id: string;
  generated_at: string;
  complete: boolean;
  limits_applied: LimitKind[];
  omitted_sections: OmittedSection[];
  data: TData;
}

export interface ControlSnapshotV1 {
  project: ProjectStateV1;
  reviews: ReviewStateV1[];
  /**
   * Reviews whose session cannot be read: they cannot be tied to any Project. A global count across
   * the data folder — no IDs, no reasons, and no fabricated review state.
   */
  unattributable_review_count: number;
  external_gates: { class: "UNKNOWN"; unknown_reason: "NOT_TRACKED_BY_DVCC" };
}

/** Allowed request keys per implemented operation; anything else is an unrecognized field. */
export const ALLOWED_REQUEST_KEYS: Readonly<Record<ImplementedOperation, readonly string[]>> = {
  get_control_snapshot: ["contract", "version", "operation", "project_id"],
  get_project_state: ["contract", "version", "operation", "project_id"],
  get_review_state: ["contract", "version", "operation", "review_session_id"],
};

/** Unrecognized field names are echoed only when they match this shape; others are only counted. */
export const ECHOABLE_FIELD_NAME = /^[a-z][a-z0-9_]{0,63}$/;

export const CONTROL_READ_ERROR_CODES = [
  "INVALID_REQUEST",
  "UNSUPPORTED_CONTRACT",
  "UNSUPPORTED_CONTRACT_VERSION",
  "UNSUPPORTED_OPERATION",
  "INVALID_TARGET",
  "SOURCE_UNAVAILABLE",
  "TARGET_NOT_FOUND",
  "TARGET_UNAVAILABLE",
] as const;
export type ControlReadErrorCode = (typeof CONTROL_READ_ERROR_CODES)[number];

export const CONTROL_READ_ERROR_REASONS = [
  // INVALID_REQUEST
  "NOT_AN_OBJECT",
  "UNRECOGNIZED_FIELD",
  "MISSING_FIELD",
  "INVALID_FIELD_TYPE",
  // UNSUPPORTED_CONTRACT_VERSION
  "REQUESTED_VERSION_NOT_SUPPORTED",
  // UNSUPPORTED_OPERATION (get_run_state)
  "NO_AUTHORITATIVE_RUN_SOURCE",
  // SOURCE_UNAVAILABLE
  "APP_NOT_READY",
  "REGISTRY_UNREADABLE",
  "REGISTRY_IO_ERROR",
  "REGISTRY_UNSUPPORTED_VERSION",
  // TARGET_UNAVAILABLE (from the review file health status only)
  "UNREADABLE",
  "IO_ERROR",
  "UNSUPPORTED_VERSION",
  "MISSING",
] as const;
export type ControlReadErrorReason = (typeof CONTROL_READ_ERROR_REASONS)[number];

export interface ControlReadError {
  contract: typeof CONTROL_READ_CONTRACT;
  /** The version DVCC speaks. */
  version: typeof CONTROL_READ_VERSION;
  error: {
    code: ControlReadErrorCode;
    reason?: ControlReadErrorReason;
    /** Field NAMES only, sorted, and only names matching `ECHOABLE_FIELD_NAME`; never values. */
    fields?: string[];
    /**
     * Count of unrecognized names that do NOT match `ECHOABLE_FIELD_NAME` (not echoed). Present only
     * when that count is >= 1; omitted (never 0) when every unrecognized name was listable.
     */
    unlisted_field_count?: number;
    supported_versions?: [1];
  };
}

export type ControlReadResult =
  | Envelope<ControlSnapshotV1>
  | Envelope<ProjectStateV1>
  | Envelope<ReviewStateV1>
  | ControlReadError;

// ---------------------------------------------------------------------------------------------
// The read-only source. Structural, minimal types: the projection can only reach what it may use.
// ---------------------------------------------------------------------------------------------

export type SourceHealthStatus = "ok" | "missing" | "restored_from_backup" | "unreadable" | "io_error" | "unsupported_version";

/** Only the project fields Control Read uses; display name, notes and next action are not reachable. */
export interface ControlReadSourceProject {
  readonly projectId: string;
  readonly repositoryUrl: string | null;
  readonly localRoot: string | null;
  readonly createdAt: string;
}

/** Only the health status is reachable — never its message, parameters or set-aside names. */
export interface ControlReadSourceReview {
  readonly reviewId: string;
  readonly session: ReviewSession | null;
  readonly health: { readonly status: SourceHealthStatus };
}

export interface ControlReadSource {
  readonly phase: "loading" | "ready" | "fatal";
  readonly projects: readonly ControlReadSourceProject[];
  readonly projectsHealth: { readonly status: SourceHealthStatus };
  readonly reviews: readonly ControlReadSourceReview[];
  readonly gitObservations: Readonly<Record<string, ObservedGitState | undefined>>;
}

export interface ReadControlEnv {
  now: () => string;
  newSnapshotId: () => string;
}
