import limits from "../../contract/limits.json";

/**
 * Shared limits contract (F-11). `contract/limits.json` is the single definition used by the
 * domain rules, schema validation, UI and tests in TypeScript and by the Rust storage
 * file-name validation (embedded at compile time). Do not repeat these numbers elsewhere.
 */
function positiveInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`contract/limits.json: ${name} must be a positive integer`);
  }
  return value;
}

/** Highest review round number a session may reach (round files are `request-r<N>.md` / `result-r<N>.md`). */
export const MAX_REVIEW_ROUNDS = positiveInteger(limits.maxReviewRounds, "maxReviewRounds");

/** Bound for one local Git observation, shared with `src-tauri/src/git.rs` (Phase 2). */
export const GIT_OBSERVATION_TIMEOUT_MS = positiveInteger(limits.gitObservationTimeoutMs, "gitObservationTimeoutMs");
