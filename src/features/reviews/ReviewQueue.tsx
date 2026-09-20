import { FreshnessBadge, ResourceStateBadge, ReviewStateBadge } from "../../components/StateBadge";
import type { FreshnessResult } from "../../domain/freshness";
import type { Project } from "../../domain/project";
import type { QueueFilter, QueueItem } from "../../domain/queue";
import { REVIEW_STATE_KEYS } from "../../i18n";
import { useT } from "../../i18n/context";

interface ReviewQueueProps {
  items: QueueItem[];
  totalCount: number;
  selectedId: string | null;
  filter: QueueFilter;
  projects: Project[];
  reviewCountByProject: Map<string, number>;
  /** Derived Freshness per review (Phase 2); independent of the Review State shown next to it. */
  freshnessByReview: Map<string, FreshnessResult>;
  projectsEditable: boolean;
  onFilterChange: (filter: Partial<QueueFilter>) => void;
  onSelect: (reviewId: string) => void;
  onEditProject: (projectId: string) => void;
  onCreateReview: (projectId: string) => void;
}

export function ReviewQueue({
  items,
  totalCount,
  selectedId,
  filter,
  projects,
  reviewCountByProject,
  freshnessByReview,
  projectsEditable,
  onFilterChange,
  onSelect,
  onEditProject,
  onCreateReview,
}: ReviewQueueProps) {
  const t = useT();
  return (
    <div className="queue">
      <div className="queue-toolbar">
        <input
          type="search"
          placeholder={t("queue.filter.placeholder")}
          value={filter.text}
          onChange={(e) => onFilterChange({ text: e.target.value })}
          aria-label={t("queue.filter.ariaLabel")}
          data-testid="queue-filter"
        />
        <label className="checkbox small">
          <input type="checkbox" checked={filter.showClosed} onChange={(e) => onFilterChange({ showClosed: e.target.checked })} data-testid="queue-show-closed" />
          {t("queue.showClosed")}
        </label>
      </div>

      <ul className="queue-list" data-testid="queue-list">
        {items.map((item) => {
          const selected = item.reviewId === selectedId;
          return (
            <li key={item.reviewId}>
              <button
                type="button"
                className={`queue-item${selected ? " selected" : ""}${item.session === null ? " unreadable" : ""}`}
                onClick={() => onSelect(item.reviewId)}
                aria-current={selected ? "true" : undefined}
                data-testid="queue-item"
                data-review-id={item.reviewId}
              >
                {item.session ? (
                  <>
                    <div className="qi-top">
                      <span className="qi-project">{item.project?.displayName ?? item.session.projectId}</span>
                      <span className="qi-pr">
                        {item.session.prNumber !== null
                          ? t("queue.item.prRound", { pr: item.session.prNumber, round: item.session.reviewRound })
                          : t("queue.item.noPr", { round: item.session.reviewRound })}
                      </span>
                    </div>
                    <div className="qi-badges">
                      <ReviewStateBadge state={item.session.reviewState} />
                      <ResourceStateBadge state={item.session.resourceState} />
                      {freshnessByReview.get(item.reviewId) && (
                        <FreshnessBadge
                          status={freshnessByReview.get(item.reviewId)!.status}
                          explanation={freshnessByReview.get(item.reviewId)!.explanation}
                          testId="queue-freshness"
                        />
                      )}
                      {item.session.suspendedFrom && (
                        <span className="muted small">
                          {t("queue.item.suspendedFrom", { state: t(REVIEW_STATE_KEYS[item.session.suspendedFrom]) })}
                        </span>
                      )}
                    </div>
                    <div className="qi-next">{item.session.nextAction || <span className="muted">{t("queue.item.noNextAction")}</span>}</div>
                  </>
                ) : (
                  <>
                    <div className="qi-top">
                      <span className="qi-project mono">{item.reviewId}</span>
                    </div>
                    <div className="qi-error">{t("queue.item.unreadable", { problem: item.problem ?? "" })}</div>
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {items.length === 0 && (
        <p className="queue-empty muted">{totalCount === 0 ? t("queue.empty.none") : t("queue.empty.filtered")}</p>
      )}

      <details className="project-list" open>
        <summary>{t("queue.projects.summary", { count: projects.length })}</summary>
        <ul>
          {projects.map((project) => (
            <li key={project.projectId} className="project-row" data-testid="project-row" data-project-id={project.projectId}>
              <span className="project-name" title={project.projectId}>
                {project.displayName}
                <span className="muted small"> {t("queue.projects.reviewCount", { count: reviewCountByProject.get(project.projectId) ?? 0 })}</span>
              </span>
              <span className="project-row-actions">
                <button type="button" className="link-button" onClick={() => onCreateReview(project.projectId)}>
                  {t("queue.projects.addReview")}
                </button>
                <button type="button" className="link-button" onClick={() => onEditProject(project.projectId)} disabled={!projectsEditable}>
                  {t("queue.projects.edit")}
                </button>
              </span>
            </li>
          ))}
        </ul>
        {projects.length === 0 && <p className="muted small">{t("queue.projects.none")}</p>}
      </details>
    </div>
  );
}
