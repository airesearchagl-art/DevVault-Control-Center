import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAllowedReviewFile } from "../test/memoryStorage";
import { GIT_OBSERVATION_TIMEOUT_MS, MAX_REVIEW_ROUNDS } from "./limits";
import { createReviewSession, emptyReviewForm, type ReviewSession, type RoundRecord } from "./review";
import { parseSessionFile, serializeSession } from "./schema";
import { applyReviewAction, canApply } from "./transitions";

/** F-11: one round-limit contract shared by domain, schema, storage file names and UI gating. */

const NOW = "2026-01-01T00:00:00.000Z";
const ID = "rv-20260101-limits";

function sessionWithRounds(count: number): ReviewSession {
  const created = createReviewSession(emptyReviewForm("project-alpha"), new Set(["project-alpha"]), ID, NOW);
  if (!created.ok) throw new Error("fixture");
  const template = created.value.session.rounds[0];
  const rounds: RoundRecord[] = Array.from({ length: count }, (_, index) => ({
    ...template,
    round: index + 1,
    resultCapturedAt: NOW,
    verdict: "FIX_REQUIRED",
    verdictConfirmedAt: NOW,
  }));
  return { ...created.value.session, reviewRound: count, rounds, reviewState: "FIX_REQUIRED" };
}

describe("round limit contract (F-11)", () => {
  it("is defined once in contract/limits.json and used by the domain and by Rust", () => {
    const json = JSON.parse(readFileSync(new URL("../../contract/limits.json", import.meta.url), "utf8")) as { maxReviewRounds: number };
    expect(MAX_REVIEW_ROUNDS).toBe(json.maxReviewRounds);
    const rust = readFileSync(new URL("../../src-tauri/src/storage.rs", import.meta.url), "utf8");
    expect(rust).toContain('include_str!("../../contract/limits.json")');
    expect(rust).not.toMatch(/number\.len\(\)\s*<=\s*3/);
  });

  it("defines the Git observation bound once and reads it on both sides (Phase 2)", () => {
    const json = JSON.parse(readFileSync(new URL("../../contract/limits.json", import.meta.url), "utf8")) as {
      gitObservationTimeoutMs: number;
    };
    expect(GIT_OBSERVATION_TIMEOUT_MS).toBe(json.gitObservationTimeoutMs);
    const rust = readFileSync(new URL("../../src-tauri/src/git.rs", import.meta.url), "utf8");
    expect(rust).toContain('include_str!("../../contract/limits.json")');
    expect(rust).toContain("git_observation_timeout_ms");
    // The bound must not be repeated as a literal next to the reader.
    expect(rust).not.toMatch(new RegExp(`Duration::from_millis\(${json.gitObservationTimeoutMs}\)`));
  });

  it("allows starting rounds up to the limit and refuses beyond it (domain + UI gating)", () => {
    const below = sessionWithRounds(MAX_REVIEW_ROUNDS - 1);
    expect(canApply(below, "startNextRound")).toBe(true);
    const next = applyReviewAction(below, { type: "startNextRound", expectedHead: null }, NOW);
    expect(next.ok && next.value.session.reviewRound).toBe(MAX_REVIEW_ROUNDS);

    const atLimit = sessionWithRounds(MAX_REVIEW_ROUNDS);
    expect(canApply(atLimit, "startNextRound")).toBe(false);
    expect(applyReviewAction(atLimit, { type: "startNextRound", expectedHead: null }, NOW).ok).toBe(false);
  });

  it("schema accepts a session at the limit and rejects one beyond it", () => {
    const atLimit = sessionWithRounds(MAX_REVIEW_ROUNDS);
    expect(parseSessionFile(serializeSession(atLimit), ID).status).toBe("ok");
    const beyond = sessionWithRounds(MAX_REVIEW_ROUNDS + 1);
    expect(parseSessionFile(serializeSession(beyond), ID).status).toBe("malformed");
  });

  it("storage file names follow the same limit (mirrors Rust is_allowed_review_file)", () => {
    expect(isAllowedReviewFile(`request-r${MAX_REVIEW_ROUNDS}.md`)).toBe(true);
    expect(isAllowedReviewFile(`result-r${MAX_REVIEW_ROUNDS}.md`)).toBe(true);
    expect(isAllowedReviewFile(`result-r${MAX_REVIEW_ROUNDS}-previous-1767225600000.md`)).toBe(true);
    expect(isAllowedReviewFile(`request-r${MAX_REVIEW_ROUNDS + 1}.md`)).toBe(false);
    expect(isAllowedReviewFile(`result-r${MAX_REVIEW_ROUNDS + 1}-previous-1.md`)).toBe(false);
    expect(isAllowedReviewFile("request-r1-previous-1.md")).toBe(false);
  });
});
