import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assessOk, DECISION_SOURCES } from "../../test/actionEligibilityFixtures";
import { ACTION_CATALOG } from "./catalog";
import { ACTION_IDS, ELIGIBILITY_RULE_IDS, EXECUTORS, NEEDS_HUMAN_CAPABLE_CHECKS } from "./contract";

/** Annex D: P-01 (payload scope), CAT (closed catalog) and SRC (source structure). */

const DIR = "src/domain/actionEligibility";
const PRODUCT_FILES = readdirSync(DIR)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .map((name) => ({ name, text: readFileSync(join(DIR, name), "utf8") }));

function specifiers(text: string): string[] {
  return [...text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)].map((match) => match[1]);
}

describe("P-01 — payload scope", () => {
  const [SR, CV, SNR] = assessOk(DECISION_SOURCES["F-READY"]()).data.assessments;

  it("P-01-01 start_review has no payload", () => {
    expect(SR.payload).toEqual({ evaluation: "NOT_APPLICABLE", fields: [] });
  });

  it("P-01-02 confirm_verdict's verdict, note and confirmation are not evaluated", () => {
    expect(CV.payload).toEqual({ evaluation: "NOT_EVALUATED", fields: ["verdict", "verdict_note", "human_confirmation"] });
  });

  it("P-01-03 start_next_round's expected head is not evaluated", () => {
    expect(SNR.payload).toEqual({ evaluation: "NOT_EVALUATED", fields: ["expected_head"] });
  });
});

describe("CAT — the catalog is closed", () => {
  it("CAT-01 exactly the three review actions, in order", () => {
    expect(ACTION_IDS).toEqual(["review.start_review", "review.confirm_verdict", "review.start_next_round"]);
    expect(ACTION_CATALOG.map((entry) => entry.action_id)).toEqual(["review.start_review", "review.confirm_verdict", "review.start_next_round"]);
    expect(assessOk(DECISION_SOURCES["F-REV"]()).data.assessments.map((assessment) => assessment.action_id)).toEqual([...ACTION_IDS]);
  });

  it("CAT-02 every action is executed by the Human UI only", () => {
    expect(EXECUTORS).toEqual(["HUMAN_UI"]);
    expect(ACTION_CATALOG.every((entry) => entry.executor === "HUMAN_UI")).toBe(true);
    expect(assessOk(DECISION_SOURCES["F-FIX"]()).data.assessments.every((assessment) => assessment.executor === "HUMAN_UI")).toBe(true);
  });

  it.each([
    { case_id: "CAT-03-SR", index: 0, checks: ["state_guard", "project_registered", "expected_head_exact", "freshness_aligned"] },
    {
      case_id: "CAT-03-CV",
      index: 1,
      checks: ["state_guard", "verdict_prerequisites", "project_registered", "reviewed_head_exact", "freshness_aligned", "human_decision"],
    },
    { case_id: "CAT-03-SNR", index: 2, checks: ["state_guard", "project_registered", "verdict_confirmation_recorded"] },
  ])("$case_id the check order is fixed", ({ index, checks }) => {
    expect(ACTION_CATALOG[index].checks).toEqual(checks);
    expect(assessOk(DECISION_SOURCES["F-REV"]()).data.assessments[index].checks.map((check) => check.check)).toEqual(checks);
  });

  it("CAT-04 exactly the three rule ids", () => {
    expect(ELIGIBILITY_RULE_IDS).toEqual(["eligibility.review.start-review@1", "eligibility.review.confirm-verdict@1", "eligibility.review.start-next-round@1"]);
    expect(ACTION_CATALOG.map((entry) => entry.rule)).toEqual([...ELIGIBILITY_RULE_IDS]);
  });

  it("CAT-05 only the Human decision may need the Human, only for confirm_verdict, and last", () => {
    expect(NEEDS_HUMAN_CAPABLE_CHECKS).toEqual(["human_decision"]);
    for (const entry of ACTION_CATALOG) {
      const at = entry.checks.indexOf("human_decision");
      if (entry.action_id === "review.confirm_verdict") expect(at).toBe(entry.checks.length - 1);
      else expect(at).toBe(-1);
    }
  });
});

describe("SRC — source structure", () => {
  it("SRC-01 product files import no service, app, feature, component, i18n or Tauri module", () => {
    expect(PRODUCT_FILES.length).toBe(5);
    for (const { name, text } of PRODUCT_FILES) {
      for (const specifier of specifiers(text)) {
        expect(/(^|\/)(services|app|features|components|i18n)(\/|$)|^@tauri-apps/.test(specifier), `${name}: ${specifier}`).toBe(false);
      }
    }
  });

  it("SRC-02 no local state table, review-state literal, head pattern or freshness re-derivation", () => {
    for (const { name, text } of PRODUCT_FILES) {
      expect(text, name).not.toContain("ALLOWED_FROM");
      expect(text, name).not.toMatch(/["'](NEW|READY_FOR_REVIEW|REVIEWING|FIX_REQUIRED|REVIEW_PASS|SUSPENDED|CLOSED)["']/);
      expect(text, name).not.toMatch(/\[0-9a-f\]|\{40\}/i);
      expect(text, name).not.toContain("deriveFreshness");
    }
  });

  it("SRC-03 no evidence reference is made by a cast", () => {
    for (const { name, text } of PRODUCT_FILES) expect(text, name).not.toMatch(/as\s+EvidenceRef/);
  });

  it("SRC-04 the entry point never passes an internal environment to the basis", () => {
    const entry = PRODUCT_FILES.find((file) => file.name === "assessEligibility.ts");
    const calls = [...(entry?.text ?? "").matchAll(/\b(resolveBasis|readBasis)\(([^)]*)\)/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call[2].split(",").length, call[0]).toBe(2);
  });

  it("SRC-05 product files import no test module", () => {
    for (const { name, text } of PRODUCT_FILES) {
      for (const specifier of specifiers(text)) expect(/(^|\/)test(\/|$)|\.test(\.ts)?$/.test(specifier), `${name}: ${specifier}`).toBe(false);
    }
  });

  it("SRC-06 the independent oracles do not import Action Eligibility", () => {
    for (const oracle of ["src/test/transitionContract.ts", "src/test/workflowContract.ts", "src/test/freshnessContract.ts"]) {
      expect(readFileSync(oracle, "utf8"), oracle).not.toContain("actionEligibility");
    }
  });
});
