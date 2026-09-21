import type { ReviewEvent } from "./events";
import type { RiskTier } from "./riskTier";
import type { InvalidationReason } from "./revalidation";
import type { EvidenceReason, EvidenceSource, EvidenceStatus } from "./evidenceReuse";

/** Why a second substantive review of an already-reviewed head was allowed (Phase 3). */
export interface RoundRevalidation {
  reason: InvalidationReason;
  priorReviews: { reviewId: string; round: number }[];
  /** The Human's own words. Stored verbatim, never translated and never parsed. */
  explanation: string | null;
}

/** What was decided about one piece of evidence offered for reuse (Phase 3). */
export interface RoundEvidenceDecision {
  id: string;
  source: EvidenceSource;
  boundHead: string | null;
  capturedAt: string | null;
  status: EvidenceStatus;
  reason: EvidenceReason;
}

import { message } from "./message";
import { err, ok, type FieldErrors, type Result } from "./result";
import { isResourceState, type ResourceState, type ResumableState, type ReviewState, type Verdict } from "./states";
import { normalizeChatgptThreadUrl, normalizeHead, parsePrNumber } from "./validation";
import { LABEL_MAX, TEXT_MAX } from "./project";

/** The ChatGPT thread title is a label the Human types; longer than this is a mistake. */
export const THREAD_TITLE_MAX = 200;

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
  /**
   * Phase 3. All of these are absent in files written before it and read as null / empty, so a
   * round from Phase 1 or 2 means exactly what it meant: no Turn 2 happened.
   */
  /** When the Turn 2 request (`followup-r<N>.md`) was written. */
  followupSavedAt: string | null;
  /** Capture time of the canonical Final Judgment `judgment-r<N>.md`. */
  judgmentCapturedAt: string | null;
  /** The Risk Tier the Human confirmed for this round. */
  riskTier: RiskTier | null;
  /** Why a second substantive review of an already-reviewed head was allowed, if it was. */
  revalidation: RoundRevalidation | null;
  /** What was decided about each piece of evidence offered for reuse in this round. */
  evidenceDecisions: RoundEvidenceDecision[];
  verdictNote: string | null;
  /** Earlier Final Judgments of this round kept when one was replaced, oldest first. */
  archivedJudgments: string[];
  /**
   * Earlier results of this round kept when a result was replaced (F-6), oldest first:
   * `result-r<N>-previous-<capture time in ms>.md`, or `...-<ms>-<n>.md` when that name was
   * already taken (E-2). `result-r<N>.md` is always the latest.
   */
  archivedResults: string[];
}

/**
 * The two reviewer responses a round can hold, named after the canonical protocol messages:
 * `result` is the Fresh Assessment (the answer to Turn 1) and `judgment` is the Final Judgment
 * (the answer to Turn 2). They share one file shape, so they share one set of helpers.
 */
export const RESPONSE_KINDS = ["result", "judgment"] as const;
export type ResponseKind = (typeof RESPONSE_KINDS)[number];

const ARCHIVED_RESPONSE_PATTERN: Record<ResponseKind, RegExp> = {
  result: /^result-r([1-9]\d*)-previous-(\d{1,20})(?:-([1-9]\d{0,2}))?\.md$/,
  judgment: /^judgment-r([1-9]\d*)-previous-(\d{1,20})(?:-([1-9]\d{0,2}))?\.md$/,
};

/** Candidate archive names per replaced result: the base name, then `-1` .. `-999`. */
export const ARCHIVE_CANDIDATES = 1000;

/**
 * Archive name for the response captured at `capturedAt` in `round`. `attempt` 0 is the base name;
 * later attempts add a numeric suffix so an interrupted capture never blocks a retry (E-2).
 */
export function archivedResponseFileName(kind: ResponseKind, round: number, capturedAt: string, attempt = 0): string {
  const suffix = attempt === 0 ? "" : `-${attempt}`;
  return `${kind}-r${round}-previous-${Date.parse(capturedAt)}${suffix}.md`;
}

export function isArchivedResponseFileName(kind: ResponseKind, name: unknown, round: number): name is string {
  if (typeof name !== "string") return false;
  const match = ARCHIVED_RESPONSE_PATTERN[kind].exec(name);
  return match !== null && Number(match[1]) === round;
}

/** True when `name` is one of the candidate archive names for the response captured at `capturedAt`. */
export function isArchiveCandidateFor(kind: ResponseKind, name: string, round: number, capturedAt: string): boolean {
  const match = ARCHIVED_RESPONSE_PATTERN[kind].exec(name);
  return match !== null && Number(match[1]) === round && match[2] === String(Date.parse(capturedAt));
}

/** The canonical file name of a round's response. */
export function responseFileName(kind: ResponseKind, round: number): string {
  return `${kind}-r${round}.md`;
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

/**
 * The neutral fallback for the review type of a brand-new form. The list the Human actually sees is
 * localized chrome (`REVIEW_TYPE_SUGGESTION_KEYS` in `src/i18n`); whatever is chosen or typed is
 * Human content from that moment on and is stored verbatim, never translated again.
 */
export const DEFAULT_REVIEW_TYPE = "PR review";

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

/** A round as it starts: nothing handed over, nothing captured, nothing decided. */
export function newRound(round: number, expectedHead: string | null): RoundRecord {
  return {
    round,
    expectedHead,
    reviewedHead: null,
    requestSavedAt: null,
    resultCapturedAt: null,
    verdict: null,
    verdictConfirmedAt: null,
    verdictNote: null,
    followupSavedAt: null,
    judgmentCapturedAt: null,
    riskTier: null,
    revalidation: null,
    evidenceDecisions: [],
    archivedJudgments: [],
    archivedResults: [],
  };
}

export function emptyReviewForm(projectId = "", reviewType: string = DEFAULT_REVIEW_TYPE): ReviewFormInput {
  return {
    projectId,
    reviewType,
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
  if (reviewType === "") errors.reviewType = message("validation.reviewType.required");
  else if (reviewType.length > LABEL_MAX) errors.reviewType = message("validation.reviewType.tooLong", { max: LABEL_MAX });

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
  if (title.length > THREAD_TITLE_MAX) errors.chatgptThreadTitle = message("validation.threadTitle.tooLong", { max: THREAD_TITLE_MAX });

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
  if (!projectIds.has(input.projectId)) errors.projectId = message("validation.project.required");
  if (!isResourceState(input.resourceState)) errors.resourceState = message("validation.resourceState.required");
  if (input.nextAction.length > TEXT_MAX) errors.nextAction = message("validation.nextAction.tooLong");
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
    rounds: [newRound(1, expectedHead)],
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
    detail: null,
  };
  return ok({ session, event });
}
