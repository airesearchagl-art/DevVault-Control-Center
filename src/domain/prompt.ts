import { DEFAULT_LOCALE, type Locale } from "../i18n/locale";
import type { Project } from "./project";
import { currentRound, type ReviewSession } from "./review";
import { pullRequestUrl } from "./validation";

/**
 * The DevVault AI Review Request (Artifact / Contract / Material Facts / Fresh Assessment), in the
 * language the Human is working in. The full two-turn workflow is Phase 3.
 *
 * This is a document, not interface chrome: it is written once, handed to a reviewer and kept as
 * `request-r<N>.md`, so its two versions live here rather than in the dictionaries, and a saved
 * request is never rewritten when the interface language changes.
 *
 * Both versions carry exactly the same facts, in the same order, with the same values. Deliberately
 * excluded from both: local root, project notes and next action — local, private context and
 * implementation narrative do not belong in a fresh-context review request.
 */

const UNRECORDED: Record<Locale, string> = { ja: "未記録", en: "not recorded" };
const NO_PREVIOUS_ROUND: Record<Locale, string> = { ja: "なし（初回Round）", en: "none (first round)" };
const HUMAN_FILLS: Record<Locale, string> = { ja: "<!-- Humanが記入 -->", en: "<!-- filled in by the Human -->" };

interface RequestFacts {
  project: string;
  repository: string;
  pullRequest: string;
  expectedHead: string;
  round: number;
  reviewType: string;
  previousVerdict: string;
}

function facts(project: Project, session: ReviewSession, locale: Locale): RequestFacts {
  const round = currentRound(session);
  const previous = session.rounds.length > 1 ? session.rounds[session.rounds.length - 2] : null;
  const unrecorded = UNRECORDED[locale];
  return {
    project: `${project.displayName} (${project.projectId})`,
    repository: project.repositoryUrl ?? unrecorded,
    pullRequest:
      session.prNumber === null
        ? unrecorded
        : project.repositoryUrl !== null
          ? `#${session.prNumber} — ${pullRequestUrl(project.repositoryUrl, session.prNumber)}`
          : `#${session.prNumber}`,
    expectedHead: round.expectedHead ?? unrecorded,
    round: session.reviewRound,
    reviewType: session.reviewType,
    previousVerdict:
      previous === null ? NO_PREVIOUS_ROUND[locale] : `R${previous.round}: ${previous.verdict ?? unrecorded}`,
  };
}

function japanese(project: Project, f: RequestFacts): string {
  const human = HUMAN_FILLS.ja;
  return [
    `# 独立レビュー依頼 — ${project.displayName} / R${f.round}`,
    "",
    "## Stage 1 — Artifact（対象）",
    "",
    `- プロジェクト: ${f.project}`,
    `- リポジトリ: ${f.repository}`,
    `- Pull Request: ${f.pullRequest}`,
    `- レビュー予定HEAD: ${f.expectedHead}`,
    `- ラウンド: R${f.round}`,
    `- レビュー種別: ${f.reviewType}`,
    "",
    "## Contract（前提）",
    "",
    `- レビュー範囲（変更してよい範囲 / 変更してはいけない範囲）: ${human}`,
    `- レビュー観点: ${human}`,
    "- 期待する出力: 総評 / 良い点 / 修正必須 / 修正推奨 / 後回しでよい改善 / リスク・注意点 / 次にLLM IDEへ渡すべき指示 / Obsidianに記録すべき判断",
    "",
    "## Material Facts（事実）",
    "",
    `- 前ラウンドの判定: ${f.previousVerdict}`,
    `- 既知の課題 / 制約 / Human Gate: ${human}`,
    "",
    "## Stage 2 — Fresh Assessment（独立評価）",
    "",
    "- 実装者の説明ではなく、Artifact（実際のdiff / HEAD）とContractから独立して判断してください。",
    "- 各指摘について根拠となるEvidenceを明示し、確認できない点は推測で補わず「未確認」と記載してください。",
    "- 回答の冒頭に、実際にReviewしたHEAD（Reviewed HEAD）を明記してください。",
    "",
  ].join("\n");
}

function english(project: Project, f: RequestFacts): string {
  const human = HUMAN_FILLS.en;
  return [
    `# Independent Review Request — ${project.displayName} / R${f.round}`,
    "",
    "## Stage 1 — Artifact",
    "",
    `- Project: ${f.project}`,
    `- Repository: ${f.repository}`,
    `- Pull Request: ${f.pullRequest}`,
    `- Expected HEAD: ${f.expectedHead}`,
    `- Review Round: R${f.round}`,
    `- Review Type: ${f.reviewType}`,
    "",
    "## Contract",
    "",
    `- Review scope (what may change / what must not): ${human}`,
    `- Review perspective: ${human}`,
    "- Desired output: overall assessment / what is good / required fixes / recommended fixes / improvements that can wait / risks and cautions / instructions to hand to the LLM IDE next / decisions worth recording in Obsidian",
    "",
    "## Material Facts",
    "",
    `- Previous round verdict: ${f.previousVerdict}`,
    `- Known issues / constraints / Human Gate: ${human}`,
    "",
    "## Stage 2 — Fresh Assessment",
    "",
    "- Judge from the Artifact (the actual diff / HEAD) and the Contract, independently of what the implementer says about it.",
    "- Give the Evidence behind each finding; where you cannot confirm something, write that it is unverified rather than filling the gap with a guess.",
    "- State the HEAD you actually reviewed (Reviewed HEAD) at the top of your answer.",
    "",
  ].join("\n");
}

export function buildReviewRequest(project: Project, session: ReviewSession, locale: Locale = DEFAULT_LOCALE): string {
  const f = facts(project, session, locale);
  return locale === "en" ? english(project, f) : japanese(project, f);
}
