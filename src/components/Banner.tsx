import { useEffect, type ReactNode } from "react";
import type { Toast } from "../app/appState";

interface BannerProps {
  kind: "info" | "warning" | "error";
  children: ReactNode;
  actions?: ReactNode;
  onDismiss?: () => void;
  testId?: string;
}

export function Banner({ kind, children, actions, onDismiss, testId }: BannerProps) {
  return (
    <div className={`banner banner-${kind}`} role={kind === "error" ? "alert" : "status"} data-testid={testId}>
      <div className="banner-text">{children}</div>
      <div className="banner-actions">
        {actions}
        {onDismiss && (
          <button type="button" onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

const AUTO_DISMISS_MS = 6000;

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    // Errors stay until dismissed; info / warning fade out after their own timeout.
    if (toast.kind === "error") return;
    const timer = window.setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.kind, onDismiss]);

  return (
    <div className={`toast toast-${toast.kind}`} data-testid="toast" data-kind={toast.kind}>
      <span>{toast.message}</span>
      <button type="button" className="icon-button" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
