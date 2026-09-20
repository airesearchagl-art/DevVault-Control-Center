/**
 * Independent Freshness contract (Phase 2).
 *
 * This file states the expected derivation as literal data. It must not import the implementation
 * it checks — the whole point is that the table is written from the contract, not read off the
 * code (same rule as `transitionContract.ts` for the Review State machine).
 *
 * Contracted priority: WORKTREE_DIRTY > REVIEW_STALE > HEAD_CHANGED > ALIGNED, and UNKNOWN for
 * everything that cannot be decided.
 */

export const FRESHNESS_VOCABULARY = [
  "ALIGNED",
  "HEAD_CHANGED",
  "REVIEW_STALE",
  "WORKTREE_DIRTY",
  "UNKNOWN",
] as const;

export type ContractFreshness = (typeof FRESHNESS_VOCABULARY)[number];

/** `null` observation = the Git state has not been observed (e.g. directly after a restart). */
export interface ContractObservation {
  status: string;
  head: string | null;
  dirty: boolean | null;
  errorMessage?: string;
}

export interface FreshnessContractRow {
  label: string;
  observation: ContractObservation | null;
  expectedHead: string | null;
  reviewedHead: string | null;
  expected: ContractFreshness;
}

const HEAD_A = "1111111111111111111111111111111111111111";
const HEAD_B = "2222222222222222222222222222222222222222";

const clean = (head: string | null): ContractObservation => ({ status: "OK", head, dirty: false });
const dirty = (head: string | null): ContractObservation => ({ status: "OK", head, dirty: true });

export const FRESHNESS_CONTRACT: readonly FreshnessContractRow[] = [
  // 1. WORKTREE_DIRTY wins over everything else while the observation is OK.
  { label: "dirty tree, heads match", observation: dirty(HEAD_A), expectedHead: HEAD_A, reviewedHead: HEAD_A, expected: "WORKTREE_DIRTY" },
  { label: "dirty tree, reviewed differs", observation: dirty(HEAD_A), expectedHead: HEAD_A, reviewedHead: HEAD_B, expected: "WORKTREE_DIRTY" },
  { label: "dirty tree, nothing recorded", observation: dirty(HEAD_A), expectedHead: null, reviewedHead: null, expected: "WORKTREE_DIRTY" },
  { label: "dirty tree, current head unknown", observation: { status: "OK", head: null, dirty: true }, expectedHead: HEAD_A, reviewedHead: null, expected: "WORKTREE_DIRTY" },

  // 2. REVIEW_STALE: clean tree, a reviewed HEAD that is not the current one.
  { label: "reviewed differs", observation: clean(HEAD_A), expectedHead: HEAD_A, reviewedHead: HEAD_B, expected: "REVIEW_STALE" },
  { label: "reviewed differs, expected also differs", observation: clean(HEAD_A), expectedHead: HEAD_B, reviewedHead: HEAD_B, expected: "REVIEW_STALE" },
  { label: "reviewed differs, no expected recorded", observation: clean(HEAD_A), expectedHead: null, reviewedHead: HEAD_B, expected: "REVIEW_STALE" },
  { label: "reviewed short prefix differs", observation: clean(HEAD_A), expectedHead: null, reviewedHead: "2222222", expected: "REVIEW_STALE" },

  // 3. HEAD_CHANGED: clean tree, reviewed matches or is absent, expected differs.
  { label: "expected differs, nothing reviewed", observation: clean(HEAD_A), expectedHead: HEAD_B, reviewedHead: null, expected: "HEAD_CHANGED" },
  { label: "expected differs, reviewed matches", observation: clean(HEAD_A), expectedHead: HEAD_B, reviewedHead: HEAD_A, expected: "HEAD_CHANGED" },
  { label: "expected short prefix differs", observation: clean(HEAD_A), expectedHead: "2222222", reviewedHead: null, expected: "HEAD_CHANGED" },

  // 4. ALIGNED: clean tree, every recorded HEAD matches the current one.
  { label: "expected matches, nothing reviewed", observation: clean(HEAD_A), expectedHead: HEAD_A, reviewedHead: null, expected: "ALIGNED" },
  { label: "reviewed matches, nothing expected", observation: clean(HEAD_A), expectedHead: null, reviewedHead: HEAD_A, expected: "ALIGNED" },
  { label: "both match", observation: clean(HEAD_A), expectedHead: HEAD_A, reviewedHead: HEAD_A, expected: "ALIGNED" },
  { label: "short recorded prefix matches", observation: clean(HEAD_A), expectedHead: "1111111", reviewedHead: "11111111111111111111", expected: "ALIGNED" },
  { label: "recorded value in upper case matches", observation: clean(HEAD_A), expectedHead: HEAD_A.toUpperCase(), reviewedHead: null, expected: "ALIGNED" },

  // 5. UNKNOWN: nothing observed, a failed observation, or a comparison that cannot be decided.
  { label: "not observed yet", observation: null, expectedHead: HEAD_A, reviewedHead: HEAD_A, expected: "UNKNOWN" },
  { label: "no local root recorded", observation: { status: "NO_LOCAL_ROOT", head: null, dirty: null }, expectedHead: HEAD_A, reviewedHead: null, expected: "UNKNOWN" },
  { label: "not a Git repository", observation: { status: "NOT_A_GIT_REPOSITORY", head: null, dirty: null }, expectedHead: HEAD_A, reviewedHead: null, expected: "UNKNOWN" },
  { label: "Git unavailable", observation: { status: "GIT_UNAVAILABLE", head: null, dirty: null }, expectedHead: HEAD_A, reviewedHead: HEAD_A, expected: "UNKNOWN" },
  { label: "observation timed out", observation: { status: "TIMEOUT", head: null, dirty: null }, expectedHead: HEAD_A, reviewedHead: null, expected: "UNKNOWN" },
  { label: "observation error (rejected path)", observation: { status: "ERROR", head: null, dirty: null, errorMessage: "network paths are not supported" }, expectedHead: HEAD_A, reviewedHead: null, expected: "UNKNOWN" },
  { label: "clean tree but current head unknown", observation: clean(null), expectedHead: HEAD_A, reviewedHead: null, expected: "UNKNOWN" },
  { label: "clean tree, nothing recorded", observation: clean(HEAD_A), expectedHead: null, reviewedHead: null, expected: "UNKNOWN" },
  { label: "working tree state unknown", observation: { status: "OK", head: HEAD_A, dirty: null }, expectedHead: HEAD_A, reviewedHead: null, expected: "UNKNOWN" },
  { label: "recorded expected HEAD is malformed", observation: clean(HEAD_A), expectedHead: "not-a-sha", reviewedHead: null, expected: "UNKNOWN" },
  { label: "expected differs while the reviewed value cannot be compared", observation: clean(HEAD_A), expectedHead: HEAD_B, reviewedHead: "not-a-sha", expected: "HEAD_CHANGED" },
  { label: "reviewed differs while the expected value cannot be compared", observation: clean(HEAD_A), expectedHead: "111", reviewedHead: HEAD_B, expected: "REVIEW_STALE" },
  { label: "reviewed matches but the expected value cannot be compared", observation: clean(HEAD_A), expectedHead: "not-a-sha", reviewedHead: HEAD_A, expected: "UNKNOWN" },
  { label: "recorded reviewed HEAD is too short", observation: clean(HEAD_A), expectedHead: null, reviewedHead: "111", expected: "UNKNOWN" },
  { label: "current head is not a full SHA", observation: clean("1111111"), expectedHead: HEAD_A, reviewedHead: null, expected: "UNKNOWN" },
];

/** Rows that must never be reported as a difference, so a mistake cannot look like staleness. */
export const NEVER_DIFFERS: readonly string[] = [
  "recorded expected HEAD is malformed",
  "recorded reviewed HEAD is too short",
  "current head is not a full SHA",
];
