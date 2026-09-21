import type { ReviewEvent, ReviewEventDetail, ReviewEventType, StateChange } from "./events";
import {
  currentRound,
  isArchiveCandidateFor,
  isArchivedResponseFileName,
  newRound,
  type ResponseKind,
  type RoundEvidenceDecision,
  type ReviewMetadata,
  type ReviewSession,
  type RoundRecord,
} from "./review";
import { canCaptureJudgment, canSendTurn2, progressOfRound } from "./freshContext";
import { message, type Message } from "./message";
import { SAME_HEAD_INVALIDATION_REASONS, type InvalidationReason } from "./revalidation";
import { validateTierChoice, type RiskTier, type Tier2Subject } from "./riskTier";
import { err, invalid, ok, type Result } from "./result";
import { isResumableState, type ResourceState, type ReviewState } from "./states";
import { isValidHead } from "./validation";
import { TEXT_MAX } from "./project";
import { MAX_REVIEW_ROUNDS } from "./limits";

/**
 * Review State transition contract (AC-05). Pure functions only.
 *
 * Verdict-bearing actions (`confirmVerdict`, `block`, `close`) require the literal
 * `confirmedByHuman: true` so that no code path can settle a verdict implicitly (AC-14).
 */
export type ReviewAction =
  | { type: "markReady" }
  | { type: "startNextRound"; expectedHead: string | null }
  | { type: "startReview" }
  | { type: "cancelReview" }
  | { type: "recordRequestSaved" }
  | {
      type: "captureResult";
      reviewedHead: string | null;
      /** Required (literal true) when the round already has a saved result that will be replaced (F-6). */
      replaceConfirmedByHuman?: true;
      /**
       * Archive files to record, oldest first: archives left unrecorded by an interrupted capture,
       * then the one holding the replaced result (E-2). For a recorded result every name must be a
       * candidate name of that result's capture time.
       */
      archivedResultFiles?: readonly string[];
    }
  /** Turn 2 (`followup-r<N>.md`) was written for this round (Phase 3). */
  | { type: "recordFollowupSaved" }
  | {
      type: "captureJudgment";
      /** Required (literal true) when the round already has a Final Judgment that will be replaced. */
      replaceConfirmedByHuman?: true;
      /** Archive files to record, oldest first, under the same rules as `archivedResultFiles`. */
      archivedJudgmentFiles?: readonly string[];
    }
  /** The Risk Tier the Human confirmed, with the Tier 2 subjects they declared (Phase 3). */
  | { type: "setRiskTier"; riskTier: RiskTier; subjects: readonly Tier2Subject[]; confirmedByHuman: true }
  /** Why a second substantive review of an already-reviewed head is going ahead (Phase 3). */
  | {
      type: "recordRevalidation";
      reason: InvalidationReason;
      priorReviews: readonly { reviewId: string; round: number }[];
      explanation: string | null;
    }
  /** What the Human decided about each piece of evidence offered for this round (Phase 3). */
  | { type: "recordEvidenceDecisions"; decisions: readonly RoundEvidenceDecision[] }
  | { type: "confirmVerdict"; verdict: "FIX_REQUIRED" | "REVIEW_PASS"; note: string | null; confirmedByHuman: true }
  | { type: "block"; reason: string; confirmedByHuman: true }
  | { type: "suspend"; resourceState: "WARM" | "COLD"; checkpoint: string }
  | { type: "resume" }
  | { type: "close"; confirmedByHuman: true }
  | { type: "setResource"; resourceState: ResourceState }
  | { type: "setNextAction"; nextAction: string }
  | { type: "updateMetadata"; metadata: ReviewMetadata };

export type ReviewActionType = ReviewAction["type"];

const ANY_STATE: readonly ReviewState[] = [
  "NEW",
  "READY_FOR_REVIEW",
  "REVIEWING",
  "FIX_REQUIRED",
  "REVIEW_PASS",
  "BLOCKED",
  "SUSPENDED",
  "CLOSED",
];

/** Review states from which each action is allowed. */
export const ALLOWED_FROM: Record<ReviewActionType, readonly ReviewState[]> = {
  markReady: ["NEW", "BLOCKED"],
  startNextRound: ["FIX_REQUIRED", "REVIEW_PASS"],
  startReview: ["READY_FOR_REVIEW"],
  cancelReview: ["REVIEWING"],
  recordRequestSaved: ["NEW", "READY_FOR_REVIEW", "REVIEWING", "FIX_REQUIRED", "REVIEW_PASS", "BLOCKED"],
  captureResult: ["REVIEWING", "FIX_REQUIRED", "REVIEW_PASS", "BLOCKED"],
  // Turn 2 and its Final Judgment belong to a round the Human has not decided yet.
  recordFollowupSaved: ["REVIEWING"],
  captureJudgment: ["REVIEWING"],
  setRiskTier: ["NEW", "READY_FOR_REVIEW", "REVIEWING", "BLOCKED"],
  recordRevalidation: ["NEW", "READY_FOR_REVIEW", "REVIEWING", "BLOCKED"],
  recordEvidenceDecisions: ["NEW", "READY_FOR_REVIEW", "REVIEWING", "BLOCKED"],
  confirmVerdict: ["REVIEWING"],
  block: ["NEW", "READY_FOR_REVIEW", "REVIEWING", "FIX_REQUIRED"],
  suspend: ["NEW", "READY_FOR_REVIEW", "REVIEWING", "FIX_REQUIRED", "REVIEW_PASS", "BLOCKED"],
  resume: ["NEW", "READY_FOR_REVIEW", "REVIEWING", "FIX_REQUIRED", "REVIEW_PASS", "BLOCKED", "SUSPENDED"],
  close: ["NEW", "READY_FOR_REVIEW", "REVIEWING", "FIX_REQUIRED", "REVIEW_PASS", "BLOCKED", "SUSPENDED"],
  setResource: ANY_STATE,
  setNextAction: ANY_STATE,
  updateMetadata: ANY_STATE,
};

/** State-level guard. Returns `null` when the action type is currently allowed. */
export function guardAction(session: ReviewSession, type: ReviewActionType): Message | null {
  if (!ALLOWED_FROM[type].includes(session.reviewState)) {
    // The action type is an identifier, not a word, so it is shown as it is.
    return message("action.notAllowed", { action: type, state: session.reviewState });
  }
  if (type === "resume" && session.reviewState !== "SUSPENDED" && session.resourceState === "HOT") {
    return message("action.alreadyActive");
  }
  if (type === "startNextRound" && session.reviewRound >= MAX_REVIEW_ROUNDS) {
    return message("action.roundLimit", { max: MAX_REVIEW_ROUNDS });
  }
  return null;
}

export function canApply(session: ReviewSession, type: ReviewActionType): boolean {
  return guardAction(session, type) === null;
}

interface Outcome {
  session: ReviewSession;
  event: ReviewEvent;
}

function withCurrentRound(session: ReviewSession, patch: Partial<RoundRecord>): RoundRecord[] {
  const rounds = session.rounds.slice();
  rounds[rounds.length - 1] = { ...rounds[rounds.length - 1], ...patch };
  return rounds;
}

function build(
  before: ReviewSession,
  after: Omit<ReviewSession, "updatedAt">,
  type: ReviewEventType,
  now: string,
  note: string | null = null,
  detail: ReviewEventDetail | null = null,
): Outcome {
  const session: ReviewSession = { ...after, updatedAt: now };
  const reviewState: StateChange<ReviewState> | null =
    before.reviewState !== session.reviewState ? { from: before.reviewState, to: session.reviewState } : null;
  const resourceState: StateChange<ResourceState> | null =
    before.resourceState !== session.resourceState ? { from: before.resourceState, to: session.resourceState } : null;
  return {
    session,
    event: {
      v: 1,
      ts: now,
      type,
      reviewSessionId: session.reviewSessionId,
      round: session.reviewRound,
      reviewState,
      resourceState,
      note,
      detail,
    },
  };
}

/**
 * Archive names for a replaced reviewer response, checked before anything is written (F-6, E-2).
 * Both responses follow the same rules, so both captures ask this one function.
 */
function archiveRefusal(
  kind: ResponseKind,
  archived: readonly string[],
  round: number,
  capturedAt: string | null,
  recorded: readonly string[],
): Message | null {
  for (const [index, name] of archived.entries()) {
    if (!isArchivedResponseFileName(kind, name, round)) return message("action.archive.roundMismatch");
    // A recorded response is archived under its own capture time; an orphan file (written but never
    // recorded, e.g. after a crash) may use any valid archive name.
    if (capturedAt !== null && !isArchiveCandidateFor(kind, name, round, capturedAt)) {
      return message(kind === "result" ? "action.archive.resultMismatch" : "action.archive.judgmentMismatch");
    }
    if (recorded.includes(name) || archived.indexOf(name) !== index) return message("action.archive.duplicate");
  }
  return null;
}

function trimmedOrNull(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function applyReviewAction(session: ReviewSession, action: ReviewAction, now: string): Result<Outcome> {
  const guard = guardAction(session, action.type);
  if (guard !== null) return err(guard);

  switch (action.type) {
    case "markReady":
      return ok(build(session, { ...session, reviewState: "READY_FOR_REVIEW" }, "review_ready", now));

    case "startNextRound": {
      if (action.expectedHead !== null && !isValidHead(action.expectedHead)) return invalid("action.expectedHead.invalid");
      const round = session.reviewRound + 1;
      const next: RoundRecord = newRound(round, action.expectedHead);
      return ok(
        build(
          session,
          { ...session, reviewRound: round, rounds: [...session.rounds, next], reviewState: "READY_FOR_REVIEW" },
          "review_ready",
          now,
          `Round R${round} started`,
        ),
      );
    }

    case "startReview":
      return ok(build(session, { ...session, reviewState: "REVIEWING" }, "review_started", now));

    case "cancelReview":
      return ok(build(session, { ...session, reviewState: "READY_FOR_REVIEW" }, "review_cancelled", now));

    case "recordRequestSaved":
      return ok(
        build(
          session,
          { ...session, rounds: withCurrentRound(session, { requestSavedAt: now }) },
          "request_saved",
          now,
          `request-r${session.reviewRound}.md`,
        ),
      );

    case "captureResult": {
      if (action.reviewedHead !== null && !isValidHead(action.reviewedHead)) return invalid("action.reviewedHead.invalid");
      const round = currentRound(session);
      const archived = action.archivedResultFiles ?? [];
      if (round.resultCapturedAt !== null && action.replaceConfirmedByHuman !== true) {
        return invalid("action.capture.replaceConfirmationRequired", { round: round.round });
      }
      for (const [index, name] of archived.entries()) {
        if (!isArchivedResponseFileName("result", name, round.round)) return invalid("action.archive.roundMismatch");
        // A recorded result is archived under its own capture time; an orphan result file
        // (written but never recorded, e.g. after a crash) may use any valid archive name.
        if (round.resultCapturedAt !== null && !isArchiveCandidateFor("result", name, round.round, round.resultCapturedAt)) {
          return invalid("action.archive.resultMismatch");
        }
        if (round.archivedResults.includes(name) || archived.indexOf(name) !== index) {
          return invalid("action.archive.duplicate");
        }
      }
      const kept = archived.length === 0 ? "" : ` (previous result kept as ${archived.join(", ")})`;
      return ok(
        build(
          session,
          {
            ...session,
            rounds: withCurrentRound(session, {
              resultCapturedAt: now,
              reviewedHead: action.reviewedHead,
              archivedResults: [...round.archivedResults, ...archived],
            }),
          },
          "result_captured",
          now,
          `result-r${session.reviewRound}.md${kept}`,
        ),
      );
    }

    case "recordFollowupSaved": {
      const round = currentRound(session);
      // The same invariant the interface reads, asked of the same function.
      if (!canSendTurn2(progressOfRound(round))) {
        if (round.resultCapturedAt === null) return invalid("action.followup.assessmentRequired", { round: round.round });
        if (round.judgmentCapturedAt !== null) return invalid("action.followup.judgmentCaptured", { round: round.round });
        return invalid("action.followup.verdictConfirmed", { round: round.round });
      }
      return ok(
        build(
          session,
          { ...session, rounds: withCurrentRound(session, { followupSavedAt: now }) },
          "followup_saved",
          now,
          `followup-r${session.reviewRound}.md`,
        ),
      );
    }

    case "captureJudgment": {
      const round = currentRound(session);
      if (!canCaptureJudgment(progressOfRound(round))) {
        if (round.resultCapturedAt === null) return invalid("action.judgment.assessmentRequired", { round: round.round });
        if (round.followupSavedAt === null) return invalid("action.judgment.followupRequired", { round: round.round });
        return invalid("action.judgment.verdictConfirmed", { round: round.round });
      }
      if (round.judgmentCapturedAt !== null && action.replaceConfirmedByHuman !== true) {
        return invalid("action.judgment.replaceConfirmationRequired", { round: round.round });
      }
      const archived = action.archivedJudgmentFiles ?? [];
      const refusal = archiveRefusal("judgment", archived, round.round, round.judgmentCapturedAt, round.archivedJudgments);
      if (refusal !== null) return err(refusal);
      const kept = archived.length === 0 ? "" : ` (previous Final Judgment kept as ${archived.join(", ")})`;
      return ok(
        build(
          session,
          {
            ...session,
            rounds: withCurrentRound(session, {
              judgmentCapturedAt: now,
              archivedJudgments: [...round.archivedJudgments, ...archived],
            }),
          },
          "judgment_captured",
          now,
          `judgment-r${session.reviewRound}.md${kept}`,
        ),
      );
    }

    case "setRiskTier": {
      if (action.confirmedByHuman !== true) return invalid("action.riskTier.confirmationRequired");
      const round = currentRound(session);
      if (round.verdictConfirmedAt !== null) return invalid("action.riskTier.verdictConfirmed", { round: round.round });
      // The canonical rule decides; DVCC never quietly moves the Human's choice.
      const verdict = validateTierChoice({ chosen: action.riskTier, subjects: action.subjects });
      if (!verdict.ok) {
        return verdict.refusal === "NOT_A_TIER"
          ? invalid("action.riskTier.unknown")
          : invalid("action.riskTier.belowRequired", { required: verdict.required });
      }
      return ok(
        build(
          session,
          {
            ...session,
            rounds: withCurrentRound(session, { riskTier: action.riskTier, riskTierSubjects: [...action.subjects] }),
          },
          "risk_tier_set",
          now,
          action.riskTier,
          { kind: "risk_tier_set", riskTier: action.riskTier, subjects: [...action.subjects] },
        ),
      );
    }

    case "recordRevalidation": {
      const round = currentRound(session);
      if (round.verdictConfirmedAt !== null) return invalid("action.revalidation.verdictConfirmed", { round: round.round });
      if (round.revalidation !== null) return invalid("action.revalidation.alreadyRecorded", { round: round.round });
      if (!SAME_HEAD_INVALIDATION_REASONS.includes(action.reason)) return invalid("action.revalidation.reasonNotApplicable");
      if (action.priorReviews.length === 0) return invalid("action.revalidation.priorReviewRequired");
      const priorReviews = action.priorReviews.map((prior) => ({ ...prior }));
      return ok(
        build(
          session,
          {
            ...session,
            rounds: withCurrentRound(session, {
              revalidation: { reason: action.reason, priorReviews, explanation: trimmedOrNull(action.explanation) },
            }),
          },
          "duplicate_continued",
          now,
          trimmedOrNull(action.explanation),
          { kind: "duplicate_continued", invalidationReason: action.reason, priorReviews },
        ),
      );
    }

    case "recordEvidenceDecisions": {
      const round = currentRound(session);
      if (round.verdictConfirmedAt !== null) return invalid("action.evidence.verdictConfirmed", { round: round.round });
      const seen = new Set<string>();
      for (const decision of action.decisions) {
        if (seen.has(decision.id)) return invalid("action.evidence.duplicateItem", { id: decision.id });
        seen.add(decision.id);
      }
      const decisions = action.decisions.map((decision) => ({ ...decision }));
      return ok(
        build(
          session,
          { ...session, rounds: withCurrentRound(session, { evidenceDecisions: decisions }) },
          "evidence_reused",
          now,
          null,
          { kind: "evidence_reused", items: decisions },
        ),
      );
    }

    case "confirmVerdict": {
      if (action.confirmedByHuman !== true) return invalid("action.verdict.confirmationRequired");
      if (action.verdict !== "FIX_REQUIRED" && action.verdict !== "REVIEW_PASS") return invalid("action.verdict.unknown");
      const deciding = currentRound(session);
      if (deciding.resultCapturedAt === null) {
        return invalid("action.verdict.resultRequired", { round: session.reviewRound });
      }
      // The canonical protocol: with no Turn 2 the Fresh Assessment is the final review response,
      // but once Turn 2 has been sent the Final Judgment is what the Human decides against.
      if (deciding.followupSavedAt !== null && deciding.judgmentCapturedAt === null) {
        return invalid("action.verdict.judgmentRequired", { round: session.reviewRound });
      }
      const note = trimmedOrNull(action.note);
      return ok(
        build(
          session,
          {
            ...session,
            reviewState: action.verdict,
            rounds: withCurrentRound(session, { verdict: action.verdict, verdictConfirmedAt: now, verdictNote: note }),
          },
          "verdict_confirmed",
          now,
          note,
        ),
      );
    }

    case "block": {
      if (action.confirmedByHuman !== true) return invalid("action.block.confirmationRequired");
      const reason = action.reason.trim();
      if (reason === "") return invalid("action.block.reasonRequired");
      if (reason.length > TEXT_MAX) return invalid("action.block.reasonTooLong");
      const fromReviewing = session.reviewState === "REVIEWING";
      return ok(
        build(
          session,
          {
            ...session,
            reviewState: "BLOCKED",
            rounds: fromReviewing
              ? withCurrentRound(session, { verdict: "BLOCKED", verdictConfirmedAt: now, verdictNote: reason })
              : session.rounds,
          },
          fromReviewing ? "verdict_confirmed" : "blocked",
          now,
          reason,
        ),
      );
    }

    case "suspend": {
      if (action.resourceState !== "WARM" && action.resourceState !== "COLD") {
        return invalid("action.suspend.resourceState");
      }
      if (action.checkpoint.trim() === "") return invalid("action.suspend.checkpointRequired");
      if (!isResumableState(session.reviewState)) return invalid("action.suspend.notResumable", { state: session.reviewState });
      return ok(
        build(
          session,
          {
            ...session,
            reviewState: "SUSPENDED",
            suspendedFrom: session.reviewState,
            resourceState: action.resourceState,
          },
          "suspended",
          now,
        ),
      );
    }

    case "resume": {
      const restored = session.reviewState === "SUSPENDED" ? session.suspendedFrom : session.reviewState;
      if (restored === null) return invalid("action.resume.noPreviousState");
      return ok(
        build(
          session,
          { ...session, reviewState: restored, suspendedFrom: null, resourceState: "HOT" },
          "resumed",
          now,
        ),
      );
    }

    case "close": {
      if (action.confirmedByHuman !== true) return invalid("action.close.confirmationRequired");
      return ok(build(session, { ...session, reviewState: "CLOSED", suspendedFrom: null }, "closed", now));
    }

    case "setResource":
      if (action.resourceState === session.resourceState) return invalid("action.resource.unchanged", { state: session.resourceState });
      return ok(build(session, { ...session, resourceState: action.resourceState }, "resource_changed", now));

    case "setNextAction": {
      const nextAction = action.nextAction.trim();
      if (nextAction.length > TEXT_MAX) return invalid("validation.nextAction.tooLong");
      if (nextAction === session.nextAction) return invalid("action.nextAction.unchanged");
      return ok(build(session, { ...session, nextAction }, "next_action_updated", now));
    }

    case "updateMetadata": {
      const { expectedHead, ...rest } = action.metadata;
      if (expectedHead !== null && !isValidHead(expectedHead)) return invalid("action.expectedHead.invalid");
      return ok(
        build(
          session,
          { ...session, ...rest, rounds: withCurrentRound(session, { expectedHead }) },
          "metadata_updated",
          now,
        ),
      );
    }
  }
}
