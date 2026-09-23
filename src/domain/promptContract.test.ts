import { describe, expect, it } from "vitest";
import { EVIDENCE_REASONS, EVIDENCE_SOURCES, EVIDENCE_STATUSES } from "./evidenceReuse";
import type { Project } from "./project";
import { buildResolutionFollowup, buildReviewRequest } from "./prompt";
import { createReviewSession, emptyReviewForm, type ReviewSession } from "./review";
import { INVALIDATION_REASONS } from "./revalidation";
import { RISK_TIERS, TIER_2_SUBJECTS } from "./riskTier";
import { applyReviewAction, type ReviewAction } from "./transitions";

/**
 * The prompt contract of Phase 3, checked against the canonical structure rather than against the
 * implementation's own tables.
 *
 * The oracle is written out here by hand: the canonical headings, the two narrative items that must
 * never reach Turn 1, the Material Facts categories that must never be withheld from it, and a
 * parity reading that compares the two languages line by line — the same kind of line, the same
 * recorded values in it, the same placeholders, and the same imperative strength.
 */

const NOW = "2026-01-01T00:00:00.000Z";
const FULL_HEAD = "0123456789abcdef0123456789abcdef01234567";
const OTHER_HEAD = "fedcba9876543210fedcba9876543210fedcba98";

const project: Project = {
  projectId: "project-alpha",
  displayName: "Project Alpha",
  repositoryUrl: "https://github.com/example-org/project-alpha",
  localRoot: "C:\\example\\secret-local-root",
  developmentIde: "Claude Code",
  nextAction: "PRIVATE-NEXT-ACTION",
  notes: "PRIVATE-NOTES",
  createdAt: NOW,
  updatedAt: NOW,
};

const VERDICT_NOTE = "VERDICT-NOTE-SENTINEL: already fixed the parser";
const REVALIDATION_EXPLANATION = "REVALIDATION-SENTINEL: the base moved";

function apply(session: ReviewSession, actions: readonly ReviewAction[]): ReviewSession {
  let current = session;
  for (const action of actions) {
    const out = applyReviewAction(current, action, NOW);
    if (!out.ok) throw new Error(`${action.type}: ${JSON.stringify(out.error)}`);
    current = out.value.session;
  }
  return current;
}

function firstRound(expectedHead = FULL_HEAD): ReviewSession {
  const created = createReviewSession(
    { ...emptyReviewForm("project-alpha"), prNumber: "45", expectedHead, nextAction: "SESSION-NEXT-ACTION" },
    new Set(["project-alpha"]),
    "rv-20260101-alpha1",
    NOW,
  );
  if (!created.ok) throw new Error(JSON.stringify(created.error));
  return apply(created.value.session, [
    { type: "setRiskTier", riskTier: "TIER_2", subjects: ["SECURITY"], confirmedByHuman: true },
  ]);
}

/** R1 reviewed and sent back for fixes, R2 opened on the same head with a recorded reason and evidence. */
function secondRound(): ReviewSession {
  const r1 = apply(firstRound(), [
    { type: "markReady" },
    { type: "startReview" },
    { type: "captureResult", reviewedHead: FULL_HEAD },
    { type: "confirmVerdict", verdict: "FIX_REQUIRED", note: VERDICT_NOTE, confirmedByHuman: true },
    { type: "startNextRound", expectedHead: FULL_HEAD },
  ]);
  return apply(r1, [
    { type: "recordRevalidation", reason: "BASE_CHANGED", priorReviews: [{ reviewId: r1.reviewSessionId, round: 1 }], explanation: REVALIDATION_EXPLANATION },
    {
      type: "recordEvidenceDecisions",
      decisions: [
        { id: "e-1", source: "INDEPENDENT_REVIEW_RESULT", boundHead: FULL_HEAD, capturedAt: NOW, status: "REUSABLE", reason: "SHA_BOUND" },
        { id: "e-2", source: "PRIOR_RUN_EVIDENCE", boundHead: OTHER_HEAD, capturedAt: null, status: "RECHECK_REQUIRED", reason: "BASE_CHANGED" },
      ],
    },
  ]);
}

function headings(text: string): string[] {
  return text.split("\n").filter((line) => line.startsWith("#"));
}

/** The text of one section: from its heading to the next heading of the same or a higher level. */
function section(text: string, heading: RegExp): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => heading.test(line));
  if (start < 0) throw new Error(`no heading ${heading}`);
  const level = /^#+/.exec(lines[start])![0].length;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#+ /.test(line) && /^#+/.exec(line)![0].length <= level);
  return [lines[start], ...(end < 0 ? rest : rest.slice(0, end))].join("\n");
}

// --- canonical structure -------------------------------------------------------------------------

describe("Turn 1 follows the canonical Stage 1 / Stage 2 structure", () => {
  const cases = [
    {
      locale: "ja" as const,
      expected: [
        /^# .*Turn 1 — Initial Review Request/,
        /^## Stage 1 — Review Target（Artifact \+ Contract \+ Material Facts）$/,
        /^### Artifact（/,
        /^### Contract（/,
        /^### Material Facts（/,
        /^## Stage 2 — Fresh Assessment（/,
      ],
    },
    {
      locale: "en" as const,
      expected: [
        /^# .*Turn 1 — Initial Review Request/,
        /^## Stage 1 — Review Target \(Artifact \+ Contract \+ Material Facts\)$/,
        /^### Artifact$/,
        /^### Contract$/,
        /^### Material Facts \(/,
        /^## Stage 2 — Fresh Assessment \(/,
      ],
    },
  ];

  it.each(cases)("has exactly the canonical headings, in order ($locale)", ({ locale, expected }) => {
    for (const session of [firstRound(), secondRound()]) {
      const found = headings(buildReviewRequest(project, session, locale));
      expect(found).toHaveLength(expected.length);
      found.forEach((line, index) => expect(line).toMatch(expected[index]));
    }
  });

  it.each(["ja", "en"] as const)("never uses the pre-Phase-3 heading layout (%s)", (locale) => {
    const text = buildReviewRequest(project, firstRound(), locale);
    expect(text).not.toMatch(/^## Stage 1 — Artifact/m);
    expect(text).not.toMatch(/^## Contract/m);
    expect(text).not.toMatch(/^## Material Facts/m);
  });

  it.each(["ja", "en"] as const)("Turn 2 is Stage 3 then Stage 4 (%s)", (locale) => {
    const found = headings(buildResolutionFollowup(project, firstRound(), locale));
    expect(found).toHaveLength(3);
    expect(found[0]).toMatch(/^# .*Turn 2/);
    expect(found[1]).toMatch(/^## Stage 3 — Resolution Context/);
    expect(found[2]).toMatch(/^## Stage 4 — Final Judgment/);
  });
});

// --- the anchoring boundary ----------------------------------------------------------------------

/** Canonical input items 7 and 8, and the narrative the canonical text lists with them. */
const NARRATIVE_MARKERS = [
  "背景・目的",
  "すでに決まっている方針",
  "実装経緯",
  "設計理由",
  "修正済み",
  "Background and purpose",
  "Decisions already taken",
  "implementation history",
  "design reason",
  "already fixed",
];

describe("the implementation narrative never reaches Turn 1", () => {
  it.each(["ja", "en"] as const)("items 7 and 8 are absent from Turn 1 (%s)", (locale) => {
    for (const session of [firstRound(), secondRound()]) {
      const text = buildReviewRequest(project, session, locale);
      for (const marker of NARRATIVE_MARKERS) expect(text).not.toContain(marker);
    }
  });

  it.each(["ja", "en"] as const)("items 7 and 8 are asked for in Turn 2, and a supplied narrative appears there verbatim (%s)", (locale) => {
    const placeholder = buildResolutionFollowup(project, firstRound(), locale);
    expect(placeholder).toMatch(locale === "ja" ? /背景・目的/ : /Background and purpose/);
    expect(placeholder).toMatch(locale === "ja" ? /すでに決まっている方針・実装経緯/ : /implementation history/);

    const narrative = { background: "BACKGROUND-SENTINEL", decisions: "DECISIONS-SENTINEL\nsecond line", tradeoffs: "TRADEOFF-SENTINEL" };
    const text = buildResolutionFollowup(project, firstRound(), locale, narrative);
    expect(text).toContain("BACKGROUND-SENTINEL");
    expect(text).toContain("  DECISIONS-SENTINEL");
    expect(text).toContain("  second line");
    expect(text).toContain("TRADEOFF-SENTINEL");
    // Only inside Stage 3, never under the Final Judgment instructions.
    const stage4 = section(text, /^## Stage 4/);
    expect(stage4).not.toContain("SENTINEL");
  });

  it.each(["ja", "en"] as const)("the Human's words about the previous round travel only in Turn 2 (%s)", (locale) => {
    const session = secondRound();
    const turn1 = buildReviewRequest(project, session, locale);
    expect(turn1).not.toContain("VERDICT-NOTE-SENTINEL");
    expect(turn1).not.toContain("REVALIDATION-SENTINEL");
    const turn2 = section(buildResolutionFollowup(project, session, locale), /^## Stage 3/);
    expect(turn2).toContain(VERDICT_NOTE);
    expect(turn2).toContain(REVALIDATION_EXPLANATION);
  });

  it.each(["ja", "en"] as const)("local and private context is in neither turn (%s)", (locale) => {
    for (const session of [firstRound(), secondRound()]) {
      for (const text of [buildReviewRequest(project, session, locale), buildResolutionFollowup(project, session, locale)]) {
        expect(text).not.toContain("secret-local-root");
        expect(text).not.toContain("PRIVATE-NOTES");
        expect(text).not.toContain("PRIVATE-NEXT-ACTION");
        expect(text).not.toContain("SESSION-NEXT-ACTION");
      }
    }
  });
});

describe("Material Facts are disclosed from Turn 1, not hidden for a fresh context", () => {
  const categories = {
    ja: ["既知のリスク・制限事項", "失敗しているテスト", "セキュリティ上の制約", "破壊的操作に関する制約", "スコープ除外", "未解決のissue", "Human Gate"],
    en: ["Known risks and limitations", "Failing tests", "Security constraints", "Destructive-operation constraints", "Scope exclusions", "Unresolved issues", "Human Gate"],
  };

  it.each(["ja", "en"] as const)("every canonical category is asked for under Material Facts (%s)", (locale) => {
    for (const session of [firstRound(), secondRound()]) {
      const facts = section(buildReviewRequest(project, session, locale), /^### Material Facts/);
      for (const category of categories[locale]) expect(facts).toContain(`- ${category}`);
    }
  });

  it.each(["ja", "en"] as const)("the Risk Tier and its Tier 2 subjects are stated in the Contract (%s)", (locale) => {
    const contract = section(buildReviewRequest(project, firstRound(), locale), /^### Contract/);
    expect(contract).toContain("- Risk Tier: TIER_2");
    expect(contract).toContain("- Tier 2 subjects: SECURITY");
  });
});

describe("a re-review states its relation to the previous round as facts only", () => {
  it.each(["ja", "en"] as const)("Turn 1 of R2 carries the previous round's recorded facts (%s)", (locale) => {
    const facts = section(buildReviewRequest(project, secondRound(), locale), /^### Material Facts/);
    expect(facts).toContain("R1");
    expect(facts).toContain(FULL_HEAD);
    expect(facts).toContain("FIX_REQUIRED");
    expect(facts).toContain("result-r1.md");
    expect(facts).toContain("REUSABLE · INDEPENDENT_REVIEW_RESULT");
    expect(facts).toContain("RECHECK_REQUIRED · PRIOR_RUN_EVIDENCE");
    expect(facts).toContain("BASE_CHANGED");
    expect(facts).toContain("Human Gate");
    // The re-check list holds exactly the items that are not reusable.
    expect(facts.split("\n").filter((line) => line.startsWith("  - RECHECK_REQUIRED"))).toHaveLength(2);
    expect(facts.split("\n").filter((line) => line.startsWith("  - REUSABLE"))).toHaveLength(1);
  });

  it.each(["ja", "en"] as const)("an unconfirmed previous verdict is not reported as one (%s)", (locale) => {
    const session = secondRound();
    const unconfirmed: ReviewSession = {
      ...session,
      rounds: [{ ...session.rounds[0], verdictConfirmedAt: null }, session.rounds[1]],
    };
    const facts = section(buildReviewRequest(project, unconfirmed, locale), /^### Material Facts/);
    expect(facts).not.toContain("FIX_REQUIRED");
    expect(facts).toContain(locale === "ja" ? "未確定" : "not confirmed");
  });
});

// --- JA / EN semantic parity --------------------------------------------------------------------

/** Recorded values that never change with the language. */
const CODES = [
  ...EVIDENCE_STATUSES,
  ...EVIDENCE_SOURCES,
  ...EVIDENCE_REASONS,
  ...RISK_TIERS,
  ...TIER_2_SUBJECTS,
  ...INVALIDATION_REASONS,
  "FIX_REQUIRED",
  "REVIEW_PASS",
  "BLOCKED",
  "NOT EXACT",
  "EXACT",
];

/** Words for an absent value, which differ by language but mean the same thing. */
const ABSENT: Record<string, string> = {
  未記録: "<unrecorded>",
  "not recorded": "<unrecorded>",
  "なし（初回Round）": "<first>",
  "none (first round)": "<first>",
  該当なし: "<n/a>",
  "not applicable": "<n/a>",
  未確定: "<unconfirmed>",
  "not confirmed": "<unconfirmed>",
};

function neutralTokens(line: string): string[] {
  const patterns = [
    /https?:\/\/\S+/g,
    /\b[0-9a-f]{40}\b/g,
    /\b[0-9a-f]{7,39}\b/g,
    /#\d+/g,
    /\bR\d+\b/g,
    /\b[a-z]+-r\d+(?:-previous-\d+)?\.md\b/g,
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g,
    /[A-Z]+-SENTINEL/g,
  ];
  const found: { at: number; token: string }[] = [];
  for (const pattern of patterns) for (const match of line.matchAll(pattern)) found.push({ at: match.index ?? 0, token: match[0] });
  // Codes are matched longest first so that NOT EXACT is not also read as EXACT.
  let rest = line;
  for (const code of [...CODES].sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(`(?<![A-Z_])${code}(?![A-Z_0-9])`, "g");
    for (const match of rest.matchAll(pattern)) {
      found.push({ at: match.index ?? 0, token: code });
      rest = rest.slice(0, match.index) + " ".repeat(code.length) + rest.slice((match.index ?? 0) + code.length);
    }
  }
  for (const [word, token] of Object.entries(ABSENT)) {
    const index = line.indexOf(word);
    if (index >= 0) found.push({ at: index, token });
  }
  if (line.includes("<!--")) found.push({ at: line.indexOf("<!--"), token: "<human>" });
  return found.sort((a, b) => a.at - b.at).map((entry) => entry.token);
}

function kind(line: string): string {
  if (line === "") return "blank";
  const heading = /^(#+) /.exec(line);
  if (heading) return `h${heading[1].length}`;
  if (line.startsWith("  - ")) return "item";
  if (line.startsWith("- ")) return "bullet";
  if (line.startsWith("  ")) return "continuation";
  return "text";
}

/** Imperative strength: an unconditional requirement is marked the same way in both languages. */
function strength(line: string, locale: "ja" | "en"): number {
  return locale === "ja" ? (line.match(/必ず/g) ?? []).length : (line.match(/\byou must\b/gi) ?? []).length;
}

function assertParity(ja: string, en: string) {
  const jaLines = ja.split("\n");
  const enLines = en.split("\n");
  expect(jaLines.map(kind)).toEqual(enLines.map(kind));
  jaLines.forEach((jaLine, index) => {
    const enLine = enLines[index];
    expect(neutralTokens(jaLine), `line ${index + 1}: ${jaLine} / ${enLine}`).toEqual(neutralTokens(enLine));
    expect(strength(jaLine, "ja"), `imperative strength, line ${index + 1}`).toBe(strength(enLine, "en"));
  });
}

describe("JA and EN say the same thing with the same force", () => {
  const scenarios = {
    "Turn 1, first round, exact head": () => buildReviewRequest(project, firstRound(), "ja") + "\u0000" + buildReviewRequest(project, firstRound(), "en"),
    "Turn 1, first round, short head": () =>
      buildReviewRequest(project, firstRound("abcdef1"), "ja") + "\u0000" + buildReviewRequest(project, firstRound("abcdef1"), "en"),
    "Turn 1, re-review": () => buildReviewRequest(project, secondRound(), "ja") + "\u0000" + buildReviewRequest(project, secondRound(), "en"),
    "Turn 2, first round": () =>
      buildResolutionFollowup(project, firstRound(), "ja") + "\u0000" + buildResolutionFollowup(project, firstRound(), "en"),
    "Turn 2, re-review with a narrative": () => {
      const narrative = { background: "BACKGROUND-SENTINEL", decisions: "DECISIONS-SENTINEL" };
      return (
        buildResolutionFollowup(project, secondRound(), "ja", narrative) + "\u0000" + buildResolutionFollowup(project, secondRound(), "en", narrative)
      );
    },
  };

  it.each(Object.entries(scenarios))("%s", (_name, build) => {
    const [ja, en] = build().split("\u0000");
    assertParity(ja, en);
  });

  it("the parity reading would notice a missing requirement (self-check)", () => {
    const ja = buildResolutionFollowup(project, firstRound(), "ja");
    const en = buildResolutionFollowup(project, firstRound(), "en");
    const weakened = ja.replace("必ず", "");
    expect(() => assertParity(weakened, en)).toThrow();
    const shortened = ja
      .split("\n")
      .filter((line) => !line.includes("最終判断を同じ出力形式"))
      .join("\n");
    expect(() => assertParity(shortened, en)).toThrow();
  });

  it.each(["ja", "en"] as const)("Turn 2 asks for a Final Judgment that leaves the Fresh Assessment untouched (%s)", (locale) => {
    const stage4 = section(buildResolutionFollowup(project, firstRound(), locale), /^## Stage 4/);
    const bullets = stage4.split("\n").filter((line) => line.startsWith("- "));
    expect(bullets).toHaveLength(5);
    expect(stage4).toMatch(locale === "ja" ? /Fresh Assessmentは書き換えずに/ : /without rewriting it/);
    expect(stage4).toMatch(locale === "ja" ? /変更の根拠となった追加Evidence/ : /name the added Evidence that changed it/);
    expect(stage4).toMatch(locale === "ja" ? /最終判断を同じ出力形式/ : /final judgment in the same output format/);
  });
});
