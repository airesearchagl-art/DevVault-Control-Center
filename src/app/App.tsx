import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Banner, Toasts } from "../components/Banner";
import { ConfirmDialog } from "../components/Dialog";
import { emptyProjectForm, projectToForm, type ProjectFormInput } from "../domain/project";
import { buildQueue } from "../domain/queue";
import {
  currentRound,
  emptyReviewForm,
  reviewToMetadataForm,
  validateReviewMetadata,
  type ReviewFormInput,
  type ReviewMetadataInput,
  type ReviewSession,
} from "../domain/review";
import type { FieldErrors } from "../domain/result";
import type { ReviewAction } from "../domain/transitions";
import { pullRequestUrl } from "../domain/validation";
import { ProjectFormDialog } from "../features/projects/ProjectForm";
import { ReviewDetail, type DetailDialog } from "../features/reviews/ReviewDetail";
import { CaptureResultDialog, NextRoundDialog, SuspendDialog, VerdictDialog, type VerdictChoice } from "../features/reviews/ReviewDialogs";
import { CreateReviewDialog, EditReviewDialog } from "../features/reviews/ReviewForm";
import { ReviewQueue } from "../features/reviews/ReviewQueue";
import { copyText } from "../services/clipboard";
import { tauriLauncher } from "../services/launcher";
import { describeHealthProblem, isWritable } from "../services/persistence";
import { ReviewHub } from "../services/reviewHub";
import type { SaveOutcome } from "../services/reviewService";
import { tauriStorage, toStorageError } from "../services/storage";
import { appReducer, initialAppState, type ToastKind } from "./appState";
import { describeError } from "./format";
import "./App.css";

const launcher = tauriLauncher;

type DialogState =
  | null
  | { kind: "createProject" }
  | { kind: "editProject"; projectId: string }
  | { kind: "createReview"; projectId: string }
  | { kind: Exclude<DetailDialog, "editProject">; reviewId: string }
  | { kind: "setAsideProjects" };

// User-facing text for a failed save; conflicts explain that nothing was overwritten.
function saveFailed(error: unknown): string {
  const storageError = toStorageError(error);
  if (storageError.code === "CONFLICT") {
    return "Not saved: a file was changed on disk by another program since DVCC loaded it, and DVCC did not overwrite that change. Use Reload to see the current data.";
  }
  if (storageError.code === "RECOVERY_REQUIRED") {
    return "Not saved: the file is missing but its backup exists. Reload to restore it from the backup.";
  }
  return `Save failed: ${describeError(error)}`;
}

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pending, setPending] = useState(0);
  const loadStarted = useRef(false);
  const hubRef = useRef<ReviewHub | null>(null);
  if (hubRef.current === null) hubRef.current = new ReviewHub(tauriStorage);
  const hub = hubRef.current;
  const busy = pending > 0;

  const notify = useCallback((kind: ToastKind, message: string) => dispatch({ type: "toast", kind, message }), []);
  const dismissToast = useCallback((id: number) => dispatch({ type: "dismissToast", id }), []);
  const closeDialog = useCallback(() => setDialog(null), []);

  // The UI shows exactly the state the hub committed (F-4), in commit order.
  useEffect(() => hub.subscribe((snapshot) => dispatch({ type: "hubCommitted", snapshot })), [hub]);

  // Tracks in-flight operations for the busy indicator; correctness does not depend on it.
  const track = useCallback(async <T,>(operation: Promise<T>): Promise<T> => {
    setPending((n) => n + 1);
    try {
      return await operation;
    } finally {
      setPending((n) => n - 1);
    }
  }, []);

  const reload = useCallback(async () => {
    try {
      const storage = await hub.info();
      const data = await hub.load();
      dispatch({ type: "loaded", storage, data });
    } catch (error) {
      dispatch({ type: "fatal", message: describeError(error) });
    }
  }, [hub]);

  useEffect(() => {
    // Single initial load (StrictMode runs effects twice in development).
    if (loadStarted.current) return;
    loadStarted.current = true;
    void reload();
  }, [reload]);

  const selected = state.reviews.find((review) => review.reviewId === state.selectedReviewId) ?? null;
  const selectedSession = selected?.session ?? null;
  const projectById = useMemo(() => new Map(state.projects.map((project) => [project.projectId, project])), [state.projects]);
  const selectedProject = selectedSession ? (projectById.get(selectedSession.projectId) ?? null) : null;
  const projectsWritable = isWritable(state.projectsHealth);

  useEffect(() => {
    if (!selectedSession) return;
    let cancelled = false;
    const reviewId = selectedSession.reviewSessionId;
    void hub.loadArtifacts(reviewId).then(
      (artifacts) => {
        if (!cancelled && artifacts) dispatch({ type: "artifactsLoaded", reviewId, artifacts });
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [hub, selectedSession]);

  const queue = useMemo(
    () =>
      buildQueue(
        state.reviews.map((review) => ({ reviewId: review.reviewId, session: review.session, problem: describeHealthProblem(review.health) })),
        state.projects,
        state.filter,
      ),
    [state.reviews, state.projects, state.filter],
  );

  const reviewCountByProject = useMemo(() => {
    const counts = new Map<string, number>();
    for (const review of state.reviews) {
      if (review.session) counts.set(review.session.projectId, (counts.get(review.session.projectId) ?? 0) + 1);
    }
    return counts;
  }, [state.reviews]);

  const findSession = (reviewId: string): ReviewSession | null => state.reviews.find((r) => r.reviewId === reviewId)?.session ?? null;

  const warnIfNeeded = (outcome: SaveOutcome) => {
    if (outcome.warning) notify("warning", outcome.warning);
  };

  // Persists a transition through the hub. Only the review id is taken from `session`; the hub
  // applies the action to its latest committed state. Returns an error message or null.
  const runAction = async (session: ReviewSession, action: ReviewAction, success?: string): Promise<string | null> => {
    try {
      const result = await track(hub.apply(session.reviewSessionId, action));
      if (!result.ok) {
        notify("error", result.error);
        return result.error;
      }
      warnIfNeeded(result.value);
      if (success) notify("info", success);
      return null;
    } catch (error) {
      const message = saveFailed(error);
      notify("error", message);
      return message;
    }
  };

  const submitProject = async (input: ProjectFormInput, projectId?: string): Promise<FieldErrors | null> => {
    try {
      const result = await track(projectId ? hub.editProject(projectId, input) : hub.createProject(input));
      if (!result.ok) return result.error;
      setDialog(null);
      notify("info", projectId ? "Project saved" : `Project “${input.displayName.trim()}” created`);
      return null;
    } catch (error) {
      return { _form: saveFailed(error) };
    }
  };

  const submitReview = async (input: ReviewFormInput): Promise<FieldErrors | null> => {
    try {
      const result = await track(hub.createReview(input));
      if (!result.ok) return result.error;
      warnIfNeeded(result.value);
      dispatch({ type: "selectReview", reviewId: result.value.session.reviewSessionId });
      setDialog(null);
      notify("info", "Review created");
      return null;
    } catch (error) {
      return { _form: saveFailed(error) };
    }
  };

  const submitReviewMetadata = async (session: ReviewSession, input: ReviewMetadataInput): Promise<FieldErrors | null> => {
    const metadata = validateReviewMetadata(input);
    if (!metadata.ok) return metadata.error;
    const error = await runAction(session, { type: "updateMetadata", metadata: metadata.value }, "Review saved");
    if (error) return { _form: error };
    setDialog(null);
    return null;
  };

  const launch = async (open: () => Promise<void>, label: string) => {
    try {
      await open();
    } catch (error) {
      notify("error", `${label} failed: ${describeError(error)}`);
    }
  };

  const copyPrompt = async (session: ReviewSession) => {
    try {
      const result = await track(hub.saveRequest(session.reviewSessionId));
      if (!result.ok) {
        notify("error", result.error);
        return;
      }
      warnIfNeeded(result.value);
      const round = result.value.session.reviewRound;
      try {
        await copyText(result.value.text);
        notify("info", `Review request saved as request-r${round}.md and copied to the clipboard`);
      } catch (error) {
        notify("error", `Saved request-r${round}.md, but copying to the clipboard failed: ${describeError(error)}`);
      }
    } catch (error) {
      notify("error", saveFailed(error));
    }
  };

  const submitCapture = async (
    session: ReviewSession,
    text: string,
    reviewedHead: string | null,
    replaceConfirmed: boolean,
  ): Promise<string | null> => {
    try {
      const result = await track(hub.captureResult(session.reviewSessionId, text, reviewedHead, replaceConfirmed));
      if (!result.ok) return result.error;
      warnIfNeeded(result.value);
      const saved = result.value.session;
      const kept = result.value.archivedAs ? ` The previous result was kept as ${result.value.archivedAs}.` : "";
      notify("info", `Result saved as result-r${saved.reviewRound}.md.${kept} The review state is unchanged until you confirm a verdict.`);
      setDialog(saved.reviewState === "REVIEWING" ? { kind: "verdict", reviewId: saved.reviewSessionId } : null);
      return null;
    } catch (error) {
      return saveFailed(error);
    }
  };

  const confirmVerdict = async (session: ReviewSession, verdict: VerdictChoice, note: string): Promise<string | null> => {
    const action: ReviewAction =
      verdict === "BLOCKED"
        ? { type: "block", reason: note, confirmedByHuman: true }
        : { type: "confirmVerdict", verdict, note: note.trim() === "" ? null : note, confirmedByHuman: true };
    const error = await runAction(session, action, `Verdict confirmed: ${verdict}`);
    if (!error) setDialog(null);
    return error;
  };

  const withDialogClose = async (promise: Promise<string | null>): Promise<string | null> => {
    const error = await promise;
    if (!error) setDialog(null);
    return error;
  };

  const setAsideProjects = async (): Promise<string | null> => {
    try {
      const kept = await track(hub.setAsideProjects());
      setDialog(null);
      notify("info", `Kept as ${kept.join(", ")}. Starting with an empty project list.`);
      return null;
    } catch (error) {
      return `Could not set the files aside: ${describeError(error)}`;
    }
  };

  const onDetailDialog = (kind: DetailDialog) => {
    if (!selectedSession) return;
    if (kind === "editProject") {
      if (selectedProject) setDialog({ kind: "editProject", projectId: selectedProject.projectId });
      return;
    }
    setDialog({ kind, reviewId: selectedSession.reviewSessionId });
  };

  if (state.phase === "loading") {
    return (
      <div className="fullscreen">
        <p className="muted">Loading DevVault Control Center…</p>
      </div>
    );
  }

  if (state.phase === "fatal") {
    return (
      <div className="fullscreen" data-testid="fatal">
        <h1>DevVault Control Center cannot open its data folder</h1>
        <p className="error-text">{state.fatalMessage}</p>
        <p className="muted">Nothing was changed. Check the folder permissions (or DVCC_DATA_DIR) and try again.</p>
        <button type="button" className="primary" onClick={() => void reload()}>
          Retry
        </button>
      </div>
    );
  }

  const projectsProblem = describeHealthProblem(state.projectsHealth);
  const dialogSession = dialog && "reviewId" in dialog ? findSession(dialog.reviewId) : null;
  const dialogProject = dialog?.kind === "editProject" ? (projectById.get(dialog.projectId) ?? null) : null;
  const dialogArtifacts = dialogSession ? state.artifacts[dialogSession.reviewSessionId] : undefined;
  const dialogResult =
    dialogSession && dialogArtifacts?.latestResult?.round === dialogSession.reviewRound ? dialogArtifacts.latestResult.text : null;

  let detail;
  if (selected && selectedSession) {
    detail = (
      <ReviewDetail
        session={selectedSession}
        project={selectedProject}
        artifacts={state.artifacts[selectedSession.reviewSessionId]}
        busy={busy}
        onAction={(action) => void runAction(selectedSession, action)}
        onOpenDialog={onDetailDialog}
        onOpenGithub={() => {
          const repo = selectedProject?.repositoryUrl;
          if (!repo) return notify("warning", "No repository URL recorded for this project");
          const url = selectedSession.prNumber !== null ? pullRequestUrl(repo, selectedSession.prNumber) : repo;
          void launch(() => launcher.openExternalUrl(url), "Open GitHub");
        }}
        onOpenChatgpt={() => {
          const url = selectedSession.chatgptThreadUrl;
          if (!url) return notify("warning", "No ChatGPT thread URL recorded for this review");
          void launch(() => launcher.openExternalUrl(url), "Open ChatGPT");
        }}
        onOpenFolder={() => {
          const root = selectedProject?.localRoot;
          if (!root) return notify("warning", "No local root recorded for this project");
          void launch(() => launcher.openProjectFolder(root), "Open project folder");
        }}
        onCopyPrompt={() => {
          void copyPrompt(selectedSession);
        }}
        onSaveNextAction={async (text) => (await runAction(selectedSession, { type: "setNextAction", nextAction: text }, "Next action saved")) === null}
      />
    );
  } else if (selected) {
    detail = (
      <div className="empty-state" data-testid="detail-unreadable" data-health={selected.health.status}>
        <h2>
          Review {selected.reviewId} {selected.health.status === "io_error" ? "cannot be accessed" : "cannot be read"}
        </h2>
        <p className="error-text">{describeHealthProblem(selected.health)}</p>
        {selected.health.status === "io_error" ? (
          <p className="muted">
            DVCC could not access <code>reviews/{selected.reviewId}/session.json</code> (for example permissions, a locked file or a device problem). This
            is not treated as damaged data: nothing was changed. Resolve the access problem, then reload. Other reviews are not affected.
          </p>
        ) : (
          <p className="muted">
            The file was left unchanged and this review is read-only. Fix or restore <code>reviews/{selected.reviewId}/session.json</code> in the data
            folder, then reload. Other reviews are not affected.
          </p>
        )}
        <div className="empty-actions">
          <button type="button" onClick={() => void launch(() => launcher.openDataDir(), "Open data folder")}>
            Open data folder
          </button>
          <button type="button" onClick={() => void reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  } else if (state.projects.length === 0 && state.reviews.length === 0) {
    detail = (
      <div className="empty-state" data-testid="empty-no-projects">
        <h2>Welcome to Review Hub</h2>
        <p className="muted">Register the projects you review, then create a review for each PR or review thread.</p>
        <div className="empty-actions">
          <button type="button" className="primary" disabled={!projectsWritable} onClick={() => setDialog({ kind: "createProject" })}>
            Register your first project
          </button>
        </div>
      </div>
    );
  } else if (state.reviews.length === 0) {
    detail = (
      <div className="empty-state" data-testid="empty-no-reviews">
        <h2>No reviews yet</h2>
        <p className="muted">Create a review to track its PR, HEAD, ChatGPT thread, state and next action.</p>
        <div className="empty-actions">
          <button type="button" className="primary" onClick={() => setDialog({ kind: "createReview", projectId: "" })} disabled={state.projects.length === 0}>
            Create a review
          </button>
        </div>
      </div>
    );
  } else {
    detail = (
      <div className="empty-state" data-testid="empty-no-selection">
        <h2>Select a review</h2>
        <p className="muted">Pick a review from the queue to see where it stands and resume it.</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          DevVault Control Center <span className="subtitle">Review Hub</span>
        </h1>
        <div className="topbar-actions">
          <button type="button" onClick={() => setDialog({ kind: "createProject" })} disabled={!projectsWritable} data-testid="btn-new-project">
            + Project
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => setDialog({ kind: "createReview", projectId: selectedSession?.projectId ?? "" })}
            disabled={state.projects.length === 0}
            data-testid="btn-new-review"
          >
            + Review
          </button>
        </div>
      </header>

      <div className="banners">
        {projectsProblem && (
          <Banner
            kind="error"
            testId={state.projectsHealth.status === "io_error" ? "banner-projects-io-error" : "banner-projects-unreadable"}
            actions={
              <>
                <button type="button" onClick={() => void launch(() => launcher.openDataDir(), "Open data folder")}>
                  Open data folder
                </button>
                <button type="button" onClick={() => void reload()}>
                  Reload
                </button>
                {state.projectsHealth.status === "unreadable" && state.projectsHealth.setAside.length > 0 && (
                  <button type="button" className="danger" onClick={() => setDialog({ kind: "setAsideProjects" })} data-testid="btn-set-aside-projects">
                    Set aside and start empty…
                  </button>
                )}
              </>
            }
          >
            {state.projectsHealth.status === "io_error" ? (
              <>
                <strong>projects.json cannot be accessed:</strong> {projectsProblem}. This is an access problem (for example permissions, a locked file or a
                device error), not damaged data. Nothing was changed; project editing is disabled until Reload succeeds.
              </>
            ) : (
              <>
                <strong>projects.json cannot be used:</strong> {projectsProblem}. Project editing is disabled and the file has not been changed.
              </>
            )}
          </Banner>
        )}
        {state.notices.map((notice) => (
          <Banner key={notice.id} kind="warning" testId="banner-notice" onDismiss={() => dispatch({ type: "dismissNotice", id: notice.id })}>
            {notice.message}
          </Banner>
        ))}
      </div>

      <main className="layout">
        <aside className="queue-pane">
          <ReviewQueue
            items={queue}
            totalCount={state.reviews.length}
            selectedId={state.selectedReviewId}
            filter={state.filter}
            projects={state.projects}
            reviewCountByProject={reviewCountByProject}
            projectsEditable={projectsWritable}
            onFilterChange={(filter) => dispatch({ type: "filterChanged", filter })}
            onSelect={(reviewId) => dispatch({ type: "selectReview", reviewId })}
            onEditProject={(projectId) => setDialog({ kind: "editProject", projectId })}
            onCreateReview={(projectId) => setDialog({ kind: "createReview", projectId })}
          />
        </aside>
        <section className="detail-pane">{detail}</section>
      </main>

      <footer className="statusbar">
        <span className="muted small">
          Data: <span className="mono" data-testid="data-dir">{state.storage?.dataDir}</span>
          {state.storage?.source === "env" && <span className="tag">DVCC_DATA_DIR</span>}
          {state.storage?.debugBuild && <span className="tag">debug build</span>}
        </span>
        <span className="statusbar-actions">
          <button type="button" className="link-button" onClick={() => void reload()} data-testid="btn-reload">
            Reload
          </button>
          <button type="button" className="link-button" onClick={() => void launch(() => launcher.openDataDir(), "Open data folder")}>
            Open data folder
          </button>
        </span>
      </footer>

      <Toasts toasts={state.toasts} onDismiss={dismissToast} />

      {dialog?.kind === "createProject" && (
        <ProjectFormDialog mode="create" initial={emptyProjectForm()} onSubmit={(input) => submitProject(input)} onCancel={closeDialog} />
      )}
      {dialog?.kind === "editProject" && dialogProject && (
        <ProjectFormDialog
          mode="edit"
          initial={projectToForm(dialogProject)}
          onSubmit={(input) => submitProject(input, dialogProject.projectId)}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === "createReview" && (
        <CreateReviewDialog projects={state.projects} initial={emptyReviewForm(dialog.projectId)} onSubmit={submitReview} onCancel={closeDialog} />
      )}
      {dialog?.kind === "editReview" && dialogSession && (
        <EditReviewDialog
          title="Edit review"
          roundLabel={`R${dialogSession.reviewRound}`}
          initial={reviewToMetadataForm(dialogSession)}
          onSubmit={(input) => submitReviewMetadata(dialogSession, input)}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === "suspend" && dialogSession && (
        <SuspendDialog
          session={dialogSession}
          onSubmit={(checkpoint, resourceState) =>
            withDialogClose(runAction(dialogSession, { type: "suspend", resourceState, checkpoint }, "Review suspended — checkpoint saved"))
          }
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === "capture" && dialogSession && (
        <CaptureResultDialog
          session={dialogSession}
          onSubmit={(text, reviewedHead, replaceConfirmed) => submitCapture(dialogSession, text, reviewedHead, replaceConfirmed)}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === "verdict" && dialogSession && (
        <VerdictDialog
          session={dialogSession}
          resultText={currentRound(dialogSession).resultCapturedAt === null ? null : dialogResult}
          onConfirm={(verdict, note) => confirmVerdict(dialogSession, verdict, note)}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === "nextRound" && dialogSession && (
        <NextRoundDialog
          session={dialogSession}
          onSubmit={(expectedHead) => withDialogClose(runAction(dialogSession, { type: "startNextRound", expectedHead }, `Round R${dialogSession.reviewRound + 1} started`))}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === "block" && dialogSession && (
        <ConfirmDialog
          title="Block review"
          message="The review moves to Blocked. Use Mark ready when it can continue."
          confirmLabel="Block review"
          reasonLabel="Reason (required)"
          testId="block-dialog"
          onConfirm={(reason) => withDialogClose(runAction(dialogSession, { type: "block", reason, confirmedByHuman: true }, "Review blocked"))}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === "close" && dialogSession && (
        <ConfirmDialog
          title="Close review"
          message="Closed reviews are hidden from the queue by default. Files and history are kept."
          confirmLabel="Close review"
          danger
          testId="close-dialog"
          onConfirm={() => withDialogClose(runAction(dialogSession, { type: "close", confirmedByHuman: true }, "Review closed"))}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === "setAsideProjects" && (
        <ConfirmDialog
          title="Set aside projects.json"
          message={
            <>
              The unusable <code>projects.json</code> (and its unusable backup, if any) is renamed to <code>….corrupt-…</code> in the data folder (not
              deleted), and DVCC starts with an empty project list. Reviews are not affected.
            </>
          }
          confirmLabel="Set aside and start empty"
          danger
          testId="set-aside-dialog"
          onConfirm={setAsideProjects}
          onCancel={closeDialog}
        />
      )}
    </div>
  );
}
