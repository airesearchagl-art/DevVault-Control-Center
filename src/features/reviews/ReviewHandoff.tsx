import { Row } from "../../components/DetailRow";
import { buildReReviewHandoff, buildRequiredFixHandoff } from "../../domain/handoff";
import type { ReviewSession, RoundRecord } from "../../domain/review";
import { formatTimestamp, INVALIDATION_REASON_KEYS, RISK_TIER_KEYS, VERDICT_KEYS } from "../../i18n";
import { useT } from "../../i18n/context";

/**
 * What this round hands on: the fixes a confirmed verdict asks for, and the relation a re-review
 * has to the round before it.
 *
 * Both are read from the domain's handoff models, so a round relation is never reconstructed here
 * from timestamps or prose. Nothing is written: the previous round's artifacts are shown by name
 * and stay exactly as they were (RW-11).
 */

export interface ReviewHandoffProps {
  session: ReviewSession;
  round: RoundRecord;
}

export function ReviewHandoff({ session, round }: ReviewHandoffProps) {
  const t = useT();
  const fixes = buildRequiredFixHandoff(session, round);
  const reReview = buildReReviewHandoff(session);
  if (fixes === null && reReview === null) return null;
  const unrecorded = <span className="muted">{t("detail.value.unrecorded")}</span>;

  return (
    <section className="card" data-testid="detail-handoff">
      <header className="card-header">
        <h3>{t("detail.card.handoff")}</h3>
      </header>

      {fixes !== null && (
        <>
          <h4 className="subhead">{t("workflow.handoff.requiredFix")}</h4>
          <dl>
            <Row label={t("workflow.handoff.fromRound")} testId="handoff-from-round">
              {t("detail.value.round", { round: fixes.fromRound })}
            </Row>
            <Row label={t("detail.field.reviewedHead")} testId="handoff-reviewed-head" mono>
              {fixes.reviewedHead ?? unrecorded}
            </Row>
            <Row label={t("workflow.handoff.response")} testId="handoff-response">
              {fixes.resultArtifact === null ? (
                unrecorded
              ) : (
                <>
                  <code>{fixes.resultArtifact}</code>{" "}
                  <span className="muted small">
                    {t("workflow.evidence.capturedAt", { timestamp: formatTimestamp(t, fixes.responseCapturedAt) })}
                  </span>
                </>
              )}
            </Row>
            <Row label={t("workflow.handoff.verdict")} testId="handoff-verdict">
              {t(VERDICT_KEYS[fixes.verdict])}
            </Row>
            <Row label={t("workflow.handoff.verdictNote")} testId="handoff-verdict-note">
              {fixes.verdictNote ?? unrecorded}
            </Row>
            <Row label={t("workflow.handoff.nextAction")} testId="handoff-next-action">
              {fixes.nextAction.trim() === "" ? unrecorded : fixes.nextAction}
            </Row>
            <Row label={t("workflow.riskTier.title")} testId="handoff-risk-tier">
              {fixes.riskTier === null ? <span className="muted">{t("workflow.riskTier.unset")}</span> : t(RISK_TIER_KEYS[fixes.riskTier])}
            </Row>
          </dl>
        </>
      )}

      {reReview !== null && (
        <>
          <h4 className="subhead">{t("workflow.handoff.reReview")}</h4>
          <dl>
            <Row label={t("workflow.handoff.previousRound")} testId="handoff-previous-round">
              {t("workflow.handoff.previousRoundValue", {
                round: reReview.previousRound,
                verdict: reReview.previousVerdict === null ? t("detail.previousResult.verdictPending") : t(VERDICT_KEYS[reReview.previousVerdict]),
              })}
            </Row>
            <Row label={t("workflow.handoff.previousHead")} testId="handoff-previous-head" mono>
              {reReview.previousReviewedHead ?? unrecorded}
            </Row>
            <Row label={t("workflow.handoff.previousResponse")} testId="handoff-previous-response">
              {reReview.previousResultArtifact === null ? unrecorded : <code>{reReview.previousResultArtifact}</code>}
            </Row>
            <Row label={t("detail.field.expectedHead")} testId="handoff-current-head" mono>
              {reReview.currentExpectedHead ?? unrecorded}
            </Row>
            <Row label={t("workflow.handoff.reusedEvidence")} testId="handoff-reused-evidence">
              {t("workflow.evidence.recorded", { count: reReview.reusedEvidence.length })}
            </Row>
            <Row label={t("workflow.handoff.revalidation")} testId="handoff-revalidation">
              {reReview.revalidationReason === null ? unrecorded : t(INVALIDATION_REASON_KEYS[reReview.revalidationReason])}
            </Row>
          </dl>
        </>
      )}
    </section>
  );
}
