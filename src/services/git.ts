import { asGitObservation, failedObservation, type GitObservation } from "../domain/git";
import { nowIso } from "../app/format";
import { invokeCommand } from "./storage";

/**
 * Port for the read-only local Git observation (Phase 2). The observation is volatile: it is kept
 * in memory by the caller and never written through the storage backend.
 */
export interface GitObserver {
  observe(localRoot: string | null): Promise<GitObservation>;
}

function describeFailure(error: unknown): { code: string; message: string } {
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const code = typeof record.code === "string" && record.code !== "" ? record.code : "OBSERVATION_FAILED";
    const message = typeof record.message === "string" && record.message !== "" ? record.message : String(error);
    return { code, message };
  }
  return { code: "OBSERVATION_FAILED", message: String(error) };
}

export const tauriGitObserver: GitObserver = {
  async observe(localRoot: string | null): Promise<GitObservation> {
    const observedAt = nowIso();
    try {
      const raw = await invokeCommand<unknown>("inspect_git_repository", { localRoot });
      return asGitObservation(raw, observedAt);
    } catch (error) {
      // A failed call is an unobserved repository, never an app error (fail closed → UNKNOWN).
      const { code, message } = describeFailure(error);
      return failedObservation(observedAt, code, message);
    }
  },
};

export interface ObservationTarget {
  projectId: string;
  localRoot: string | null;
}

/**
 * Observes several projects **one at a time** (Refresh All): a handful of Git processes started in
 * parallel would spike the operator's machine, and the Human's own work must not be disturbed.
 * `onObserved` is called after each project so the UI can fill in progressively.
 */
export async function observeSequentially(
  observer: GitObserver,
  targets: readonly ObservationTarget[],
  onObserved?: (projectId: string, observation: GitObservation) => void,
): Promise<Record<string, GitObservation>> {
  const observations: Record<string, GitObservation> = {};
  for (const target of targets) {
    const observation = await observer.observe(target.localRoot);
    observations[target.projectId] = observation;
    onObserved?.(target.projectId, observation);
  }
  return observations;
}
