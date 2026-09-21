import type { ReviewEvent } from "./events";

/**
 * The review history, read per round (RW-012).
 *
 * `events.jsonl` is append-only and every line already carries the round it belongs to, so this is
 * a grouping of the existing history and not a second history: no event is invented, none is
 * dropped, and the order inside a round stays the order the lines were written.
 *
 * Lines an older build could not read are skipped by the parser with a visible count, which is the
 * existing contract; nothing here fills such a gap in.
 */

export interface RoundTimeline {
  round: number;
  events: ReviewEvent[];
}

/** Rounds in ascending order, each holding its events in the order they were appended. */
export function timelineByRound(events: readonly ReviewEvent[]): RoundTimeline[] {
  const byRound = new Map<number, ReviewEvent[]>();
  for (const event of events) {
    const bucket = byRound.get(event.round);
    if (bucket === undefined) byRound.set(event.round, [event]);
    else bucket.push(event);
  }
  return [...byRound.entries()]
    .sort(([a], [b]) => a - b)
    .map(([round, roundEvents]) => ({ round, events: roundEvents }));
}
