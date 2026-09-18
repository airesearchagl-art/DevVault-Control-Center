import type { Project, ProjectFormInput } from "../domain/project";
import type { ReviewFormInput, ReviewSession } from "../domain/review";
import { err, type FieldErrors, type Result } from "../domain/result";
import type { ReviewAction } from "../domain/transitions";
import { generateReviewId } from "../domain/validation";
import {
  loadAll,
  loadReviewArtifacts,
  setAsideProjectsFile,
  type FileHealth,
  type LoadedData,
  type LoadedReview,
  type ReviewArtifacts,
} from "./persistence";
import {
  captureReviewResult,
  performReviewAction,
  saveEditedProject,
  saveNewProject,
  saveNewReview,
  saveReviewRequest,
  type SaveOutcome,
} from "./reviewService";
import { createSerialQueue } from "./serialQueue";
import type { StorageBackend, StorageInfo } from "./storage";
import { TrackedStorage } from "./trackedStorage";

export interface ReviewHubOptions {
  now?: () => string;
  newReviewId?: (now: Date) => string;
}

export type HubListener = (snapshot: LoadedData) => void;

/**
 * Single owner of the committed application state and the only path to storage mutations
 * (F-3 / F-4). Every operation runs through one serial queue and starts from the state
 * committed by the previous operation, so application operation order equals disk commit order
 * and the UI (fed by snapshots) always equals what is on disk. Writes go through
 * `TrackedStorage`, so external changes are detected (`CONFLICT`) instead of overwritten.
 */
export class ReviewHub {
  private readonly storage: TrackedStorage;
  private readonly run = createSerialQueue();
  private readonly now: () => string;
  private readonly newReviewId: (now: Date) => string;
  private readonly listeners = new Set<HubListener>();
  private projects: Project[] = [];
  private projectsHealth: FileHealth = { status: "missing" };
  private reviews = new Map<string, LoadedReview>();

  constructor(backend: StorageBackend, options: ReviewHubOptions = {}) {
    this.storage = new TrackedStorage(backend);
    this.now = options.now ?? (() => new Date().toISOString());
    this.newReviewId = options.newReviewId ?? ((now) => generateReviewId(now));
  }

  subscribe(listener: HubListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): LoadedData {
    return { projects: this.projects, projectsHealth: this.projectsHealth, reviews: [...this.reviews.values()] };
  }

  session(reviewId: string): ReviewSession | null {
    return this.reviews.get(reviewId)?.session ?? null;
  }

  private commit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  private storeSession(session: ReviewSession): void {
    this.reviews.set(session.reviewSessionId, { reviewId: session.reviewSessionId, session, health: { status: "ok" } });
  }

  info(): Promise<StorageInfo> {
    return this.run(() => this.storage.info());
  }

  load(): Promise<LoadedData> {
    return this.run(async () => {
      const data = await loadAll(this.storage);
      this.projects = data.projects;
      this.projectsHealth = data.projectsHealth;
      this.reviews = new Map(data.reviews.map((review) => [review.reviewId, review]));
      return this.snapshot();
    });
  }

  createProject(input: ProjectFormInput): Promise<Result<Project[], FieldErrors>> {
    return this.run(async () => {
      const result = await saveNewProject(this.storage, this.projects, this.projectsHealth, input, this.now());
      if (result.ok) {
        this.projects = result.value;
        this.projectsHealth = { status: "ok" };
        this.commit();
      }
      return result;
    });
  }

  editProject(projectId: string, input: ProjectFormInput): Promise<Result<Project[], FieldErrors>> {
    return this.run(async () => {
      const result = await saveEditedProject(this.storage, this.projects, this.projectsHealth, projectId, input, this.now());
      if (result.ok) {
        this.projects = result.value;
        this.projectsHealth = { status: "ok" };
        this.commit();
      }
      return result;
    });
  }

  setAsideProjects(): Promise<string[]> {
    return this.run(async () => {
      const kept = await setAsideProjectsFile(this.storage, this.projectsHealth);
      this.projects = [];
      this.projectsHealth = { status: "missing" };
      this.commit();
      return kept;
    });
  }

  createReview(input: ReviewFormInput): Promise<Result<SaveOutcome, FieldErrors>> {
    return this.run(async () => {
      let reviewId = this.newReviewId(new Date(this.now()));
      for (let attempt = 0; this.reviews.has(reviewId) && attempt < 10; attempt += 1) reviewId = this.newReviewId(new Date(this.now()));
      if (this.reviews.has(reviewId)) return err({ _form: "Could not allocate a unique review id; try again" });
      const result = await saveNewReview(this.storage, this.projects, input, reviewId, this.now());
      if (result.ok) {
        this.storeSession(result.value.session);
        this.commit();
      }
      return result;
    });
  }

  apply(reviewId: string, action: ReviewAction): Promise<Result<SaveOutcome>> {
    return this.run(async () => {
      const session = this.session(reviewId);
      if (!session) return err(`Review ${reviewId} is not available`);
      const result = await performReviewAction(this.storage, session, action, this.now());
      if (result.ok) {
        this.storeSession(result.value.session);
        this.commit();
      }
      return result;
    });
  }

  saveRequest(reviewId: string): Promise<Result<SaveOutcome & { text: string }>> {
    return this.run(async () => {
      const session = this.session(reviewId);
      if (!session) return err(`Review ${reviewId} is not available`);
      const project = this.projects.find((p) => p.projectId === session.projectId);
      if (!project) return err(`Project ${session.projectId} is not in projects.json`);
      const result = await saveReviewRequest(this.storage, project, session, this.now());
      if (result.ok) {
        this.storeSession(result.value.session);
        this.commit();
      }
      return result;
    });
  }

  captureResult(
    reviewId: string,
    text: string,
    reviewedHead: string | null,
    replaceConfirmed: boolean,
  ): Promise<Result<SaveOutcome & { archivedAs: string | null }>> {
    return this.run(async () => {
      const session = this.session(reviewId);
      if (!session) return err(`Review ${reviewId} is not available`);
      const result = await captureReviewResult(this.storage, session, text, reviewedHead, replaceConfirmed, this.now());
      if (result.ok) {
        this.storeSession(result.value.session);
        this.commit();
      }
      return result;
    });
  }

  loadArtifacts(reviewId: string): Promise<ReviewArtifacts | null> {
    return this.run(async () => {
      const session = this.session(reviewId);
      return session ? loadReviewArtifacts(this.storage, session) : null;
    });
  }
}
