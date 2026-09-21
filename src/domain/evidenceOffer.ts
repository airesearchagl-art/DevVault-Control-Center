import type { EvidenceItem } from "./evidenceReuse";
import type { GitObservation } from "./git";
import { latestResponse } from "./handoff";
import type { ReviewSession, RoundRecord } from "./review";

/**
 * The evidence DVCC actually holds, offered to the Human for a decision (RW-08, RW-09).
 *
 * Only facts that already exist are offered, each with the head it was established against and when
 * it was captured. Nothing is invented and nothing is assumed reusable here: `assessEvidenceItem`
 * decides that, against the head the next review is about.
 *
 * Deliberately not offered: derived Freshness, which is a conclusion drawn from evidence rather
 * than evidence bound to a head (RW-017), and evidence from outside DVCC, which it cannot vouch for.
 */

function reviewResultItem(round: RoundRecord): EvidenceItem | null {
  const response = latestResponse(round);
  if (response === null) return null;
  return {
    id: `round-${round.round}-${response.kind}`,
    source: "INDEPENDENT_REVIEW_RESULT",
    boundHead: round.reviewedHead,
    boundBase: null,
    capturedAt: response.capturedAt,
    // A review's conclusions are about the files it read and the contract it read them against.
    blobBound: true,
    contractBound: true,
    environmentBound: false,
  };
}

function recordedHeadItem(round: RoundRecord): EvidenceItem | null {
  if (round.reviewedHead === null || round.resultCapturedAt === null) return null;
  return {
    id: `round-${round.round}-reviewed-head`,
    source: "HUMAN_RECORDED_HEAD",
    boundHead: round.reviewedHead,
    boundBase: null,
    capturedAt: round.resultCapturedAt,
    // The Human's record of which commit was reviewed depends on nothing else.
    blobBound: false,
    contractBound: false,
    environmentBound: false,
  };
}

function gitObservationItem(observation: GitObservation | undefined): EvidenceItem | null {
  if (observation === undefined || observation.status !== "OK") return null;
  return {
    id: "git-observation",
    source: "GIT_OBSERVATION",
    boundHead: observation.head,
    boundBase: null,
    capturedAt: observation.observedAt,
    blobBound: false,
    contractBound: false,
    // What `git` reported is a fact about the machine it ran on.
    environmentBound: true,
  };
}

/**
 * The candidates for the round now being prepared: what the earlier rounds of this review
 * established, and the last Git observation. The current round's own response is not offered to
 * itself.
 */
export function offeredEvidence(session: ReviewSession, observation: GitObservation | undefined): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  for (const round of session.rounds) {
    if (round.round === session.reviewRound) continue;
    const result = reviewResultItem(round);
    if (result !== null) items.push(result);
    const head = recordedHeadItem(round);
    if (head !== null) items.push(head);
  }
  const git = gitObservationItem(observation);
  if (git !== null) items.push(git);
  return items;
}
