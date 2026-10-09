import { MAX_REVIEW_ROUNDS } from "../limits";
import { isIsoTimestamp, isValidProjectId, isValidReviewId } from "../validation";

/**
 * Control Read v1 evidence references (Phase 5A, Task Packet rev 3.2 §6 / RF-5A-R2-04).
 *
 * An evidence reference names *where* a fact comes from without carrying any of its content. The
 * grammar is closed: only the seven variants below exist, and only the builders in this module can
 * produce the branded `EvidenceRef` type. Every builder input is checked with an existing domain
 * helper — a valid project ID, a valid review ID, an integer round within `MAX_REVIEW_ROUNDS`, a
 * closed field name, or an ISO-8601 observation time — and anything else yields `null`. No other
 * string, and no raw source text (a path, a display name, a note, an error message, a provider
 * identifier), is ever interpolated into a reference.
 */

declare const evidenceRefBrand: unique symbol;

export const EVIDENCE_REF_KINDS = [
  "project",
  "project-repository",
  "project-local-root",
  "review",
  "review-field",
  "review-round-field",
  "git-observation",
] as const;
export type EvidenceRefKind = (typeof EVIDENCE_REF_KINDS)[number];

/** A reference produced by one of the builders below; a plain string is not one. */
export type EvidenceRef = string & { readonly [evidenceRefBrand]: EvidenceRefKind };

export const REVIEW_FIELDS = ["review-state", "resource-state", "pr-number"] as const;
export type ReviewField = (typeof REVIEW_FIELDS)[number];

export const REVIEW_ROUND_FIELDS = ["expected-head", "reviewed-head", "result", "verdict", "judgment", "risk-tier"] as const;
export type ReviewRoundField = (typeof REVIEW_ROUND_FIELDS)[number];

function brand(value: string): EvidenceRef {
  return value as EvidenceRef;
}

function isProjectId(value: unknown): value is string {
  return typeof value === "string" && isValidProjectId(value);
}

function isReviewId(value: unknown): value is string {
  return typeof value === "string" && isValidReviewId(value);
}

function isRound(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_REVIEW_ROUNDS;
}

/** The field names are checked at run time too, so a value cast past the type cannot slip in. */
function isOneOf<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

/** `dvcc:project/<projectId>` */
export function projectRef(projectId: string): EvidenceRef | null {
  return isProjectId(projectId) ? brand(`dvcc:project/${projectId}`) : null;
}

/** `dvcc:project/<projectId>/repository` */
export function projectRepositoryRef(projectId: string): EvidenceRef | null {
  return isProjectId(projectId) ? brand(`dvcc:project/${projectId}/repository`) : null;
}

/** `dvcc:project/<projectId>/local-root` — names the field, never its value. */
export function projectLocalRootRef(projectId: string): EvidenceRef | null {
  return isProjectId(projectId) ? brand(`dvcc:project/${projectId}/local-root`) : null;
}

/** `dvcc:review/<reviewSessionId>` */
export function reviewRef(reviewSessionId: string): EvidenceRef | null {
  return isReviewId(reviewSessionId) ? brand(`dvcc:review/${reviewSessionId}`) : null;
}

/** `dvcc:review/<reviewSessionId>/field/<review-state|resource-state|pr-number>` */
export function reviewFieldRef(reviewSessionId: string, field: ReviewField): EvidenceRef | null {
  if (!isReviewId(reviewSessionId) || !isOneOf(REVIEW_FIELDS, field)) return null;
  return brand(`dvcc:review/${reviewSessionId}/field/${field}`);
}

/** `dvcc:review/<reviewSessionId>/round/<n>/<expected-head|reviewed-head|result|verdict|judgment|risk-tier>` */
export function reviewRoundFieldRef(reviewSessionId: string, round: number, field: ReviewRoundField): EvidenceRef | null {
  if (!isReviewId(reviewSessionId) || !isRound(round) || !isOneOf(REVIEW_ROUND_FIELDS, field)) return null;
  return brand(`dvcc:review/${reviewSessionId}/round/${round}/${field}`);
}

/** `dvcc:git-observation/<projectId>/<observedAt>` */
export function gitObservationRef(projectId: string, observedAt: string): EvidenceRef | null {
  if (!isProjectId(projectId) || !isIsoTimestamp(observedAt)) return null;
  return brand(`dvcc:git-observation/${projectId}/${observedAt}`);
}
