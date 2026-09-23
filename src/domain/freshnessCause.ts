import type { FreshnessResult } from "./freshness";
import type { TranslationKey } from "../i18n/types";

/**
 * Which kind of "we do not know" an `UNKNOWN` Freshness is (Phase 3 workflow surface).
 *
 * `deriveFreshness` already explains every UNKNOWN in one sentence; this only sorts that sentence
 * into the four groups a Human acts on differently — nothing has been observed yet, Git could not be
 * run, there is no local root, or the HEAD values cannot be compared — plus the failed observation
 * and the round with nothing recorded. It reads the explanation the Phase 2 function chose, so the
 * two can never disagree, and it returns `null` for every decided status.
 */

export const UNKNOWN_CAUSES = [
  "NOT_OBSERVED",
  "GIT_UNAVAILABLE",
  "NO_LOCAL_ROOT",
  "HEAD_NOT_COMPARABLE",
  "OBSERVATION_FAILED",
  "NOTHING_RECORDED",
] as const;
export type UnknownCause = (typeof UNKNOWN_CAUSES)[number];

const CAUSE_OF_EXPLANATION: Partial<Record<TranslationKey, UnknownCause>> = {
  "freshness.explanation.notObserved": "NOT_OBSERVED",
  "freshness.explanation.gitUnavailable": "GIT_UNAVAILABLE",
  "freshness.explanation.noLocalRoot": "NO_LOCAL_ROOT",
  "freshness.explanation.headUnknown": "HEAD_NOT_COMPARABLE",
  "freshness.explanation.reviewedNotComparable": "HEAD_NOT_COMPARABLE",
  "freshness.explanation.expectedNotComparable": "HEAD_NOT_COMPARABLE",
  "freshness.explanation.worktreeUnknown": "OBSERVATION_FAILED",
  "freshness.explanation.notARepository": "OBSERVATION_FAILED",
  "freshness.explanation.timeout": "OBSERVATION_FAILED",
  "freshness.explanation.error": "OBSERVATION_FAILED",
  "freshness.explanation.errorWithReason": "OBSERVATION_FAILED",
  "git.observation.malformed": "OBSERVATION_FAILED",
  "freshness.explanation.nothingRecorded": "NOTHING_RECORDED",
};

export function unknownCause(result: FreshnessResult): UnknownCause | null {
  if (result.status !== "UNKNOWN") return null;
  // An explanation this table does not know is still unknown — it is never read as a decided status.
  return CAUSE_OF_EXPLANATION[result.explanation.key] ?? "OBSERVATION_FAILED";
}
