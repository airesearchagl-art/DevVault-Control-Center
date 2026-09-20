import type { Project } from "./project";
import type { ReviewSession } from "./review";
import type { ResourceState, ReviewState } from "./states";

export interface QueueSource {
  reviewId: string;
  session: ReviewSession | null;
  /** Set when the session could not be loaded. */
  problem: string | null;
}

export interface QueueItem extends QueueSource {
  project: Project | null;
}

export interface QueueFilter {
  text: string;
  showClosed: boolean;
}

/** Lower number = needs attention sooner. */
export const REVIEW_ATTENTION: Record<ReviewState, number> = {
  REVIEWING: 0,
  FIX_REQUIRED: 1,
  READY_FOR_REVIEW: 2,
  BLOCKED: 3,
  NEW: 4,
  REVIEW_PASS: 5,
  SUSPENDED: 6,
  CLOSED: 7,
};

export const RESOURCE_ATTENTION: Record<ResourceState, number> = { HOT: 0, WARM: 1, COLD: 2 };

function compare(a: QueueItem, b: QueueItem): number {
  // Unreadable entries first: they need Human attention and must stay visible.
  if (a.session === null || b.session === null) {
    if (a.session === null && b.session === null) return a.reviewId.localeCompare(b.reviewId);
    return a.session === null ? -1 : 1;
  }
  return (
    REVIEW_ATTENTION[a.session.reviewState] - REVIEW_ATTENTION[b.session.reviewState] ||
    RESOURCE_ATTENTION[a.session.resourceState] - RESOURCE_ATTENTION[b.session.resourceState] ||
    b.session.updatedAt.localeCompare(a.session.updatedAt) ||
    a.reviewId.localeCompare(b.reviewId)
  );
}

function matches(item: QueueItem, text: string): boolean {
  if (text === "") return true;
  const haystack = [
    item.reviewId,
    item.project?.displayName ?? "",
    item.session?.projectId ?? "",
    item.session?.prNumber != null ? `#${item.session.prNumber} pr${item.session.prNumber}` : "",
    item.session?.reviewType ?? "",
    item.session?.chatgptThreadTitle ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token !== "")
    .every((token) => haystack.includes(token));
}

export function buildQueue(sources: readonly QueueSource[], projects: readonly Project[], filter: QueueFilter): QueueItem[] {
  const byId = new Map(projects.map((project) => [project.projectId, project]));
  return sources
    .map((source) => ({ ...source, project: source.session ? (byId.get(source.session.projectId) ?? null) : null }))
    .filter((item) => filter.showClosed || item.session?.reviewState !== "CLOSED")
    .filter((item) => matches(item, filter.text.trim()))
    .sort(compare);
}
