import { DEFAULT_LOCALE, type Locale } from "../i18n/locale";
import type { RoundEvidenceDecision } from "./review";
import { headBinding, type HeadBinding } from "./headBinding";
import type { Project } from "./project";
import { currentRound, type ReviewSession } from "./review";
import { latestResponse } from "./handoff";
import { pullRequestUrl } from "./validation";

/**
 * The two Fresh-Context messages of the canonical review protocol, in the language the Human is
 * working in (`02_Prompts/AI_Review/AI_Review_Request_Prompt.md` at obsidian-vault main `77ce41e`):
 *
 * - Turn 1 — Initial Review Request: `Stage 1 — Review Target` (Artifact / Contract / Material
 *   Facts) and `Stage 2 — Fresh Assessment`.
 * - Turn 2 — Resolution Follow-up: `Stage 3 — Resolution Context` and `Stage 4 — Final Judgment`.
 *
 * These are documents, not interface chrome: each is written once, handed to a reviewer and kept as
 * `request-r<N>.md` / `followup-r<N>.md`, so both versions live here rather than in the
 * dictionaries. A saved file is never regenerated: a request written by an earlier version keeps its
 * old headings, and only a newly generated one uses this structure.
 *
 * The anchoring boundary. Turn 1 never carries the implementation narrative — background and
 * purpose, decisions already taken, the implementation history, design reasons, or any
 * "already fixed" self-assessment (canonical input items 7 and 8). The Human's own words about a
 * previous round (the verdict note, the explanation of a revalidation) are narrative too, so they
 * travel only in Turn 2. What Turn 1 must *not* hide is the Material Facts: known risks,
 * limitations, failing tests, security and destructive-operation constraints, scope exclusions,
 * unresolved issues and Human Gate items are asked for from the start, and a re-review states its
 * relation to the previous round as recorded facts only.
 *
 * Both languages carry exactly the same facts, in the same order, with the same values; recorded
 * codes (verdicts, tiers, evidence statuses and reasons) are shown as the codes they are, so a value
 * is never translated into something else. Deliberately excluded from both: the local root, the
 * project notes and the next action — local, private context never goes into a review request.
 */

const UNRECORDED: Record<Locale, string> = { ja: "未記録", en: "not recorded" };
const NONE: Record<Locale, string> = { ja: "なし", en: "none" };
const NOT_APPLICABLE: Record<Locale, string> = { ja: "該当なし", en: "not applicable" };
const NOT_CONFIRMED: Record<Locale, string> = { ja: "未確定", en: "not confirmed" };
const NO_PREVIOUS_ROUND: Record<Locale, string> = { ja: "なし（初回Round）", en: "none (first round)" };
const HUMAN_FILLS: Record<Locale, string> = { ja: "<!-- Humanが記入 -->", en: "<!-- filled in by the Human -->" };

/** `- label: value`, or the label followed by the value indented when the value spans lines. */
function field(label: string, value: string): string[] {
  const lines = value.split(/\r?\n/);
  if (lines.length === 1) return [`- ${label}: ${value}`];
  return [`- ${label}:`, ...lines.map((line) => (line === "" ? "" : `  ${line}`))];
}

function evidenceLine(decision: RoundEvidenceDecision, locale: Locale): string {
  const unrecorded = UNRECORDED[locale];
  return `  - ${decision.status} · ${decision.source} · HEAD ${decision.boundHead ?? unrecorded} · ${decision.capturedAt ?? unrecorded} · ${decision.reason}`;
}

/** A labelled list of evidence decisions: `none`, or a count followed by one line per item. */
function evidenceBlock(label: string, decisions: readonly RoundEvidenceDecision[], locale: Locale): string[] {
  if (decisions.length === 0) return [`- ${label}: ${NONE[locale]}`];
  return [`- ${label} (${decisions.length}):`, ...decisions.map((decision) => evidenceLine(decision, locale))];
}

// --- Turn 1 -------------------------------------------------------------------------------------

interface ReReviewFacts {
  previousRound: number;
  previousReviewedHead: string;
  previousVerdict: string;
  previousResponse: string;
  evidence: RoundEvidenceDecision[];
  recheck: RoundEvidenceDecision[];
  revalidation: string;
}

interface RequestFacts {
  project: string;
  repository: string;
  pullRequest: string;
  targetHead: string;
  binding: HeadBinding;
  round: number;
  reviewType: string;
  riskTier: string;
  tierSubjects: string;
  /** `null` for a first round, which has nothing before it. */
  reReview: ReReviewFacts | null;
}

function facts(project: Project, session: ReviewSession, locale: Locale): RequestFacts {
  const round = currentRound(session);
  const previous = session.rounds.length > 1 ? session.rounds[session.rounds.length - 2] : null;
  const unrecorded = UNRECORDED[locale];
  let reReview: ReReviewFacts | null = null;
  if (previous !== null) {
    reReview = {
      previousRound: previous.round,
      previousReviewedHead: previous.reviewedHead ?? unrecorded,
      previousVerdict: previous.verdict !== null && previous.verdictConfirmedAt !== null ? previous.verdict : NOT_CONFIRMED[locale],
      previousResponse: latestResponse(previous)?.file ?? unrecorded,
      evidence: round.evidenceDecisions,
      recheck: round.evidenceDecisions.filter((decision) => decision.status !== "REUSABLE"),
      // The reason code only: the Human's explanation of it is narrative and belongs to Turn 2.
      revalidation: round.revalidation?.reason ?? NOT_APPLICABLE[locale],
    };
  }
  return {
    project: `${project.displayName} (${project.projectId})`,
    repository: project.repositoryUrl ?? unrecorded,
    pullRequest:
      session.prNumber === null
        ? unrecorded
        : project.repositoryUrl !== null
          ? `#${session.prNumber} — ${pullRequestUrl(project.repositoryUrl, session.prNumber)}`
          : `#${session.prNumber}`,
    targetHead: round.expectedHead ?? unrecorded,
    binding: headBinding(round.expectedHead),
    round: session.reviewRound,
    reviewType: session.reviewType,
    riskTier: round.riskTier ?? unrecorded,
    tierSubjects: round.riskTierSubjects.length === 0 ? NONE[locale] : round.riskTierSubjects.join(", "),
    reReview,
  };
}

const BINDING_JA: Record<HeadBinding, string> = {
  EXACT: "EXACT — 40文字のfull HEADに固定されたexact-head review依頼です",
  SHORT: "NOT EXACT — 短縮HEADしか記録されていないため、exact-head reviewとして扱わないでください",
  MISSING: "NOT EXACT — HEADが記録されていないため、exact-head reviewとして扱わないでください",
};

const BINDING_EN: Record<HeadBinding, string> = {
  EXACT: "EXACT — this is an exact-head review request, bound to the full 40-character HEAD",
  SHORT: "NOT EXACT — only a short HEAD is recorded, so do not treat this as an exact-head review",
  MISSING: "NOT EXACT — no HEAD is recorded, so do not treat this as an exact-head review",
};

function japanese(project: Project, f: RequestFacts): string {
  const human = HUMAN_FILLS.ja;
  const reReview = f.reReview;
  return [
    `# 独立レビュー依頼（Turn 1 — Initial Review Request） — ${project.displayName} / R${f.round}`,
    "",
    "## Stage 1 — Review Target（Artifact + Contract + Material Facts）",
    "",
    "### Artifact（レビュー対象）",
    "",
    `- プロジェクト: ${f.project}`,
    `- リポジトリ: ${f.repository}`,
    `- Pull Request: ${f.pullRequest}`,
    `- レビュー対象HEAD: ${f.targetHead}`,
    `- HEAD binding: ${BINDING_JA[f.binding]}`,
    `- ラウンド: R${f.round}`,
    `- レビュー種別: ${f.reviewType}`,
    "",
    "### Contract（評価基準）",
    "",
    `- Risk Tier: ${f.riskTier}`,
    `- Tier 2 subjects: ${f.tierSubjects}`,
    `- レビュー範囲（変更してよい範囲 / 変更してはいけない範囲）: ${human}`,
    `- レビュー観点: ${human}`,
    "- 期待する出力: 総評 / 良い点 / 修正必須 / 修正推奨 / 後回しでよい改善 / リスク・注意点 / 次にLLM IDE / Coding Agentへ渡すべき指示 / Obsidianに記録すべき判断",
    "",
    "### Material Facts（初回から開示。fresh-contextを理由に隠さない）",
    "",
    `- 既知のリスク・制限事項: ${human}`,
    `- 失敗しているテスト: ${human}`,
    `- セキュリティ上の制約: ${human}`,
    `- 破壊的操作に関する制約: ${human}`,
    `- スコープ除外: ${human}`,
    `- 未解決のissue: ${human}`,
    `- Human Gate必須事項: ${human}`,
    ...(reReview === null
      ? [`- 前ラウンド: ${NO_PREVIOUS_ROUND.ja}`]
      : [
          `- 前ラウンド: R${reReview.previousRound}`,
          `- 前ラウンドのReviewed HEAD: ${reReview.previousReviewedHead}`,
          `- 前ラウンドのHuman確定判定: ${reReview.previousVerdict}`,
          `- 前ラウンドの回答ファイル: ${reReview.previousResponse}`,
          `- 前ラウンドから未解決のRequired Fix / Human Gate: ${human}`,
          ...evidenceBlock("Evidence reuse判断", reReview.evidence, "ja"),
          ...evidenceBlock("再確認が必要なEvidence", reReview.recheck, "ja"),
          `- 同一HEADを再Reviewする失効理由: ${reReview.revalidation}`,
        ]),
    "",
    "## Stage 2 — Fresh Assessment（Reviewerへの指示）",
    "",
    "- 実装者の説明ではなく、Artifact（実際のdiff / HEAD）とContractから独立して判断してください。",
    "- Material Factsに挙げたリスク・制約・未解決事項・Human Gateは、必ず評価に含めてください。",
    "- 各指摘について根拠となるEvidenceを明示し、確認できない点は推測で補わず「未確認」と記載してください。",
    "- 回答の冒頭に、実際にReviewしたHEAD（Reviewed HEAD）を40文字のfull SHAで明記してください。",
    ...(reReview === null
      ? []
      : [
          "- 前ラウンドの指摘が解消済みだと仮定せず、現在のArtifactで確認してください。",
          "- REUSABLEのEvidenceは失効理由がない限り再実行せず、再確認が必要なEvidenceだけを再確認してください。",
        ]),
    "",
  ].join("\n");
}

function english(project: Project, f: RequestFacts): string {
  const human = HUMAN_FILLS.en;
  const reReview = f.reReview;
  return [
    `# Independent Review Request (Turn 1 — Initial Review Request) — ${project.displayName} / R${f.round}`,
    "",
    "## Stage 1 — Review Target (Artifact + Contract + Material Facts)",
    "",
    "### Artifact",
    "",
    `- Project: ${f.project}`,
    `- Repository: ${f.repository}`,
    `- Pull Request: ${f.pullRequest}`,
    `- Target HEAD: ${f.targetHead}`,
    `- HEAD binding: ${BINDING_EN[f.binding]}`,
    `- Review Round: R${f.round}`,
    `- Review Type: ${f.reviewType}`,
    "",
    "### Contract",
    "",
    `- Risk Tier: ${f.riskTier}`,
    `- Tier 2 subjects: ${f.tierSubjects}`,
    `- Review scope (what may change / what must not): ${human}`,
    `- Review perspective: ${human}`,
    "- Desired output: overall assessment / what is good / required fixes / recommended fixes / improvements that can wait / risks and cautions / instructions to hand to the LLM IDE / Coding Agent next / decisions worth recording in Obsidian",
    "",
    "### Material Facts (disclosed from the start; never withheld for the sake of a fresh context)",
    "",
    `- Known risks and limitations: ${human}`,
    `- Failing tests: ${human}`,
    `- Security constraints: ${human}`,
    `- Destructive-operation constraints: ${human}`,
    `- Scope exclusions: ${human}`,
    `- Unresolved issues: ${human}`,
    `- Human Gate items: ${human}`,
    ...(reReview === null
      ? [`- Previous round: ${NO_PREVIOUS_ROUND.en}`]
      : [
          `- Previous round: R${reReview.previousRound}`,
          `- Reviewed HEAD of the previous round: ${reReview.previousReviewedHead}`,
          `- Verdict the Human confirmed for the previous round: ${reReview.previousVerdict}`,
          `- Response file of the previous round: ${reReview.previousResponse}`,
          `- Required Fixes / Human Gate items still open from the previous round: ${human}`,
          ...evidenceBlock("Evidence reuse decisions", reReview.evidence, "en"),
          ...evidenceBlock("Evidence that must be re-checked", reReview.recheck, "en"),
          `- Invalidation reason for reviewing the same HEAD again: ${reReview.revalidation}`,
        ]),
    "",
    "## Stage 2 — Fresh Assessment (instructions to the reviewer)",
    "",
    "- Judge from the Artifact (the actual diff / HEAD) and the Contract, independently of what the implementer says about it.",
    "- You must take every risk, constraint, unresolved issue and Human Gate item listed under Material Facts into account.",
    "- Give the Evidence behind each finding; where you cannot confirm something, write that it is unverified rather than filling the gap with a guess.",
    "- State the HEAD you actually reviewed (Reviewed HEAD) as the full 40-character SHA at the top of your answer.",
    ...(reReview === null
      ? []
      : [
          "- Do not assume the previous round's findings are resolved; confirm them against the current Artifact.",
          "- Do not re-run REUSABLE evidence unless there is an invalidation reason; re-check only the evidence that must be re-checked.",
        ]),
    "",
  ].join("\n");
}

/**
 * Turn 1. A request whose target HEAD is not the full 40 characters is still generated — the
 * Phase 1 path keeps working — but it says in its own text that it is not an exact-head review, so
 * the two meanings can never be confused.
 */
export function buildReviewRequest(project: Project, session: ReviewSession, locale: Locale = DEFAULT_LOCALE): string {
  const f = facts(project, session, locale);
  return locale === "en" ? english(project, f) : japanese(project, f);
}

// --- Turn 2 -------------------------------------------------------------------------------------

/**
 * The implementation narrative the Human chose to share (canonical input items 7 and 8, plus the
 * trade-offs). Human words: inserted verbatim, never translated. Absent means the Human fills it in.
 */
export interface ResolutionNarrative {
  background?: string | null;
  decisions?: string | null;
  tradeoffs?: string | null;
}

interface FollowupFacts {
  round: number;
  project: string;
  reviewType: string;
  expectedHead: string;
  background: string | null;
  decisions: string | null;
  tradeoffs: string | null;
  /** Human words about the previous round; `null` for a first round. */
  previous: { round: number; verdictNote: string; revalidationExplanation: string } | null;
}

function supplied(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function followupFacts(project: Project, session: ReviewSession, locale: Locale, narrative: ResolutionNarrative): FollowupFacts {
  const round = currentRound(session);
  const previous = session.rounds.length > 1 ? session.rounds[session.rounds.length - 2] : null;
  return {
    round: session.reviewRound,
    project: `${project.displayName} (${project.projectId})`,
    reviewType: session.reviewType,
    expectedHead: round.expectedHead ?? UNRECORDED[locale],
    background: supplied(narrative.background),
    decisions: supplied(narrative.decisions),
    tradeoffs: supplied(narrative.tradeoffs),
    previous:
      previous === null
        ? null
        : {
            round: previous.round,
            verdictNote: previous.verdictNote ?? UNRECORDED[locale],
            revalidationExplanation: round.revalidation?.explanation ?? NOT_APPLICABLE[locale],
          },
  };
}

function japaneseFollowup(project: Project, f: FollowupFacts): string {
  const human = HUMAN_FILLS.ja;
  return [
    `# 解決フォローアップ（Turn 2） — ${project.displayName} / R${f.round}`,
    "",
    "初回のFresh Assessmentを受領しました。findingの解消とintent確認のため、ここで初めてimplementation narrativeを共有します。",
    "",
    "## Stage 3 — Resolution Context（implementation narrative）",
    "",
    `- プロジェクト: ${f.project}`,
    `- レビュー種別: ${f.reviewType}`,
    `- レビュー対象HEAD: ${f.expectedHead}`,
    ...field("背景・目的", f.background ?? human),
    ...field("すでに決まっている方針・実装経緯", f.decisions ?? human),
    ...field("known trade-offs / 過去の検討 / 関連する過去レビュー", f.tradeoffs ?? human),
    ...(f.previous === null
      ? []
      : [
          ...field(`R${f.previous.round}の判定に対するHumanのメモ`, f.previous.verdictNote),
          ...field("同一HEADを再Reviewする理由についてのHumanの説明", f.previous.revalidationExplanation),
        ]),
    "",
    "- このcontextは、findingの解消・矛盾の確認・intentの確認に使ってください。",
    "- 追加contextによって初回findingを変更してかまいませんが、どのfindingがどの追加Evidenceによって変わったのかを必ず区別して示してください。",
    "- このcontextとArtifactのEvidenceが矛盾する場合は、ArtifactのEvidenceを優先してください。",
    "",
    "## Stage 4 — Final Judgment（最終判断）",
    "",
    "- 初回のFresh Assessmentは書き換えずにそのまま残し、Final Judgmentは別の回答として返してください。",
    "- 初回のFresh Assessmentと本contextを統合し、最終判断を同じ出力形式で示してください。",
    "- 初回から変更した判断には、変更の根拠となった追加Evidenceを必ず明記してください。",
    "- 変更しなかった指摘は、追加contextを踏まえてもなお有効であることを示してください。",
    "- 回答の冒頭に、最終判断の対象としたHEAD（Reviewed HEAD）を40文字のfull SHAで明記してください。",
    "",
  ].join("\n");
}

function englishFollowup(project: Project, f: FollowupFacts): string {
  const human = HUMAN_FILLS.en;
  return [
    `# Resolution Follow-up (Turn 2) — ${project.displayName} / R${f.round}`,
    "",
    "Your initial Fresh Assessment has arrived. Here, for the first time, is the implementation narrative — for resolving findings and confirming intent.",
    "",
    "## Stage 3 — Resolution Context (implementation narrative)",
    "",
    `- Project: ${f.project}`,
    `- Review Type: ${f.reviewType}`,
    `- Reviewed HEAD: ${f.expectedHead}`,
    ...field("Background and purpose", f.background ?? human),
    ...field("Decisions already taken, and the implementation history", f.decisions ?? human),
    ...field("Known trade-offs / earlier considerations / related past reviews", f.tradeoffs ?? human),
    ...(f.previous === null
      ? []
      : [
          ...field(`The Human's note on the R${f.previous.round} verdict`, f.previous.verdictNote),
          ...field("The Human's explanation for reviewing the same HEAD again", f.previous.revalidationExplanation),
        ]),
    "",
    "- Use this context to resolve findings, check contradictions and confirm intent.",
    "- You may change an initial finding because of it, but you must show which findings changed and which added Evidence changed them.",
    "- Where this context and the Artifact's Evidence disagree, the Artifact's Evidence wins.",
    "",
    "## Stage 4 — Final Judgment",
    "",
    "- Leave your initial Fresh Assessment as it is, without rewriting it, and give the Final Judgment as a separate answer.",
    "- Combine your initial Fresh Assessment with this context and state your final judgment in the same output format.",
    "- For anything you changed from the initial assessment, you must name the added Evidence that changed it.",
    "- For anything you did not change, say that it still stands with this context in hand.",
    "- State the HEAD your final judgment is about (Reviewed HEAD) as the full 40-character SHA at the top of your answer.",
    "",
  ].join("\n");
}

/**
 * Turn 2. It carries what Turn 1 withheld on purpose and asks for the Final Judgment, which the
 * Human captures into `judgment-r<N>.md` beside — never over — the Fresh Assessment `result-r<N>.md`.
 */
export function buildResolutionFollowup(
  project: Project,
  session: ReviewSession,
  locale: Locale = DEFAULT_LOCALE,
  narrative: ResolutionNarrative = {},
): string {
  const f = followupFacts(project, session, locale, narrative);
  return locale === "en" ? englishFollowup(project, f) : japaneseFollowup(project, f);
}
