import type { Project } from "./project";
import { currentRound, type ReviewSession } from "./review";
import { pullRequestUrl } from "./validation";

const UNRECORDED = "未記録";

/**
 * Turn-1 skeleton of the DevVault AI Review Request (Artifact / Contract / Material Facts /
 * Fresh Assessment). The full two-turn workflow is Phase 3.
 *
 * Deliberately excluded: local root, project notes and next action (local / private context
 * and implementation narrative do not belong in a fresh-context review request).
 */
export function buildReviewRequest(project: Project, session: ReviewSession): string {
  const round = currentRound(session);
  const previous = session.rounds.length > 1 ? session.rounds[session.rounds.length - 2] : null;
  const pr =
    session.prNumber === null
      ? UNRECORDED
      : project.repositoryUrl !== null
        ? `#${session.prNumber} — ${pullRequestUrl(project.repositoryUrl, session.prNumber)}`
        : `#${session.prNumber}`;
  const previousVerdict =
    previous === null ? "なし（初回Round）" : `R${previous.round}: ${previous.verdict ?? UNRECORDED}`;

  return [
    `# Independent Review Request — ${project.displayName} / R${session.reviewRound}`,
    "",
    "## Stage 1 — Artifact",
    "",
    `- Project: ${project.displayName} (${project.projectId})`,
    `- Repository: ${project.repositoryUrl ?? UNRECORDED}`,
    `- Pull Request: ${pr}`,
    `- Expected HEAD: ${round.expectedHead ?? UNRECORDED}`,
    `- Review Round: R${session.reviewRound}`,
    `- Review Type: ${session.reviewType}`,
    "",
    "## Contract",
    "",
    "- Review scope（変更してよい範囲 / 変更してはいけない範囲）: <!-- Humanが記入 -->",
    "- Review perspective: <!-- Humanが記入 -->",
    "- Desired output: 総評 / 良い点 / 修正必須 / 修正推奨 / 後回しでよい改善 / リスク・注意点 / 次にLLM IDEへ渡すべき指示 / Obsidianに記録すべき判断",
    "",
    "## Material Facts",
    "",
    `- Previous round verdict: ${previousVerdict}`,
    "- Known issues / constraints / Human Gate: <!-- Humanが記入 -->",
    "",
    "## Stage 2 — Fresh Assessment",
    "",
    "- 実装者の説明ではなく、Artifact（実際のdiff / HEAD）とContractから独立して判断してください。",
    "- 各指摘について根拠となるEvidenceを明示し、確認できない点は推測で補わず「未確認」と記載してください。",
    "- 回答の冒頭に、実際にReviewしたHEAD（Reviewed HEAD）を明記してください。",
    "",
  ].join("\n");
}
