import { compareHead } from "./freshness";
import type { GitObservation } from "./git";

/**
 * Whether a Turn 1 request can be bound to an exact head (Phase 3 prompt readiness).
 *
 * The canonical request (`02_Prompts/AI_Review/AI_Review_Request_Prompt.md`, input item 4) binds a
 * GitHub-direct review to the **full 40-character** head SHA. The review metadata keeps accepting
 * 7–40 characters, as it always has; this function does not narrow that schema. It only answers the
 * question a request needs answered: is what the Human recorded an exact binding, or not?
 *
 * Nothing here completes a short value, and nothing here writes. The locally observed HEAD is
 * reported as a *candidate* the Human may adopt through their own edit; it is never copied into the
 * recorded expected HEAD, and when it cannot be compared the answer says so instead of guessing.
 */

const FULL_HEAD = /^[0-9a-f]{40}$/i;

export const HEAD_BINDINGS = ["EXACT", "SHORT", "MISSING"] as const;
export type HeadBinding = (typeof HEAD_BINDINGS)[number];

/** How the local observation relates to the recorded head. Informational only. */
export const OBSERVED_HEAD_RELATIONS = ["MATCHES", "DIFFERS", "UNDECIDABLE", "UNAVAILABLE"] as const;
export type ObservedHeadRelation = (typeof OBSERVED_HEAD_RELATIONS)[number];

export interface ExactHeadReadiness {
  binding: HeadBinding;
  /** What the Human recorded, exactly as recorded; `null` when nothing is. */
  recordedHead: string | null;
  /** The locally observed full HEAD, shown as a candidate only; `null` when there is none. */
  observedHead: string | null;
  observed: ObservedHeadRelation;
  observedAt: string | null;
}

export function headBinding(recorded: string | null | undefined): HeadBinding {
  if (typeof recorded !== "string" || recorded.trim() === "") return "MISSING";
  return FULL_HEAD.test(recorded.trim()) ? "EXACT" : "SHORT";
}

/** An exact-head request is possible only for an `EXACT` binding; every other value is not one. */
export function isExactHeadBound(recorded: string | null | undefined): boolean {
  return headBinding(recorded) === "EXACT";
}

export function exactHeadReadiness(recorded: string | null, observation: GitObservation | undefined): ExactHeadReadiness {
  const binding = headBinding(recorded);
  const observedHead =
    observation !== undefined && observation.status === "OK" && typeof observation.head === "string" && FULL_HEAD.test(observation.head)
      ? observation.head
      : null;
  let observed: ObservedHeadRelation;
  if (observedHead === null) observed = "UNAVAILABLE";
  else {
    const comparison = compareHead(recorded, observedHead);
    observed = comparison === "match" ? "MATCHES" : comparison === "differs" ? "DIFFERS" : "UNDECIDABLE";
  }
  return {
    binding,
    recordedHead: recorded,
    observedHead,
    observed,
    observedAt: observation?.observedAt ?? null,
  };
}
