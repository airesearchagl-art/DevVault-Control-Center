import { ResourceStateBadge, ReviewStateBadge } from "../../components/StateBadge";
import type { Project } from "../../domain/project";
import type { QueueFilter, QueueItem } from "../../domain/queue";
import { REVIEW_STATE_LABELS } from "../../domain/states";

interface ReviewQueueProps {
  items: QueueItem[];
  totalCount: number;
  selectedId: string | null;
  filter: QueueFilter;
  projects: Project[];
  reviewCountByProject: Map<string, number>;
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
  projectsEditable,
  onFilterChange,
  onSelect,
  onEditProject,
  onCreateReview,
}: ReviewQueueProps) {
  return (
    <div className="queue">
      <div className="queue-toolbar">
        <input
          type="search"
          placeholder="Filter: project, PR (#45), type…"
          value={filter.text}
          onChange={(e) => onFilterChange({ text: e.target.value })}
          aria-label="Filter reviews"
          data-testid="queue-filter"
        />
        <label className="checkbox small">
          <input type="checkbox" checked={filter.showClosed} onChange={(e) => onFilterChange({ showClosed: e.target.checked })} data-testid="queue-show-closed" />
          Show closed
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
                        {item.session.prNumber !== null ? `PR${item.session.prNumber}` : "—"} / R{item.session.reviewRound}
                      </span>
                    </div>
                    <div className="qi-badges">
                      <ReviewStateBadge state={item.session.reviewState} />
                      <ResourceStateBadge state={item.session.resourceState} />
                      {item.session.suspendedFrom && <span className="muted small">from {REVIEW_STATE_LABELS[item.session.suspendedFrom]}</span>}
                    </div>
                    <div className="qi-next">{item.session.nextAction || <span className="muted">No next action</span>}</div>
                  </>
                ) : (
                  <>
                    <div className="qi-top">
                      <span className="qi-project mono">{item.reviewId}</span>
                    </div>
                    <div className="qi-error">Unreadable — {item.problem}</div>
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {items.length === 0 && (
        <p className="queue-empty muted">{totalCount === 0 ? "No reviews yet." : "No reviews match the filter."}</p>
      )}

      <details className="project-list" open>
        <summary>Projects ({projects.length})</summary>
        <ul>
          {projects.map((project) => (
            <li key={project.projectId} className="project-row" data-testid="project-row" data-project-id={project.projectId}>
              <span className="project-name" title={project.projectId}>
                {project.displayName}
                <span className="muted small"> · {reviewCountByProject.get(project.projectId) ?? 0} reviews</span>
              </span>
              <span className="project-row-actions">
                <button type="button" className="link-button" onClick={() => onCreateReview(project.projectId)}>
                  + Review
                </button>
                <button type="button" className="link-button" onClick={() => onEditProject(project.projectId)} disabled={!projectsEditable}>
                  Edit
                </button>
              </span>
            </li>
          ))}
        </ul>
        {projects.length === 0 && <p className="muted small">No projects registered.</p>}
      </details>
    </div>
  );
}
