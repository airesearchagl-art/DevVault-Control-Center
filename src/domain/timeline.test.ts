import { describe, expect, it } from "vitest";
import type { ReviewEvent, ReviewEventType } from "./events";
import { timelineByRound } from "./timeline";

const REVIEW_ID = "rv-20260101-alpha1";

function event(round: number, type: ReviewEventType, ts: string): ReviewEvent {
  return {
    v: 1,
    ts,
    type,
    reviewSessionId: REVIEW_ID,
    round,
    reviewState: null,
    resourceState: null,
    note: null,
    detail: null,
  };
}

describe("timelineByRound", () => {
  it("groups the history by round, ascending, keeping each round's order", () => {
    const events = [
      event(1, "review_created", "2026-01-01T10:00:00.000Z"),
      event(1, "request_saved", "2026-01-01T11:00:00.000Z"),
      event(2, "review_ready", "2026-01-02T10:00:00.000Z"),
      event(1, "result_captured", "2026-01-01T12:00:00.000Z"),
      event(2, "request_saved", "2026-01-02T11:00:00.000Z"),
    ];
    expect(timelineByRound(events)).toEqual([
      { round: 1, events: [events[0], events[1], events[3]] },
      { round: 2, events: [events[2], events[4]] },
    ]);
  });

  it("keeps a round that has no events out of the list rather than inventing one", () => {
    const events = [event(3, "followup_saved", "2026-01-03T10:00:00.000Z")];
    expect(timelineByRound(events).map((r) => r.round)).toEqual([3]);
  });

  it("returns nothing for an empty history", () => {
    expect(timelineByRound([])).toEqual([]);
  });

  it("does not reorder events that share a timestamp", () => {
    const first = event(1, "risk_tier_set", "2026-01-01T10:00:00.000Z");
    const second = event(1, "evidence_reused", "2026-01-01T10:00:00.000Z");
    expect(timelineByRound([first, second])[0].events).toEqual([first, second]);
  });
});
