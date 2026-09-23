import { useId } from "react";

/**
 * A button for an operation the Human may or may not be allowed to run right now.
 *
 * `enabled` is always computed from the same function the domain uses to refuse the action, so a
 * greyed-out button and a refused action can never disagree — and the button is never the gate:
 * the refusal still happens in `applyReviewAction` if the operation is somehow reached.
 *
 * When a refused button has a `disabledReason`, it does not just go grey: the reason is written
 * next to it and tied to it with `aria-describedby`, and the button stays focusable
 * (`aria-disabled` rather than `disabled`) so a keyboard or screen-reader user reaches the reason
 * too. Clicking it then does nothing.
 */
export function ActionButton({
  label,
  testId,
  onClick,
  enabled,
  primary,
  title,
  disabledReason,
}: {
  label: string;
  testId: string;
  onClick: () => void;
  enabled: boolean;
  primary?: boolean;
  title?: string;
  /** Why the operation is refused, and what to do next; shown only while it is refused. */
  disabledReason?: string | null;
}) {
  const reasonId = useId();
  const explained = !enabled && typeof disabledReason === "string" && disabledReason !== "";
  if (!explained) {
    return (
      <button type="button" className={primary ? "primary" : undefined} onClick={onClick} disabled={!enabled} data-testid={testId} title={title}>
        {label}
      </button>
    );
  }
  return (
    <span className="action-with-reason">
      <button
        type="button"
        className={primary ? "primary" : undefined}
        aria-disabled="true"
        aria-describedby={reasonId}
        onClick={() => undefined}
        data-testid={testId}
        title={title}
      >
        {label}
      </button>
      <span id={reasonId} className="disabled-reason" data-testid={`${testId}-reason`}>
        {disabledReason}
      </span>
    </span>
  );
}
