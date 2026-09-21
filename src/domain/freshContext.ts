/**
 * The Fresh-Context review protocol, as the canonical contract defines it
 * (`02_Prompts/AI_Review/AI_Review_Request_Prompt.md` at obsidian-vault main `77ce41e`, the
 * section "Fresh-Context Review（anchoring制御）" and "入力項目").
 *
 * Two turns are the standard. Turn 1 carries the Artifact, the Contract and the Material Facts and
 * asks for an independent Fresh Assessment; the implementation narrative is physically absent from
 * it. Turn 2 is sent only after that assessment comes back, and only when a finding needs
 * resolving. A surface that cannot split the request sends the Turn 1 structure alone: the
 * canonical text calls that a soft anchoring mitigation and refuses to call it a fresh-context
 * review, so it is a mode of its own here rather than a third turn.
 *
 * Everything in this file is language-neutral: what the Human reads comes from `src/i18n`.
 */

export const FRESH_CONTEXT_MODES = ["TWO_TURN", "SINGLE_TURN"] as const;
export type FreshContextMode = (typeof FRESH_CONTEXT_MODES)[number];

export const FRESH_CONTEXT_TURNS = ["TURN_1", "TURN_2"] as const;
export type FreshContextTurn = (typeof FRESH_CONTEXT_TURNS)[number];

/** The four stages the canonical protocol names, in the order it names them. */
export const REQUEST_STAGES = ["STAGE_1", "STAGE_2", "STAGE_3", "STAGE_4"] as const;
export type RequestStage = (typeof REQUEST_STAGES)[number];

/** Turn 1 is Stage 1 + Stage 2; Turn 2 is Stage 3 + Stage 4. */
export const STAGES_OF_TURN: Record<FreshContextTurn, readonly RequestStage[]> = {
  TURN_1: ["STAGE_1", "STAGE_2"],
  TURN_2: ["STAGE_3", "STAGE_4"],
};

/**
 * The 16 input items of the canonical request, and the turn each one belongs to: items 1–6 and
 * 9–16 go in Turn 1, items 7 (背景・目的) and 8 (すでに決まっている方針・実装経緯) are the
 * implementation narrative and must not appear in the Turn 1 payload.
 */
export const INPUT_ITEM_COUNT = 16;
export const NARRATIVE_INPUT_ITEMS: readonly number[] = [7, 8];

export function turnOfInputItem(item: number): FreshContextTurn | null {
  if (!Number.isInteger(item) || item < 1 || item > INPUT_ITEM_COUNT) return null;
  return NARRATIVE_INPUT_ITEMS.includes(item) ? "TURN_2" : "TURN_1";
}

/** What has happened in this round so far. Nothing here is stored yet; Wave 2 decides that. */
export interface FreshContextProgress {
  /** Turn 1 has been written out and handed to the reviewer. */
  turn1SavedAt: string | null;
  /** The reviewer's Fresh Assessment has been captured. */
  assessmentCapturedAt: string | null;
  /** Turn 2 has been written out (optional: only when a finding needs resolving). */
  turn2SavedAt: string | null;
  /** The Human has confirmed the verdict for this round. */
  verdictConfirmedAt: string | null;
}

/**
 * Where the Human stands in the protocol. `AWAITING_ASSESSMENT` is the point the canonical text
 * cares about most: Turn 2 exists only after the assessment has come back.
 */
export const FRESH_CONTEXT_STATES = [
  "TURN_1_NOT_SENT",
  "AWAITING_ASSESSMENT",
  "ASSESSMENT_RECEIVED",
  "TURN_2_SENT",
  "JUDGMENT_CONFIRMED",
] as const;
export type FreshContextState = (typeof FRESH_CONTEXT_STATES)[number];

export function freshContextState(progress: FreshContextProgress): FreshContextState {
  if (progress.verdictConfirmedAt !== null) return "JUDGMENT_CONFIRMED";
  if (progress.turn2SavedAt !== null) return "TURN_2_SENT";
  if (progress.assessmentCapturedAt !== null) return "ASSESSMENT_RECEIVED";
  if (progress.turn1SavedAt !== null) return "AWAITING_ASSESSMENT";
  return "TURN_1_NOT_SENT";
}

/**
 * Whether Turn 2 may be written now. The canonical rule is that it is sent only after the Fresh
 * Assessment has been returned, and only when something needs resolving — the second half is the
 * Human's call, so this answers the first half only.
 */
export function canSendTurn2(progress: FreshContextProgress): boolean {
  return progress.assessmentCapturedAt !== null && progress.verdictConfirmedAt === null;
}

/** The single-turn fallback is never the two-turn protocol, whatever it contains. */
export function isFreshContextReview(mode: FreshContextMode): boolean {
  return mode === "TWO_TURN";
}
