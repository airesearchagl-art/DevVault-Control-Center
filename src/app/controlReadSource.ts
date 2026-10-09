import type { ControlReadSource } from "../domain/controlRead/contract";
import type { AppState } from "./appState";

/**
 * Phase 5A: the read-only Control Read source, taken from the very state the Human UI renders.
 *
 * Only five keys are passed on — the load phase, the project registry and its health, the loaded
 * reviews, and the runtime Git observations. IDE session discovery, review artifacts (checkpoint,
 * result text, events), toasts, notices and storage information never reach the projection. Nothing
 * is copied, re-read from disk or written.
 */
export function controlReadSourceFrom(state: AppState): ControlReadSource {
  return {
    phase: state.phase,
    projects: state.projects,
    projectsHealth: state.projectsHealth,
    reviews: state.reviews,
    gitObservations: state.gitObservations,
  };
}

/**
 * An identifier for one Control Read response: `snap-` plus a random UUID v4. It identifies a
 * response only; it is never an authority, a lock or a concurrency token.
 */
export function newControlSnapshotId(
  fill: (bytes: Uint8Array<ArrayBuffer>) => void = (bytes) => {
    crypto.getRandomValues(bytes);
  },
): string {
  const bytes = new Uint8Array(16);
  fill(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `snap-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
