/**
 * Independent Phase 3 workflow contract.
 *
 * Written from the canonical DevVault review contract (obsidian-vault main `77ce41e`), not from the
 * implementation: this file imports nothing from `src/domain`. Each table states what the contract
 * requires, in literal data, so a test can compare the two and a mutation in the implementation has
 * nowhere to hide.
 *
 * Sources, by table:
 * - stages / turns: `02_Prompts/AI_Review/AI_Review_Request_Prompt.md` lines 33–57 and 70–89
 * - risk tier: `02_Prompts/GPTS_Review_Agent/DevVault_Review_Depth_Tiering.md` lines 13–31, 74–79
 * - duplicate / revalidation: the same file, lines 46, 66, 71
 * - evidence reuse: the same file, lines 43–47 and 67
 */

// --- Fresh Context ---------------------------------------------------------------------------

export const CONTRACT_TURNS = ["TURN_1", "TURN_2"] as const;
export const CONTRACT_MODES = ["TWO_TURN", "SINGLE_TURN"] as const;
export const CONTRACT_STAGES = ["STAGE_1", "STAGE_2", "STAGE_3", "STAGE_4"] as const;

/** Turn 1 is Stage 1 + Stage 2; Turn 2 is Stage 3 + Stage 4. */
export const TURN_STAGE_TABLE: { turn: string; stages: string[] }[] = [
  { turn: "TURN_1", stages: ["STAGE_1", "STAGE_2"] },
  { turn: "TURN_2", stages: ["STAGE_3", "STAGE_4"] },
];

/** Items 1–6 and 9–16 belong to Turn 1; items 7 and 8 are the implementation narrative. */
export const INPUT_ITEM_TABLE: { item: number; turn: string }[] = [
  { item: 1, turn: "TURN_1" },
  { item: 2, turn: "TURN_1" },
  { item: 3, turn: "TURN_1" },
  { item: 4, turn: "TURN_1" },
  { item: 5, turn: "TURN_1" },
  { item: 6, turn: "TURN_1" },
  { item: 7, turn: "TURN_2" },
  { item: 8, turn: "TURN_2" },
  { item: 9, turn: "TURN_1" },
  { item: 10, turn: "TURN_1" },
  { item: 11, turn: "TURN_1" },
  { item: 12, turn: "TURN_1" },
  { item: 13, turn: "TURN_1" },
  { item: 14, turn: "TURN_1" },
  { item: 15, turn: "TURN_1" },
  { item: 16, turn: "TURN_1" },
];

/** Where the Human stands, from what has happened in the round. Turn 2 exists only after an assessment. */
export const FRESH_CONTEXT_STATE_TABLE: {
  label: string;
  turn1SavedAt: string | null;
  assessmentCapturedAt: string | null;
  turn2SavedAt: string | null;
  judgmentCapturedAt: string | null;
  verdictConfirmedAt: string | null;
  expected: string;
  canSendTurn2: boolean;
}[] = [
  {
    label: "nothing sent yet",
    turn1SavedAt: null,
    assessmentCapturedAt: null,
    turn2SavedAt: null,
    judgmentCapturedAt: null,
    verdictConfirmedAt: null,
    expected: "TURN_1_NOT_SENT",
    canSendTurn2: false,
  },
  {
    label: "Turn 1 handed over, waiting for the Fresh Assessment",
    turn1SavedAt: "2026-09-21T10:00:00.000Z",
    assessmentCapturedAt: null,
    turn2SavedAt: null,
    judgmentCapturedAt: null,
    verdictConfirmedAt: null,
    expected: "AWAITING_ASSESSMENT",
    canSendTurn2: false,
  },
  {
    label: "assessment received, Turn 2 not needed yet",
    turn1SavedAt: "2026-09-21T10:00:00.000Z",
    assessmentCapturedAt: "2026-09-21T11:00:00.000Z",
    turn2SavedAt: null,
    judgmentCapturedAt: null,
    verdictConfirmedAt: null,
    expected: "ASSESSMENT_RECEIVED",
    canSendTurn2: true,
  },
  {
    label: "Turn 2 handed over",
    turn1SavedAt: "2026-09-21T10:00:00.000Z",
    assessmentCapturedAt: "2026-09-21T11:00:00.000Z",
    turn2SavedAt: "2026-09-21T12:00:00.000Z",
    judgmentCapturedAt: null,
    verdictConfirmedAt: null,
    expected: "TURN_2_SENT",
    canSendTurn2: true,
  },
  {
    label: "verdict confirmed",
    turn1SavedAt: "2026-09-21T10:00:00.000Z",
    assessmentCapturedAt: "2026-09-21T11:00:00.000Z",
    turn2SavedAt: "2026-09-21T12:00:00.000Z",
    judgmentCapturedAt: "2026-09-21T12:30:00.000Z",
    verdictConfirmedAt: "2026-09-21T13:00:00.000Z",
    expected: "JUDGMENT_CONFIRMED",
    canSendTurn2: false,
  },
  {
    label: "the Final Judgment is in, the Human has not decided yet",
    turn1SavedAt: "2026-09-21T10:00:00.000Z",
    assessmentCapturedAt: "2026-09-21T11:00:00.000Z",
    turn2SavedAt: "2026-09-21T12:00:00.000Z",
    judgmentCapturedAt: "2026-09-21T12:30:00.000Z",
    verdictConfirmedAt: null,
    expected: "JUDGMENT_RECEIVED",
    canSendTurn2: true,
  },
  {
    label: "a follow-up cannot precede the assessment",
    turn1SavedAt: "2026-09-21T10:00:00.000Z",
    assessmentCapturedAt: null,
    turn2SavedAt: null,
    judgmentCapturedAt: null,
    verdictConfirmedAt: null,
    expected: "AWAITING_ASSESSMENT",
    canSendTurn2: false,
  },
];

/**
 * When the Human may confirm a verdict. The canonical protocol decides it: with no Turn 2 the Fresh
 * Assessment is the final review response, and once Turn 2 has been sent the Final Judgment is what
 * the decision is made against (`AI_Review_Request_Prompt.md` lines 44–47 and 147–149).
 *
 * `judgmentCapturedAt` without `followupSavedAt` is not in this table: it is not a state the
 * protocol can reach, and the schema parser refuses such a file rather than the domain guarding it.
 */
export const VERDICT_GATE_TABLE: {
  label: string;
  resultCapturedAt: string | null;
  followupSavedAt: string | null;
  judgmentCapturedAt: string | null;
  allowed: boolean;
  refusal: string | null;
}[] = [
  {
    label: "no Fresh Assessment yet",
    resultCapturedAt: null,
    followupSavedAt: null,
    judgmentCapturedAt: null,
    allowed: false,
    refusal: "action.verdict.resultRequired",
  },
  {
    label: "Fresh Assessment captured, no Turn 2",
    resultCapturedAt: "2026-09-21T11:00:00.000Z",
    followupSavedAt: null,
    judgmentCapturedAt: null,
    allowed: true,
    refusal: null,
  },
  {
    label: "Turn 2 sent, Final Judgment missing",
    resultCapturedAt: "2026-09-21T11:00:00.000Z",
    followupSavedAt: "2026-09-21T12:00:00.000Z",
    judgmentCapturedAt: null,
    allowed: false,
    refusal: "action.verdict.judgmentRequired",
  },
  {
    label: "Turn 2 sent, Final Judgment captured",
    resultCapturedAt: "2026-09-21T11:00:00.000Z",
    followupSavedAt: "2026-09-21T12:00:00.000Z",
    judgmentCapturedAt: "2026-09-21T12:30:00.000Z",
    allowed: true,
    refusal: null,
  },
  {
    label: "a round written before Phase 3: no follow-up key at all",
    resultCapturedAt: "2026-01-01T11:00:00.000Z",
    followupSavedAt: null,
    judgmentCapturedAt: null,
    allowed: true,
    refusal: null,
  },
];

// --- Risk Tier -------------------------------------------------------------------------------

export const CONTRACT_TIERS = ["TIER_0", "TIER_1", "TIER_2"] as const;
export const CONTRACT_TIER_2_SUBJECTS = ["SECURITY", "PRIVACY", "CREDENTIAL", "PRODUCTION", "MIGRATION"] as const;

/** The ambiguity rule: take the higher candidate, and Tier 0 vs Tier 1 stops at Tier 1. */
export const TIER_ESCALATION_TABLE: { label: string; candidates: string[]; expected: string | null }[] = [
  { label: "no candidate recorded", candidates: [], expected: null },
  { label: "one candidate", candidates: ["TIER_1"], expected: "TIER_1" },
  { label: "Tier 0 vs Tier 1 stops at Tier 1", candidates: ["TIER_0", "TIER_1"], expected: "TIER_1" },
  { label: "Tier 1 vs Tier 2 goes to Tier 2", candidates: ["TIER_1", "TIER_2"], expected: "TIER_2" },
  { label: "Tier 0 vs Tier 2 goes to Tier 2", candidates: ["TIER_0", "TIER_2"], expected: "TIER_2" },
  { label: "order does not matter", candidates: ["TIER_2", "TIER_0"], expected: "TIER_2" },
];

export const TIER_CHOICE_TABLE: {
  label: string;
  chosen: string;
  subjects: string[];
  candidates: string[];
  ok: boolean;
  refusal: string | null;
  required: string | null;
}[] = [
  { label: "a plain Tier 1 choice", chosen: "TIER_1", subjects: [], candidates: [], ok: true, refusal: null, required: null },
  { label: "Tier 0 for a trivial change", chosen: "TIER_0", subjects: [], candidates: [], ok: true, refusal: null, required: null },
  {
    label: "security makes Tier 1 impossible",
    chosen: "TIER_1",
    subjects: ["SECURITY"],
    candidates: [],
    ok: false,
    refusal: "BELOW_TIER_2_SUBJECT",
    required: "TIER_2",
  },
  {
    label: "migration makes Tier 0 impossible",
    chosen: "TIER_0",
    subjects: ["MIGRATION"],
    candidates: [],
    ok: false,
    refusal: "BELOW_TIER_2_SUBJECT",
    required: "TIER_2",
  },
  {
    label: "credential with Tier 2 chosen is fine",
    chosen: "TIER_2",
    subjects: ["CREDENTIAL"],
    candidates: [],
    ok: true,
    refusal: null,
    required: null,
  },
  {
    label: "choosing below the recorded candidates is refused",
    chosen: "TIER_1",
    subjects: [],
    candidates: ["TIER_2"],
    ok: false,
    refusal: "BELOW_CANDIDATES",
    required: "TIER_2",
  },
  {
    label: "Tier 1 with a Tier 0 candidate is the higher of the two",
    chosen: "TIER_1",
    subjects: [],
    candidates: ["TIER_0"],
    ok: true,
    refusal: null,
    required: null,
  },
];

// --- Duplicate detection ----------------------------------------------------------------------

const HEAD_A = "a".repeat(40);
const HEAD_B = "b".repeat(40);

export const DUPLICATE_TABLE: {
  label: string;
  projectId: string;
  targetHead: string | null;
  priors: { reviewId: string; round: number; projectId: string; reviewedHead: string | null; substantive: boolean }[];
  expected: string;
  matches: { reviewId: string; round: number }[];
}[] = [
  {
    label: "no prior review at all",
    projectId: "project-alpha",
    targetHead: HEAD_A,
    priors: [],
    expected: "NO_DUPLICATE",
    matches: [],
  },
  {
    label: "same project, same head, already reviewed substantively",
    projectId: "project-alpha",
    targetHead: HEAD_A,
    priors: [{ reviewId: "rv-1", round: 1, projectId: "project-alpha", reviewedHead: HEAD_A, substantive: true }],
    expected: "SAME_HEAD_DUPLICATE",
    matches: [{ reviewId: "rv-1", round: 1 }],
  },
  {
    label: "same head but the earlier round was never reviewed substantively",
    projectId: "project-alpha",
    targetHead: HEAD_A,
    priors: [{ reviewId: "rv-1", round: 1, projectId: "project-alpha", reviewedHead: HEAD_A, substantive: false }],
    expected: "NO_DUPLICATE",
    matches: [],
  },
  {
    label: "a different head is not a duplicate",
    projectId: "project-alpha",
    targetHead: HEAD_A,
    priors: [{ reviewId: "rv-1", round: 1, projectId: "project-alpha", reviewedHead: HEAD_B, substantive: true }],
    expected: "NO_DUPLICATE",
    matches: [],
  },
  {
    label: "another project's review of the same head is not this project's duplicate",
    projectId: "project-alpha",
    targetHead: HEAD_A,
    priors: [{ reviewId: "rv-9", round: 1, projectId: "project-beta", reviewedHead: HEAD_A, substantive: true }],
    expected: "NO_DUPLICATE",
    matches: [],
  },
  {
    label: "a short recorded head that prefixes the target still matches",
    projectId: "project-alpha",
    targetHead: HEAD_A,
    priors: [{ reviewId: "rv-1", round: 1, projectId: "project-alpha", reviewedHead: "aaaaaaa", substantive: true }],
    expected: "SAME_HEAD_DUPLICATE",
    matches: [{ reviewId: "rv-1", round: 1 }],
  },
  {
    label: "two short values that cannot be compared are undecidable, not absent",
    projectId: "project-alpha",
    targetHead: "aaaaaaa",
    priors: [{ reviewId: "rv-1", round: 1, projectId: "project-alpha", reviewedHead: "aaaaaaa", substantive: true }],
    expected: "UNDECIDABLE",
    matches: [],
  },
  {
    label: "a missing recorded head is undecidable",
    projectId: "project-alpha",
    targetHead: HEAD_A,
    priors: [{ reviewId: "rv-1", round: 1, projectId: "project-alpha", reviewedHead: null, substantive: true }],
    expected: "UNDECIDABLE",
    matches: [],
  },
  {
    label: "a match wins over an undecidable one",
    projectId: "project-alpha",
    targetHead: HEAD_A,
    priors: [
      { reviewId: "rv-1", round: 1, projectId: "project-alpha", reviewedHead: null, substantive: true },
      { reviewId: "rv-2", round: 2, projectId: "project-alpha", reviewedHead: HEAD_A, substantive: true },
    ],
    expected: "SAME_HEAD_DUPLICATE",
    matches: [{ reviewId: "rv-2", round: 2 }],
  },
];

// --- Revalidation permission -------------------------------------------------------------------

export const CONTRACT_INVALIDATION_REASONS = [
  "HEAD_CHANGED",
  "BASE_CHANGED",
  "TARGET_BLOB_CHANGED",
  "RELEVANT_CONTRACT_CHANGED",
  "EXECUTION_ENVIRONMENT_CHANGED",
] as const;

export const REVALIDATION_TABLE: {
  label: string;
  duplicate: string;
  reason: string | null;
  explanation: string | null;
  expected: string;
}[] = [
  { label: "no duplicate at all", duplicate: "NO_DUPLICATE", reason: null, explanation: null, expected: "NO_DUPLICATE" },
  {
    label: "a duplicate with no reason is blocked",
    duplicate: "SAME_HEAD_DUPLICATE",
    reason: null,
    explanation: null,
    expected: "DUPLICATE_BLOCKED",
  },
  {
    label: "an explanation without a reason code is still blocked",
    duplicate: "SAME_HEAD_DUPLICATE",
    reason: null,
    explanation: "the reviewer asked me to look again",
    expected: "DUPLICATE_BLOCKED",
  },
  {
    label: "a changed contract allows the revalidation",
    duplicate: "SAME_HEAD_DUPLICATE",
    reason: "RELEVANT_CONTRACT_CHANGED",
    explanation: null,
    expected: "REVALIDATION_ALLOWED",
  },
  {
    label: "a changed base allows it",
    duplicate: "SAME_HEAD_DUPLICATE",
    reason: "BASE_CHANGED",
    explanation: "base moved to a new main",
    expected: "REVALIDATION_ALLOWED",
  },
  {
    label: "a changed blob allows it",
    duplicate: "SAME_HEAD_DUPLICATE",
    reason: "TARGET_BLOB_CHANGED",
    explanation: null,
    expected: "REVALIDATION_ALLOWED",
  },
  {
    label: "a changed environment allows it",
    duplicate: "SAME_HEAD_DUPLICATE",
    reason: "EXECUTION_ENVIRONMENT_CHANGED",
    explanation: null,
    expected: "REVALIDATION_ALLOWED",
  },
  {
    label: "HEAD_CHANGED contradicts a same-head duplicate and does not unlock it",
    duplicate: "SAME_HEAD_DUPLICATE",
    reason: "HEAD_CHANGED",
    explanation: null,
    expected: "DUPLICATE_BLOCKED",
  },
  {
    label: "an undecidable duplicate is not permission",
    duplicate: "UNDECIDABLE",
    reason: "RELEVANT_CONTRACT_CHANGED",
    explanation: null,
    expected: "UNDECIDABLE",
  },
];

// --- Evidence reuse -----------------------------------------------------------------------------

export const CONTRACT_EVIDENCE_STATUSES = ["REUSABLE", "RECHECK_REQUIRED", "UNAVAILABLE"] as const;

export const EVIDENCE_TABLE: {
  label: string;
  currentHead: string | null;
  invalidationReasons: string[];
  item: {
    id: string;
    source: string;
    boundHead: string | null;
    boundBase: string | null;
    capturedAt: string | null;
    blobBound: boolean;
    contractBound: boolean;
    environmentBound: boolean;
  };
  expected: string;
  reason: string;
}[] = [
  {
    label: "bound to this head, nothing invalidated",
    currentHead: HEAD_A,
    invalidationReasons: [],
    item: {
      id: "e1",
      source: "INDEPENDENT_REVIEW_RESULT",
      boundHead: HEAD_A,
      boundBase: null,
      capturedAt: "2026-09-20T10:00:00.000Z",
      blobBound: false,
      contractBound: false,
      environmentBound: false,
    },
    expected: "REUSABLE",
    reason: "SHA_BOUND",
  },
  {
    label: "bound to another head",
    currentHead: HEAD_A,
    invalidationReasons: [],
    item: {
      id: "e2",
      source: "INDEPENDENT_REVIEW_RESULT",
      boundHead: HEAD_B,
      boundBase: null,
      capturedAt: "2026-09-19T10:00:00.000Z",
      blobBound: false,
      contractBound: false,
      environmentBound: false,
    },
    expected: "RECHECK_REQUIRED",
    reason: "BOUND_TO_ANOTHER_HEAD",
  },
  {
    label: "no binding recorded is never assumed reusable",
    currentHead: HEAD_A,
    invalidationReasons: [],
    item: {
      id: "e3",
      source: "PRIOR_RUN_EVIDENCE",
      boundHead: null,
      boundBase: null,
      capturedAt: null,
      blobBound: false,
      contractBound: false,
      environmentBound: false,
    },
    expected: "UNAVAILABLE",
    reason: "NO_BINDING",
  },
  {
    label: "an uncomparable head is unavailable, not reusable",
    currentHead: null,
    invalidationReasons: [],
    item: {
      id: "e4",
      source: "GIT_OBSERVATION",
      boundHead: HEAD_A,
      boundBase: null,
      capturedAt: "2026-09-20T10:00:00.000Z",
      blobBound: false,
      contractBound: false,
      environmentBound: false,
    },
    expected: "UNAVAILABLE",
    reason: "HEAD_NOT_COMPARABLE",
  },
  {
    label: "a contract change only touches contract-bound evidence",
    currentHead: HEAD_A,
    invalidationReasons: ["RELEVANT_CONTRACT_CHANGED"],
    item: {
      id: "e5",
      source: "PRIOR_RUN_EVIDENCE",
      boundHead: HEAD_A,
      boundBase: null,
      capturedAt: "2026-09-20T10:00:00.000Z",
      blobBound: false,
      contractBound: true,
      environmentBound: false,
    },
    expected: "RECHECK_REQUIRED",
    reason: "RELEVANT_CONTRACT_CHANGED",
  },
  {
    label: "…and leaves the rest alone",
    currentHead: HEAD_A,
    invalidationReasons: ["RELEVANT_CONTRACT_CHANGED"],
    item: {
      id: "e6",
      source: "PRIOR_RUN_EVIDENCE",
      boundHead: HEAD_A,
      boundBase: null,
      capturedAt: "2026-09-20T10:00:00.000Z",
      blobBound: false,
      contractBound: false,
      environmentBound: false,
    },
    expected: "REUSABLE",
    reason: "SHA_BOUND",
  },
  {
    label: "an environment change only touches environment-bound evidence",
    currentHead: HEAD_A,
    invalidationReasons: ["EXECUTION_ENVIRONMENT_CHANGED"],
    item: {
      id: "e7",
      source: "PRIOR_RUN_EVIDENCE",
      boundHead: HEAD_A,
      boundBase: null,
      capturedAt: "2026-09-20T10:00:00.000Z",
      blobBound: false,
      contractBound: false,
      environmentBound: true,
    },
    expected: "RECHECK_REQUIRED",
    reason: "EXECUTION_ENVIRONMENT_CHANGED",
  },
  {
    label: "a base change touches base-bound evidence",
    currentHead: HEAD_A,
    invalidationReasons: ["BASE_CHANGED"],
    item: {
      id: "e8",
      source: "PRIOR_RUN_EVIDENCE",
      boundHead: HEAD_A,
      boundBase: HEAD_B,
      capturedAt: "2026-09-20T10:00:00.000Z",
      blobBound: false,
      contractBound: false,
      environmentBound: false,
    },
    expected: "RECHECK_REQUIRED",
    reason: "BASE_CHANGED",
  },
  {
    label: "a blob change touches blob-bound evidence",
    currentHead: HEAD_A,
    invalidationReasons: ["TARGET_BLOB_CHANGED"],
    item: {
      id: "e9",
      source: "INDEPENDENT_REVIEW_RESULT",
      boundHead: HEAD_A,
      boundBase: null,
      capturedAt: "2026-09-20T10:00:00.000Z",
      blobBound: true,
      contractBound: false,
      environmentBound: false,
    },
    expected: "RECHECK_REQUIRED",
    reason: "TARGET_BLOB_CHANGED",
  },
  {
    label: "a short bound head that prefixes the current one is still bound to it",
    currentHead: HEAD_A,
    invalidationReasons: [],
    item: {
      id: "e10",
      source: "HUMAN_RECORDED_HEAD",
      boundHead: "aaaaaaa",
      boundBase: null,
      capturedAt: "2026-09-20T10:00:00.000Z",
      blobBound: false,
      contractBound: false,
      environmentBound: false,
    },
    expected: "REUSABLE",
    reason: "SHA_BOUND",
  },
];
