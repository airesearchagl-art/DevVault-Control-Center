import { useState } from "react";
import type { ResumeLaunchRequest } from "../../app/launchCodexResumeAction";
import { Dialog } from "../../components/Dialog";
import { Row } from "../../components/DetailRow";
import { useT } from "../../i18n/context";

export interface ResumeLaunchDialogProps {
  request: ResumeLaunchRequest;
  /** Receives whether the acknowledgement was checked; resolves when the attempt is over. */
  onConfirm: (acknowledged: boolean) => Promise<void>;
  onCancel: () => void;
}

/**
 * Phase 4b-2b confirmation (HD-4B2B-03/04). Shows only the provider, the Project's display name,
 * the collision-safe session label and the action — never a local path, the executable path, the
 * full session ID, a provider storage path or a repository URL. The confirm button stays disabled
 * until the Human checks the already-open acknowledgement, which is not persisted anywhere.
 */
export function ResumeLaunchDialog({ request, onConfirm, onCancel }: ResumeLaunchDialogProps) {
  const t = useT();
  const [acknowledged, setAcknowledged] = useState(false);
  const [working, setWorking] = useState(false);

  const confirm = async () => {
    setWorking(true);
    try {
      await onConfirm(acknowledged);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog title={t("resume.launch.dialog.title")} onClose={onCancel} testId="resume-launch-dialog">
      <dl>
        <Row label={t("resume.launch.dialog.provider")}>{t("ideSessions.provider.codex")}</Row>
        <Row label={t("resume.launch.dialog.project")}>{request.projectDisplayName}</Row>
        <Row label={t("resume.launch.dialog.session")} mono testId="resume-launch-session-label">
          {request.sessionLabel}
        </Row>
        <Row label={t("resume.launch.dialog.action")}>{t("resume.launch.dialog.actionValue")}</Row>
      </dl>
      <div className="dialog-message">
        <p className="warning-text" data-testid="resume-launch-warning-already-open">
          {t("resume.launch.dialog.warningAlreadyOpen")}
        </p>
        {request.workspaceWarning && (
          <p className="warning-text" data-testid="resume-launch-warning-workspace">
            {t("resume.launch.dialog.warningWorkspace")}
          </p>
        )}
        <p className="muted small" data-testid="resume-launch-warning-process-only">
          {t("resume.launch.dialog.warningProcessOnly")}
        </p>
      </div>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
          data-testid="resume-launch-acknowledge"
        />{" "}
        {t("resume.launch.dialog.acknowledge")}
      </label>
      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>
          {t("dialog.cancel")}
        </button>
        <button type="button" className="primary" disabled={!acknowledged || working} onClick={() => void confirm()} data-testid="resume-launch-confirm">
          {t("resume.launch.dialog.confirm")}
        </button>
      </div>
    </Dialog>
  );
}
