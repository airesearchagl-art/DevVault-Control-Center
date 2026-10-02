import type { DiscoveredIdeSession } from "../domain/ideSessionDiscovery";
import { evaluateLaunch, type LaunchProject, type ValidatedSessionId } from "../domain/resumeIntent";
import { LAUNCH_ERROR_KEYS, LAUNCH_REFUSAL_KEYS, type Translator } from "../i18n";
import { launchErrorCode, type CodexLauncher } from "../services/codexLauncher";
import type { ToastKind } from "./appState";

/**
 * Phase 4b-2b "Resume in Codex" (LRP-20261002-DVCC-010), as a narrow seam like Phase 4b-2a's
 * `copyResumeCommandAction`: its only side-effecting capabilities are the dedicated `CodexLauncher`
 * commands and `notify` — no storage, hub, dispatch, event writer or clipboard — so a launch can
 * never persist anything, write an event or change a Review / Project.
 *
 * Two Human steps (HD-4B2B-04): `requestResumeLaunch` (the row button) only ever opens the
 * confirmation; `confirmResumeLaunch` (the dialog's confirm) is the only path to a process. Both
 * re-evaluate eligibility from the *current* state they are handed — never the rendered button —
 * and the native command re-validates every fact again on its own.
 */

/** The live facts at the moment of a Human action, looked up fresh by the caller. */
export interface LaunchContext {
  session: DiscoveredIdeSession;
  project: (LaunchProject & { displayName: string }) | null;
  stale: boolean;
  codexExecutablePath: string | null;
}

/** What the confirmation dialog may show. No path, no full ID, no executable, no repository. */
export interface ResumeLaunchRequest {
  sessionId: ValidatedSessionId;
  projectId: string;
  projectDisplayName: string;
  sessionLabel: string;
  workspaceWarning: boolean;
}

type Notify = (kind: ToastKind, message: string) => void;

/** Click time: re-evaluate, run the native read-only preflight, and return what to confirm. */
export async function requestResumeLaunch(
  context: LaunchContext,
  sessionLabel: string,
  t: Translator,
  launcher: CodexLauncher,
  notify: Notify,
): Promise<ResumeLaunchRequest | null> {
  const eligibility = evaluateLaunch(context.session, context.project, context.stale, context.codexExecutablePath);
  if (!eligibility.eligible || context.project === null) {
    notify("warning", t(LAUNCH_REFUSAL_KEYS[eligibility.eligible ? "NOT_MATCHED" : eligibility.reason]));
    return null;
  }
  const { intent } = eligibility;
  try {
    const preflight = await launcher.preflight(intent.codexExecutablePath, intent.sessionId, intent.projectRoot);
    return {
      sessionId: intent.sessionId,
      projectId: intent.projectId,
      projectDisplayName: context.project.displayName,
      sessionLabel,
      workspaceWarning: preflight.workspaceWarning,
    };
  } catch (error) {
    notify("warning", t(LAUNCH_ERROR_KEYS[launchErrorCode(error)]));
    return null;
  }
}

/**
 * Confirm time: the acknowledgement must be given, and the current state must still make exactly
 * this session (by full ID) eligible for exactly this Project; only then is the one native launch
 * requested. `true` means only that Windows created the process.
 */
export async function confirmResumeLaunch(
  request: ResumeLaunchRequest,
  current: LaunchContext | null,
  acknowledged: boolean,
  t: Translator,
  launcher: CodexLauncher,
  notify: Notify,
): Promise<boolean> {
  if (!acknowledged) {
    notify("warning", t("resume.launch.toast.ackRequired"));
    return false;
  }
  if (current === null) {
    notify("warning", t("resume.launch.error.STALE_DISCOVERY"));
    return false;
  }
  const eligibility = evaluateLaunch(current.session, current.project, current.stale, current.codexExecutablePath);
  if (!eligibility.eligible) {
    notify("warning", t(LAUNCH_REFUSAL_KEYS[eligibility.reason]));
    return false;
  }
  const { intent } = eligibility;
  if (intent.sessionId !== request.sessionId || intent.projectId !== request.projectId) {
    notify("warning", t("resume.launch.error.STALE_DISCOVERY"));
    return false;
  }
  try {
    await launcher.launch(intent.codexExecutablePath, intent.sessionId, intent.projectRoot, request.workspaceWarning);
    notify("info", t("resume.launch.toast.started"));
    return true;
  } catch (error) {
    notify("error", t(LAUNCH_ERROR_KEYS[launchErrorCode(error)]));
    return false;
  }
}
