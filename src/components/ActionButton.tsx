/**
 * A button for an operation the Human may or may not be allowed to run right now.
 *
 * `enabled` is always computed from the same function the domain uses to refuse the action, so a
 * greyed-out button and a refused action can never disagree — and the button is never the gate:
 * the refusal still happens in `applyReviewAction` if the operation is somehow reached.
 */
export function ActionButton({
  label,
  testId,
  onClick,
  enabled,
  primary,
  title,
}: {
  label: string;
  testId: string;
  onClick: () => void;
  enabled: boolean;
  primary?: boolean;
  title?: string;
}) {
  return (
    <button type="button" className={primary ? "primary" : undefined} onClick={onClick} disabled={!enabled} data-testid={testId} title={title}>
      {label}
    </button>
  );
}
