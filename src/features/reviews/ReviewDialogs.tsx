import { useState } from "react";
import { excerpt } from "../../app/format";
import { Dialog, Field, FormError } from "../../components/Dialog";
import { currentRound, type ReviewSession } from "../../domain/review";
import { REVIEW_STATE_LABELS, RESOURCE_STATE_HINTS } from "../../domain/states";
import { normalizeHead } from "../../domain/validation";

function useSubmit() {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const run = async (fn: () => Promise<string | null>) => {
    setSaving(true);
    const result = await fn();
    setSaving(false);
    setError(result);
  };
  return { error, setError, saving, run };
}

/** D2: checkpoint note + Human choice of WARM / COLD. */
export function SuspendDialog({
  session,
  onSubmit,
  onCancel,
}: {
  session: ReviewSession;
  onSubmit: (checkpoint: string, resourceState: "WARM" | "COLD") => Promise<string | null>;
  onCancel: () => void;
}) {
  const [checkpoint, setCheckpoint] = useState(
    [`State: ${REVIEW_STATE_LABELS[session.reviewState]} (R${session.reviewRound})`, "Stopped at: ", `Next: ${session.nextAction}`].join("\n"),
  );
  const [resource, setResource] = useState<"WARM" | "COLD">("WARM");
  const { error, saving, run } = useSubmit();

  return (
    <Dialog title="Suspend review" onClose={onCancel} testId="suspend-dialog">
      <p className="dialog-message">
        The review becomes <strong>Suspended</strong> and remembers its current state ({REVIEW_STATE_LABELS[session.reviewState]}). Resume restores it.
        You can close ChatGPT and the IDE afterwards.
      </p>
      <Field label="Checkpoint (saved to checkpoint.md)" htmlFor="suspend-checkpoint">
        <textarea id="suspend-checkpoint" rows={6} value={checkpoint} onChange={(e) => setCheckpoint(e.target.value)} data-testid="suspend-checkpoint" />
      </Field>
      <fieldset className="field">
        <legend>Resource state while suspended</legend>
        <div className="segmented">
          {(["WARM", "COLD"] as const).map((value) => (
            <label key={value} className={resource === value ? "selected" : ""} title={RESOURCE_STATE_HINTS[value]}>
              <input type="radio" name="suspend-resource" checked={resource === value} onChange={() => setResource(value)} data-testid={`suspend-resource-${value}`} />
              {value}
            </label>
          ))}
        </div>
        <p className="hint">{RESOURCE_STATE_HINTS[resource]}</p>
      </fieldset>
      <FormError message={error} />
      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          disabled={saving || checkpoint.trim() === ""}
          onClick={() => run(() => onSubmit(checkpoint, resource))}
          data-testid="suspend-submit"
        >
          Suspend
        </button>
      </div>
    </Dialog>
  );
}

/** AC-13: Human pastes the result. The clipboard is never read by DVCC. */
export function CaptureResultDialog({
  session,
  onSubmit,
  onCancel,
}: {
  session: ReviewSession;
  onSubmit: (text: string, reviewedHead: string | null) => Promise<string | null>;
  onCancel: () => void;
}) {
  const round = currentRound(session);
  const [text, setText] = useState("");
  const [head, setHead] = useState(round.reviewedHead ?? "");
  const { error, setError, saving, run } = useSubmit();

  const submit = () =>
    run(async () => {
      let reviewedHead: string | null = null;
      if (head.trim() !== "") {
        const normalized = normalizeHead(head);
        if (!normalized.ok) return normalized.error;
        reviewedHead = normalized.value;
      }
      return onSubmit(text, reviewedHead);
    });

  return (
    <Dialog title={`Capture review result — R${session.reviewRound}`} onClose={onCancel} testId="capture-dialog" wide>
      <p className="dialog-message">
        Copy the reviewer&apos;s answer in ChatGPT, then paste it below with <kbd>Ctrl</kbd>+<kbd>V</kbd>. It is saved as{" "}
        <code>result-r{session.reviewRound}.md</code>. The review state does not change until you confirm a verdict.
      </p>
      {round.resultCapturedAt !== null && <p className="warning-text">A result is already saved for R{session.reviewRound}; saving replaces it.</p>}
      <Field label="Review result" htmlFor="capture-text">
        <textarea
          id="capture-text"
          rows={14}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          placeholder="Paste the ChatGPT review result here (Ctrl+V)"
          autoFocus
          data-testid="capture-text"
        />
      </Field>
      <Field label="Reviewed HEAD" htmlFor="capture-reviewed-head" hint="The commit SHA the reviewer states it reviewed (optional; leave empty if not stated).">
        <input id="capture-reviewed-head" value={head} onChange={(e) => setHead(e.target.value)} className="mono" data-testid="capture-reviewed-head" />
      </Field>
      <FormError message={error} />
      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="primary" disabled={saving || text.trim() === ""} onClick={submit} data-testid="capture-submit">
          Save result
        </button>
      </div>
    </Dialog>
  );
}

export type VerdictChoice = "FIX_REQUIRED" | "REVIEW_PASS" | "BLOCKED";

const VERDICT_OPTIONS: { value: VerdictChoice; label: string; description: string }[] = [
  { value: "FIX_REQUIRED", label: "Fix required", description: "The reviewer requires fixes before passing." },
  { value: "REVIEW_PASS", label: "Review pass", description: "The reviewer found no required fixes." },
  { value: "BLOCKED", label: "Blocked", description: "The review cannot proceed (reason required)." },
];

/** AC-14: nothing is preselected; the Human must pick and acknowledge. */
export function VerdictDialog({
  session,
  resultText,
  onConfirm,
  onCancel,
}: {
  session: ReviewSession;
  resultText: string | null;
  onConfirm: (verdict: VerdictChoice, note: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [verdict, setVerdict] = useState<VerdictChoice | null>(null);
  const [note, setNote] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const { error, saving, run } = useSubmit();
  const shown = resultText === null ? null : excerpt(resultText, 40);
  const disabled = saving || verdict === null || !acknowledged || (verdict === "BLOCKED" && note.trim() === "");

  return (
    <Dialog title={`Confirm verdict — R${session.reviewRound}`} onClose={onCancel} testId="verdict-dialog" wide>
      {shown === null ? (
        <p className="muted">The saved result for this round is loading or unavailable.</p>
      ) : (
        <pre className="result-text result-preview">
          {shown.text}
          {shown.truncated ? "\n…" : ""}
        </pre>
      )}
      <fieldset className="field">
        <legend>Verdict (your decision)</legend>
        <div className="verdict-options">
          {VERDICT_OPTIONS.map((option) => (
            <label key={option.value} className={`verdict-option${verdict === option.value ? " selected" : ""}`}>
              <input type="radio" name="verdict" checked={verdict === option.value} onChange={() => setVerdict(option.value)} data-testid={`verdict-${option.value}`} />
              <span>
                <strong>{option.label}</strong>
                <span className="muted"> — {option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label={verdict === "BLOCKED" ? "Reason (required)" : "Note (optional)"} htmlFor="verdict-note">
        <textarea id="verdict-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} data-testid="verdict-note" />
      </Field>
      <label className="checkbox">
        <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} data-testid="verdict-ack" />
        I have read the review result and confirm this verdict.
      </label>
      <FormError message={error} />
      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>
          Decide later
        </button>
        <button
          type="button"
          className="primary"
          disabled={disabled}
          onClick={() => verdict && run(() => onConfirm(verdict, note))}
          data-testid="verdict-submit"
        >
          Confirm verdict
        </button>
      </div>
    </Dialog>
  );
}

export function NextRoundDialog({
  session,
  onSubmit,
  onCancel,
}: {
  session: ReviewSession;
  onSubmit: (expectedHead: string | null) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [head, setHead] = useState("");
  const { error, saving, run } = useSubmit();
  const next = session.reviewRound + 1;

  const submit = () =>
    run(async () => {
      if (head.trim() === "") return onSubmit(null);
      const normalized = normalizeHead(head);
      return normalized.ok ? onSubmit(normalized.value) : normalized.error;
    });

  return (
    <Dialog title={`Start round R${next}`} onClose={onCancel} testId="next-round-dialog">
      <p className="dialog-message">
        R{session.reviewRound} artifacts stay as they are. R{next} starts as <strong>Ready for review</strong>.
      </p>
      <Field label={`Expected HEAD for R${next}`} htmlFor="next-round-head" hint="Optional; the commit you will ask the reviewer to review.">
        <input id="next-round-head" value={head} onChange={(e) => setHead(e.target.value)} className="mono" autoFocus data-testid="next-round-head" />
      </Field>
      <FormError message={error} />
      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="primary" disabled={saving} onClick={submit} data-testid="next-round-submit">
          Start R{next}
        </button>
      </div>
    </Dialog>
  );
}
