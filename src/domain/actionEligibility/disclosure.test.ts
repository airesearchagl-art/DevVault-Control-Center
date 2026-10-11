import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import { createTranslator, LOCALES, translate } from "../../i18n";
import {
  assessError,
  assessOk,
  countingEnv,
  DECISION_SOURCES,
  deepFreeze,
  entry,
  ENV,
  fFix,
  fReady,
  fRev,
  ID_A,
  request,
  SENTINEL,
  sourceOf,
  successCorpus,
  withSentinels,
} from "../../test/actionEligibilityFixtures";
import { actionRefusal } from "../actionRefusal";
import type { ControlReadSource, ControlReadSourceReview } from "../controlRead/contract";
import type { Message } from "../message";
import type { ReviewSession } from "../review";
import { guardAction } from "../transitions";
import { assessActionEligibility } from "./assessEligibility";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => {
    throw new Error("IPC is not allowed in Action Eligibility");
  }),
}));

/** Annex D: DISC (least disclosure), SIDE (no side effect) and DET (determinism). */

const STATE_NAMES = ["NEW", "READY_FOR_REVIEW", "REVIEWING", "FIX_REQUIRED", "REVIEW_PASS", "SUSPENDED", "CLOSED"];
const DOMAIN_TYPES = ["startReview", "confirmVerdict", "startNextRound"] as const;

/** Every refusal message the domain gives for this review, in every interface language. */
function refusalTexts(session: ReviewSession): string[] {
  const messages: Message[] = [];
  for (const type of DOMAIN_TYPES) {
    const guard = guardAction(session, type);
    if (guard !== null) messages.push(guard);
  }
  const refusal = actionRefusal(session, "confirmVerdict");
  if (refusal !== null) messages.push(refusal);
  return LOCALES.flatMap((locale) => messages.map((message) => translate(createTranslator(locale), message)));
}

describe("DISC — least disclosure", () => {
  it.each([
    { case_id: "DISC-01", build: fReady, disposition: ["ELIGIBLE_NOW", "BLOCKED", "BLOCKED"] },
    { case_id: "DISC-02", build: fRev, disposition: ["BLOCKED", "NEEDS_HUMAN", "BLOCKED"] },
    { case_id: "DISC-03", build: fFix, disposition: ["BLOCKED", "BLOCKED", "ELIGIBLE_NOW"] },
  ])("$case_id no sentinel, i18n text or message parameter reaches the output", ({ build, disposition }) => {
    const session = build();
    const result = assessOk(withSentinels(session));
    expect(result.data.assessments.map((assessment) => assessment.disposition)).toEqual(disposition);
    const text = JSON.stringify(result);
    expect(text.toLowerCase()).not.toContain(SENTINEL);
    expect(text).not.toContain("action.");
    expect(text).not.toMatch(/"(key|params|messageParams)"/);
    for (const name of [...STATE_NAMES, ...DOMAIN_TYPES]) expect(text, name).not.toContain(name);
    const texts = refusalTexts(session);
    expect(texts.length).toBeGreaterThan(0);
    for (const translated of texts) expect(text, translated).not.toContain(translated);
  });

  it("DISC-04 an unreadable target's health details never reach the error", () => {
    const health = { status: "unreadable", message: `${SENTINEL}-health-message` } as unknown as ControlReadSourceReview["health"];
    const source = sourceOf(fRev(), { reviews: [{ reviewId: ID_A, session: null, health }] });
    const error = assessError(request(), source);
    expect(error).toEqual({ code: "TARGET_UNAVAILABLE", reason: "UNREADABLE" });
    expect(JSON.stringify(error).toLowerCase()).not.toContain(SENTINEL);
  });

  it("DISC-05 a conflicting inner id is never echoed", () => {
    const sentinelId = "rv-29991231-zqxsnt";
    const source = sourceOf(fRev(), { reviews: [entry(fRev({}, { reviewSessionId: sentinelId }), "ok", ID_A)] });
    const env = countingEnv();
    const text = JSON.stringify(assessActionEligibility(request(), source, env));
    expect(text).toContain("IDENTITY_MISMATCH");
    expect(text).not.toContain("zqxsnt");
    expect(text).not.toContain("rv-");
  });

  it("DISC-06 an unsafe unrecognized key is counted, never echoed", () => {
    const error = assessError(request(ID_A, { [`${SENTINEL.toUpperCase()} Key`]: 1 }), sourceOf(fRev()));
    expect(error).toEqual({ code: "INVALID_REQUEST", reason: "UNRECOGNIZED_FIELD", unlisted_field_count: 1 });
    expect(JSON.stringify(error).toLowerCase()).not.toContain(SENTINEL);
  });
});

describe("SIDE — no side effect", () => {
  it.each([
    { case_id: "SIDE-01", name: "F-READY" as const },
    { case_id: "SIDE-02", name: "F-REV" as const },
    { case_id: "SIDE-03", name: "F-FIX" as const },
  ])("$case_id a deep-frozen source is read without being written", ({ name }) => {
    const frozen: ControlReadSource = deepFreeze(DECISION_SOURCES[name]());
    let result: unknown;
    expect(() => {
      result = assessOk(frozen);
    }).not.toThrow();
    expect(result).toEqual(assessOk(DECISION_SOURCES[name]()));
  });

  it("SIDE-04 no IPC call is made", () => {
    for (const { source } of successCorpus()) assessOk(source);
    assessError(request("rv-bad"), sourceOf(fRev()));
    expect(vi.mocked(invoke)).not.toHaveBeenCalled();
  });
});

describe("DET — determinism", () => {
  it.each([
    { case_id: "DET-01", name: "F-READY" as const },
    { case_id: "DET-02", name: "F-REV" as const },
    { case_id: "DET-03", name: "F-FIX" as const },
  ])("$case_id the same input twice gives the same output", ({ name }) => {
    expect(assessOk(DECISION_SOURCES[name](), ENV)).toEqual(assessOk(DECISION_SOURCES[name](), ENV));
  });

  it("DET-04 the caller's clock does not change the data", () => {
    const first = assessOk(DECISION_SOURCES["F-REV"](), { now: () => "2026-10-11T04:00:00.000Z", newAssessmentId: () => "assess-a" });
    const second = assessOk(DECISION_SOURCES["F-REV"](), { now: () => "2027-01-01T00:00:00.000Z", newAssessmentId: () => "assess-a" });
    expect(second.data).toEqual(first.data);
  });
});
