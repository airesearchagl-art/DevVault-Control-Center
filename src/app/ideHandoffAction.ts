import { buildIdeHandoff, renderIdeHandoff } from "../domain/ideHandoff";
import type { Project } from "../domain/project";
import { currentRound, type ReviewSession } from "../domain/review";
import type { Translator } from "../i18n";
import { describeError } from "./format";
import type { ToastKind } from "./appState";

/**
 * Phase 4a's "Copy IDE Handoff" logic, factored out of the `App` component as a narrow,
 * explicitly-parameterized seam (Independent Review P3-01) so the exact code the Human's click runs
 * is testable without rendering the app. `copy` and `notify` are its only side-effecting
 * capabilities — it takes no storage, hub or dispatch reference at all — so a rejected `copy` cannot
 * reach any project, review, event or checkpoint file: there is nothing else in scope for it to call.
 * `App.tsx` supplies the app's real `copyText` and `notify`; this module has no Tauri import of its
 * own, so it can be imported by a test without pulling in a plugin binding.
 */
export async function copyIdeHandoffAction(
  project: Project,
  session: ReviewSession,
  hasCheckpoint: boolean,
  t: Translator,
  copy: (text: string) => Promise<void>,
  notify: (kind: ToastKind, message: string) => void,
): Promise<void> {
  const handoff = buildIdeHandoff(project, session, currentRound(session), hasCheckpoint);
  try {
    await copy(renderIdeHandoff(t, handoff));
    notify("info", t("toast.ideHandoffCopied"));
  } catch (error) {
    notify("error", t("toast.ideHandoffCopyFailed", { error: describeError(t, error) }));
  }
}
