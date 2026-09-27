import { useId } from "react";
import { ActionButton } from "../../components/ActionButton";
import { Row } from "../../components/DetailRow";
import { actionRefusal } from "../../domain/actionRefusal";
import { canCaptureJudgment, canSendTurn2, freshContextState, progressOfRound } from "../../domain/freshContext";
import type { GitObservation } from "../../domain/git";
import { exactHeadReadiness } from "../../domain/headBinding";
import type { ReviewSession, RoundRecord } from "../../domain/review";
import { canApply } from "../../domain/transitions";
import {
  formatTimestamp,
  FRESH_CONTEXT_STATE_KEYS,
  HEAD_BINDING_KEYS,
  OBSERVED_HEAD_KEYS,
  refusalText,
  RISK_TIER_KEYS,
  TIER_2_SUBJECT_KEYS,
  type Translator,
} from "../../i18n";
import { useT } from "../../i18n/context";

/**
 * Where the Human stands in the canonical two-turn protocol, whether Turn 1 can be bound to an exact
 * head, and the Risk Tier they chose for this round.
 *
 * Every control asks the domain whether its operation is allowed — `canSendTurn2`,
 * `canCaptureJudgment`, `canApply` — rather than deciding for itself, and a disabled control is
 * never the only gate: the same rules refuse the action in `applyReviewAction` as well. When
 * something is not allowed the button shows the domain's own refusal and the next step next to it,
 * instead of being silently grey.
 *
 * The exact-head readiness is read, never written: a locally observed HEAD is shown as a candidate
 * and the Human adopts it, or not, through their own edit.
 */

export interface ReviewWorkflowProps {
  session: ReviewSession;
  round: RoundRecord;
  busy: boolean;
  projectMissing: boolean;
  observation: GitObservation | undefined;
  onCopyFollowup: () => void;
  onCaptureJudgment: () => void;
  onSetRiskTier: () => void;
  onEditReview: () => void;
}

function step(t: Translator, at: string | null, notDone: string) {
  return at === null ? <span className="muted">{notDone}</span> : formatTimestamp(t, at);
}

export function ReviewWorkflow({
  session,
  round,
  busy,
  projectMissing,
  observation,
  onCopyFollowup,
  onCaptureJudgment,
  onSetRiskTier,
  onEditReview,
}: ReviewWorkflowProps) {
  const t = useT();
  const freshId = useId();
  const headId = useId();
  const tierId = useId();
  const progress = progressOfRound(round);
  const state = freshContextState(progress);
  const notSent = t("workflow.fresh.notSent");
  const notReceived = t("workflow.fresh.notReceived");
  const followupAllowed = canSendTurn2(progress) && canApply(session, "recordFollowupSaved") && !projectMissing;
  const judgmentAllowed = canCaptureJudgment(progress) && canApply(session, "captureJudgment");
  const followupRefusal = actionRefusal(session, "recordFollowupSaved");
  const judgmentRefusal = actionRefusal(session, "captureJudgment");
  const tierRefusal = actionRefusal(session, "setRiskTier");
  const followupReason =
    followupRefusal !== null ? refusalText(t, followupRefusal) : projectMissing ? t("workflow.next.projectMissing") : null;
  const subjects = round.riskTierSubjects.map((subject) => t(TIER_2_SUBJECT_KEYS[subject]));

  const readiness = exactHeadReadiness(round.expectedHead, observation);
  const observedText = t(OBSERVED_HEAD_KEYS[readiness.observed], {
    observed: readiness.observedHead ?? "",
    timestamp: formatTimestamp(t, readiness.observedAt),
  });

  return (
    <section className="card" data-testid="detail-workflow">
      <header className="card-header">
        <h3>{t("detail.card.workflow")}</h3>
        <span className="muted small" role="status" aria-label={t("workflow.fresh.ariaLabel")} data-testid="workflow-fresh-state" data-state={state}>
          {t(FRESH_CONTEXT_STATE_KEYS[state])}
        </span>
      </header>

      <h4 className="subhead" id={freshId}>
        {t("workflow.fresh.title")}
      </h4>
      <dl aria-labelledby={freshId}>
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

      <h4 className="subhead" id={headId}>
        {t("workflow.head.title")}
      </h4>
      <dl aria-labelledby={headId}>
        <Row label={t("workflow.head.bindingLabel")} testId="workflow-head-binding">
          <span data-state={readiness.binding}>{t(HEAD_BINDING_KEYS[readiness.binding], { head: readiness.recordedHead ?? "" })}</span>
        </Row>
        <Row label={t("workflow.head.observedLabel")} testId="workflow-head-observed">
          <span data-state={readiness.observed}>{observedText}</span>
        </Row>
      </dl>
      {readiness.binding !== "EXACT" && (
        <p className="hint" data-testid="workflow-head-next">
          {t("workflow.head.next")}
        </p>
      )}

      <h4 className="subhead" id={tierId}>
        {t("workflow.riskTier.title")}
      </h4>
      <dl aria-labelledby={tierId}>
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
          disabledReason={followupReason}
        />
        <ActionButton
          label={t("workflow.actions.captureJudgment")}
          testId="action-capture-judgment"
          onClick={onCaptureJudgment}
          enabled={!busy && judgmentAllowed}
          disabledReason={judgmentRefusal === null ? null : refusalText(t, judgmentRefusal)}
        />
        <ActionButton
          label={t("workflow.actions.setRiskTier")}
          testId="action-set-risk-tier"
          onClick={onSetRiskTier}
          enabled={!busy && tierRefusal === null}
          disabledReason={tierRefusal === null ? null : refusalText(t, tierRefusal)}
        />
        {readiness.binding !== "EXACT" && (
          <ActionButton label={t("workflow.head.edit")} testId="action-edit-head" onClick={onEditReview} enabled={!busy} />
        )}
      </div>
    </section>
  );
}
