import { CONTROL_READ_CONTRACT, CONTROL_READ_VERSION, type ControlReadSource, type ReadControlEnv } from "../domain/controlRead/contract";
import { readControl } from "../domain/controlRead/readControl";
import type { Translator } from "../i18n";
import type { ToastKind } from "./appState";

/**
 * Phase 5A "Copy control snapshot (JSON)" — the Human UI adapter of Control Read v1.
 *
 * A narrow seam like `copyResumeCommandAction`: its only side-effecting capabilities are `copy` and
 * `notify`. It asks `readControl` for the selected review's project snapshot exactly once and puts
 * the sanitized JSON on the clipboard; no storage, hub, dispatch, event writer, filesystem or
 * provider command is in scope, so nothing is persisted. A refusal is reported by its error code
 * only, and a failed copy by a fixed sentence — never a path or an underlying message.
 */
export async function copyControlSnapshotAction(
  projectId: string,
  source: ControlReadSource,
  env: ReadControlEnv,
  t: Translator,
  copy: (text: string) => Promise<void>,
  notify: (kind: ToastKind, message: string) => void,
): Promise<void> {
  const result = readControl(
    { contract: CONTROL_READ_CONTRACT, version: CONTROL_READ_VERSION, operation: "get_control_snapshot", project_id: projectId },
    source,
    env,
  );
  if ("error" in result) {
    notify("warning", t("controlRead.toast.unavailable", { code: result.error.code }));
    return;
  }
  try {
    await copy(`${JSON.stringify(result, null, 2)}\n`);
    notify("info", t("controlRead.toast.copied"));
  } catch {
    notify("error", t("controlRead.toast.copyFailed"));
  }
}
