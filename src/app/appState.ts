import type { Project } from "../domain/project";
import type { QueueFilter } from "../domain/queue";
import type { ReviewSession } from "../domain/review";
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
  filter: { text: "", showClosed: false },
  notices: [],
  toasts: [],
  nextToastId: 1,
};

export type AppAction =
  | { type: "loaded"; storage: StorageInfo; data: LoadedData }
  | { type: "fatal"; message: string }
  | { type: "selectReview"; reviewId: string | null }
  | { type: "projectsSaved"; projects: Project[]; health?: FileHealth }
  | { type: "reviewSaved"; session: ReviewSession }
  | { type: "artifactsLoaded"; reviewId: string; artifacts: ReviewArtifacts }
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

    case "projectsSaved":
      // A successful write means the file is healthy from now on.
      return { ...state, projects: action.projects, projectsHealth: action.health ?? { status: "ok" } };

    case "reviewSaved": {
      const entry: LoadedReview = { reviewId: action.session.reviewSessionId, session: action.session, health: { status: "ok" } };
      const exists = state.reviews.some((r) => r.reviewId === entry.reviewId);
      return {
        ...state,
        reviews: exists ? state.reviews.map((r) => (r.reviewId === entry.reviewId ? entry : r)) : [...state.reviews, entry],
      };
    }

    case "artifactsLoaded":
      return { ...state, artifacts: { ...state.artifacts, [action.reviewId]: action.artifacts } };

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
