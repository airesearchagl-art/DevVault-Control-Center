import { describe, expect, it } from "vitest";
import {
  assessError,
  assessOk,
  countingEnv,
  entry,
  fFix,
  fReady,
  fRev,
  H,
  ID_A,
  ID_B,
  ID_D,
  ID_E,
  ID_X,
  observed,
  project,
  request,
  session,
  sourceOf,
  successCorpus,
} from "../../test/actionEligibilityFixtures";
import {
  CONTROL_READ_ERROR_CODES,
  CONTROL_READ_ERROR_REASONS,
  type ControlReadSource,
  type ControlReadSourceReview,
  type Envelope,
  type ReadControlEnv,
  type ReviewStateV1,
} from "../controlRead/contract";
import { readControl } from "../controlRead/readControl";
import type { ReviewSession } from "../review";
import { assessActionEligibility } from "./assessEligibility";
import { bindIdentity, interpretBasis, mapBasisError, readBasis, scanIdentity } from "./basis";

/** Annex D: BM (basis error rebuild), ENV (environments), ID (identity binding), PERM (order independence). */

const ENV_5A = { now: () => "2026-10-11T00:00:00.000Z", newSnapshotId: () => "snap-test" };
const IDENTITY_MISMATCH = { code: "TARGET_UNAVAILABLE", reason: "IDENTITY_MISMATCH" };
const VIOLATION = { code: "SOURCE_UNAVAILABLE", reason: "BASIS_CONTRACT_VIOLATION" };

/** The pass-through table, written as literals (independent of `basis.ts`). */
const PASS10: [string, string | null][] = [
  ["INVALID_TARGET", null],
  ["SOURCE_UNAVAILABLE", "APP_NOT_READY"],
  ["SOURCE_UNAVAILABLE", "REGISTRY_UNREADABLE"],
  ["SOURCE_UNAVAILABLE", "REGISTRY_IO_ERROR"],
  ["SOURCE_UNAVAILABLE", "REGISTRY_UNSUPPORTED_VERSION"],
  ["TARGET_NOT_FOUND", null],
  ["TARGET_UNAVAILABLE", "UNREADABLE"],
  ["TARGET_UNAVAILABLE", "IO_ERROR"],
  ["TARGET_UNAVAILABLE", "UNSUPPORTED_VERSION"],
  ["TARGET_UNAVAILABLE", "MISSING"],
];

const isPass10 = (code: string, reason: string | null) => PASS10.some(([c, r]) => c === code && r === reason);

function internalError(code: string, reason: string | null, extra: Record<string, unknown> = {}, wrapper: Record<string, unknown> = {}) {
  return { contract: "dvcc.control-read", version: 1, error: { code, ...(reason === null ? {} : { reason }), ...extra }, ...wrapper };
}

describe("BM — closed basis error rebuild", () => {
  const rows = CONTROL_READ_ERROR_CODES.flatMap((code) =>
    [null, ...CONTROL_READ_ERROR_REASONS].map((reason) => ({ case_id: `BM-01-${code}-${reason ?? "NONE"}`, code, reason })),
  );

  it("support: the BM-01 table has 8 codes x 15 reason slots", () => {
    expect(rows).toHaveLength(120);
  });

  // A template title: `it.each` would truncate these long case ids in the test name.
  for (const { case_id, code, reason } of rows) {
    it(`${case_id} is passed on only when it is one of the ten listed pairs`, () => {
      const mapped = mapBasisError(internalError(code, reason));
      expect(mapped.contract).toBe("dvcc.action-eligibility");
      expect(mapped.version).toBe(1);
      if (isPass10(code, reason)) expect(mapped.error).toEqual(reason === null ? { code } : { code, reason });
      else expect(mapped.error).toEqual(VIOLATION);
    });
  }

  it.each(PASS10.map(([code, reason], index) => ({ case_id: `BM-02-${String(index + 1).padStart(2, "0")}`, code, reason })))(
    "$case_id an extra internal error key makes even a listed pair a violation",
    ({ code, reason }) => {
      const mapped = mapBasisError(internalError(code, reason, { fields: ["x"] }));
      expect(mapped.error).toEqual(VIOLATION);
      expect(Object.keys(mapped.error).every((key) => key === "code" || key === "reason")).toBe(true);
    },
  );

  it.each([
    { case_id: "BM-03-01", wrapper: { contract: "dvcc.other" } },
    { case_id: "BM-03-02", wrapper: { version: 2 } },
  ])("$case_id a listed pair in another contract or version is a violation", ({ wrapper }) => {
    expect(mapBasisError(internalError("TARGET_NOT_FOUND", null, {}, wrapper)).error).toEqual(VIOLATION);
  });

  const success = () => readControl({ contract: "dvcc.control-read", version: 1, operation: "get_review_state", review_session_id: ID_A }, sourceOf(fRev()), {
    now: () => "2026-10-11T00:00:00.000Z",
    newSnapshotId: () => "snap-test",
  }) as Envelope<ReviewStateV1>;

  it.each([
    { case_id: "BM-04-01", mutate: (value: Record<string, unknown>) => ({ ...value, contract: "dvcc.other" }) },
    { case_id: "BM-04-02", mutate: (value: Record<string, unknown>) => ({ ...value, version: 2 }) },
    { case_id: "BM-04-03", mutate: (value: Record<string, unknown>) => ({ ...value, operation: "get_project_state" }) },
    {
      case_id: "BM-04-04",
      mutate: (value: Record<string, unknown>) => {
        const copy = { ...value };
        delete copy.data;
        return copy;
      },
    },
  ])("$case_id a malformed success envelope is a violation", ({ mutate }) => {
    const bound = interpretBasis(ID_A, sourceOf(fRev()), mutate(success() as unknown as Record<string, unknown>));
    expect(bound.ok).toBe(false);
    if (!bound.ok) expect(bound.error.error).toEqual(VIOLATION);
  });
});

function countingBasisEnv(): ReadControlEnv & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    now: () => {
      calls.push("now");
      return "2026-10-11T00:00:00.000Z";
    },
    newSnapshotId: () => {
      calls.push("newSnapshotId");
      return "snap-counting";
    },
  };
}

describe("ENV — caller and internal environments", () => {
  it("ENV-01 a success consumes newAssessmentId once, then now once, and uses their values", () => {
    const env = countingEnv("2026-10-11T02:00:00.000Z", "assess-counting");
    const result = assessOk(sourceOf(fRev()), env);
    expect(env.calls).toEqual(["newAssessmentId", "now"]);
    expect(result.assessment_id).toBe("assess-counting");
    expect(result.generated_at).toBe("2026-10-11T02:00:00.000Z");
  });

  it("ENV-02 the internal read consumes its own environment once each on success", () => {
    const basisEnv = countingBasisEnv();
    readBasis(ID_A, sourceOf(fRev()), basisEnv);
    expect([...basisEnv.calls].sort()).toEqual(["newSnapshotId", "now"]);
  });

  it("ENV-03 the internal read consumes nothing on an error", () => {
    const basisEnv = countingBasisEnv();
    readBasis(ID_X, sourceOf(fRev()), basisEnv);
    expect(basisEnv.calls).toEqual([]);
  });

  it("ENV-04 nothing of the internal environment or snapshot reaches the output", () => {
    const text = JSON.stringify(assessOk(sourceOf(fRev())));
    expect(text).not.toContain("1970-01-01T00:00:00.000Z");
    expect(text).not.toContain("snap-00000000-0000-4000-8000-000000000000");
    expect(text).not.toContain("snapshot_id");
  });

  it("ENV-05 every success output carries the fixed envelope values", () => {
    for (const { name, source } of successCorpus()) {
      const result = assessOk(source);
      expect(result, name).toMatchObject({
        contract: "dvcc.action-eligibility",
        version: 1,
        operation: "assess_review_actions",
        authority: "NONE",
        scope: "ACTION_LEVEL",
        revalidation: "REQUIRED_BEFORE_EXECUTION",
        basis: { contract: "dvcc.control-read", version: 1, operation: "get_review_state" },
        not_evaluated: ["ACTION_PAYLOAD", "AGENT_PERMISSION", "EXTERNAL_GATES", "EXECUTION_OUTCOME"],
      });
      expect(Object.keys(result).sort(), name).toEqual(
        ["assessment_id", "authority", "basis", "contract", "data", "generated_at", "not_evaluated", "operation", "revalidation", "scope", "version"].sort(),
      );
    }
  });
});

// ---------------------------------------------------------------------------------------------
// ID — identity binding (Annex A4)
// ---------------------------------------------------------------------------------------------

const withReviews = (reviews: ControlReadSourceReview[], parts: Partial<ControlReadSource> = {}) => sourceOf(fRev(), { reviews, ...parts });
const claimingA = (status: "ok" | "unreadable" = "ok") => entry(fRev(), status, ID_X);
const unreadableA = () => entry(null, "unreadable", ID_A);
const otherRoot = () => project({ localRoot: "/synthetic/alpha-other" });

/** Every identity input that must be refused, by case id (shared with ID-INV). */
const REFUSED_SOURCES: Record<string, () => ControlReadSource> = {
  "ID-01": () => withReviews([entry(fRev({}, { reviewSessionId: ID_B }), "ok", ID_A)]),
  "ID-02": () => withReviews([claimingA()]),
  "ID-03-01": () => withReviews([entry(fRev()), claimingA()]),
  "ID-03-02": () => withReviews([claimingA(), entry(fRev())]),
  "ID-04": () => withReviews([entry(fRev()), entry(fRev())]),
  "ID-05-01": () => withReviews([unreadableA(), entry(fRev())]),
  "ID-05-02": () => withReviews([entry(fRev()), unreadableA()]),
  "ID-06": () => withReviews([unreadableA(), entry(null, "io_error", ID_A)]),
  "ID-07": () => sourceOf(fRev(), { projects: [project(), project()] }),
  "ID-08-01": () => sourceOf(fRev(), { projects: [project(), otherRoot()] }),
  "ID-08-02": () => sourceOf(fRev(), { projects: [otherRoot(), project()] }),
  "ID-11": () => sourceOf(fRev({}, { reviewRound: 2 })),
  "ID-12": () => sourceOf(fRev({}, { rounds: [], reviewRound: 0 })),
  "ID-15-01": () => withReviews([entry(fRev()), claimingA("unreadable")]),
  "ID-15-02": () => withReviews([claimingA("unreadable"), entry(fRev())]),
};

function refused(caseId: string) {
  return assessError(request(), REFUSED_SOURCES[caseId]());
}

function basisData(source: ControlReadSource): ReviewStateV1 {
  const result = readControl({ contract: "dvcc.control-read", version: 1, operation: "get_review_state", review_session_id: ID_A }, source, {
    now: () => "2026-10-11T00:00:00.000Z",
    newSnapshotId: () => "snap-test",
  });
  if ("error" in result) throw new Error("fixture basis");
  return (result as Envelope<ReviewStateV1>).data;
}

describe("ID — identity binding is fail-closed and order-independent", () => {
  it("ID-01 an entry whose inner session id differs from its reviewId is refused (I3)", () => {
    expect(refused("ID-01")).toEqual(IDENTITY_MISMATCH);
    expect(scanIdentity(ID_A, REFUSED_SOURCES["ID-01"]())).toEqual({ kind: "REVIEW_CONFLICT", rules: ["I3"] });
  });

  it("ID-02 an inner-only claim of the id is refused, not reported as not found (I2)", () => {
    const source = REFUSED_SOURCES["ID-02"]();
    expect(readControl({ contract: "dvcc.control-read", version: 1, operation: "get_review_state", review_session_id: ID_A }, source, ENV_5A)).toMatchObject({
      error: { code: "TARGET_NOT_FOUND" },
    });
    expect(refused("ID-02")).toEqual(IDENTITY_MISMATCH);
    expect(scanIdentity(ID_A, source)).toEqual({ kind: "REVIEW_CONFLICT", rules: ["I2"] });
  });

  it.each([{ case_id: "ID-03-01" }, { case_id: "ID-03-02" }])("$case_id a valid entry plus a conflicting inner claim is refused in either order (I2)", ({ case_id }) => {
    expect(refused(case_id)).toEqual(IDENTITY_MISMATCH);
    expect(scanIdentity(ID_A, REFUSED_SOURCES[case_id]())).toEqual({ kind: "REVIEW_CONFLICT", rules: ["I2"] });
  });

  it("ID-04 two identical readable entries are refused (I1)", () => {
    expect(refused("ID-04")).toEqual(IDENTITY_MISMATCH);
    expect(scanIdentity(ID_A, REFUSED_SOURCES["ID-04"]())).toEqual({ kind: "REVIEW_CONFLICT", rules: ["I1"] });
  });

  it.each([{ case_id: "ID-05-01" }, { case_id: "ID-05-02" }])("$case_id an unreadable and a readable entry of one id are refused in either order (I1)", ({ case_id }) => {
    expect(refused(case_id)).toEqual(IDENTITY_MISMATCH);
    expect(scanIdentity(ID_A, REFUSED_SOURCES[case_id]())).toEqual({ kind: "REVIEW_CONFLICT", rules: ["I1"] });
  });

  it("ID-06 two unreadable entries of one id are refused (I1)", () => {
    expect(refused("ID-06")).toEqual(IDENTITY_MISMATCH);
    expect(scanIdentity(ID_A, REFUSED_SOURCES["ID-06"]())).toEqual({ kind: "REVIEW_CONFLICT", rules: ["I1"] });
  });

  it("ID-07 a project registered twice is refused (I4)", () => {
    expect(refused("ID-07")).toEqual(IDENTITY_MISMATCH);
    expect(scanIdentity(ID_A, REFUSED_SOURCES["ID-07"]())).toMatchObject({ kind: "UNIQUE_READABLE", projectCount: 2 });
  });

  it.each([{ case_id: "ID-08-01" }, { case_id: "ID-08-02" }])("$case_id two registry entries of one projectId are refused in either order (I4)", ({ case_id }) => {
    expect(refused(case_id)).toEqual(IDENTITY_MISMATCH);
    expect(scanIdentity(ID_A, REFUSED_SOURCES[case_id]())).toMatchObject({ kind: "UNIQUE_READABLE", projectCount: 2 });
  });

  it("ID-10 an unrelated inconsistent entry does not change the assessment", () => {
    const baseline = assessOk(sourceOf(fRev()));
    const unrelated = entry(fRev({}, { reviewSessionId: ID_X }), "ok", ID_D);
    const result = assessOk(withReviews([entry(fRev()), unrelated]));
    expect(result.data.assessments).toEqual(baseline.data.assessments);
  });

  it("ID-11 a review whose round counter disagrees with its rounds is refused (B6)", () => {
    expect(refused("ID-11")).toEqual(IDENTITY_MISMATCH);
  });

  it("ID-12 a review without rounds is refused (B6)", () => {
    expect(refused("ID-12")).toEqual(IDENTITY_MISMATCH);
  });

  const raw = () => fRev();
  const basisVariants: { case_id: string; mutate: (data: ReviewStateV1) => ReviewStateV1 }[] = [
    { case_id: "ID-13-B4", mutate: (data) => ({ ...data, review_session_id: ID_X }) },
    { case_id: "ID-13-B5", mutate: (data) => ({ ...data, project_id: "project-beta" }) },
    { case_id: "ID-13-B6a", mutate: (data) => ({ ...data, current_round: 2 }) },
    { case_id: "ID-13-B6b", mutate: (data) => ({ ...data, rounds: [{ ...data.rounds[0], round: 2 }] }) },
    { case_id: "ID-13-B6c", mutate: (data) => ({ ...data, rounds: [] }) },
    {
      case_id: "ID-13-B7",
      mutate: (data) => ({ ...data, review_state: { ...data.review_state, value: "FIX_REQUIRED" } as ReviewStateV1["review_state"] }),
    },
  ];

  it("support: ID-13 baseline, the unmodified basis binds", () => {
    expect(bindIdentity(ID_A, raw(), basisData(sourceOf(fRev()))).ok).toBe(true);
  });

  it.each(basisVariants)("$case_id a projected basis that disagrees with the raw review is refused", ({ mutate }) => {
    const bound = bindIdentity(ID_A, raw(), mutate(basisData(sourceOf(fRev()))));
    expect(bound.ok).toBe(false);
    if (!bound.ok) expect(bound.error.error).toEqual(IDENTITY_MISMATCH);
  });

  it("ID-14 a projectId named like an Object.prototype property never yields ELIGIBLE_NOW", () => {
    const constructorProject = project({ projectId: "constructor" });
    const source: ControlReadSource = {
      phase: "ready",
      projects: [constructorProject],
      projectsHealth: { status: "ok" },
      reviews: [entry(fReady({}, { projectId: "constructor" }))],
      gitObservations: {},
    };
    const result = assessOk(source);
    const startReview = result.data.assessments[0];
    const freshness = basisData(source).freshness;
    expect(freshness.class).toBe("UNKNOWN");
    expect(startReview.disposition).toBe("BLOCKED");
    expect(startReview.reasons).toEqual(["FRESHNESS_UNKNOWN"]);
    expect(startReview.checks[3].fact_reason).toBe(freshness.class === "UNKNOWN" ? freshness.unknown_reason : undefined);
    expect(result.data.assessments.some((assessment) => assessment.disposition === "ELIGIBLE_NOW")).toBe(false);
  });

  it.each([{ case_id: "ID-15-01" }, { case_id: "ID-15-02" }])("$case_id an unreadable entry claiming the id is refused in either order (I2)", ({ case_id }) => {
    expect(refused(case_id)).toEqual(IDENTITY_MISMATCH);
    expect(scanIdentity(ID_A, REFUSED_SOURCES[case_id]())).toEqual({ kind: "REVIEW_CONFLICT", rules: ["I2"] });
  });

  it("ID-INV every refused identity input is an error without data or assessments", () => {
    for (const [caseId, build] of Object.entries(REFUSED_SOURCES)) {
      const env = countingEnv();
      const result = assessActionEligibility(request(), build(), env);
      expect("error" in result, caseId).toBe(true);
      expect(result, caseId).not.toHaveProperty("data");
      expect(JSON.stringify(result), caseId).not.toContain("assessments");
      expect(env.calls, caseId).toEqual([]);
    }
    for (const { mutate, case_id } of basisVariants) {
      const bound = bindIdentity(ID_A, raw(), mutate(basisData(sourceOf(fRev()))));
      expect(bound.ok, case_id).toBe(false);
      expect(bound, case_id).not.toHaveProperty("raw");
      expect(bound, case_id).not.toHaveProperty("basis");
    }
  });
});

// ---------------------------------------------------------------------------------------------
// PERM — order independence over distractors
// ---------------------------------------------------------------------------------------------

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]));
}

const beta = project({ projectId: "project-beta", localRoot: "/synthetic/beta" });
const distractorReadable = () => entry(session({ reviewSessionId: ID_D, projectId: "project-beta" }));
const distractorUnreadable = () => entry(null, "unreadable", ID_E);

function permutationCases(target: () => ReviewSession) {
  const reviewOrders = permutations([0, 1, 2]);
  const projectOrders = [
    [0, 1],
    [1, 0],
  ];
  const build = (reviewOrder: number[], projectOrder: number[]): ControlReadSource => {
    const reviews = [entry(target()), distractorReadable(), distractorUnreadable()];
    const projects = [project(), beta];
    return sourceOf(target(), {
      reviews: reviewOrder.map((index) => reviews[index]),
      projects: projectOrder.map((index) => projects[index]),
      gitObservations: { "project-alpha": observed(H), "project-beta": observed(H, {}, beta) },
    });
  };
  const canonical = build([0, 1, 2], [0, 1]);
  return {
    canonical,
    cases: reviewOrders.flatMap((reviewOrder) => projectOrders.map((projectOrder) => build(reviewOrder, projectOrder))),
  };
}

describe("PERM — the output does not depend on source array order", () => {
  for (const [label, target] of [
    ["READY", fReady],
    ["REV", fRev],
    ["FIX", fFix],
  ] as const) {
    const { canonical, cases } = permutationCases(() => target());
    const rows = cases.map((source, index) => ({ case_id: `PERM-${label}-${String(index + 1).padStart(2, "0")}`, source }));
    it.each(rows)("$case_id permuted reviews and projects give the canonical output", ({ source }) => {
      expect(rows).toHaveLength(12);
      expect(assessOk(source)).toEqual(assessOk(canonical));
    });
  }
});
