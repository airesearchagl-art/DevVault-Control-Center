import type { GitObservation } from "../domain/git";
import type { Project } from "../domain/project";
import type { QueueFilter } from "../domain/queue";
import type { FileHealth, LoadedData, LoadedReview, ReviewArtifacts } from "../services/persistence";
import type { StorageInfo } from "../services/storage";

export type ToastKind = "info" | "warning" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

/** One-time recovery information shown until dismissed (e.g. restored from backup). */
export interface Notice {
  id: string;
  message: string;
}

export interface AppState {
  phase: "loading" | "ready" | "fatal";
  fatalMessage: string | null;
  storage: StorageInfo | null;
  projects: Project[];
  projectsHealth: FileHealth;
  reviews: LoadedReview[];
  selectedReviewId: string | null;
  artifacts: Record<string, ReviewArtifacts | undefined>;
  /**
   * Observed local Git facts per project (Phase 2). Runtime memory only: the current Git state is
   * volatile, so it is never persisted and is unknown again after a restart until the Human
   * refreshes.
   */
  gitObservations: Record<string, GitObservation | undefined>;
  filter: QueueFilter;
  notices: Notice[];
  toasts: Toast[];
  nextToastId: number;
}

export const MAX_TOASTS = 5;

export const initialAppState: AppState = {
  phase: "loading",
  fatalMessage: null,
  storage: null,
  projects: [],
  projectsHealth: { status: "missing" },
  reviews: [],
  selectedReviewId: null,
  artifacts: {},
  gitObservations: {},
  filter: { text: "", showClosed: false },
  notices: [],
  toasts: [],
  nextToastId: 1,
};

export type AppAction =
  | { type: "loaded"; storage: StorageInfo; data: LoadedData }
  | { type: "fatal"; message: string }
  | { type: "selectReview"; reviewId: string | null }
  | { type: "hubCommitted"; snapshot: LoadedData }
  | { type: "artifactsLoaded"; reviewId: string; artifacts: ReviewArtifacts }
  | { type: "gitObserved"; projectId: string; observation: GitObservation }
  | { type: "filterChanged"; filter: Partial<QueueFilter> }
  | { type: "dismissNotice"; id: string }
  | { type: "toast"; kind: ToastKind; message: string }
  | { type: "dismissToast"; id: number };

export function restoredMessage(label: string, health: FileHealth): string | null {
  if (health.status !== "restored_from_backup") return null;
  return health.cause === "missing_primary"
    ? `${label} was missing and was restored from its backup (the backup was kept).`
    : `${label} could not be read and was restored from its backup. The unreadable file was kept as ${health.quarantinedAs}.`;
}

function recoveryNotices(data: LoadedData): Notice[] {
  const notices: Notice[] = [];
  const projects = restoredMessage("projects.json", data.projectsHealth);
  if (projects) notices.push({ id: "projects-restored", message: projects });
  for (const review of data.reviews) {
    const message = restoredMessage(`Review ${review.reviewId}: session.json`, review.health);
    if (message) notices.push({ id: `review-restored-${review.reviewId}`, message });
  }
  return notices;
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "loaded": {
      const keepSelection =
        state.selectedReviewId !== null && action.data.reviews.some((r) => r.reviewId === state.selectedReviewId);
      return {
        ...state,
        phase: "ready",
        fatalMessage: null,
        storage: action.storage,
        projects: action.data.projects,
        projectsHealth: action.data.projectsHealth,
        reviews: action.data.reviews,
        selectedReviewId: keepSelection ? state.selectedReviewId : null,
        artifacts: {},
        notices: recoveryNotices(action.data),
      };
    }

    case "fatal":
      return { ...state, phase: "fatal", fatalMessage: action.message };

    case "selectReview":
      return { ...state, selectedReviewId: action.reviewId };

    case "hubCommitted": {
      // Committed state from the hub replaces the data slices; selection, filter, notices and
      // artifacts are UI concerns and are kept (selection is dropped only if the review vanished).
      const { projects, projectsHealth, reviews } = action.snapshot;
      const keepSelection = state.selectedReviewId !== null && reviews.some((r) => r.reviewId === state.selectedReviewId);
      return { ...state, projects, projectsHealth, reviews, selectedReviewId: keepSelection ? state.selectedReviewId : null };
    }

    case "artifactsLoaded":
      return { ...state, artifacts: { ...state.artifacts, [action.reviewId]: action.artifacts } };

    // Observed facts only: no review or project data is touched, so a refresh can never change a
    // Review State or a recorded HEAD.
    case "gitObserved":
      return { ...state, gitObservations: { ...state.gitObservations, [action.projectId]: action.observation } };

    case "filterChanged":
      return { ...state, filter: { ...state.filter, ...action.filter } };

    case "dismissNotice":
      return { ...state, notices: state.notices.filter((n) => n.id !== action.id) };

    case "toast": {
      const toast: Toast = { id: state.nextToastId, kind: action.kind, message: action.message };
      return { ...state, toasts: [...state.toasts, toast].slice(-MAX_TOASTS), nextToastId: state.nextToastId + 1 };
    }

    case "dismissToast":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
  }
}
