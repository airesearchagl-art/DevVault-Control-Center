import type { DiscoveredIdeSession } from "../domain/ideSessionDiscovery";
import { evaluateResume, renderResumeCommand } from "../domain/resumeIntent";
import { RESUME_REFUSAL_KEYS, type Translator } from "../i18n";
import type { ToastKind } from "./appState";
import { describeError } from "./format";

/**
 * Phase 4b-2a "Copy Resume Command", as a narrow seam like Phase 4a's `copyIdeHandoffAction`: its
 * only side-effecting capabilities are `copy` and `notify` — no storage, hub, dispatch, event
 * writer, filesystem, provider command or launcher is in scope, so nothing but the clipboard and a
 * toast can be touched. Eligibility is re-evaluated here, at click time, from the full session and
 * the current stale state and selected Project; the disabled button is never the security boundary.
 */
export async function copyResumeCommandAction(
  session: DiscoveredIdeSession,
  selectedProjectId: string | null,
  stale: boolean,
  t: Translator,
  copy: (text: string) => Promise<void>,
  notify: (kind: ToastKind, message: string) => void,
): Promise<void> {
  const eligibility = selectedProjectId === null ? ({ eligible: false, reason: "NOT_MATCHED" } as const) : evaluateResume(session, selectedProjectId, stale);
  if (!eligibility.eligible) {
    notify("warning", t(RESUME_REFUSAL_KEYS[eligibility.reason]));
    return;
  }
  try {
    await copy(renderResumeCommand(eligibility.intent));
    notify("info", t("resume.toast.copied"));
  } catch (error) {
    notify("error", t("resume.toast.copyFailed", { error: describeError(t, error) }));
  }
}
