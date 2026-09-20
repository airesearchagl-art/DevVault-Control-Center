import { useEffect, useState, type ReactNode } from "react";
import type { Message } from "../domain/message";
import { translate } from "../i18n";
import { useT } from "../i18n/context";

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
  wide?: boolean;
}

export function Dialog({ title, onClose, children, testId, wide = false }: DialogProps) {
  const t = useT();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className={`dialog${wide ? " dialog-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} data-testid={testId}>
        <header className="dialog-header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t("dialog.closeAriaLabel")}>
            ×
          </button>
        </header>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  htmlFor?: string;
  /** What is wrong with this field, named by the domain and put into words here. */
  error?: Message;
  hint?: ReactNode;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  const t = useT();
  return (
    <div className={`field${error ? " field-invalid" : ""}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="hint">{hint}</p>}
      {error && (
        <p className="field-error" role="alert">
          {translate(t, error)}
        </p>
      )}
    </div>
  );
}

export function FormError({ message }: { message?: Message | null }) {
  const t = useT();
  if (!message) return null;
  return (
    <p className="form-error" role="alert" data-testid="form-error">
      {translate(t, message)}
    </p>
  );
}

interface ConfirmDialogProps {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  reasonLabel?: string;
  testId?: string;
  onConfirm: (reason: string) => Promise<Message | null>;
  onCancel: () => void;
}

/** Explicit Human confirmation, optionally with a required reason. */
export function ConfirmDialog({ title, message, confirmLabel, danger, reasonLabel, testId, onConfirm, onCancel }: ConfirmDialogProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<Message | null>(null);
  const [saving, setSaving] = useState(false);
  const t = useT();
  const needsReason = reasonLabel !== undefined;
  const disabled = saving || (needsReason && reason.trim() === "");

  const submit = async () => {
    setSaving(true);
    const result = await onConfirm(reason);
    setSaving(false);
    setError(result);
  };

  return (
    <Dialog title={title} onClose={onCancel} testId={testId}>
      <div className="dialog-message">{message}</div>
      {needsReason && (
        <Field label={reasonLabel} htmlFor="confirm-reason">
          <textarea id="confirm-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="confirm-reason" />
        </Field>
      )}
      <FormError message={error} />
      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>
          {t("dialog.cancel")}
        </button>
        <button type="button" className={danger ? "danger" : "primary"} disabled={disabled} onClick={submit} data-testid="confirm-submit">
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
