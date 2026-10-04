import { isValidProjectId, isValidReviewId } from "../validation";
import {
  ALLOWED_REQUEST_KEYS,
  CONTROL_READ_CONTRACT,
  CONTROL_READ_VERSION,
  ECHOABLE_FIELD_NAME,
  OMITTED_SECTIONS,
  type ControlReadError,
  type ControlReadErrorCode,
  type ControlReadErrorReason,
  type ControlReadResult,
  type ControlReadSource,
  type Envelope,
  type ImplementedOperation,
  type LimitKind,
  type ReadControlEnv,
  type SourceHealthStatus,
} from "./contract";
import { controlSnapshot, projectState, readableHealth, readableReview, reviewState, type Projected } from "./projection";

/**
 * The single, transport-neutral entry point of Control Read v1 (Phase 5A).
 *
 * Pure: the clock and the snapshot identifier are injected, nothing is read from or written to
 * storage, and the request is validated in a fixed order (Task Packet rev 3.2 §6):
 *
 *   1. plain object            -> INVALID_REQUEST / NOT_AN_OBJECT
 *   2. contract                -> UNSUPPORTED_CONTRACT
 *   3. version                 -> UNSUPPORTED_CONTRACT_VERSION
 *   4. operation               -> UNSUPPORTED_OPERATION (get_run_state: NO_AUTHORITATIVE_RUN_SOURCE)
 *   5. unrecognized fields     -> INVALID_REQUEST / UNRECOGNIZED_FIELD
 *   6. missing / mistyped      -> INVALID_REQUEST / MISSING_FIELD | INVALID_FIELD_TYPE
 *   7. target ID format        -> INVALID_TARGET (existing isValidProjectId / isValidReviewId)
 *   8. app not loaded          -> SOURCE_UNAVAILABLE / APP_NOT_READY
 *   9. registry unreadable     -> SOURCE_UNAVAILABLE / REGISTRY_*
 *  10. target lookup           -> TARGET_NOT_FOUND / TARGET_UNAVAILABLE
 *
 * Contract and version come first so that a request for a future version is refused as such, and
 * the registry check precedes the lookup so that "not found" is never inferred from a file DVCC
 * could not read.
 */

function failure(
  code: ControlReadErrorCode,
  reason?: ControlReadErrorReason,
  extra: Omit<ControlReadError["error"], "code" | "reason"> = {},
): ControlReadError {
  return {
    contract: CONTROL_READ_CONTRACT,
    version: CONTROL_READ_VERSION,
    error: { code, ...(reason === undefined ? {} : { reason }), ...extra },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isImplementedOperation(value: unknown): value is ImplementedOperation {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ALLOWED_REQUEST_KEYS, value);
}

/** Names that match the echo pattern are listed; the rest are only counted, never echoed. */
function unrecognizedFields(names: readonly string[]): ControlReadError {
  const listable = names.filter((name) => ECHOABLE_FIELD_NAME.test(name)).sort();
  const unlisted = names.length - listable.length;
  return failure("INVALID_REQUEST", "UNRECOGNIZED_FIELD", {
    ...(listable.length > 0 ? { fields: listable } : {}),
    ...(unlisted > 0 ? { unlisted_field_count: unlisted } : {}),
  });
}

const REGISTRY_REASONS: Partial<Record<SourceHealthStatus, ControlReadErrorReason>> = {
  unreadable: "REGISTRY_UNREADABLE",
  io_error: "REGISTRY_IO_ERROR",
  unsupported_version: "REGISTRY_UNSUPPORTED_VERSION",
};

/** The review file's health status as a reason code — never its message, parameters or names. */
function unavailableReason(status: SourceHealthStatus): ControlReadErrorReason {
  switch (status) {
    case "io_error":
      return "IO_ERROR";
    case "unsupported_version":
      return "UNSUPPORTED_VERSION";
    case "missing":
      return "MISSING";
    default:
      return "UNREADABLE";
  }
}

function envelope<T>(operation: ImplementedOperation, projected: Projected<T>, env: ReadControlEnv): Envelope<T> {
  const limits = [...projected.limits].sort() as LimitKind[];
  return {
    contract: CONTROL_READ_CONTRACT,
    version: CONTROL_READ_VERSION,
    operation,
    snapshot_id: env.newSnapshotId(),
    generated_at: env.now(),
    complete: limits.length === 0,
    limits_applied: limits,
    omitted_sections: [...OMITTED_SECTIONS],
    data: projected.value,
  };
}

export function readControl(request: unknown, source: ControlReadSource, env: ReadControlEnv): ControlReadResult {
  // 1–4: shape, contract, version, operation.
  if (!isPlainObject(request)) return failure("INVALID_REQUEST", "NOT_AN_OBJECT");
  if (request.contract !== CONTROL_READ_CONTRACT) return failure("UNSUPPORTED_CONTRACT");
  if (request.version !== CONTROL_READ_VERSION) {
    return failure("UNSUPPORTED_CONTRACT_VERSION", "REQUESTED_VERSION_NOT_SUPPORTED", { supported_versions: [1] });
  }
  const operation = request.operation;
  if (operation === "get_run_state") return failure("UNSUPPORTED_OPERATION", "NO_AUTHORITATIVE_RUN_SOURCE");
  if (!isImplementedOperation(operation)) return failure("UNSUPPORTED_OPERATION");

  // 5–6: exact field set.
  const allowed = ALLOWED_REQUEST_KEYS[operation];
  const unknownNames = Object.keys(request).filter((name) => !allowed.includes(name));
  if (unknownNames.length > 0) return unrecognizedFields(unknownNames);
  const targetKey = operation === "get_review_state" ? "review_session_id" : "project_id";
  if (!Object.prototype.hasOwnProperty.call(request, targetKey)) return failure("INVALID_REQUEST", "MISSING_FIELD", { fields: [targetKey] });
  const target = request[targetKey];
  if (typeof target !== "string") return failure("INVALID_REQUEST", "INVALID_FIELD_TYPE", { fields: [targetKey] });

  // 7: target format, with the existing domain validators.
  const validTarget = operation === "get_review_state" ? isValidReviewId(target) : isValidProjectId(target);
  if (!validTarget) return failure("INVALID_TARGET");

  // 8–9: the source must be loaded and its registry readable.
  if (source.phase !== "ready") return failure("SOURCE_UNAVAILABLE", "APP_NOT_READY");
  const registryReason = REGISTRY_REASONS[source.projectsHealth.status];
  if (registryReason !== undefined) return failure("SOURCE_UNAVAILABLE", registryReason);

  // 10: lookup.
  if (operation === "get_review_state") {
    const review = source.reviews.find((candidate) => candidate.reviewId === target);
    if (review === undefined) return failure("TARGET_NOT_FOUND");
    const readable = readableReview(review);
    if (readable === null) return failure("TARGET_UNAVAILABLE", unavailableReason(review.health.status));
    return envelope(operation, reviewState(source, readable), env);
  }
  const project = source.projects.find((candidate) => candidate.projectId === target);
  // A registry that was read (ok / restored) or is absent (missing) can truthfully lack the project.
  if (project === undefined) return failure("TARGET_NOT_FOUND");
  const registryHealth = readableHealth(source.projectsHealth.status);
  // `missing` cannot hold a project; anything that does without a readable status fails closed.
  if (registryHealth === null) return failure("SOURCE_UNAVAILABLE", "REGISTRY_UNREADABLE");
  return operation === "get_project_state"
    ? envelope(operation, projectState(source, project, registryHealth), env)
    : envelope(operation, controlSnapshot(source, project, registryHealth), env);
}
