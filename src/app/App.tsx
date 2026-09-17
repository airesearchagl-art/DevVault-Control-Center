import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Banner, Toasts } from "../components/Banner";
import { ConfirmDialog } from "../components/Dialog";
import { emptyProjectForm, projectToForm, type Project, type ProjectFormInput } from "../domain/project";
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
import { generateReviewId, pullRequestUrl } from "../domain/validation";
import { ProjectFormDialog } from "../features/projects/ProjectForm";
import { ReviewDetail, type DetailDialog } from "../features/reviews/ReviewDetail";
import { CaptureResultDialog, NextRoundDialog, SuspendDialog, VerdictDialog, type VerdictChoice } from "../features/reviews/ReviewDialogs";
import { CreateReviewDialog, EditReviewDialog } from "../features/reviews/ReviewForm";
import { ReviewQueue } from "../features/reviews/ReviewQueue";
import { copyText } from "../services/clipboard";
import { tauriLauncher } from "../services/launcher";
import { describeHealthProblem, isWritable, loadAll, loadReviewArtifacts, setAsideProjectsFile } from "../services/persistence";
import {
  captureReviewResult,
  performReviewAction,
  saveEditedProject,
  saveNewProject,
  saveNewReview,
  saveReviewRequest,
  type SaveOutcome,
} from "../services/reviewService";
import { tauriStorage } from "../services/storage";
import { appReducer, initialAppState, type ToastKind } from "./appState";
import { describeError, nowIso } from "./format";
import "./App.css";

const backend = tauriStorage;
const launcher = tauriLauncher;

type DialogState =
  | null
  | { kind: "createProject" }
  | { kind: "editProject"; projectId: string }
  | { kind: "createReview"; projectId: string }
  | { kind: Exclude<DetailDialog, "editProject">; reviewId: string }
  | { kind: "setAsideProjects" };

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busy, setBusy] = useState(false);
  const loadStarted = useRef(false);

  const notify = useCallback((kind: ToastKind, message: string) => dispatch({ type: "toast", kind, message }), []);
  const dismissToast = useCallback((id: number) => dispatch({ type: "dismissToast", id }), []);
  const closeDialog = useCallback(() => setDialog(null), []);

  const reload = useCallback(async () => {
    try {
      const storage = await backend.info();
      const data = await loadAll(backend);
      dispatch({ type: "loaded", storage, data });
    } catch (error) {
      dispatch({ type: "fatal", message: describeError(error) });
    }
  }, []);

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
    void loadReviewArtifacts(backend, selectedSession).then((artifacts) => {
      if (!cancelled) dispatch({ type: "artifactsLoaded", reviewId: selectedSession.reviewSessionId, artifacts });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedSession]);

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

  const applyOutcome = (outcome: SaveOutcome) => {
    dispatch({ type: "reviewSaved", session: outcome.session });
    if (outcome.warning) notify("warning", outcome.warning);
  };

  /** Persists a transition. Returns an error message (also toasted) or null on success. */
  const runAction = async (session: ReviewSession, action: ReviewAction, success?: string): Promise<string | null> => {
    setBusy(true);
    try {
      const result = await performReviewAction(backend, session, action, nowIso());
      if (!result.ok) {
        notify("error", result.error);
        return result.error;
      }
      applyOutcome(result.value);
      if (success) notify("info", success);
      return null;
    } catch (error) {
      const message = `Save failed: ${describeError(error)}`;
      notify("error", message);
      return message;
    } finally {
      setBusy(false);
    }
  };

  const submitProject = async (input: ProjectFormInput, projectId?: string): Promise<FieldErrors | null> => {
    try {
      const result = projectId
        ? await saveEditedProject(backend, state.projects, state.projectsHealth, projectId, input, nowIso())
        : await saveNewProject(backend, state.projects, state.projectsHealth, input, nowIso());
      if (!result.ok) return result.error;
      dispatch({ type: "projectsSaved", projects: result.value });
      setDialog(null);
      notify("info", projectId ? "Project saved" : `Project “${input.displayName.trim()}” created`);
      return null;
    } catch (error) {
      return { _form: `Save failed: ${describeError(error)}` };
    }
  };

  const submitReview = async (input: ReviewFormInput): Promise<FieldErrors | null> => {
    const existing = new Set(state.reviews.map((r) => r.reviewId));
    let reviewId = generateReviewId(new Date());
    for (let attempt = 0; existing.has(reviewId) && attempt < 10; attempt += 1) reviewId = generateReviewId(new Date());
    if (existing.has(reviewId)) return { _form: "Could not allocate a unique review id; try again" };
    try {
      const result = await saveNewReview(backend, state.projects, input, reviewId, nowIso());
      if (!result.ok) return result.error;
      applyOutcome(result.value);
      dispatch({ type: "selectReview", reviewId });
      setDialog(null);
      notify("info", "Review created");
      return null;
    } catch (error) {
      return { _form: `Save failed: ${describeError(error)}` };
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

  const copyPrompt = async (session: ReviewSession, project: Project) => {
    setBusy(true);
    try {
      const result = await saveReviewRequest(backend, project, session, nowIso());
      if (!result.ok) {
        notify("error", result.error);
        return;
      }
      applyOutcome(result.value);
      try {
        await copyText(result.value.text);
        notify("info", `Review request saved as request-r${session.reviewRound}.md and copied to the clipboard`);
      } catch (error) {
        notify("error", `Saved request-r${session.reviewRound}.md, but copying to the clipboard failed: ${describeError(error)}`);
      }
    } catch (error) {
      notify("error", `Save failed: ${describeError(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const submitCapture = async (session: ReviewSession, text: string, reviewedHead: string | null): Promise<string | null> => {
    setBusy(true);
    try {
      const result = await captureReviewResult(backend, session, text, reviewedHead, nowIso());
      if (!result.ok) return result.error;
      applyOutcome(result.value);
      notify("info", `Result saved as result-r${session.reviewRound}.md. The review state is unchanged until you confirm a verdict.`);
      setDialog(result.value.session.reviewState === "REVIEWING" ? { kind: "verdict", reviewId: session.reviewSessionId } : null);
      return null;
    } catch (error) {
      return `Save failed: ${describeError(error)}`;
    } finally {
      setBusy(false);
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
      const aside = await setAsideProjectsFile(backend);
      dispatch({ type: "projectsSaved", projects: [], health: { status: "missing" } });
      setDialog(null);
      notify("info", `projects.json was kept as ${aside}. Starting with an empty project list.`);
      return null;
    } catch (error) {
      return `Could not set the file aside: ${describeError(error)}`;
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
          if (selectedProject) void copyPrompt(selectedSession, selectedProject);
        }}
        onSaveNextAction={async (text) => (await runAction(selectedSession, { type: "setNextAction", nextAction: text }, "Next action saved")) === null}
      />
    );
  } else if (selected) {
    detail = (
      <div className="empty-state" data-testid="detail-unreadable">
        <h2>Review {selected.reviewId} cannot be read</h2>
        <p className="error-text">{describeHealthProblem(selected.health)}</p>
        <p className="muted">
          The file was left unchanged and this review is read-only. Fix or restore <code>reviews/{selected.reviewId}/session.json</code> in the data folder,
          then reload. Other reviews are not affected.
        </p>
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
            testId="banner-projects-unreadable"
            actions={
              <>
                <button type="button" onClick={() => void launch(() => launcher.openDataDir(), "Open data folder")}>
                  Open data folder
                </button>
                <button type="button" onClick={() => void reload()}>
                  Reload
                </button>
                {state.projectsHealth.status === "unreadable" && (
                  <button type="button" className="danger" onClick={() => setDialog({ kind: "setAsideProjects" })} data-testid="btn-set-aside-projects">
                    Set aside and start empty…
                  </button>
                )}
              </>
            }
          >
            <strong>projects.json cannot be used:</strong> {projectsProblem}. Project editing is disabled and the file has not been changed.
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
          onSubmit={(text, reviewedHead) => submitCapture(dialogSession, text, reviewedHead)}
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
              The unreadable <code>projects.json</code> is renamed to <code>projects.json.corrupt-…</code> in the data folder (not deleted), and DVCC starts with an
              empty project list. Reviews are not affected.
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
