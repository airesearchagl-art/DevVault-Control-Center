import type { RoundEvidenceDecision, ReviewSession, RoundRecord } from "./review";
import { responseFileName, type ResponseKind } from "./review";
import type { InvalidationReason } from "./revalidation";
import type { RiskTier } from "./riskTier";
import type { Verdict } from "./states";

/**
 * What must survive the boundary between one round and the next.
 *
 * The canonical contract does not name a "handoff" object; it names the parts that must not be lost
 * (`02_Prompts/AI_Review/AI_Review_Request_Prompt.md` line 116's answer skeleton, which ends in
 * 次にLLM IDE / Coding Agentへ渡すべき指示, and
 * `02_Prompts/GPTS_Review_Agent/DevVault_Review_Depth_Tiering.md` line 67, which says a changed head
 * starts the review again and forbids carrying an old head's conclusion over unverified).
 *
 * So these two functions collect what is already recorded. They decide nothing, classify nothing and
 * invent nothing: every field is read from the session, and a fact that was never recorded comes
 * back as `null` rather than as a guess.
 */

/** The response a verdict was made against: the Final Judgment when there is one, else the Fresh Assessment. */
export function latestResponse(round: RoundRecord): { kind: ResponseKind; file: string; capturedAt: string } | null {
  if (round.judgmentCapturedAt !== null) {
    return { kind: "judgment", file: responseFileName("judgment", round.round), capturedAt: round.judgmentCapturedAt };
  }
  if (round.resultCapturedAt !== null) {
    return { kind: "result", file: responseFileName("result", round.round), capturedAt: round.resultCapturedAt };
  }
  return null;
}

export interface RequiredFixHandoff {
  /** The round the fixes come from. */
  fromRound: number;
  /** The head the reviewer said it reviewed, as the Human recorded it. */
  reviewedHead: string | null;
  /** The response the verdict was confirmed against, by file name. */
  resultArtifact: string | null;
  responseCapturedAt: string | null;
  verdict: Verdict;
  /** The Human's own words about the verdict, verbatim. */
  verdictNote: string | null;
  /** What the Human says happens next; empty when nothing was written. */
  nextAction: string;
  riskTier: RiskTier | null;
}

/**
 * The handoff a round produces when the Human confirmed a verdict that asks for work: `FIX_REQUIRED`
 * or `BLOCKED`. A round whose verdict passed, or which has no confirmed verdict, produces none.
 */
export function buildRequiredFixHandoff(session: ReviewSession, round: RoundRecord): RequiredFixHandoff | null {
  if (round.verdict === null || round.verdictConfirmedAt === null) return null;
  if (round.verdict === "REVIEW_PASS") return null;
  const response = latestResponse(round);
  return {
    fromRound: round.round,
    reviewedHead: round.reviewedHead,
    resultArtifact: response?.file ?? null,
    responseCapturedAt: response?.capturedAt ?? null,
    verdict: round.verdict,
    verdictNote: round.verdictNote,
    nextAction: session.nextAction,
    riskTier: round.riskTier,
  };
}

export interface ReReviewHandoff {
  previousRound: number;
  previousReviewedHead: string | null;
  previousVerdict: Verdict | null;
  /** The response of the previous round, by file name; never rewritten by the new round. */
  previousResultArtifact: string | null;
  currentRound: number;
  currentExpectedHead: string | null;
  /** What was decided about each piece of evidence offered for this round. */
  reusedEvidence: RoundEvidenceDecision[];
  /** Why this round is reviewing a head that already had one, when that is what happened. */
  revalidationReason: InvalidationReason | null;
  revalidationExplanation: string | null;
}

/**
 * The relation the current round has to the one before it. Returns `null` for a first round, which
 * has nothing to carry over.
 */
export function buildReReviewHandoff(session: ReviewSession): ReReviewHandoff | null {
  if (session.rounds.length < 2) return null;
  const current = session.rounds[session.rounds.length - 1];
  const previous = session.rounds[session.rounds.length - 2];
  const response = latestResponse(previous);
  return {
    previousRound: previous.round,
    previousReviewedHead: previous.reviewedHead,
    previousVerdict: previous.verdict,
    previousResultArtifact: response?.file ?? null,
    currentRound: current.round,
    currentExpectedHead: current.expectedHead,
    reusedEvidence: [...current.evidenceDecisions],
    revalidationReason: current.revalidation?.reason ?? null,
    revalidationExplanation: current.revalidation?.explanation ?? null,
  };
}
