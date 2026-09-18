/**
 * Human-approved Review State transition contract — INDEPENDENT TEST ORACLE (F-5).
 *
 * Source: the approved Review Hub v0.1 plan and `docs/data-contract-v1.md` "Review State
 * transitions" (Task Packet D2, AC-05, AC-14). This file must NOT import anything from
 * `src/domain/transitions.ts`; tests compare the implementation against these literals, so a
 * change to the implementation table that violates the contract makes the tests fail.
 */

export const ORACLE_REVIEW_STATES = [
  "NEW",
  "READY_FOR_REVIEW",
  "REVIEWING",
  "FIX_REQUIRED",
  "REVIEW_PASS",
  "BLOCKED",
  "SUSPENDED",
  "CLOSED",
] as const;
export type OracleState = (typeof ORACLE_REVIEW_STATES)[number];

export const ORACLE_RESOURCE_STATES = ["HOT", "WARM", "COLD"] as const;

/** Resulting Review State: a concrete state, "unchanged", or "suspendedFrom" (restore). */
export type OracleTo = OracleState | "unchanged" | "suspendedFrom";

export interface ContractRow {
  /** Action name as used by the application (`ReviewAction["type"]`). */
  action: string;
  /** Contract label (distinguishes payload variants such as the two verdicts). */
  label: string;
  from: readonly OracleState[];
  to: OracleTo;
}

const ALL: readonly OracleState[] = ORACLE_REVIEW_STATES;
const OPEN: readonly OracleState[] = ["NEW", "READY_FOR_REVIEW", "REVIEWING", "FIX_REQUIRED", "REVIEW_PASS", "BLOCKED"];

export const TRANSITION_CONTRACT: readonly ContractRow[] = [
  { action: "markReady", label: "Mark ready", from: ["NEW", "BLOCKED"], to: "READY_FOR_REVIEW" },
  { action: "startReview", label: "Start review", from: ["READY_FOR_REVIEW"], to: "REVIEWING" },
  { action: "cancelReview", label: "Cancel review", from: ["REVIEWING"], to: "READY_FOR_REVIEW" },
  { action: "recordRequestSaved", label: "Copy review prompt", from: OPEN, to: "unchanged" },
  { action: "captureResult", label: "Capture result", from: ["REVIEWING", "FIX_REQUIRED", "REVIEW_PASS", "BLOCKED"], to: "unchanged" },
  { action: "confirmVerdict", label: "Confirm verdict FIX_REQUIRED", from: ["REVIEWING"], to: "FIX_REQUIRED" },
  { action: "confirmVerdict", label: "Confirm verdict REVIEW_PASS", from: ["REVIEWING"], to: "REVIEW_PASS" },
  { action: "block", label: "Block", from: ["NEW", "READY_FOR_REVIEW", "REVIEWING", "FIX_REQUIRED"], to: "BLOCKED" },
  { action: "startNextRound", label: "Start next round", from: ["FIX_REQUIRED", "REVIEW_PASS"], to: "READY_FOR_REVIEW" },
  { action: "suspend", label: "Suspend", from: OPEN, to: "SUSPENDED" },
  { action: "resume", label: "Resume (suspended)", from: ["SUSPENDED"], to: "suspendedFrom" },
  { action: "close", label: "Close", from: [...OPEN, "SUSPENDED"], to: "CLOSED" },
  { action: "setResource", label: "Set resource", from: ALL, to: "unchanged" },
  { action: "setNextAction", label: "Set next action", from: ALL, to: "unchanged" },
  { action: "updateMetadata", label: "Update metadata", from: ALL, to: "unchanged" },
];

/**
 * Resume on a review that is not suspended: allowed only when it is not CLOSED and its resource
 * is not HOT; it changes the resource to HOT and leaves the Review State unchanged.
 */
export const RESUME_NOT_SUSPENDED_FROM: readonly OracleState[] = OPEN;

/** Actions that may change the Resource State (all others must leave it unchanged). */
export const RESOURCE_CHANGING_ACTIONS: readonly string[] = ["setResource", "suspend", "resume"];
