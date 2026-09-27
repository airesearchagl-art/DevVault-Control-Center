import type { Project } from "./project";
import type { ReviewSession, RoundRecord } from "./review";
import type { ReviewState } from "./states";
import { REVIEW_STATE_KEYS, type Translator } from "../i18n";

/**
 * Phase 4a — IDE Handoff (Human Decisions HD-P4-01..04, 2026-09-27): a deterministic text the Human
 * copies and pastes, by hand, into an already-open Claude Code / Codex / other session. DVCC does not
 * launch, discover, resume or control that session, and this module does not either.
 *
 * Same principle as `handoff.ts`: collect what is already recorded, decide nothing, classify nothing,
 * invent nothing. A fact that was never recorded comes back as `null` and renders as an explicit
 * "not recorded" value — this file never omits a line to hide an absence.
 *
 * `Project.localRoot`, `Project.notes`, the ChatGPT thread pointer, review response bodies and
 * `verdictNote` are structurally excluded: `IdeHandoff` has no field for them, so a caller cannot
 * pass them through even by accident (Human Decision section 7 — "the builder should never receive
 * localRoot if practical").
 */
export interface IdeHandoff {
  projectId: string;
  displayName: string;
  repositoryUrl: string | null;
  reviewSessionId: string;
  reviewType: string;
  prNumber: number | null;
  reviewRound: number;
  reviewState: ReviewState;
  /** From `ReviewSession.nextAction` only — never `Project.nextAction` (Human Decision section 6). */
  nextAction: string;
  expectedHead: string | null;
  reviewedHead: string | null;
  /** Existence only; the checkpoint's own text is never read into the handoff. */
  hasCheckpoint: boolean;
}

export function buildIdeHandoff(project: Project, session: ReviewSession, round: RoundRecord, hasCheckpoint: boolean): IdeHandoff {
  return {
    projectId: project.projectId,
    displayName: project.displayName,
    repositoryUrl: project.repositoryUrl,
    reviewSessionId: session.reviewSessionId,
    reviewType: session.reviewType,
    prNumber: session.prNumber,
    reviewRound: session.reviewRound,
    reviewState: session.reviewState,
    nextAction: session.nextAction,
    expectedHead: round.expectedHead,
    reviewedHead: round.reviewedHead,
    hasCheckpoint,
  };
}

/**
 * The deterministic missing-value rule for this file: every optional fact renders on its own line
 * either as its recorded value or as the localized "not recorded" placeholder. No line is ever
 * omitted, so the shape of the text never depends on which facts happen to be present.
 */
export function renderIdeHandoff(t: Translator, handoff: IdeHandoff): string {
  const notRecorded = t("detail.value.unrecorded");
  const field = (label: string, value: string) => `${label}\n${value}`;

  return [
    t("ideHandoff.heading"),
    "",
    field(t("ideHandoff.field.project"), handoff.displayName),
    "",
    field(t("project.form.projectId"), handoff.projectId),
    "",
    field(t("detail.field.repository"), handoff.repositoryUrl ?? notRecorded),
    "",
    field(t("detail.field.reviewType"), handoff.reviewType),
    "",
    field(t("detail.field.pr"), handoff.prNumber === null ? notRecorded : `#${handoff.prNumber}`),
    "",
    field(t("detail.field.round"), t("detail.value.round", { round: handoff.reviewRound })),
    "",
    field(t("detail.field.reviewState"), `${t(REVIEW_STATE_KEYS[handoff.reviewState])} (${handoff.reviewState})`),
    "",
    field(t("detail.field.expectedHead"), handoff.expectedHead ?? notRecorded),
    "",
    field(t("detail.field.reviewedHead"), handoff.reviewedHead ?? notRecorded),
    "",
    field(t("workflow.handoff.nextAction"), handoff.nextAction.trim() === "" ? notRecorded : handoff.nextAction),
    "",
    field(t("detail.card.checkpoint"), handoff.hasCheckpoint ? "checkpoint.md" : notRecorded),
    "",
    t("ideHandoff.boundary.heading"),
    t("ideHandoff.boundary.body"),
  ].join("\n");
}
