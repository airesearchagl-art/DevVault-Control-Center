import type { ReviewEvent } from "./events";
import { err, ok, type FieldErrors, type Result } from "./result";
import { isResourceState, type ResourceState, type ResumableState, type ReviewState, type Verdict } from "./states";
import { normalizeChatgptThreadUrl, normalizeHead, parsePrNumber } from "./validation";
import { LABEL_MAX, TEXT_MAX } from "./project";

export const SCHEMA_VERSION = 1;

/** One review round. HEADs are Human-recorded claims, not observed Git facts. */
export interface RoundRecord {
  round: number;
  expectedHead: string | null;
  reviewedHead: string | null;
  requestSavedAt: string | null;
  /** Capture time of the canonical latest result `result-r<N>.md`. */
  resultCapturedAt: string | null;
  verdict: Verdict | null;
  verdictConfirmedAt: string | null;
  verdictNote: string | null;
  /**
   * Earlier results of this round kept when a result was replaced (F-6), oldest first:
   * `result-r<N>-previous-<capture time in ms>.md`. `result-r<N>.md` is always the latest.
   */
  archivedResults: string[];
}

const ARCHIVED_RESULT_PATTERN = /^result-r([1-9]\d*)-previous-(\d{1,20})\.md$/;

/** Deterministic archive name for the result captured at `capturedAt` in `round`. */
export function archivedResultFileName(round: number, capturedAt: string): string {
  return `result-r${round}-previous-${Date.parse(capturedAt)}.md`;
}

export function isArchivedResultFileName(name: unknown, round: number): name is string {
  if (typeof name !== "string") return false;
  const match = ARCHIVED_RESULT_PATTERN.exec(name);
  return match !== null && Number(match[1]) === round;
}

export interface ReviewSession {
  schemaVersion: typeof SCHEMA_VERSION;
  reviewSessionId: string;
  projectId: string;
  prNumber: number | null;
  reviewType: string;
  /** Current round number; always equals the last entry of `rounds`. */
  reviewRound: number;
  resourceState: ResourceState;
  reviewState: ReviewState;
  /** Set only while `reviewState === "SUSPENDED"` (Task Packet D2). */
  suspendedFrom: ResumableState | null;
  chatgptThreadTitle: string | null;
  chatgptThreadUrl: string | null;
  nextAction: string;
  rounds: RoundRecord[];
  createdAt: string;
  updatedAt: string;
}

export const REVIEW_TYPE_SUGGESTIONS = ["PR review", "Re-review", "Design review", "Plan review"];

export interface ReviewMetadataInput {
  reviewType: string;
  prNumber: string;
  expectedHead: string;
  chatgptThreadTitle: string;
  chatgptThreadUrl: string;
}

export interface ReviewFormInput extends ReviewMetadataInput {
  projectId: string;
  nextAction: string;
  resourceState: ResourceState;
}

export interface ReviewMetadata {
  reviewType: string;
  prNumber: number | null;
  /** Expected HEAD of the current round. */
  expectedHead: string | null;
  chatgptThreadTitle: string | null;
  chatgptThreadUrl: string | null;
}

export function emptyReviewForm(projectId = ""): ReviewFormInput {
  return {
    projectId,
    reviewType: REVIEW_TYPE_SUGGESTIONS[0],
    prNumber: "",
    expectedHead: "",
    chatgptThreadTitle: "",
    chatgptThreadUrl: "",
    nextAction: "",
    resourceState: "HOT",
  };
}

export function currentRound(session: ReviewSession): RoundRecord {
  return session.rounds[session.rounds.length - 1];
}

/** Latest round that has a captured result, if any. */
export function latestCapturedRound(session: ReviewSession): RoundRecord | null {
  for (let i = session.rounds.length - 1; i >= 0; i -= 1) {
    if (session.rounds[i].resultCapturedAt !== null) return session.rounds[i];
  }
  return null;
}

export function reviewToMetadataForm(session: ReviewSession): ReviewMetadataInput {
  return {
    reviewType: session.reviewType,
    prNumber: session.prNumber === null ? "" : String(session.prNumber),
    expectedHead: currentRound(session).expectedHead ?? "",
    chatgptThreadTitle: session.chatgptThreadTitle ?? "",
    chatgptThreadUrl: session.chatgptThreadUrl ?? "",
  };
}

export function validateReviewMetadata(input: ReviewMetadataInput): Result<ReviewMetadata, FieldErrors> {
  const errors: FieldErrors = {};
  const reviewType = input.reviewType.trim();
  if (reviewType === "") errors.reviewType = "Review type is required";
  else if (reviewType.length > LABEL_MAX) errors.reviewType = `Review type must be at most ${LABEL_MAX} characters`;

  let prNumber: number | null = null;
  if (input.prNumber.trim() !== "") {
    const result = parsePrNumber(input.prNumber);
    if (result.ok) prNumber = result.value;
    else errors.prNumber = result.error;
  }

  let expectedHead: string | null = null;
  if (input.expectedHead.trim() !== "") {
    const result = normalizeHead(input.expectedHead);
    if (result.ok) expectedHead = result.value;
    else errors.expectedHead = result.error;
  }

  const title = input.chatgptThreadTitle.trim();
  if (title.length > 200) errors.chatgptThreadTitle = "Thread title must be at most 200 characters";

  let chatgptThreadUrl: string | null = null;
  if (input.chatgptThreadUrl.trim() !== "") {
    const result = normalizeChatgptThreadUrl(input.chatgptThreadUrl);
    if (result.ok) chatgptThreadUrl = result.value;
    else errors.chatgptThreadUrl = result.error;
  }

  if (Object.keys(errors).length > 0) return err(errors);
  return ok({ reviewType, prNumber, expectedHead, chatgptThreadTitle: title === "" ? null : title, chatgptThreadUrl });
}

export function createReviewSession(
  input: ReviewFormInput,
  projectIds: ReadonlySet<string>,
  reviewSessionId: string,
  now: string,
): Result<{ session: ReviewSession; event: ReviewEvent }, FieldErrors> {
  const metadata = validateReviewMetadata(input);
  const errors: FieldErrors = metadata.ok ? {} : { ...metadata.error };
  if (!projectIds.has(input.projectId)) errors.projectId = "Select a registered project";
  if (!isResourceState(input.resourceState)) errors.resourceState = "Select a resource state";
  if (input.nextAction.length > TEXT_MAX) errors.nextAction = "Next action is too long";
  if (!metadata.ok || Object.keys(errors).length > 0) return err(errors);

  const { expectedHead, ...rest } = metadata.value;
  const session: ReviewSession = {
    schemaVersion: SCHEMA_VERSION,
    reviewSessionId,
    projectId: input.projectId,
    ...rest,
    reviewRound: 1,
    resourceState: input.resourceState,
    reviewState: "NEW",
    suspendedFrom: null,
    nextAction: input.nextAction.trim(),
    rounds: [
      {
        round: 1,
        expectedHead,
        reviewedHead: null,
        requestSavedAt: null,
        resultCapturedAt: null,
        verdict: null,
        verdictConfirmedAt: null,
        verdictNote: null,
        archivedResults: [],
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  const event: ReviewEvent = {
    v: 1,
    ts: now,
    type: "review_created",
    reviewSessionId,
    round: 1,
    reviewState: { from: null, to: "NEW" },
    resourceState: { from: null, to: input.resourceState },
    note: null,
  };
  return ok({ session, event });
}
