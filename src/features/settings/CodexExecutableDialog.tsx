import { useEffect, useState } from "react";
import { Dialog, Field } from "../../components/Dialog";
import { useT } from "../../i18n/context";

export type CodexExecutableStatus = "notConfigured" | "valid" | "invalid" | "checking";

export interface CodexExecutableDialogProps {
  /** The stored path, shown only on this dedicated Human-edit surface. */
  storedPath: string | null;
  /** Native validation only; nothing is started. */
  validate: (path: string) => Promise<boolean>;
  /** Validates and stores (or clears, with `null`). Resolves to whether it was stored. */
  onSave: (path: string | null) => Promise<boolean>;
  onClose: () => void;
}

/**
 * Phase 4b-2b: the Human configures the one native `codex.exe` the launcher may start (HD-4B2B-02).
 * No auto-detection and no file picker; the setting is never changed without this dialog's button.
 */
export function CodexExecutableDialog({ storedPath, validate, onSave, onClose }: CodexExecutableDialogProps) {
  const t = useT();
  const [path, setPath] = useState(storedPath ?? "");
  const [status, setStatus] = useState<CodexExecutableStatus>(storedPath === null ? "notConfigured" : "checking");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (storedPath === null) return;
    let cancelled = false;
    void validate(storedPath).then((ok) => {
      if (!cancelled) setStatus(ok ? "valid" : "invalid");
    });
    return () => {
      cancelled = true;
    };
  }, [storedPath, validate]);

  const save = async (next: string | null) => {
    setWorking(true);
    try {
      const stored = await onSave(next);
      if (stored) setStatus(next === null ? "notConfigured" : "valid");
      else if (next !== null) setStatus("invalid");
      if (stored && next === null) setPath("");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog title={t("codexSettings.dialog.title")} onClose={onClose} testId="codex-executable-dialog">
      <Field label={t("codexSettings.field.path")} htmlFor="codex-executable-path" hint={t("codexSettings.field.hint")}>
        <input
          id="codex-executable-path"
          type="text"
          className="mono"
          spellCheck={false}
          value={path}
          onChange={(event) => setPath(event.target.value)}
          data-testid="codex-executable-path"
        />
      </Field>
      <p className="small">
        {t("codexSettings.state.label")}:{" "}
        <span data-testid="codex-executable-status" data-status={status}>
          {t(`codexSettings.state.${status}`)}
        </span>
      </p>
      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          {t("dialog.cancel")}
        </button>
        <button type="button" disabled={working || storedPath === null} onClick={() => void save(null)} data-testid="codex-executable-clear">
          {t("codexSettings.action.clear")}
        </button>
        <button type="button" className="primary" disabled={working || path.trim() === ""} onClick={() => void save(path)} data-testid="codex-executable-save">
          {t("codexSettings.action.save")}
        </button>
      </div>
    </Dialog>
  );
}
