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
/**
 * Turn 2 — the Resolution Follow-up: the canonical Stage 3 + Stage 4 message.
 *
 * It goes out only after the Fresh Assessment has come back, and it carries what Turn 1 withheld on
 * purpose — the background and the implementation history, items 7 and 8 of the canonical input
 * list — then asks for the Final Judgment. Two rules travel with that context: say which findings
 * the added Evidence changed, and let the Artifact win wherever the narrative disagrees with it.
 *
 * Like the request, this is a document rather than interface chrome, so both languages live here
 * and a saved follow-up is never rewritten when the interface language changes.
 */

interface FollowupFacts {
  round: number;
  project: string;
  reviewType: string;
  expectedHead: string;
}

function followupFacts(project: Project, session: ReviewSession, locale: Locale): FollowupFacts {
  const round = currentRound(session);
  return {
    round: session.reviewRound,
    project: `${project.displayName} (${project.projectId})`,
    reviewType: session.reviewType,
    expectedHead: round.expectedHead ?? UNRECORDED[locale],
  };
}

function japaneseFollowup(project: Project, f: FollowupFacts): string {
  const human = HUMAN_FILLS.ja;
  return [
    `# 解決フォローアップ（Turn 2） — ${project.displayName} / R${f.round}`,
    "",
    "初回assessmentを受領しました。findingの解消とintent確認のため、ここで初めて追加contextを共有します。",
    "",
    "## Stage 3 — Resolution Context（追加context）",
    "",
    `- プロジェクト: ${f.project}`,
    `- レビュー種別: ${f.reviewType}`,
    `- レビュー対象HEAD: ${f.expectedHead}`,
    `- 背景・目的: ${human}`,
    `- すでに決まっている方針・実装経緯: ${human}`,
    `- known trade-offs / 過去の検討 / 関連する過去レビュー: ${human}`,
    "",
    "- このcontextは、findingの解消・矛盾の確認・intentの確認に使ってください。",
    "- 追加contextによって初回findingを変更してかまいませんが、どのfindingがどの追加Evidenceによって変わったのかを区別して示してください。",
    "- このcontextとArtifactのEvidenceが矛盾する場合は、ArtifactのEvidenceを優先してください。",
    "",
    "## Stage 4 — Final Judgment（最終判断）",
    "",
    "- 初回assessmentと本contextを統合し、最終判断を同じ出力形式で更新してください。",
    "- 初回から変更した判断には、変更の根拠となった追加Evidenceを明記してください。",
    "- 変更しなかった指摘は、追加contextを踏まえてもなお有効であることを示してください。",
    "",
  ].join("\n");
}

function englishFollowup(project: Project, f: FollowupFacts): string {
  const human = HUMAN_FILLS.en;
  return [
    `# Resolution Follow-up (Turn 2) — ${project.displayName} / R${f.round}`,
    "",
    "Your initial assessment has arrived. Here, for the first time, is the additional context — for resolving findings and confirming intent.",
    "",
    "## Stage 3 — Resolution Context",
    "",
    `- Project: ${f.project}`,
    `- Review Type: ${f.reviewType}`,
    `- Reviewed HEAD: ${f.expectedHead}`,
    `- Background and purpose: ${human}`,
    `- Decisions already taken, and the implementation history: ${human}`,
    `- Known trade-offs / earlier considerations / related past reviews: ${human}`,
    "",
    "- Use this context to resolve findings, check contradictions and confirm intent.",
    "- You may change an initial finding because of it, but show which findings changed and which added Evidence changed them.",
    "- Where this context and the Artifact's Evidence disagree, the Artifact's Evidence wins.",
    "",
    "## Stage 4 — Final Judgment",
    "",
    "- Combine your initial assessment with this context and restate your judgment in the same output format.",
    "- For anything you changed from the initial assessment, name the added Evidence that changed it.",
    "- For anything you did not change, say that it still stands with this context in hand.",
    "",
  ].join("\n");
}

export function buildResolutionFollowup(
  project: Project,
  session: ReviewSession,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const f = followupFacts(project, session, locale);
  return locale === "en" ? englishFollowup(project, f) : japaneseFollowup(project, f);
}
