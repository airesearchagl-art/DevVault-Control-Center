import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Banner, Toasts } from "../components/Banner";
import { LanguageSelector } from "../components/LanguageSelector";
import { ConfirmDialog } from "../components/Dialog";
import { emptyProjectForm, projectToForm, type Project, type ProjectFormInput } from "../domain/project";
import { deriveFreshness, type FreshnessResult } from "../domain/freshness";
import { observationForProject, type GitObservation } from "../domain/git";
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
import { observeSequentially, tauriGitObserver } from "../services/git";
import { tauriLauncher } from "../services/launcher";
import { describeHealthProblem, isWritable } from "../services/persistence";
import { ReviewHub } from "../services/reviewHub";
import type { SaveOutcome } from "../services/reviewService";
import { createLocaleStore, loadSettings } from "../services/settings";
import { tauriStorage, toStorageError } from "../services/storage";
import {
  createTranslator,
  DEFAULT_LOCALE,
  formatParts,
  REVIEW_STATE_KEYS,
  REVIEW_TYPE_SUGGESTION_KEYS,
  VERDICT_KEYS,
  type Locale,
  type Translator,
} from "../i18n";
import { I18nContext, type I18n } from "../i18n/context";
import { appReducer, initialAppState, type ToastKind } from "./appState";
import { describeError } from "./format";
import "./App.css";

const launcher = tauriLauncher;
const gitObserver = tauriGitObserver;

type DialogState =
  | null
  | { kind: "createProject" }
  | { kind: "editProject"; projectId: string }
  | { kind: "createReview"; projectId: string }
  | { kind: Exclude<DetailDialog, "editProject">; reviewId: string }
  | { kind: "setAsideProjects" };

// User-facing text for a failed save; conflicts explain that nothing was overwritten.
function saveFailed(t: Translator, error: unknown): string {
  const storageError = toStorageError(error);
  if (storageError.code === "CONFLICT") return t("error.saveConflict");
  if (storageError.code === "RECOVERY_REQUIRED") return t("error.saveRecoveryRequired");
  return t("error.saveFailed", { error: describeError(t, error) });
}

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pending, setPending] = useState(0);
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const t = useMemo(() => createTranslator(locale), [locale]);
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
      dispatch({ type: "fatal", message: describeError(t, error) });
    }
  }, [hub, t]);

  useEffect(() => {
    // Single initial load (StrictMode runs effects twice in development).
    if (loadStarted.current) return;
    loadStarted.current = true;
    void reload();
  }, [reload]);

  // Every write of the preference goes through one store, so rapid switching cannot land out of
  // order and a failed write can say which language is still on disk.
  const localeStore = useMemo(() => createLocaleStore(tauriStorage, DEFAULT_LOCALE), []);

  // The interface language is read once at start-up; a file that cannot be used means Japanese and
  // says so, and no other file is read on this path.
  useEffect(() => {
    let cancelled = false;
    void loadSettings(tauriStorage).then(
      (settings) => {
        if (cancelled) return;
        localeStore.adopt(settings.locale);
        setLocaleState(settings.locale);
        if (settings.problem !== null) {
          dispatch({
            type: "toast",
            kind: "warning",
            message: createTranslator(settings.locale)("notice.settingsInvalid", { file: "settings.json" }),
          });
        }
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const i18n = useMemo<I18n>(
    () => ({
      locale,
      t,
      setLocale: (next: Locale) => {
        if (next === locale) return;
        // Only the preference changes: no review, project or Git state is touched. The interface
        // follows the choice at once, but a write that fails takes it back to the language that is
        // stored rather than showing one the next start-up would not restore.
        setLocaleState(next);
        void localeStore.save(next).then((result) => {
          if (result.ok || result.superseded) return;
          setLocaleState(result.locale);
          dispatch({
            type: "toast",
            kind: "error",
            message: createTranslator(result.locale)("notice.settingsSaveFailed", { file: "settings.json" }),
          });
        });
      },
    }),
    [locale, t, localeStore],
  );

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

  // Freshness is derived per review from the recorded HEADs and the observed facts; it never
  // feeds back into the review data (Phase 2 state separation).
  // An observation is only shown while it still describes the project's current local root.
  const observationFor = useCallback(
    (projectId: string): GitObservation | undefined =>
      observationForProject(state.gitObservations[projectId], projectById.get(projectId)),
    [state.gitObservations, projectById],
  );

  const freshnessByReview = useMemo(() => {
    const map = new Map<string, FreshnessResult>();
    for (const review of state.reviews) {
      if (!review.session) continue;
      const round = currentRound(review.session);
      map.set(
        review.reviewId,
        deriveFreshness({
          observation: observationFor(review.session.projectId),
          expectedHead: round.expectedHead,
          reviewedHead: round.reviewedHead,
        }),
      );
    }
    return map;
  }, [state.reviews, observationFor]);

  const selectedObservation = selectedProject ? observationFor(selectedProject.projectId) : undefined;
  const selectedFreshness = selected ? freshnessByReview.get(selected.reviewId) : undefined;

  // One project at a time, only when the Human asks: no observation happens at start-up.
  const refreshGit = useCallback(
    async (project: Project) => {
      const observation = await track(gitObserver.observe(project.localRoot));
      dispatch({
        type: "gitObserved",
        projectId: project.projectId,
        localRoot: project.localRoot,
        projectCreatedAt: project.createdAt,
        observation,
      });
      return observation;
    },
    [track],
  );

  const refreshAllGit = useCallback(async () => {
    const targets = state.projects.map((project) => ({ projectId: project.projectId, localRoot: project.localRoot }));
    if (targets.length === 0) {
      notify("info", t("toast.noProjectsToObserve"));
      return;
    }
    await track(
      observeSequentially(gitObserver, targets, (projectId, observation) => {
        const project = projectById.get(projectId);
        if (!project) return;
        dispatch({
          type: "gitObserved",
          projectId,
          localRoot: project.localRoot,
          projectCreatedAt: project.createdAt,
          observation,
        });
      }),
    );
    notify("info", t("toast.gitRefreshedAll", { count: targets.length }));
  }, [state.projects, projectById, track, notify, t]);

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
      const message = saveFailed(t, error);
      notify("error", message);
      return message;
    }
  };

  const submitProject = async (input: ProjectFormInput, projectId?: string): Promise<FieldErrors | null> => {
    try {
      const result = await track(projectId ? hub.editProject(projectId, input) : hub.createProject(input));
      if (!result.ok) return result.error;
      setDialog(null);
      notify("info", projectId ? t("toast.projectSaved") : t("toast.projectCreated", { name: input.displayName.trim() }));
      return null;
    } catch (error) {
      return { _form: saveFailed(t, error) };
    }
  };

  const submitReview = async (input: ReviewFormInput): Promise<FieldErrors | null> => {
    try {
      const result = await track(hub.createReview(input));
      if (!result.ok) return result.error;
      warnIfNeeded(result.value);
      dispatch({ type: "selectReview", reviewId: result.value.session.reviewSessionId });
      setDialog(null);
      notify("info", t("toast.reviewCreated"));
      return null;
    } catch (error) {
      return { _form: saveFailed(t, error) };
    }
  };

  const submitReviewMetadata = async (session: ReviewSession, input: ReviewMetadataInput): Promise<FieldErrors | null> => {
    const metadata = validateReviewMetadata(input);
    if (!metadata.ok) return metadata.error;
    const error = await runAction(session, { type: "updateMetadata", metadata: metadata.value }, t("toast.reviewSaved"));
    if (error) return { _form: error };
    setDialog(null);
    return null;
  };

  const launch = async (open: () => Promise<void>, label: string) => {
    try {
      await open();
    } catch (error) {
      notify("error", t("toast.launchFailed", { label, error: describeError(t, error) }));
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
        notify("info", t("toast.requestSaved", { round }));
      } catch (error) {
        notify("error", t("toast.requestSavedCopyFailed", { round, error: describeError(t, error) }));
      }
    } catch (error) {
      notify("error", saveFailed(t, error));
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
      const kept = result.value.archivedAs ? `${t("toast.resultSavedKept", { file: result.value.archivedAs })} ` : "";
      notify("info", t("toast.resultSaved", { round: saved.reviewRound, kept }));
      setDialog(saved.reviewState === "REVIEWING" ? { kind: "verdict", reviewId: saved.reviewSessionId } : null);
      return null;
    } catch (error) {
      return saveFailed(t, error);
    }
  };

  const confirmVerdict = async (session: ReviewSession, verdict: VerdictChoice, note: string): Promise<string | null> => {
    const action: ReviewAction =
      verdict === "BLOCKED"
        ? { type: "block", reason: note, confirmedByHuman: true }
        : { type: "confirmVerdict", verdict, note: note.trim() === "" ? null : note, confirmedByHuman: true };
    const error = await runAction(session, action, t("toast.verdictConfirmed", { verdict: t(VERDICT_KEYS[verdict]) }));
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
      notify("info", t("toast.setAsideDone", { files: kept.join(", ") }));
      return null;
    } catch (error) {
      return t("toast.setAsideFailed", { error: describeError(t, error) });
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
        <p className="muted">{t("app.loading")}</p>
      </div>
    );
  }

  if (state.phase === "fatal") {
    return (
      <div className="fullscreen" data-testid="fatal">
        <h1>{t("app.fatal.title")}</h1>
        <p className="error-text">{state.fatalMessage}</p>
        <p className="muted">{t("app.fatal.body")}</p>
        <button type="button" className="primary" onClick={() => void reload()}>
          {t("app.fatal.retry")}
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
        observation={selectedObservation}
        freshness={
          selectedFreshness ??
          deriveFreshness({
            observation: selectedObservation,
            expectedHead: currentRound(selectedSession).expectedHead,
            reviewedHead: currentRound(selectedSession).reviewedHead,
          })
        }
        onRefreshGit={() => {
          if (!selectedProject) return notify("warning", t("toast.noProjectForReview"));
          void refreshGit(selectedProject);
        }}
        onAction={(action) => void runAction(selectedSession, action)}
        onOpenDialog={onDetailDialog}
        onOpenGithub={() => {
          const repo = selectedProject?.repositoryUrl;
          if (!repo) return notify("warning", t("toast.noRepositoryUrl"));
          const url = selectedSession.prNumber !== null ? pullRequestUrl(repo, selectedSession.prNumber) : repo;
          void launch(() => launcher.openExternalUrl(url), t("detail.actions.openGithub"));
        }}
        onOpenChatgpt={() => {
          const url = selectedSession.chatgptThreadUrl;
          if (!url) return notify("warning", t("toast.noThreadUrl"));
          void launch(() => launcher.openExternalUrl(url), t("detail.actions.openChatgpt"));
        }}
        onOpenFolder={() => {
          const root = selectedProject?.localRoot;
          if (!root) return notify("warning", t("toast.noLocalRoot"));
          void launch(() => launcher.openProjectFolder(root), t("detail.actions.openFolder"));
        }}
        onCopyPrompt={() => {
          void copyPrompt(selectedSession);
        }}
        onSaveNextAction={async (text) => (await runAction(selectedSession, { type: "setNextAction", nextAction: text }, t("toast.nextActionSaved"))) === null}
      />
    );
  } else if (selected) {
    detail = (
      <div className="empty-state" data-testid="detail-unreadable" data-health={selected.health.status}>
        <h2>
          {selected.health.status === "io_error"
            ? t("unreadable.title.inaccessible", { id: selected.reviewId })
            : t("unreadable.title.unreadable", { id: selected.reviewId })}
        </h2>
        <p className="error-text">{describeHealthProblem(selected.health)}</p>
        <p className="muted">
          {formatParts(
            selected.health.status === "io_error" ? t("unreadable.body.inaccessible") : t("unreadable.body.unreadable"),
            { file: <code key="file">reviews/{selected.reviewId}/session.json</code> },
          )}
        </p>
        <div className="empty-actions">
          <button type="button" onClick={() => void launch(() => launcher.openDataDir(), t("app.actions.openDataFolder"))}>
            {t("app.actions.openDataFolder")}
          </button>
          <button type="button" onClick={() => void reload()}>
            {t("app.actions.reload")}
          </button>
        </div>
      </div>
    );
  } else if (state.projects.length === 0 && state.reviews.length === 0) {
    detail = (
      <div className="empty-state" data-testid="empty-no-projects">
        <h2>{t("empty.noProjects.title")}</h2>
        <p className="muted">{t("empty.noProjects.body")}</p>
        <div className="empty-actions">
          <button type="button" className="primary" disabled={!projectsWritable} onClick={() => setDialog({ kind: "createProject" })}>
            {t("empty.noProjects.action")}
          </button>
        </div>
      </div>
    );
  } else if (state.reviews.length === 0) {
    detail = (
      <div className="empty-state" data-testid="empty-no-reviews">
        <h2>{t("empty.noReviews.title")}</h2>
        <p className="muted">{t("empty.noReviews.body")}</p>
        <div className="empty-actions">
          <button type="button" className="primary" onClick={() => setDialog({ kind: "createReview", projectId: "" })} disabled={state.projects.length === 0}>
            {t("empty.noReviews.action")}
          </button>
        </div>
      </div>
    );
  } else {
    detail = (
      <div className="empty-state" data-testid="empty-no-selection">
        <h2>{t("empty.noSelection.title")}</h2>
        <p className="muted">{t("empty.noSelection.body")}</p>
      </div>
    );
  }

  return (
    <I18nContext.Provider value={i18n}>
    <div className="app">
      <header className="topbar">
        <h1>
          {t("app.name")} <span className="subtitle">{t("app.subtitle")}</span>
        </h1>
        <div className="topbar-actions">
          <LanguageSelector disabled={busy} />
          <button type="button" onClick={() => setDialog({ kind: "createProject" })} disabled={!projectsWritable} data-testid="btn-new-project">
            {t("app.actions.newProject")}
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => setDialog({ kind: "createReview", projectId: selectedSession?.projectId ?? "" })}
            disabled={state.projects.length === 0}
            data-testid="btn-new-review"
          >
            {t("app.actions.newReview")}
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
                <button type="button" onClick={() => void launch(() => launcher.openDataDir(), t("app.actions.openDataFolder"))}>
                  {t("app.actions.openDataFolder")}
                </button>
                <button type="button" onClick={() => void reload()}>
                  {t("app.actions.reload")}
                </button>
                {state.projectsHealth.status === "unreadable" && state.projectsHealth.setAside.length > 0 && (
                  <button type="button" className="danger" onClick={() => setDialog({ kind: "setAsideProjects" })} data-testid="btn-set-aside-projects">
                    {t("projects.setAside.action")}
                  </button>
                )}
              </>
            }
          >
            {formatParts(
              state.projectsHealth.status === "io_error"
                ? t("banner.projectsIoError", { problem: projectsProblem ?? "" })
                : t("banner.projectsUnreadable", { problem: projectsProblem ?? "" }),
              { projects: <strong key="projects">{t("notice.label.projects")}</strong> },
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
            freshnessByReview={freshnessByReview}
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
          {t("app.dataDir.label")}{" "}
          <span className="mono" data-testid="data-dir">
            {state.storage?.dataDir}
          </span>
          {state.storage?.source === "env" && <span className="tag">{t("app.dataDir.envTag")}</span>}
          {state.storage?.debugBuild && <span className="tag">{t("app.dataDir.debugTag")}</span>}
        </span>
        <span className="statusbar-actions">
          <button type="button" className="link-button" onClick={() => void reload()} data-testid="btn-reload">
            {t("app.actions.reload")}
          </button>
          <button type="button" className="link-button" onClick={() => void refreshAllGit()} disabled={busy} data-testid="btn-refresh-all-git">
            {t("app.actions.refreshAllGit")}
          </button>
          <button type="button" className="link-button" onClick={() => void launch(() => launcher.openDataDir(), t("app.actions.openDataFolder"))}>
            {t("app.actions.openDataFolder")}
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
        <CreateReviewDialog
          projects={state.projects}
          initial={emptyReviewForm(dialog.projectId, t(REVIEW_TYPE_SUGGESTION_KEYS[0]))}
          onSubmit={submitReview}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === "editReview" && dialogSession && (
        <EditReviewDialog
          title={t("review.edit.title")}
          roundLabel={t("detail.value.round", { round: dialogSession.reviewRound })}
          initial={reviewToMetadataForm(dialogSession)}
          onSubmit={(input) => submitReviewMetadata(dialogSession, input)}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === "suspend" && dialogSession && (
        <SuspendDialog
          session={dialogSession}
          onSubmit={(checkpoint, resourceState) =>
            withDialogClose(runAction(dialogSession, { type: "suspend", resourceState, checkpoint }, t("toast.reviewSuspended")))
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
          onSubmit={(expectedHead) =>
            withDialogClose(
              runAction(dialogSession, { type: "startNextRound", expectedHead }, t("toast.roundStarted", { round: dialogSession.reviewRound + 1 })),
            )
          }
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === "block" && dialogSession && (
        <ConfirmDialog
          title={t("review.block.title")}
          message={t("review.block.body", {
            blockedLabel: t(REVIEW_STATE_KEYS.BLOCKED),
            markReady: t("detail.actions.markReady"),
          })}
          confirmLabel={t("review.block.submit")}
          reasonLabel={t("review.block.reasonLabel")}
          testId="block-dialog"
          onConfirm={(reason) => withDialogClose(runAction(dialogSession, { type: "block", reason, confirmedByHuman: true }, t("toast.reviewBlocked")))}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === "close" && dialogSession && (
        <ConfirmDialog
          title={t("review.close.title")}
          message={t("review.close.body")}
          confirmLabel={t("review.close.submit")}
          danger
          testId="close-dialog"
          onConfirm={() => withDialogClose(runAction(dialogSession, { type: "close", confirmedByHuman: true }, t("toast.reviewClosed")))}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === "setAsideProjects" && (
        <ConfirmDialog
          title={t("projects.setAside.title")}
          message={formatParts(t("projects.setAside.body"), {
            projects: <code key="projects">projects.json</code>,
            corrupt: <code key="corrupt">….corrupt-…</code>,
          })}
          confirmLabel={t("projects.setAside.submit")}
          danger
          testId="set-aside-dialog"
          onConfirm={setAsideProjects}
          onCancel={closeDialog}
        />
      )}
    </div>
    </I18nContext.Provider>
  );
}
