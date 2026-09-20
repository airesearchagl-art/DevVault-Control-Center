import { describe, expect, it } from "vitest";
import {
  FRESHNESS_CONTRACT,
  FRESHNESS_VOCABULARY,
  NEVER_DIFFERS,
  type ContractObservation,
} from "../test/freshnessContract";
import { compareHead, deriveFreshness, FRESHNESS_STATES, shortHead, type Freshness } from "./freshness";
import { asGitObservation, GIT_STATUSES, type GitObservation } from "./git";

/**
 * Phase 2 derived-Freshness contract: every row of the independent table in
 * `src/test/freshnessContract.ts` is checked against the implementation. The table is written from
 * the contract and imports nothing from `freshness.ts`.
 */

const OBSERVED_AT = "2026-09-20T00:00:00.000Z";

function observationFrom(row: ContractObservation | null): GitObservation | undefined {
  if (row === null) return undefined;
  return asGitObservation({ ...row, observedAt: OBSERVED_AT }, OBSERVED_AT);
}

describe("Freshness vocabulary", () => {
  it("is exactly the contracted set", () => {
    expect([...FRESHNESS_STATES].sort()).toEqual([...FRESHNESS_VOCABULARY].sort());
  });

  it("mirrors the Rust status vocabulary", () => {
    expect([...GIT_STATUSES]).toEqual([
      "OK",
      "NO_LOCAL_ROOT",
      "NOT_A_GIT_REPOSITORY",
      "GIT_UNAVAILABLE",
      "TIMEOUT",
      "ERROR",
    ]);
  });
});

describe("deriveFreshness follows the contract table", () => {
  it.each(FRESHNESS_CONTRACT.map((row) => [row.label, row] as const))("%s", (_label, row) => {
    const result = deriveFreshness({
      observation: observationFrom(row.observation),
      expectedHead: row.expectedHead,
      reviewedHead: row.reviewedHead,
    });
    expect(result.status).toBe(row.expected as Freshness);
    expect(result.explanation.trim().length).toBeGreaterThan(0);
    // The derivation reports the Human-recorded values back unchanged (AC2-07).
    expect(result.expectedHead).toBe(row.expectedHead);
    expect(result.reviewedHead).toBe(row.reviewedHead);
  });

  it("covers every Freshness state", () => {
    const covered = new Set(FRESHNESS_CONTRACT.map((row) => row.expected));
    expect([...covered].sort()).toEqual([...FRESHNESS_VOCABULARY].sort());
  });

  it("never turns an undecidable comparison into a difference", () => {
    for (const label of NEVER_DIFFERS) {
      const row = FRESHNESS_CONTRACT.find((candidate) => candidate.label === label);
      if (!row) throw new Error(`contract row missing: ${label}`);
      const result = deriveFreshness({
        observation: observationFrom(row.observation),
        expectedHead: row.expectedHead,
        reviewedHead: row.reviewedHead,
      });
      expect(result.status).toBe("UNKNOWN");
      expect(result.explanation).not.toMatch(/differs/);
    }
  });

  it("explains a difference with both short HEADs", () => {
    const stale = deriveFreshness({
      observation: observationFrom({ status: "OK", head: "1".repeat(40), dirty: false }),
      expectedHead: null,
      reviewedHead: "2".repeat(40),
    });
    expect(stale.status).toBe("REVIEW_STALE");
    expect(stale.explanation).toBe("Reviewed HEAD 2222222 differs from current HEAD 1111111.");

    const changed = deriveFreshness({
      observation: observationFrom({ status: "OK", head: "1".repeat(40), dirty: false }),
      expectedHead: "3".repeat(40),
      reviewedHead: null,
    });
    expect(changed.status).toBe("HEAD_CHANGED");
    expect(changed.explanation).toBe("Expected HEAD 3333333 differs from current HEAD 1111111.");
  });

  it("names the reason a failed observation is unknown", () => {
    const rejected = deriveFreshness({
      observation: observationFrom({
        status: "ERROR",
        head: null,
        dirty: null,
        errorMessage: "UNC / network paths are not supported",
      }),
      expectedHead: "1".repeat(40),
      reviewedHead: null,
    });
    expect(rejected.status).toBe("UNKNOWN");
    expect(rejected.explanation).toContain("UNC / network paths are not supported");

    const unobserved = deriveFreshness({ observation: undefined, expectedHead: null, reviewedHead: null });
    expect(unobserved.explanation).toBe("Git state has not been observed.");
  });
});

describe("compareHead", () => {
  const current = "abcdef0123456789abcdef0123456789abcdef01";

  it.each([
    [current, "match"],
    [current.toUpperCase(), "match"],
    ["abcdef0", "match"],
    ["abcdef01234", "match"],
    ["abcdef1", "differs"],
    ["b".repeat(40), "differs"],
    ["abcde", "unknown"],
    ["", "unknown"],
    ["zzzzzzz", "unknown"],
    [null, "unknown"],
  ])("%s -> %s", (recorded, expected) => {
    expect(compareHead(recorded as string | null, current)).toBe(expected);
  });

  it("is unknown when the current HEAD is not a full SHA", () => {
    expect(compareHead(current, null)).toBe("unknown");
    expect(compareHead(current, "abcdef0")).toBe("unknown");
    expect(compareHead("abcdef0", "abcdef0")).toBe("unknown");
  });
});

describe("shortHead", () => {
  it("shows seven characters, lower case, and a dash when absent", () => {
    expect(shortHead("ABCDEF0123456789ABCDEF0123456789ABCDEF01")).toBe("abcdef0");
    expect(shortHead(null)).toBe("—");
    expect(shortHead("   ")).toBe("—");
  });
});
