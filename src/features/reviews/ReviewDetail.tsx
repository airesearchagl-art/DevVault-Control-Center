import { useEffect, useState, type ReactNode } from "react";
import { excerpt, formatTimestamp } from "../../app/format";
import { ResourceStateBadge, ReviewStateBadge } from "../../components/StateBadge";
import { MAX_REVIEW_ROUNDS } from "../../domain/limits";
import type { Project } from "../../domain/project";
import { currentRound, latestCapturedRound, type ReviewSession } from "../../domain/review";
import { REVIEW_STATE_LABELS, RESOURCE_STATE_HINTS, RESOURCE_STATES, type ResourceState } from "../../domain/states";
import { canApply, type ReviewAction } from "../../domain/transitions";
import { pullRequestUrl } from "../../domain/validation";
import type { ReviewArtifacts } from "../../services/persistence";

export type DetailDialog = "suspend" | "capture" | "verdict" | "block" | "close" | "nextRound" | "editReview" | "editProject";

interface ReviewDetailProps {
  session: ReviewSession;
  project: Project | null;
  artifacts: ReviewArtifacts | undefined;
  busy: boolean;
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

const UNRECORDED = <span className="muted">— not recorded</span>;

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
  onAction,
  onOpenDialog,
  onOpenGithub,
  onOpenChatgpt,
  onOpenFolder,
  onCopyPrompt,
  onSaveNextAction,
}: ReviewDetailProps) {
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

  return (
    <article className="detail" data-testid="detail" data-review-id={session.reviewSessionId}>
      <header className="detail-header">
        <div>
          <h2 data-testid="detail-project-name">{project?.displayName ?? session.projectId}</h2>
          <p className="muted">
            {session.reviewType} · {session.prNumber !== null ? `PR #${session.prNumber}` : "No PR"} · Round R{session.reviewRound}
          </p>
        </div>
        <div className="detail-badges">
          <ReviewStateBadge state={state} testId="detail-review-state" />
          <ResourceStateBadge state={session.resourceState} testId="detail-resource-state" />
        </div>
      </header>

      {suspended && session.suspendedFrom && (
        <div className="callout" data-testid="detail-suspended-from" data-state={session.suspendedFrom}>
          Suspended from <strong>{REVIEW_STATE_LABELS[session.suspendedFrom]}</strong>. Resume restores that state and sets the resource to HOT.
        </div>
      )}
      {!project && <div className="callout callout-warning">Project “{session.projectId}” is not in projects.json.</div>}

      <section className="action-bar" aria-label="Review actions">
        {suspended ? (
          <ActionButton label="Resume" testId="action-resume" primary enabled={can("resume")} onClick={() => onAction({ type: "resume" })} />
        ) : (
          <>
            {session.resourceState !== "HOT" && state !== "CLOSED" && (
              <ActionButton label="Resume (HOT)" testId="action-resume" enabled={can("resume")} onClick={() => onAction({ type: "resume" })} />
            )}
            {(state === "NEW" || state === "BLOCKED") && (
              <ActionButton label="Mark ready" testId="action-mark-ready" primary enabled={can("markReady")} onClick={() => onAction({ type: "markReady" })} />
            )}
            {state === "READY_FOR_REVIEW" && (
              <ActionButton label="Start review" testId="action-start-review" primary enabled={can("startReview")} onClick={() => onAction({ type: "startReview" })} />
            )}
            {state === "REVIEWING" && (
              <>
                <ActionButton label="Capture result" testId="action-capture" primary enabled={can("captureResult")} onClick={() => onOpenDialog("capture")} />
                <ActionButton
                  label="Confirm verdict"
                  testId="action-verdict"
                  enabled={can("confirmVerdict") && round.resultCapturedAt !== null}
                  title={round.resultCapturedAt === null ? "Capture the result of this round first" : undefined}
                  onClick={() => onOpenDialog("verdict")}
                />
                <ActionButton label="Cancel review" testId="action-cancel-review" enabled={can("cancelReview")} onClick={() => onAction({ type: "cancelReview" })} />
              </>
            )}
            {(state === "FIX_REQUIRED" || state === "REVIEW_PASS") && (
              <ActionButton
                label={`Start R${session.reviewRound + 1}`}
                testId="action-next-round"
                primary
                enabled={can("startNextRound")}
                title={session.reviewRound >= MAX_REVIEW_ROUNDS ? `Round limit R${MAX_REVIEW_ROUNDS} reached` : undefined}
                onClick={() => onOpenDialog("nextRound")}
              />
            )}
            {(state === "FIX_REQUIRED" || state === "REVIEW_PASS" || state === "BLOCKED") && (
              <ActionButton label="Re-capture result" testId="action-capture" enabled={can("captureResult")} onClick={() => onOpenDialog("capture")} />
            )}
            <ActionButton label="Suspend…" testId="action-suspend" enabled={can("suspend")} onClick={() => onOpenDialog("suspend")} />
          </>
        )}
        <span className="action-spacer" />
        {state !== "BLOCKED" && state !== "CLOSED" && !suspended && (
          <ActionButton label="Block…" testId="action-block" enabled={can("block")} onClick={() => onOpenDialog("block")} />
        )}
        {state !== "CLOSED" && <ActionButton label="Close…" testId="action-close" enabled={can("close")} onClick={() => onOpenDialog("close")} />}
      </section>

      <section className="action-bar secondary" aria-label="Open and copy">
        <ActionButton label="Open GitHub" testId="action-open-github" enabled={!busy && githubUrl !== null} onClick={onOpenGithub} title={githubUrl ?? "No repository URL recorded"} />
        <ActionButton
          label="Open ChatGPT"
          testId="action-open-chatgpt"
          enabled={!busy && session.chatgptThreadUrl !== null}
          onClick={onOpenChatgpt}
          title={session.chatgptThreadUrl ?? "No thread URL recorded"}
        />
        <ActionButton
          label="Open project folder"
          testId="action-open-folder"
          enabled={!busy && !!project?.localRoot}
          onClick={onOpenFolder}
          title={project?.localRoot ?? "No local root recorded"}
        />
        <ActionButton
          label={`Copy review prompt (R${session.reviewRound})`}
          testId="action-copy-prompt"
          enabled={can("recordRequestSaved") && project !== null}
          onClick={onCopyPrompt}
        />
      </section>

      <div className="detail-grid">
        <section className="card">
          <header className="card-header">
            <h3>Review</h3>
            <button type="button" className="link-button" onClick={() => onOpenDialog("editReview")} disabled={busy} data-testid="action-edit-review">
              Edit
            </button>
          </header>
          <dl>
            <Row label="Review type" testId="detail-review-type">
              {session.reviewType}
            </Row>
            <Row label="PR" testId="detail-pr">
              {session.prNumber !== null ? `#${session.prNumber}` : UNRECORDED}
            </Row>
            <Row label="Round" testId="detail-round">
              R{session.reviewRound}
            </Row>
            <Row label="Expected HEAD (recorded)" testId="detail-expected-head" mono>
              {round.expectedHead ?? UNRECORDED}
            </Row>
            <Row label="Reviewed HEAD (recorded)" testId="detail-reviewed-head" mono>
              {round.reviewedHead ?? UNRECORDED}
            </Row>
            <Row label="Request saved">{round.requestSavedAt ? `${formatTimestamp(round.requestSavedAt)} · request-r${round.round}.md` : UNRECORDED}</Row>
            <Row label="Updated">{formatTimestamp(session.updatedAt)}</Row>
          </dl>
        </section>

        <section className="card">
          <header className="card-header">
            <h3>State</h3>
          </header>
          <dl>
            <Row label="Review state">
              <ReviewStateBadge state={state} />
            </Row>
            <Row label="Resource state">
              <div className="segmented compact" role="group" aria-label="Resource state">
                {RESOURCE_STATES.map((resource: ResourceState) => (
                  <button
                    key={resource}
                    type="button"
                    className={session.resourceState === resource ? "selected" : ""}
                    aria-pressed={session.resourceState === resource}
                    disabled={busy || session.resourceState === resource}
                    title={RESOURCE_STATE_HINTS[resource]}
                    onClick={() => onAction({ type: "setResource", resourceState: resource })}
                    data-testid={`resource-${resource}`}
                  >
                    {resource}
                  </button>
                ))}
              </div>
            </Row>
          </dl>
          <p className="hint">{RESOURCE_STATE_HINTS[session.resourceState]}</p>
        </section>

        <section className="card">
          <header className="card-header">
            <h3>ChatGPT thread</h3>
          </header>
          <dl>
            <Row label="Title" testId="detail-thread-title">
              {session.chatgptThreadTitle ?? UNRECORDED}
            </Row>
            <Row label="URL" testId="detail-thread-url" mono>
              {session.chatgptThreadUrl ?? UNRECORDED}
            </Row>
          </dl>
        </section>

        <section className="card">
          <header className="card-header">
            <h3>Project</h3>
            <button type="button" className="link-button" onClick={() => onOpenDialog("editProject")} disabled={busy || !project} data-testid="action-edit-project">
              Edit
            </button>
          </header>
          <dl>
            <Row label="Repository" testId="detail-repository" mono>
              {project?.repositoryUrl ?? UNRECORDED}
            </Row>
            <Row label="Local root" testId="detail-local-root" mono>
              {project?.localRoot ?? UNRECORDED}
            </Row>
            <Row label="IDE">{project?.developmentIde ?? UNRECORDED}</Row>
            <Row label="Project next action">{project?.nextAction || UNRECORDED}</Row>
          </dl>
        </section>
      </div>

      <section className="card">
        <header className="card-header">
          <h3>Next action</h3>
        </header>
        <textarea
          rows={3}
          value={nextAction}
          onChange={(e) => setNextAction(e.target.value)}
          aria-label="Next action"
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
            Save next action
          </button>
          {nextAction.trim() !== session.nextAction && (
            <button type="button" onClick={() => setNextAction(session.nextAction)} disabled={busy}>
              Revert
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <h3>Checkpoint</h3>
          <span className="muted small">checkpoint.md</span>
        </header>
        {artifacts === undefined ? (
          <p className="muted">Loading…</p>
        ) : artifacts.checkpoint === null ? (
          <p className="muted">No checkpoint saved. Suspend writes one.</p>
        ) : (
          <pre className="result-text" data-testid="detail-checkpoint">
            {artifacts.checkpoint}
          </pre>
        )}
      </section>

      <section className="card">
        <header className="card-header">
          <h3>Previous result</h3>
          {captured && (
            <span className="muted small">
              R{captured.round} · {captured.verdict ?? "verdict not confirmed"} · captured {formatTimestamp(captured.resultCapturedAt)}
            </span>
          )}
        </header>
        {captured === null ? (
          <p className="muted">No result captured yet.</p>
        ) : artifacts === undefined ? (
          <p className="muted">Loading…</p>
        ) : shownResult === null ? (
          <p className="error-text">result-r{captured.round}.md could not be read.</p>
        ) : (
          <>
            <pre className="result-text" data-testid="detail-previous-result">
              {shownResult.text}
              {shownResult.truncated ? "\n…" : ""}
            </pre>
            {(shownResult.truncated || showFullResult) && (
              <button type="button" className="link-button" onClick={() => setShowFullResult((v) => !v)}>
                {showFullResult ? "Show less" : "Show full result"}
              </button>
            )}
          </>
        )}
        {captured?.verdictNote && <p className="hint">Verdict note: {captured.verdictNote}</p>}
        {captured && captured.archivedResults.length > 0 && (
          <p className="hint" data-testid="detail-archived-results">
            Earlier results of R{captured.round} kept: {captured.archivedResults.join(", ")}
          </p>
        )}
      </section>

      <section className="card">
        <header className="card-header">
          <h3>Recent events</h3>
          <span className="muted small">events.jsonl</span>
        </header>
        {artifacts && artifacts.skippedEventLines > 0 && (
          <p className="warning-text">{artifacts.skippedEventLines} unreadable line(s) in events.jsonl were skipped (file left unchanged).</p>
        )}
        {artifacts && artifacts.errors.length > 0 && <p className="error-text">{artifacts.errors.join(" / ")}</p>}
        {recentEvents.length === 0 ? (
          <p className="muted">No events.</p>
        ) : (
          <ol className="event-list" data-testid="detail-events">
            {recentEvents.map((event, index) => (
              <li key={`${event.ts}-${index}`} data-event-type={event.type}>
                <span className="mono small">{formatTimestamp(event.ts)}</span> <strong>{event.type}</strong>
                {event.reviewState && (
                  <span className="muted small">
                    {" "}
                    {event.reviewState.from ?? "∅"} → {event.reviewState.to}
                  </span>
                )}
                {event.resourceState && (
                  <span className="muted small">
                    {" "}
                    [{event.resourceState.from ?? "∅"} → {event.resourceState.to}]
                  </span>
                )}
                {event.note && <span className="small"> — {event.note}</span>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
  );
}
