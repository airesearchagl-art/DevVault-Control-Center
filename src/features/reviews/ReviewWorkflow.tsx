import { ActionButton } from "../../components/ActionButton";
import { Row } from "../../components/DetailRow";
import { canCaptureJudgment, canSendTurn2, freshContextState, progressOfRound } from "../../domain/freshContext";
import type { ReviewSession, RoundRecord } from "../../domain/review";
import { canApply } from "../../domain/transitions";
import { formatTimestamp, FRESH_CONTEXT_STATE_KEYS, RISK_TIER_KEYS, TIER_2_SUBJECT_KEYS, type Translator } from "../../i18n";
import { useT } from "../../i18n/context";

/**
 * Where the Human stands in the canonical two-turn protocol, and the Risk Tier they chose for this
 * round.
 *
 * Every control asks the domain whether its operation is allowed — `canSendTurn2`,
 * `canCaptureJudgment`, `canApply` — rather than deciding for itself, and a disabled control is
 * never the only gate: the same rules refuse the action in `applyReviewAction` as well. When
 * something is not allowed the button carries the reason instead of being silently grey.
 */

export interface ReviewWorkflowProps {
  session: ReviewSession;
  round: RoundRecord;
  busy: boolean;
  projectMissing: boolean;
  onCopyFollowup: () => void;
  onCaptureJudgment: () => void;
  onSetRiskTier: () => void;
}

function step(t: Translator, at: string | null, notDone: string) {
  return at === null ? <span className="muted">{notDone}</span> : formatTimestamp(t, at);
}

export function ReviewWorkflow({
  session,
  round,
  busy,
  projectMissing,
  onCopyFollowup,
  onCaptureJudgment,
  onSetRiskTier,
}: ReviewWorkflowProps) {
  const t = useT();
  const progress = progressOfRound(round);
  const state = freshContextState(progress);
  const notSent = t("workflow.fresh.notSent");
  const notReceived = t("workflow.fresh.notReceived");
  const followupAllowed = canSendTurn2(progress) && canApply(session, "recordFollowupSaved") && !projectMissing;
  const judgmentAllowed = canCaptureJudgment(progress) && canApply(session, "captureJudgment");
  const followupTitle =
    round.resultCapturedAt === null
      ? t("workflow.followup.needsAssessment")
      : round.judgmentCapturedAt !== null
        ? t("workflow.followup.answered")
        : undefined;
  const subjects = round.riskTierSubjects.map((subject) => t(TIER_2_SUBJECT_KEYS[subject]));

  return (
    <section className="card" data-testid="detail-workflow">
      <header className="card-header">
        <h3>{t("detail.card.workflow")}</h3>
        <span className="muted small" data-testid="workflow-fresh-state">
          {t(FRESH_CONTEXT_STATE_KEYS[state])}
        </span>
      </header>

      <h4 className="subhead">{t("workflow.fresh.title")}</h4>
      <dl>
        <Row label={t("workflow.fresh.turn1")} testId="workflow-turn1">
          {step(t, round.requestSavedAt, notSent)}
        </Row>
        <Row label={t("workflow.fresh.assessment")} testId="workflow-assessment">
          {step(t, round.resultCapturedAt, notReceived)}
        </Row>
        <Row label={t("workflow.fresh.turn2")} testId="workflow-turn2">
          {step(t, round.followupSavedAt, notSent)}
        </Row>
        <Row label={t("workflow.fresh.judgment")} testId="workflow-judgment">
          {step(t, round.judgmentCapturedAt, notReceived)}
        </Row>
      </dl>
      <p className="hint">{t("workflow.fresh.hint")}</p>

      <h4 className="subhead">{t("workflow.riskTier.title")}</h4>
      <dl>
        <Row label={t("workflow.riskTier.title")} testId="workflow-risk-tier">
          {round.riskTier === null ? <span className="muted">{t("workflow.riskTier.unset")}</span> : t(RISK_TIER_KEYS[round.riskTier])}
        </Row>
        <Row label={t("workflow.riskTier.subjectsLabel")} testId="workflow-risk-subjects">
          {subjects.length === 0 ? (
            <span className="muted">{t("workflow.riskTier.noSubjects")}</span>
          ) : (
            subjects.join(t("review.verdict.separator"))
          )}
        </Row>
      </dl>
      <p className="hint">{t("workflow.riskTier.hint")}</p>

      <div className="action-bar" role="group" aria-label={t("workflow.actions.ariaLabel")}>
        <ActionButton
          label={t("workflow.actions.copyFollowup")}
          testId="action-copy-followup"
          onClick={onCopyFollowup}
          enabled={!busy && followupAllowed}
          title={followupTitle}
        />
        <ActionButton
          label={t("workflow.actions.captureJudgment")}
          testId="action-capture-judgment"
          onClick={onCaptureJudgment}
          enabled={!busy && judgmentAllowed}
          title={round.followupSavedAt === null ? t("workflow.judgment.needsFollowup") : undefined}
        />
        <ActionButton
          label={t("workflow.actions.setRiskTier")}
          testId="action-set-risk-tier"
          onClick={onSetRiskTier}
          enabled={!busy && canApply(session, "setRiskTier")}
        />
      </div>
    </section>
  );
}
