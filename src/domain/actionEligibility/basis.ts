import {
  CONTROL_READ_CONTRACT,
  CONTROL_READ_VERSION,
  type ControlReadErrorCode,
  type ControlReadResult,
  type ControlReadSource,
  type ReadControlEnv,
  type ReviewStateV1,
} from "../controlRead/contract";
import { readableReview } from "../controlRead/projection";
import { readControl } from "../controlRead/readControl";
import type { ReviewSession } from "../review";
import {
  ACTION_ELIGIBILITY_CONTRACT,
  ACTION_ELIGIBILITY_VERSION,
  type ActionEligibilityError,
  type ActionEligibilityErrorReason,
} from "./contract";

/**
 * The basis of an assessment (Phase 5B, Annex A3 / A4): one internal Control Read v1
 * `get_review_state` call, bound to the unique raw review it was projected from.
 *
 * The internal call never sees the caller's request or environment: its request is rebuilt from the
 * validated review ID alone, and its environment is a constant whose values are discarded. Every
 * basis error is rebuilt from a closed table; nothing of the internal response is copied through.
 * An ambiguous source (duplicated or conflicting identities) is refused, whatever the array order.
 */

export function actionEligibilityError(
  code: ControlReadErrorCode,
  reason?: ActionEligibilityErrorReason,
  extra: Omit<ActionEligibilityError["error"], "code" | "reason"> = {},
): ActionEligibilityError {
  return {
    contract: ACTION_ELIGIBILITY_CONTRACT,
    version: ACTION_ELIGIBILITY_VERSION,
    error: { code, ...(reason === undefined ? {} : { reason }), ...extra },
  };
}

const basisContractViolation = () => actionEligibilityError("SOURCE_UNAVAILABLE", "BASIS_CONTRACT_VIOLATION");
const identityMismatch = () => actionEligibilityError("TARGET_UNAVAILABLE", "IDENTITY_MISMATCH");

/** Constant: called once each on a successful internal read and never on an error; values are discarded. */
export const BASIS_ENV: ReadControlEnv = Object.freeze({
  now: () => "1970-01-01T00:00:00.000Z",
  newSnapshotId: () => "snap-00000000-0000-4000-8000-000000000000",
});

function basisRequest(reviewSessionId: string) {
  return { contract: CONTROL_READ_CONTRACT, version: CONTROL_READ_VERSION, operation: "get_review_state", review_session_id: reviewSessionId };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** The only internal basis errors that are passed on, as (code, reason) pairs; `null` = no reason. */
const PASS_THROUGH: ReadonlyMap<ControlReadErrorCode, readonly (ActionEligibilityErrorReason | null)[]> = new Map([
  ["INVALID_TARGET", [null]],
  ["SOURCE_UNAVAILABLE", ["APP_NOT_READY", "REGISTRY_UNREADABLE", "REGISTRY_IO_ERROR", "REGISTRY_UNSUPPORTED_VERSION"]],
  ["TARGET_NOT_FOUND", [null]],
  ["TARGET_UNAVAILABLE", ["UNREADABLE", "IO_ERROR", "UNSUPPORTED_VERSION", "MISSING"]],
] as const);

/**
 * Rebuilds an internal basis error from the closed table. Anything outside it — another pair, an extra
 * key, another contract or version — is a basis contract violation. Nothing is spread or copied.
 */
export function mapBasisError(result: unknown): ActionEligibilityError {
  if (!isPlainObject(result) || result.contract !== CONTROL_READ_CONTRACT || result.version !== CONTROL_READ_VERSION) {
    return basisContractViolation();
  }
  const error = result.error;
  if (!isPlainObject(error) || Object.keys(error).some((key) => key !== "code" && key !== "reason")) return basisContractViolation();
  const code = error.code;
  const reason = hasOwn(error, "reason") ? error.reason : null;
  for (const [allowedCode, reasons] of PASS_THROUGH) {
    if (code !== allowedCode) continue;
    const match = reasons.find((allowed) => allowed === reason);
    if (match === undefined) return basisContractViolation();
    return match === null ? actionEligibilityError(allowedCode) : actionEligibilityError(allowedCode, match);
  }
  return basisContractViolation();
}

export type IdentityRule = "I1" | "I2" | "I3";

export type IdentityScan =
  | { kind: "REVIEW_CONFLICT"; rules: IdentityRule[] }
  | { kind: "NONE" }
  | { kind: "UNIQUE_UNREADABLE" }
  | { kind: "UNIQUE_READABLE"; raw: ReviewSession; projectCount: number };

/**
 * Counts, without using array order, every source entry that names the review ID — by its outer
 * `reviewId` or by its inner `session.reviewSessionId` — and the registry entries of its project.
 *
 * - I1: two or more entries carry the ID as their outer `reviewId`.
 * - I2: another entry's inner session claims the ID (whatever that entry's health).
 * - I3: the one entry with the ID holds a session with a different inner ID.
 */
export function scanIdentity(reviewSessionId: string, source: ControlReadSource): IdentityScan {
  const outer = source.reviews.filter((entry) => entry.reviewId === reviewSessionId);
  const inner = source.reviews.filter(
    (entry) => entry.reviewId !== reviewSessionId && entry.session !== null && entry.session.reviewSessionId === reviewSessionId,
  );
  const rules: IdentityRule[] = [];
  if (outer.length >= 2) rules.push("I1");
  if (inner.length >= 1) rules.push("I2");
  if (outer.length === 1 && outer[0].session !== null && outer[0].session.reviewSessionId !== reviewSessionId) rules.push("I3");
  if (rules.length > 0) return { kind: "REVIEW_CONFLICT", rules };
  if (outer.length === 0) return { kind: "NONE" };
  const readable = readableReview(outer[0]);
  if (readable === null) return { kind: "UNIQUE_UNREADABLE" };
  const projectCount = source.projects.filter((project) => project.projectId === readable.session.projectId).length;
  return { kind: "UNIQUE_READABLE", raw: readable.session, projectCount };
}

export type BoundBasis = { ok: true; raw: ReviewSession; basis: ReviewStateV1 } | { ok: false; error: ActionEligibilityError };

function lastRoundNumber(raw: ReviewSession): number | null {
  return raw.rounds.length > 0 ? raw.rounds[raw.rounds.length - 1].round : null;
}

/**
 * Post-binding identity (B4 – B7): the projected basis must describe exactly the raw review the scan
 * found (B2 — a unique, readable entry — is what the scan returned). Any disagreement is refused.
 */
export function bindIdentity(reviewSessionId: string, raw: ReviewSession, data: ReviewStateV1): BoundBasis {
  // B4: the projected review is the requested one.
  if (data.review_session_id !== reviewSessionId) return { ok: false, error: identityMismatch() };
  // B5: of the same project.
  if (data.project_id !== raw.projectId) return { ok: false, error: identityMismatch() };
  // B6: one current round, the same in the raw review and in its projection.
  const current = raw.reviewRound;
  const newest = Array.isArray(data.rounds) && data.rounds.length > 0 ? data.rounds[0] : undefined;
  if (
    raw.rounds.length < 1 ||
    lastRoundNumber(raw) !== current ||
    raw.rounds.length !== current ||
    data.current_round !== current ||
    newest === undefined ||
    newest.round !== current
  ) {
    return { ok: false, error: identityMismatch() };
  }
  // B7: a confirmed review state is the raw review's state.
  if (data.review_state.class === "HUMAN_CONFIRMED" && data.review_state.value !== raw.reviewState) {
    return { ok: false, error: identityMismatch() };
  }
  return { ok: true, raw, basis: data };
}

function isErrorResult(result: unknown): result is Record<string, unknown> & { error: unknown } {
  return isPlainObject(result) && hasOwn(result, "error");
}

function errorCode(result: Record<string, unknown> & { error: unknown }): unknown {
  return isPlainObject(result.error) ? result.error.code : undefined;
}

function isSuccessShape(result: unknown): result is { data: ReviewStateV1 } {
  if (
    !isPlainObject(result) ||
    result.contract !== CONTROL_READ_CONTRACT ||
    result.version !== CONTROL_READ_VERSION ||
    result.operation !== "get_review_state" ||
    !isPlainObject(result.data)
  ) {
    return false;
  }
  const data = result.data;
  return (
    typeof data.review_session_id === "string" &&
    typeof data.project_id === "string" &&
    Array.isArray(data.rounds) &&
    isPlainObject(data.review_state) &&
    isPlainObject(data.freshness)
  );
}

/** Interprets one internal basis result in the fixed precedence of Annex A3 (steps 7 – 11). */
export function interpretBasis(reviewSessionId: string, source: ControlReadSource, result: unknown): BoundBasis {
  // 7–9: format, readiness and registry come from the request and the source health alone.
  if (isErrorResult(result)) {
    const code = errorCode(result);
    if (code === "INVALID_TARGET" || code === "SOURCE_UNAVAILABLE") return { ok: false, error: mapBasisError(result) };
  }
  const scan = scanIdentity(reviewSessionId, source);
  // 10a: a review-side identity conflict, before any lookup result is trusted.
  if (scan.kind === "REVIEW_CONFLICT") return { ok: false, error: identityMismatch() };
  // 10b / 10c: not found / unavailable, from the closed table.
  if (isErrorResult(result)) return { ok: false, error: mapBasisError(result) };
  if (scan.kind !== "UNIQUE_READABLE") return { ok: false, error: basisContractViolation() };
  // 10d: the review's project is registered more than once.
  if (scan.projectCount >= 2) return { ok: false, error: identityMismatch() };
  // 11: the success envelope's shape, then post-binding identity.
  if (!isSuccessShape(result)) return { ok: false, error: basisContractViolation() };
  return bindIdentity(reviewSessionId, scan.raw, result.data);
}

/** The internal Control Read call. `basisEnv` is a test seam only; product code never passes it. */
export function readBasis(reviewSessionId: string, source: ControlReadSource, basisEnv: ReadControlEnv = BASIS_ENV): ControlReadResult {
  return readControl(basisRequest(reviewSessionId), source, basisEnv);
}

export function resolveBasis(reviewSessionId: string, source: ControlReadSource, basisEnv: ReadControlEnv = BASIS_ENV): BoundBasis {
  return interpretBasis(reviewSessionId, source, readBasis(reviewSessionId, source, basisEnv));
}
