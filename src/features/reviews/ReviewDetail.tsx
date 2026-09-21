import { useEffect, useState, type ReactNode } from "react";
import { excerpt } from "../../app/format";
import { FreshnessBadge, ResourceStateBadge, ReviewStateBadge } from "../../components/StateBadge";
import type { FreshnessResult } from "../../domain/freshness";
import type { GitObservation } from "../../domain/git";
import { MAX_REVIEW_ROUNDS } from "../../domain/limits";
import type { Project } from "../../domain/project";
import { currentRound, latestCapturedRound, type ReviewSession } from "../../domain/review";
import { RESOURCE_STATES, type ResourceState } from "../../domain/states";
import { canApply, type ReviewAction } from "../../domain/transitions";
import { pullRequestUrl } from "../../domain/validation";
import {
  EVENT_TYPE_KEYS,
  formatTimestamp,
  GIT_STATUS_KEYS,
  RESOURCE_HINT_KEYS,
  RESOURCE_STATE_KEYS,
  REVIEW_STATE_KEYS,
  translate,
  VERDICT_KEYS,
  type Translator,
} from "../../i18n";
import { useT } from "../../i18n/context";
import type { ReviewArtifacts } from "../../services/persistence";

export type DetailDialog = "suspend" | "capture" | "verdict" | "block" | "close" | "nextRound" | "editReview" | "editProject";

interface ReviewDetailProps {
  session: ReviewSession;
  project: Project | null;
  artifacts: ReviewArtifacts | undefined;
  busy: boolean;
  /** Observed Git facts for this review's project; `undefined` until the Human refreshes. */
  observation: GitObservation | undefined;
  freshness: FreshnessResult;
  onRefreshGit: () => void;
  onAction: (action: ReviewAction) => void;
  onOpenDialog: (dialog: DetailDialog) => void;
  onOpenGithub: () => void;
  onOpenChatgpt: () => void;
  onOpenFolder: () => void;
  onCopyPrompt: () => void;
  onSaveNextAction: (text: string) => Promise<boolean>;
}

function Row({ label, children, testId, mono }: { label: string; children: ReactNode; testId?: string; mono?: boolean }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined} data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}

function unrecorded(t: Translator): ReactNode {
  return <span className="muted">{t("detail.value.unrecorded")}</span>;
}

function unobserved(t: Translator): ReactNode {
  return <span className="muted">{t("detail.value.unobserved")}</span>;
}

function workingTree(t: Translator, observation: GitObservation | undefined): ReactNode {
  if (!observation || observation.status !== "OK" || observation.dirty === null) return unobserved(t);
  return observation.dirty ? t("git.worktree.dirty") : t("git.worktree.clean");
}

function currentBranch(t: Translator, observation: GitObservation | undefined): ReactNode {
  if (!observation || observation.status !== "OK") return unobserved(t);
  if (observation.branch !== null) return observation.branch;
  return observation.detached === true ? t("git.branch.detached") : unobserved(t);
}

function ActionButton({
  label,
  testId,
  onClick,
  enabled,
  primary,
  title,
}: {
  label: string;
  testId: string;
  onClick: () => void;
  enabled: boolean;
  primary?: boolean;
  title?: string;
}) {
  return (
    <button type="button" className={primary ? "primary" : undefined} onClick={onClick} disabled={!enabled} data-testid={testId} title={title}>
      {label}
    </button>
  );
}

export function ReviewDetail({
  session,
  project,
  artifacts,
  busy,
  observation,
  freshness,
  onRefreshGit,
  onAction,
  onOpenDialog,
  onOpenGithub,
  onOpenChatgpt,
  onOpenFolder,
  onCopyPrompt,
  onSaveNextAction,
}: ReviewDetailProps) {
  const t = useT();
  const round = currentRound(session);
  const captured = latestCapturedRound(session);
  const [nextAction, setNextAction] = useState(session.nextAction);
  const [showFullResult, setShowFullResult] = useState(false);

  useEffect(() => {
    setNextAction(session.nextAction);
  }, [session.reviewSessionId, session.nextAction]);

  useEffect(() => {
    setShowFullResult(false);
  }, [session.reviewSessionId]);

  const can = (type: ReviewAction["type"]) => !busy && canApply(session, type);
  const state = session.reviewState;
  const suspended = state === "SUSPENDED";
  const githubUrl =
    project?.repositoryUrl && session.prNumber !== null ? pullRequestUrl(project.repositoryUrl, session.prNumber) : (project?.repositoryUrl ?? null);
  const resultText = artifacts?.latestResult?.text ?? null;
  const shownResult = resultText === null ? null : showFullResult ? { text: resultText, truncated: false } : excerpt(resultText, 20);
  const recentEvents = artifacts ? artifacts.events.slice(-8).reverse() : [];
  const UNRECORDED = unrecorded(t);
  const UNOBSERVED = unobserved(t);

  return (
    <article className="detail" data-testid="detail" data-review-id={session.reviewSessionId}>
      <header className="detail-header">
        <div>
          <h2 data-testid="detail-project-name">{project?.displayName ?? session.projectId}</h2>
          <p className="muted">
            {t("detail.header.summary", {
              type: session.reviewType,
              pr: session.prNumber !== null ? t("detail.header.pr", { pr: session.prNumber }) : t("detail.header.noPr"),
              round: session.reviewRound,
            })}
          </p>
        </div>
        <div className="detail-badges">
          <ReviewStateBadge state={state} testId="detail-review-state" />
          <ResourceStateBadge state={session.resourceState} testId="detail-resource-state" />
        </div>
      </header>

      {suspended && session.suspendedFrom && (
        <div className="callout" data-testid="detail-suspended-from" data-state={session.suspendedFrom}>
          {t("detail.suspendedFrom", { state: t(REVIEW_STATE_KEYS[session.suspendedFrom]) })}
        </div>
      )}
      {!project && <div className="callout callout-warning">{t("detail.projectMissing", { id: session.projectId })}</div>}

      <section className="action-bar" aria-label={t("detail.actions.ariaLabel")}>
        {suspended ? (
          <ActionButton label={t("detail.actions.resume")} testId="action-resume" primary enabled={can("resume")} onClick={() => onAction({ type: "resume" })} />
        ) : (
          <>
            {session.resourceState !== "HOT" && state !== "CLOSED" && (
              <ActionButton label={t("detail.actions.resumeHot")} testId="action-resume" enabled={can("resume")} onClick={() => onAction({ type: "resume" })} />
            )}
            {(state === "NEW" || state === "BLOCKED") && (
              <ActionButton label={t("detail.actions.markReady")} testId="action-mark-ready" primary enabled={can("markReady")} onClick={() => onAction({ type: "markReady" })} />
            )}
            {state === "READY_FOR_REVIEW" && (
              <ActionButton label={t("detail.actions.startReview")} testId="action-start-review" primary enabled={can("startReview")} onClick={() => onAction({ type: "startReview" })} />
            )}
            {state === "REVIEWING" && (
              <>
                <ActionButton label={t("detail.actions.captureResult")} testId="action-capture" primary enabled={can("captureResult")} onClick={() => onOpenDialog("capture")} />
                <ActionButton
                  label={t("detail.actions.confirmVerdict")}
                  testId="action-verdict"
                  enabled={can("confirmVerdict") && round.resultCapturedAt !== null}
                  title={round.resultCapturedAt === null ? t("detail.actions.confirmVerdictDisabled") : undefined}
                  onClick={() => onOpenDialog("verdict")}
                />
                <ActionButton label={t("detail.actions.cancelReview")} testId="action-cancel-review" enabled={can("cancelReview")} onClick={() => onAction({ type: "cancelReview" })} />
              </>
            )}
            {(state === "FIX_REQUIRED" || state === "REVIEW_PASS") && (
              <ActionButton
                label={t("detail.actions.startNextRound", { round: session.reviewRound + 1 })}
                testId="action-next-round"
                primary
                enabled={can("startNextRound")}
                title={session.reviewRound >= MAX_REVIEW_ROUNDS ? t("detail.actions.roundLimit", { max: MAX_REVIEW_ROUNDS }) : undefined}
                onClick={() => onOpenDialog("nextRound")}
              />
            )}
            {(state === "FIX_REQUIRED" || state === "REVIEW_PASS" || state === "BLOCKED") && (
              <ActionButton label={t("detail.actions.recaptureResult")} testId="action-capture" enabled={can("captureResult")} onClick={() => onOpenDialog("capture")} />
            )}
            <ActionButton label={t("detail.actions.suspend")} testId="action-suspend" enabled={can("suspend")} onClick={() => onOpenDialog("suspend")} />
          </>
        )}
        <span className="action-spacer" />
        {state !== "BLOCKED" && state !== "CLOSED" && !suspended && (
          <ActionButton label={t("detail.actions.block")} testId="action-block" enabled={can("block")} onClick={() => onOpenDialog("block")} />
        )}
        {state !== "CLOSED" && <ActionButton label={t("detail.actions.close")} testId="action-close" enabled={can("close")} onClick={() => onOpenDialog("close")} />}
      </section>

      <section className="action-bar secondary" aria-label={t("detail.actions.openAriaLabel")}>
        <ActionButton
          label={t("detail.actions.openGithub")}
          testId="action-open-github"
          enabled={!busy && githubUrl !== null}
          onClick={onOpenGithub}
          title={githubUrl ?? t("detail.actions.openGithubMissing")}
        />
        <ActionButton
          label={t("detail.actions.openChatgpt")}
          testId="action-open-chatgpt"
          enabled={!busy && session.chatgptThreadUrl !== null}
          onClick={onOpenChatgpt}
          title={session.chatgptThreadUrl ?? t("detail.actions.openChatgptMissing")}
        />
        <ActionButton
          label={t("detail.actions.openFolder")}
          testId="action-open-folder"
          enabled={!busy && !!project?.localRoot}
          onClick={onOpenFolder}
          title={project?.localRoot ?? t("detail.actions.openFolderMissing")}
        />
        <ActionButton
          label={t("detail.actions.copyPrompt", { round: session.reviewRound })}
          testId="action-copy-prompt"
          enabled={can("recordRequestSaved") && project !== null}
          onClick={onCopyPrompt}
        />
      </section>

      <div className="detail-grid">
        <section className="card">
          <header className="card-header">
            <h3>{t("detail.card.review")}</h3>
            <button type="button" className="link-button" onClick={() => onOpenDialog("editReview")} disabled={busy} data-testid="action-edit-review">
              {t("detail.edit")}
            </button>
          </header>
          <dl>
            <Row label={t("detail.field.reviewType")} testId="detail-review-type">
              {session.reviewType}
            </Row>
            <Row label={t("detail.field.pr")} testId="detail-pr">
              {session.prNumber !== null ? t("detail.value.prNumber", { pr: session.prNumber }) : UNRECORDED}
            </Row>
            <Row label={t("detail.field.round")} testId="detail-round">
              {t("detail.value.round", { round: session.reviewRound })}
            </Row>
            <Row label={t("detail.field.expectedHead")} testId="detail-expected-head" mono>
              {round.expectedHead ?? UNRECORDED}
            </Row>
            <Row label={t("detail.field.reviewedHead")} testId="detail-reviewed-head" mono>
              {round.reviewedHead ?? UNRECORDED}
            </Row>
            <Row label={t("detail.field.requestSaved")}>
              {round.requestSavedAt
                ? t("detail.field.requestSavedValue", { timestamp: formatTimestamp(t, round.requestSavedAt), round: round.round })
                : UNRECORDED}
            </Row>
            <Row label={t("detail.field.updated")}>{formatTimestamp(t, session.updatedAt)}</Row>
          </dl>
        </section>

        <section className="card">
          <header className="card-header">
            <h3>{t("detail.card.state")}</h3>
          </header>
          <dl>
            <Row label={t("detail.field.reviewState")}>
              <ReviewStateBadge state={state} />
            </Row>
            <Row label={t("detail.field.resourceState")}>
              <div className="segmented compact" role="group" aria-label={t("detail.field.resourceState")}>
                {RESOURCE_STATES.map((resource: ResourceState) => (
                  <button
                    key={resource}
                    type="button"
                    className={session.resourceState === resource ? "selected" : ""}
                    aria-pressed={session.resourceState === resource}
                    disabled={busy || session.resourceState === resource}
                    title={t(RESOURCE_HINT_KEYS[resource])}
                    onClick={() => onAction({ type: "setResource", resourceState: resource })}
                    data-testid={`resource-${resource}`}
                  >
                    {t(RESOURCE_STATE_KEYS[resource])}
                  </button>
                ))}
              </div>
            </Row>
          </dl>
          <p className="hint">{t(RESOURCE_HINT_KEYS[session.resourceState])}</p>
        </section>

        <section className="card">
          <header className="card-header">
            <h3>{t("detail.card.thread")}</h3>
          </header>
          <dl>
            <Row label={t("detail.field.threadTitle")} testId="detail-thread-title">
              {session.chatgptThreadTitle ?? UNRECORDED}
            </Row>
            <Row label={t("detail.field.threadUrl")} testId="detail-thread-url" mono>
              {session.chatgptThreadUrl ?? UNRECORDED}
            </Row>
          </dl>
        </section>

        <section className="card">
          <header className="card-header">
            <h3>{t("detail.card.project")}</h3>
            <button type="button" className="link-button" onClick={() => onOpenDialog("editProject")} disabled={busy || !project} data-testid="action-edit-project">
              {t("detail.edit")}
            </button>
          </header>
          <dl>
            <Row label={t("detail.field.repository")} testId="detail-repository" mono>
              {project?.repositoryUrl ?? UNRECORDED}
            </Row>
            <Row label={t("detail.field.localRoot")} testId="detail-local-root" mono>
              {project?.localRoot ?? UNRECORDED}
            </Row>
            <Row label={t("detail.field.ide")}>{project?.developmentIde ?? UNRECORDED}</Row>
            <Row label={t("detail.field.projectNextAction")}>{project?.nextAction || UNRECORDED}</Row>
          </dl>
        </section>
      </div>

      <section className="card git-evidence" data-testid="git-evidence">
        <header className="card-header">
          <h3>{t("detail.card.gitEvidence")}</h3>
          <button type="button" className="link-button" onClick={onRefreshGit} disabled={busy} data-testid="action-refresh-git">
            {t("git.refresh")}
          </button>
        </header>
        <div className="freshness-line">
          <FreshnessBadge status={freshness.status} testId="detail-freshness" />
          <span className="small" data-testid="detail-freshness-explanation">
            {translate(t, freshness.explanation)}
          </span>
        </div>
        <dl>
          <Row label={t("git.field.observation")} testId="detail-git-status">
            {observation ? t(GIT_STATUS_KEYS[observation.status]) : UNOBSERVED}
          </Row>
          <Row label={t("git.field.branch")} testId="detail-git-branch">
            {currentBranch(t, observation)}
          </Row>
          <Row label={t("git.field.head")} testId="detail-current-head" mono>
            {observation?.head ?? UNOBSERVED}
          </Row>
          <Row label={t("git.field.worktree")} testId="detail-worktree">
            {workingTree(t, observation)}
          </Row>
          <Row label={t("detail.field.expectedHead")} testId="detail-freshness-expected" mono>
            {round.expectedHead ?? UNRECORDED}
          </Row>
          <Row label={t("detail.field.reviewedHead")} testId="detail-freshness-reviewed" mono>
            {round.reviewedHead ?? UNRECORDED}
          </Row>
          <Row label={t("git.field.observedAt")} testId="detail-observed-at">
            {observation ? formatTimestamp(t, observation.observedAt) : UNOBSERVED}
          </Row>
        </dl>
        <p className="hint">{t("git.hint")}</p>
      </section>

      <section className="card">
        <header className="card-header">
          <h3>{t("detail.card.nextAction")}</h3>
        </header>
        <textarea
          rows={3}
          value={nextAction}
          onChange={(e) => setNextAction(e.target.value)}
          aria-label={t("detail.nextAction.ariaLabel")}
          data-testid="detail-next-action"
        />
        <div className="card-actions">
          <button
            type="button"
            className="primary"
            disabled={busy || nextAction.trim() === session.nextAction}
            onClick={() => void onSaveNextAction(nextAction)}
            data-testid="next-action-save"
          >
            {t("detail.nextAction.save")}
          </button>
          {nextAction.trim() !== session.nextAction && (
            <button type="button" onClick={() => setNextAction(session.nextAction)} disabled={busy}>
              {t("detail.nextAction.revert")}
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <h3>{t("detail.card.checkpoint")}</h3>
          <span className="muted small">{t("detail.checkpoint.file")}</span>
        </header>
        {artifacts === undefined ? (
          <p className="muted">{t("detail.checkpoint.loading")}</p>
        ) : artifacts.checkpoint === null ? (
          <p className="muted">{t("detail.checkpoint.none")}</p>
        ) : (
          <pre className="result-text" data-testid="detail-checkpoint">
            {artifacts.checkpoint}
          </pre>
        )}
      </section>

      <section className="card">
        <header className="card-header">
          <h3>{t("detail.card.previousResult")}</h3>
          {captured && (
            <span className="muted small">
              {t("detail.previousResult.summary", {
                round: captured.round,
                verdict: captured.verdict ? t(VERDICT_KEYS[captured.verdict]) : t("detail.previousResult.verdictPending"),
                timestamp: formatTimestamp(t, captured.resultCapturedAt),
              })}
            </span>
          )}
        </header>
        {captured === null ? (
          <p className="muted">{t("detail.previousResult.none")}</p>
        ) : artifacts === undefined ? (
          <p className="muted">{t("detail.previousResult.loading")}</p>
        ) : shownResult === null ? (
          <p className="error-text">{t("detail.previousResult.unreadable", { round: captured.round })}</p>
        ) : (
          <>
            <pre className="result-text" data-testid="detail-previous-result">
              {shownResult.text}
              {shownResult.truncated ? t("detail.truncated") : ""}
            </pre>
            {(shownResult.truncated || showFullResult) && (
              <button type="button" className="link-button" onClick={() => setShowFullResult((v) => !v)}>
                {showFullResult ? t("detail.previousResult.showLess") : t("detail.previousResult.showFull")}
              </button>
            )}
          </>
        )}
        {captured?.verdictNote && <p className="hint">{t("detail.previousResult.verdictNote", { note: captured.verdictNote })}</p>}
        {captured && captured.archivedResults.length > 0 && (
          <p className="hint" data-testid="detail-archived-results">
            {t("detail.previousResult.archived", { round: captured.round, files: captured.archivedResults.join(", ") })}
          </p>
        )}
      </section>

      <section className="card">
        <header className="card-header">
          <h3>{t("detail.card.recentEvents")}</h3>
          <span className="muted small">{t("detail.events.file")}</span>
        </header>
        {artifacts && artifacts.skippedEventLines > 0 && (
          <p className="warning-text">{t("detail.events.skipped", { count: artifacts.skippedEventLines })}</p>
        )}
        {artifacts && artifacts.errors.length > 0 && <p className="error-text">{artifacts.errors.join(" / ")}</p>}
        {recentEvents.length === 0 ? (
          <p className="muted">{t("detail.events.none")}</p>
        ) : (
          <ol className="event-list" data-testid="detail-events">
            {recentEvents.map((event, index) => (
              <li key={`${event.ts}-${index}`} data-event-type={event.type}>
                <span className="mono small">{formatTimestamp(t, event.ts)}</span> <strong>{t(EVENT_TYPE_KEYS[event.type])}</strong>
                {event.reviewState && (
                  <span className="muted small">
                    {" "}
                    {t("detail.events.stateChange", {
                      from: event.reviewState.from ? t(REVIEW_STATE_KEYS[event.reviewState.from]) : t("detail.events.noState"),
                      to: t(REVIEW_STATE_KEYS[event.reviewState.to]),
                    })}
                  </span>
                )}
                {event.resourceState && (
                  <span className="muted small">
                    {" "}
                    [
                    {t("detail.events.stateChange", {
                      from: event.resourceState.from ? t(RESOURCE_STATE_KEYS[event.resourceState.from]) : t("detail.events.noState"),
                      to: t(RESOURCE_STATE_KEYS[event.resourceState.to]),
                    })}
                    ]
                  </span>
                )}
                {event.note && <span className="small">{t("detail.events.note", { note: event.note })}</span>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
  );
}
