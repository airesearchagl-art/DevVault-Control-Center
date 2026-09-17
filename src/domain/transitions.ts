import type { ReviewEvent, ReviewEventType, StateChange } from "./events";
import { currentRound, type ReviewMetadata, type ReviewSession, type RoundRecord } from "./review";
import { err, ok, type Result } from "./result";
import { isResumableState, type ResourceState, type ReviewState } from "./states";
import { isValidHead } from "./validation";
import { TEXT_MAX } from "./project";

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
  | { type: "captureResult"; reviewedHead: string | null }
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
export function guardAction(session: ReviewSession, type: ReviewActionType): string | null {
  if (!ALLOWED_FROM[type].includes(session.reviewState)) {
    return `"${type}" is not allowed while the review is ${session.reviewState}`;
  }
  if (type === "resume" && session.reviewState !== "SUSPENDED" && session.resourceState === "HOT") {
    return "The review is already active (not suspended and HOT)";
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
    },
  };
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
      if (action.expectedHead !== null && !isValidHead(action.expectedHead)) return err("Expected HEAD is not a valid SHA");
      const round = session.reviewRound + 1;
      const next: RoundRecord = {
        round,
        expectedHead: action.expectedHead,
        reviewedHead: null,
        requestSavedAt: null,
        resultCapturedAt: null,
        verdict: null,
        verdictConfirmedAt: null,
        verdictNote: null,
      };
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
      if (action.reviewedHead !== null && !isValidHead(action.reviewedHead)) return err("Reviewed HEAD is not a valid SHA");
      return ok(
        build(
          session,
          {
            ...session,
            rounds: withCurrentRound(session, { resultCapturedAt: now, reviewedHead: action.reviewedHead }),
          },
          "result_captured",
          now,
          `result-r${session.reviewRound}.md`,
        ),
      );
    }

    case "confirmVerdict": {
      if (action.confirmedByHuman !== true) return err("A verdict requires explicit Human confirmation");
      if (action.verdict !== "FIX_REQUIRED" && action.verdict !== "REVIEW_PASS") return err("Unknown verdict");
      if (currentRound(session).resultCapturedAt === null) {
        return err(`Capture the review result for round R${session.reviewRound} before confirming a verdict`);
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
      if (action.confirmedByHuman !== true) return err("Blocking requires explicit Human confirmation");
      const reason = action.reason.trim();
      if (reason === "") return err("A reason is required to block the review");
      if (reason.length > TEXT_MAX) return err("Reason is too long");
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
        return err("Suspend requires WARM or COLD");
      }
      if (action.checkpoint.trim() === "") return err("A checkpoint note is required to suspend");
      if (!isResumableState(session.reviewState)) return err(`Cannot suspend from ${session.reviewState}`);
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
      if (restored === null) return err("Suspended review has no recorded previous state");
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
      if (action.confirmedByHuman !== true) return err("Closing requires explicit Human confirmation");
      return ok(build(session, { ...session, reviewState: "CLOSED", suspendedFrom: null }, "closed", now));
    }

    case "setResource":
      if (action.resourceState === session.resourceState) return err(`Resource is already ${session.resourceState}`);
      return ok(build(session, { ...session, resourceState: action.resourceState }, "resource_changed", now));

    case "setNextAction": {
      const nextAction = action.nextAction.trim();
      if (nextAction.length > TEXT_MAX) return err("Next action is too long");
      if (nextAction === session.nextAction) return err("Next action is unchanged");
      return ok(build(session, { ...session, nextAction }, "next_action_updated", now));
    }

    case "updateMetadata": {
      const { expectedHead, ...rest } = action.metadata;
      if (expectedHead !== null && !isValidHead(expectedHead)) return err("Expected HEAD is not a valid SHA");
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
