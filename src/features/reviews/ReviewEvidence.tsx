import { ActionButton } from "../../components/ActionButton";
import { actionRefusal } from "../../domain/actionRefusal";
import { detectDuplicate, type PriorReview } from "../../domain/duplicate";
import { offeredEvidence } from "../../domain/evidenceOffer";
import { assessEvidence } from "../../domain/evidenceReuse";
import type { GitObservation } from "../../domain/git";
import { assessRevalidationPermission } from "../../domain/revalidation";
import type { ReviewSession, RoundEvidenceDecision, RoundRecord } from "../../domain/review";
import { canApply } from "../../domain/transitions";
import {
  EVIDENCE_REASON_KEYS,
  EVIDENCE_SOURCE_KEYS,
  EVIDENCE_STATUS_KEYS,
  formatTimestamp,
  INVALIDATION_REASON_KEYS,
  refusalText,
} from "../../i18n";
import { useT } from "../../i18n/context";

/**
 * The two things a Human has to see before asking for another review: whether this head has already
 * been reviewed, and what evidence from before still holds.
 *
 * Neither is decided here. `detectDuplicate` reports the finding, `assessRevalidationPermission`
 * says whether a second review may go ahead, and `assessEvidenceItem` rates each piece of evidence
 * against the head this round is about. There is no override button: a duplicate proceeds only
 * once the Human has recorded one of the canonical invalidation reasons, and the two paths that
 * need no permission at all are spelled out instead.
 */

export interface ReviewEvidenceProps {
  session: ReviewSession;
  round: RoundRecord;
  busy: boolean;
  /** Every round that could already have reviewed this head, the current one excluded. */
  priorReviews: readonly PriorReview[];
  observation: GitObservation | undefined;
  onRecordRevalidation: () => void;
  onRecordEvidence: (decisions: RoundEvidenceDecision[]) => void;
}

export function ReviewEvidence({
  session,
  round,
  busy,
  priorReviews,
  observation,
  onRecordRevalidation,
  onRecordEvidence,
}: ReviewEvidenceProps) {
  const t = useT();
  const targetHead = round.expectedHead ?? round.reviewedHead;
  const duplicate = detectDuplicate({ projectId: session.projectId, targetHead, priorReviews });
  const recorded = round.revalidation;
  const permission = assessRevalidationPermission({
    duplicate,
    reason: recorded?.reason ?? null,
    explanation: recorded?.explanation ?? null,
  }).permission;

  const items = offeredEvidence(session, observation);
  const invalidationReasons = recorded === null ? [] : [recorded.reason];
  const assessments = assessEvidence(items, { currentHead: targetHead, invalidationReasons });
  const decisions: RoundEvidenceDecision[] = items.map((item, index) => ({
    id: item.id,
    source: item.source,
    boundHead: item.boundHead,
    capturedAt: item.capturedAt,
    status: assessments[index].status,
    reason: assessments[index].reason,
  }));
  const revalidationRefusal = actionRefusal(session, "recordRevalidation");
  const revalidationReason =
    permission === "NO_DUPLICATE"
      ? t("workflow.revalidation.notNeeded")
      : permission === "UNDECIDABLE"
        ? t("workflow.revalidation.undecidable")
        : revalidationRefusal !== null
          ? refusalText(t, revalidationRefusal)
          : null;
  const evidenceRefusal = actionRefusal(session, "recordEvidenceDecisions");
  const evidenceReason =
    decisions.length === 0
      ? t("workflow.evidence.nothingToRecord")
      : evidenceRefusal !== null
        ? refusalText(t, evidenceRefusal)
        : null;
  const matches = duplicate.matches.map((match) => t("detail.value.round", { round: match.round })).join(t("review.verdict.separator"));

  return (
    <section className="card" data-testid="detail-evidence">
      <header className="card-header">
        <h3>{t("detail.card.evidence")}</h3>
        <span className="muted small" data-testid="evidence-permission">
          {t("workflow.duplicate.title")}
        </span>
      </header>

      {permission === "NO_DUPLICATE" && <p className="muted" data-testid="duplicate-none">{t("workflow.duplicate.none")}</p>}
      {permission === "UNDECIDABLE" && (
        <div role="status" data-testid="duplicate-undecidable">
          <p className="warning-text">{t("workflow.duplicate.undecidable")}</p>
          <p className="hint">{t("workflow.revalidation.undecidable")}</p>
        </div>
      )}
      {(permission === "DUPLICATE_BLOCKED" || permission === "REVALIDATION_ALLOWED") && (
        <div role="status" data-testid="duplicate-warning" data-state={permission}>
          <p className="warning-text" data-testid="duplicate-detected">
            {t("workflow.duplicate.detected", { reviews: matches })}
          </p>
          <p className="hint">{t("workflow.duplicate.rule")}</p>
          <ul className="event-list" aria-label={t("workflow.duplicate.title")}>
            <li>{t("workflow.duplicate.pathOpen")}</li>
            <li>{t("workflow.duplicate.pathReuse")}</li>
          </ul>
          {permission === "DUPLICATE_BLOCKED" && (
            <p className="hint" data-testid="duplicate-next">
              {t("workflow.duplicate.next")}
            </p>
          )}
        </div>
      )}
      {recorded !== null && (
        <p className="hint" data-testid="duplicate-recorded">
          {t("workflow.duplicate.recorded", { reason: t(INVALIDATION_REASON_KEYS[recorded.reason]) })}
          {recorded.explanation !== null ? t("workflow.duplicate.explanation", { explanation: recorded.explanation }) : ""}
        </p>
      )}

      <h4 className="subhead">{t("workflow.evidence.title")}</h4>
      {items.length === 0 ? (
        <p className="muted" data-testid="evidence-none">
          {t("workflow.evidence.none")}
        </p>
      ) : (
        <ol className="event-list" aria-label={t("workflow.evidence.listAriaLabel")} data-testid="evidence-items">
          {decisions.map((decision) => (
            <li key={decision.id} data-evidence-status={decision.status}>
              <strong>{t(EVIDENCE_STATUS_KEYS[decision.status])}</strong>{" "}
              <span>
                {t("workflow.evidence.item", {
                  source: t(EVIDENCE_SOURCE_KEYS[decision.source]),
                  head: decision.boundHead ?? t("workflow.evidence.unbound"),
                })}
              </span>{" "}
              <span className="muted small">
                {t("workflow.evidence.capturedAt", { timestamp: formatTimestamp(t, decision.capturedAt) })}
                {t("review.verdict.separator")}
                {t(EVIDENCE_REASON_KEYS[decision.reason])}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="hint">{t("workflow.evidence.hint")}</p>
      {round.evidenceDecisions.length > 0 && (
        <p className="hint" data-testid="evidence-recorded">
          {t("workflow.evidence.recorded", { count: round.evidenceDecisions.length })}
        </p>
      )}

      <div className="action-bar" role="group" aria-label={t("workflow.actions.ariaLabel")}>
        <ActionButton
          label={t("workflow.actions.recordRevalidation")}
          testId="action-record-revalidation"
          onClick={onRecordRevalidation}
          enabled={!busy && permission === "DUPLICATE_BLOCKED" && canApply(session, "recordRevalidation")}
          disabledReason={revalidationReason}
        />
        <ActionButton
          label={t("workflow.actions.recordEvidence")}
          testId="action-record-evidence"
          onClick={() => onRecordEvidence(decisions)}
          enabled={!busy && decisions.length > 0 && canApply(session, "recordEvidenceDecisions")}
          disabledReason={evidenceReason}
        />
      </div>
    </section>
  );
}
