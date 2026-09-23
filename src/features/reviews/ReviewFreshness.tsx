import { useId } from "react";
import { ActionButton } from "../../components/ActionButton";
import { Row } from "../../components/DetailRow";
import { FreshnessBadge } from "../../components/StateBadge";
import type { FreshnessResult } from "../../domain/freshness";
import { unknownCause } from "../../domain/freshnessCause";
import type { GitObservation } from "../../domain/git";
import { formatTimestamp, translate, UNKNOWN_CAUSE_KEYS } from "../../i18n";
import { useT } from "../../i18n/context";

/**
 * Phase 2 Freshness, shown inside the Review workflow as its own card (RW-13).
 *
 * Freshness is a visible derived fact, never a decision input. This card receives the result and
 * the observation and nothing that could change a review: it has no action callback other than the
 * Human's own refresh, it never writes a Review State, never starts a round, and it never tells the
 * evidence card what is reusable — those decisions are recorded separately, per item.
 *
 * Every status comes with its reason: the explanation `deriveFreshness` chose, the recorded and
 * observed HEAD values it compared, and when it was observed. An `UNKNOWN` also says which kind of
 * unknown it is. A value that was never recorded or observed is shown as such, never guessed.
 */

export interface ReviewFreshnessProps {
  freshness: FreshnessResult;
  observation: GitObservation | undefined;
  busy: boolean;
  onRefreshGit: () => void;
}

export function ReviewFreshness({ freshness, observation, busy, onRefreshGit }: ReviewFreshnessProps) {
  const t = useT();
  const titleId = useId();
  const cause = unknownCause(freshness);
  const unrecorded = <span className="muted">{t("detail.value.unrecorded")}</span>;
  const unobserved = <span className="muted">{t("detail.value.unobserved")}</span>;

  return (
    <section className="card" aria-labelledby={titleId} data-testid="workflow-freshness" data-state={freshness.status}>
      <header className="card-header">
        <h3 id={titleId}>{t("detail.card.workflowFreshness")}</h3>
      </header>
      <dl>
        <Row label={t("workflow.freshness.status")} testId="workflow-freshness-status">
          <span role="status">
            <FreshnessBadge status={freshness.status} />
          </span>
        </Row>
        <Row label={t("workflow.freshness.reason")} testId="workflow-freshness-reason">
          {translate(t, freshness.explanation)}
        </Row>
        {cause !== null && (
          <Row label={t("workflow.freshness.cause")} testId="workflow-freshness-cause">
            <span data-cause={cause}>{t(UNKNOWN_CAUSE_KEYS[cause])}</span>
          </Row>
        )}
        <Row label={t("detail.field.expectedHead")} testId="workflow-freshness-expected" mono>
          {freshness.expectedHead ?? unrecorded}
        </Row>
        <Row label={t("detail.field.reviewedHead")} testId="workflow-freshness-reviewed" mono>
          {freshness.reviewedHead ?? unrecorded}
        </Row>
        <Row label={t("workflow.freshness.currentHead")} testId="workflow-freshness-current" mono>
          {freshness.currentHead ?? unobserved}
        </Row>
        <Row label={t("git.field.observedAt")} testId="workflow-freshness-observed-at">
          {observation ? formatTimestamp(t, observation.observedAt) : unobserved}
        </Row>
      </dl>
      {freshness.status === "UNKNOWN" && (
        <p className="hint" data-testid="workflow-freshness-next">
          {t("workflow.freshness.next")}
        </p>
      )}
      <p className="hint">{t("workflow.freshness.hint")}</p>
      <div className="action-bar" role="group" aria-label={t("workflow.actions.ariaLabel")}>
        <ActionButton label={t("git.refresh")} testId="action-workflow-refresh-git" onClick={onRefreshGit} enabled={!busy} />
      </div>
    </section>
  );
}
