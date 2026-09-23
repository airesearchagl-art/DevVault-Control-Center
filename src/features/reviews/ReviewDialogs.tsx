import { useId, useState } from "react";
import { excerpt } from "../../app/format";
import { Dialog, Field, FormError } from "../../components/Dialog";
import { message, type Message } from "../../domain/message";
import type { ResolutionNarrative } from "../../domain/prompt";
import { currentRound, type ReviewSession } from "../../domain/review";
import { SAME_HEAD_INVALIDATION_REASONS, type InvalidationReason } from "../../domain/revalidation";
import { RISK_TIERS, TIER_2_SUBJECTS, validateTierChoice, type RiskTier, type Tier2Subject } from "../../domain/riskTier";
import { normalizeHead } from "../../domain/validation";
import {
  formatParts,
  RESOURCE_HINT_KEYS,
  RESOURCE_STATE_KEYS,
  INVALIDATION_REASON_KEYS,
  REVIEW_STATE_KEYS,
  RISK_TIER_KEYS,
  TIER_2_SUBJECT_KEYS,
  translate,
  VERDICT_KEYS,
  type TranslationKey,
} from "../../i18n";
import { useT } from "../../i18n/context";

function useSubmit() {
  const [error, setError] = useState<Message | null>(null);
  const [saving, setSaving] = useState(false);
  const run = async (fn: () => Promise<Message | null>) => {
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
  onSubmit: (checkpoint: string, resourceState: "WARM" | "COLD") => Promise<Message | null>;
  onCancel: () => void;
}) {
  const t = useT();
  // A draft the Human edits before saving: it is offered in the interface language, and whatever is
  // saved into checkpoint.md afterwards stays in the language it was written in.
  const [checkpoint, setCheckpoint] = useState(
    [
      t("review.suspend.draft.state", { label: t(REVIEW_STATE_KEYS[session.reviewState]), round: session.reviewRound }),
      t("review.suspend.draft.stoppedAt"),
      t("review.suspend.draft.next", { nextAction: session.nextAction }),
    ].join("\n"),
  );
  const [resource, setResource] = useState<"WARM" | "COLD">("WARM");
  const { error, saving, run } = useSubmit();

  return (
    <Dialog title={t("review.suspend.title")} onClose={onCancel} testId="suspend-dialog">
      <p className="dialog-message">
        {formatParts(t("review.suspend.body", { state: t(REVIEW_STATE_KEYS[session.reviewState]) }), {
          suspendedLabel: <strong key="suspended">{t(REVIEW_STATE_KEYS.SUSPENDED)}</strong>,
        })}
      </p>
      <Field label={t("review.suspend.checkpointLabel")} htmlFor="suspend-checkpoint">
        <textarea id="suspend-checkpoint" rows={6} value={checkpoint} onChange={(e) => setCheckpoint(e.target.value)} data-testid="suspend-checkpoint" />
      </Field>
      <fieldset className="field">
        <legend>{t("review.suspend.resourceLegend")}</legend>
        <div className="segmented">
          {(["WARM", "COLD"] as const).map((value) => (
            <label key={value} className={resource === value ? "selected" : ""} title={t(RESOURCE_HINT_KEYS[value])}>
              <input type="radio" name="suspend-resource" checked={resource === value} onChange={() => setResource(value)} data-testid={`suspend-resource-${value}`} />
              {t(RESOURCE_STATE_KEYS[value])}
            </label>
          ))}
        </div>
        <p className="hint">{t(RESOURCE_HINT_KEYS[resource])}</p>
      </fieldset>
      <FormError message={error} />
      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>
          {t("dialog.cancel")}
        </button>
        <button
          type="button"
          className="primary"
          disabled={saving || checkpoint.trim() === ""}
          onClick={() => run(() => onSubmit(checkpoint, resource))}
          data-testid="suspend-submit"
        >
          {t("review.suspend.submit")}
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
  onSubmit: (text: string, reviewedHead: string | null, replaceConfirmed: boolean) => Promise<Message | null>;
  onCancel: () => void;
}) {
  const round = currentRound(session);
  const replacing = round.resultCapturedAt !== null;
  const [text, setText] = useState("");
  const [head, setHead] = useState(round.reviewedHead ?? "");
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const { error, setError, saving, run } = useSubmit();
  const t = useT();

  const submit = () =>
    run(async () => {
      let reviewedHead: string | null = null;
      if (head.trim() !== "") {
        const normalized = normalizeHead(head);
        if (!normalized.ok) return normalized.error;
        reviewedHead = normalized.value;
      }
      return onSubmit(text, reviewedHead, replaceConfirmed);
    });

  return (
    <Dialog title={t("review.capture.title", { round: session.reviewRound })} onClose={onCancel} testId="capture-dialog" wide>
      <p className="dialog-message">
        {formatParts(t("review.capture.body"), {
          paste: (
            <span key="paste">
              <kbd>Ctrl</kbd>+<kbd>V</kbd>
            </span>
          ),
          file: <code key="file">result-r{session.reviewRound}.md</code>,
        })}
      </p>
      {replacing && (
        <label className="checkbox replace-confirm">
          <input type="checkbox" checked={replaceConfirmed} onChange={(e) => setReplaceConfirmed(e.target.checked)} data-testid="capture-replace-confirm" />
          <span>
            {formatParts(t("review.capture.replaceLabel", { round: session.reviewRound }), {
              archived: <code key="archived">result-r{session.reviewRound}-previous-….md</code>,
              file: <code key="file">result-r{session.reviewRound}.md</code>,
            })}
          </span>
        </label>
      )}
      <Field label={t("review.capture.resultLabel")} htmlFor="capture-text">
        <textarea
          id="capture-text"
          rows={14}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          placeholder={t("review.capture.resultPlaceholder")}
          autoFocus
          data-testid="capture-text"
        />
      </Field>
      <Field label={t("review.capture.reviewedHeadLabel")} htmlFor="capture-reviewed-head" hint={t("review.capture.reviewedHeadHint")}>
        <input id="capture-reviewed-head" value={head} onChange={(e) => setHead(e.target.value)} className="mono" data-testid="capture-reviewed-head" />
      </Field>
      <FormError message={error} />
      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>
          {t("dialog.cancel")}
        </button>
        <button
          type="button"
          className="primary"
          disabled={saving || text.trim() === "" || (replacing && !replaceConfirmed)}
          onClick={submit}
          data-testid="capture-submit"
        >
          {replacing ? t("review.capture.submitReplace") : t("review.capture.submitSave")}
        </button>
      </div>
    </Dialog>
  );
}

export type VerdictChoice = "FIX_REQUIRED" | "REVIEW_PASS" | "BLOCKED";

/** The value is what gets stored; the label and the description are only what the Human reads. */
const VERDICT_OPTIONS: { value: VerdictChoice; description: TranslationKey }[] = [
  { value: "FIX_REQUIRED", description: "review.verdict.fixRequiredDescription" },
  { value: "REVIEW_PASS", description: "review.verdict.reviewPassDescription" },
  { value: "BLOCKED", description: "review.verdict.blockedDescription" },
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
  onConfirm: (verdict: VerdictChoice, note: string) => Promise<Message | null>;
  onCancel: () => void;
}) {
  const [verdict, setVerdict] = useState<VerdictChoice | null>(null);
  const [note, setNote] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const { error, saving, run } = useSubmit();
  const t = useT();
  const shown = resultText === null ? null : excerpt(resultText, 40);
  const disabled = saving || verdict === null || !acknowledged || (verdict === "BLOCKED" && note.trim() === "");

  return (
    <Dialog title={t("review.verdict.title", { round: session.reviewRound })} onClose={onCancel} testId="verdict-dialog" wide>
      {shown === null ? (
        <p className="muted">{t("review.verdict.missingResult")}</p>
      ) : (
        <pre className="result-text result-preview">
          {shown.text}
          {shown.truncated ? t("detail.truncated") : ""}
        </pre>
      )}
      <fieldset className="field">
        <legend>{t("review.verdict.legend")}</legend>
        <div className="verdict-options">
          {VERDICT_OPTIONS.map((option) => (
            <label key={option.value} className={`verdict-option${verdict === option.value ? " selected" : ""}`}>
              <input type="radio" name="verdict" checked={verdict === option.value} onChange={() => setVerdict(option.value)} data-testid={`verdict-${option.value}`} />
              <span>
                <strong>{t(VERDICT_KEYS[option.value])}</strong>
                <span className="muted">
                  {t("review.verdict.separator")}
                  {t(option.description)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label={verdict === "BLOCKED" ? t("review.verdict.reasonRequired") : t("review.verdict.noteOptional")} htmlFor="verdict-note">
        <textarea id="verdict-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} data-testid="verdict-note" />
      </Field>
      <label className="checkbox">
        <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} data-testid="verdict-ack" />
        {t("review.verdict.acknowledgement")}
      </label>
      <FormError message={error} />
      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>
          {t("review.verdict.later")}
        </button>
        <button
          type="button"
          className="primary"
          disabled={disabled}
          onClick={() => verdict && run(() => onConfirm(verdict, note))}
          data-testid="verdict-submit"
        >
          {t("review.verdict.submit")}
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
  onSubmit: (expectedHead: string | null) => Promise<Message | null>;
  onCancel: () => void;
}) {
  const [head, setHead] = useState("");
  const { error, saving, run } = useSubmit();
  const t = useT();
  const next = session.reviewRound + 1;

  const submit = () =>
    run(async () => {
      if (head.trim() === "") return onSubmit(null);
      const normalized = normalizeHead(head);
      return normalized.ok ? onSubmit(normalized.value) : normalized.error;
    });

  return (
    <Dialog title={t("review.nextRound.title", { round: next })} onClose={onCancel} testId="next-round-dialog">
      <p className="dialog-message">
        {formatParts(t("review.nextRound.body", { previous: session.reviewRound, round: next }), {
          readyLabel: <strong key="ready">{t(REVIEW_STATE_KEYS.READY_FOR_REVIEW)}</strong>,
        })}
      </p>
      <Field
        label={t("review.nextRound.expectedHeadLabel", { round: next })}
        htmlFor="next-round-head"
        hint={t("review.nextRound.expectedHeadHint")}
      >
        <input id="next-round-head" value={head} onChange={(e) => setHead(e.target.value)} className="mono" autoFocus data-testid="next-round-head" />
      </Field>
      <FormError message={error} />
      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>
          {t("dialog.cancel")}
        </button>
        <button type="button" className="primary" disabled={saving} onClick={submit} data-testid="next-round-submit">
          {t("review.nextRound.submit", { round: next })}
        </button>
      </div>
    </Dialog>
  );
}

/**
 * The Final Judgment (Turn 2's answer). It is kept beside the Fresh Assessment, never over it, so
 * the dialog says which file it goes to and only asks about replacing a judgment.
 */
export function CaptureJudgmentDialog({
  session,
  onSubmit,
  onCancel,
}: {
  session: ReviewSession;
  onSubmit: (text: string, replaceConfirmed: boolean) => Promise<Message | null>;
  onCancel: () => void;
}) {
  const round = currentRound(session);
  const replacing = round.judgmentCapturedAt !== null;
  const [text, setText] = useState("");
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const { error, setError, saving, run } = useSubmit();
  const t = useT();

  return (
    <Dialog title={t("review.judgment.title", { round: session.reviewRound })} onClose={onCancel} testId="judgment-dialog" wide>
      {replacing && (
        <label className="checkbox replace-confirm">
          <input
            type="checkbox"
            checked={replaceConfirmed}
            onChange={(e) => setReplaceConfirmed(e.target.checked)}
            data-testid="judgment-replace-confirm"
          />
          <span>{t("review.judgment.replace")}</span>
        </label>
      )}
      <Field
        label={t("review.judgment.text")}
        htmlFor="judgment-text"
        hint={t("review.judgment.textHint", { round: session.reviewRound })}
      >
        <textarea
          id="judgment-text"
          rows={14}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          autoFocus
          data-testid="judgment-text"
        />
      </Field>
      <FormError message={error} />
      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>
          {t("dialog.cancel")}
        </button>
        <button
          type="button"
          className="primary"
          disabled={saving || text.trim() === "" || (replacing && !replaceConfirmed)}
          onClick={() => run(() => onSubmit(text, replaceConfirmed))}
          data-testid="judgment-submit"
        >
          {replacing ? t("review.judgment.submitReplace") : t("review.judgment.submitSave")}
        </button>
      </div>
    </Dialog>
  );
}

export interface NarrativeFields {
  background: string;
  decisions: string;
  tradeoffs: string;
}

/**
 * The three fields as the narrative Turn 2 is built from, one to one. The Human's words are passed
 * on as typed; a blank field becomes absent, which the builder turns into the canonical placeholder.
 */
export function narrativeOf(fields: NarrativeFields): ResolutionNarrative {
  const keep = (value: string) => (value.trim() === "" ? null : value);
  return { background: keep(fields.background), decisions: keep(fields.decisions), tradeoffs: keep(fields.tradeoffs) };
}

/**
 * Turn 2's implementation narrative (canonical input items 7 and 8, and the trade-offs), entered
 * before anything is written (RF-WF-01). Confirming saves `followup-r<N>.md` from exactly these
 * fields and copies that same text; cancelling writes nothing.
 */
export function FollowupDialog({
  session,
  onSubmit,
  onCancel,
}: {
  session: ReviewSession;
  onSubmit: (narrative: ResolutionNarrative) => Promise<Message | null>;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState<NarrativeFields>({ background: "", decisions: "", tradeoffs: "" });
  const { error, saving, run } = useSubmit();
  const t = useT();
  const round = session.reviewRound;
  const noticeId = useId();
  const set = (key: keyof NarrativeFields) => (value: string) => setFields((current) => ({ ...current, [key]: value }));
  const areas: { key: keyof NarrativeFields; label: TranslationKey }[] = [
    { key: "background", label: "review.followup.background" },
    { key: "decisions", label: "review.followup.decisions" },
    { key: "tradeoffs", label: "review.followup.tradeoffs" },
  ];

  return (
    <Dialog title={t("review.followup.title", { round })} onClose={onCancel} testId="followup-dialog" wide>
      <p className="dialog-message">{t("review.followup.body", { round })}</p>
      {areas.map(({ key, label }) => (
        <Field key={key} label={t(label)} htmlFor={`followup-${key}`}>
          <textarea
            id={`followup-${key}`}
            rows={4}
            value={fields[key]}
            onChange={(e) => set(key)(e.target.value)}
            aria-describedby={noticeId}
            data-testid={`followup-${key}`}
          />
        </Field>
      ))}
      <p className="hint" id={noticeId} data-testid="followup-notice">
        {t("review.followup.notice", { round })}
      </p>
      <FormError message={error} />
      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>
          {t("dialog.cancel")}
        </button>
        <button type="button" className="primary" disabled={saving} onClick={() => run(() => onSubmit(narrativeOf(fields)))} data-testid="followup-submit">
          {t("review.followup.submit")}
        </button>
      </div>
    </Dialog>
  );
}

const TIER_DESCRIPTIONS: Record<RiskTier, TranslationKey> = {
  TIER_0: "review.riskTier.tier0Description",
  TIER_1: "review.riskTier.tier1Description",
  TIER_2: "review.riskTier.tier2Description",
};

/**
 * The Risk Tier, chosen by the Human. The tier and the subjects are sent to the domain exactly as
 * ticked: nothing here derives a tier from the checkboxes, and nothing raises a choice quietly. A
 * tier below what the declared subjects require comes back as a refusal with the reason, which is
 * shown where every other form error is shown.
 */
export function RiskTierDialog({
  session,
  onSubmit,
  onCancel,
}: {
  session: ReviewSession;
  onSubmit: (tier: RiskTier, subjects: Tier2Subject[]) => Promise<Message | null>;
  onCancel: () => void;
}) {
  const round = currentRound(session);
  const [tier, setTier] = useState<RiskTier | null>(round.riskTier);
  const [subjects, setSubjects] = useState<Tier2Subject[]>([...round.riskTierSubjects]);
  const [acknowledged, setAcknowledged] = useState(false);
  const { error, setError, saving, run } = useSubmit();
  const t = useT();

  const submitHintId = useId();
  // The same rule the domain applies on save, read ahead so the refusal is visible before it happens.
  const preview = tier === null ? null : validateTierChoice({ chosen: tier, subjects });
  const refusal =
    preview === null || preview.ok
      ? null
      : preview.refusal === "NOT_A_TIER"
        ? message("action.riskTier.unknown")
        : message("action.riskTier.belowRequired", { required: preview.required });
  const submitDisabled = saving || tier === null || !acknowledged;

  const toggle = (subject: Tier2Subject) => {
    setError(null);
    setSubjects((current) => (current.includes(subject) ? current.filter((s) => s !== subject) : [...current, subject]));
  };

  return (
    <Dialog title={t("review.riskTier.title", { round: session.reviewRound })} onClose={onCancel} testId="risk-tier-dialog">
      <fieldset className="field">
        <legend>{t("review.riskTier.tier")}</legend>
        <div className="verdict-options">
          {RISK_TIERS.map((value) => (
            <label key={value} className={`verdict-option${tier === value ? " selected" : ""}`}>
              <input
                type="radio"
                name="risk-tier"
                checked={tier === value}
                onChange={() => {
                  setTier(value);
                  setError(null);
                }}
                data-testid={`risk-tier-${value}`}
              />
              <span>
                <strong>{t(RISK_TIER_KEYS[value])}</strong>
                <span className="muted">
                  {t("review.verdict.separator")}
                  {t(TIER_DESCRIPTIONS[value])}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="field">
        <legend>{t("review.riskTier.subjects")}</legend>
        {TIER_2_SUBJECTS.map((subject) => (
          <label key={subject} className="checkbox">
            <input
              type="checkbox"
              checked={subjects.includes(subject)}
              onChange={() => toggle(subject)}
              data-testid={`risk-subject-${subject}`}
            />
            {t(TIER_2_SUBJECT_KEYS[subject])}
          </label>
        ))}
      </fieldset>
      <p className="hint">{t("review.riskTier.rule")}</p>
      {refusal !== null && (
        <p className="warning-text" role="status" data-testid="risk-tier-refusal-preview">
          {t("review.riskTier.preview")} {translate(t, refusal)}
        </p>
      )}
      <label className="checkbox">
        <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} data-testid="risk-tier-ack" />
        {t("review.riskTier.acknowledgement")}
      </label>
      <FormError message={error} />
      {submitDisabled && !saving && (
        <p className="hint" id={submitHintId} data-testid="risk-tier-submit-reason">
          {t("review.riskTier.submitDisabled")}
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>
          {t("dialog.cancel")}
        </button>
        <button
          type="button"
          className="primary"
          disabled={submitDisabled}
          aria-describedby={submitDisabled && !saving ? submitHintId : undefined}
          onClick={() => run(() => onSubmit(tier as RiskTier, subjects))}
          data-testid="risk-tier-submit"
        >
          {t("review.riskTier.submit")}
        </button>
      </div>
    </Dialog>
  );
}


/**
 * Why a head that already has a substantive review is being reviewed again.
 *
 * The canonical list decides; the free text is kept with the record but never grants anything. Only
 * the reasons that can apply to an unchanged head are offered — a changed head is not a same-head
 * duplicate at all — and nothing is preselected, so the reason is always a choice.
 */
export function RevalidationDialog({
  session,
  matches,
  onSubmit,
  onCancel,
}: {
  session: ReviewSession;
  /** The existing reviews this decision is about, already rendered for display. */
  matches: string;
  onSubmit: (reason: InvalidationReason, explanation: string | null) => Promise<Message | null>;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<InvalidationReason | null>(null);
  const [explanation, setExplanation] = useState("");
  const { error, setError, saving, run } = useSubmit();
  const t = useT();

  return (
    <Dialog title={t("review.revalidation.title", { round: session.reviewRound })} onClose={onCancel} testId="revalidation-dialog">
      <p className="dialog-message">{t("review.revalidation.body", { reviews: matches })}</p>
      <fieldset className="field">
        <legend>{t("review.revalidation.reason")}</legend>
        <div className="verdict-options">
          {SAME_HEAD_INVALIDATION_REASONS.map((value) => (
            <label key={value} className={`verdict-option${reason === value ? " selected" : ""}`}>
              <input
                type="radio"
                name="invalidation-reason"
                checked={reason === value}
                onChange={() => {
                  setReason(value);
                  setError(null);
                }}
                data-testid={`revalidation-${value}`}
              />
              <span>{t(INVALIDATION_REASON_KEYS[value])}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label={t("review.revalidation.explanation")} htmlFor="revalidation-explanation" hint={t("review.revalidation.explanationHint")}>
        <textarea
          id="revalidation-explanation"
          rows={3}
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          data-testid="revalidation-explanation"
        />
      </Field>
      <FormError message={error} />
      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>
          {t("dialog.cancel")}
        </button>
        <button
          type="button"
          className="primary"
          disabled={saving || reason === null}
          onClick={() => run(() => onSubmit(reason as InvalidationReason, explanation.trim() === "" ? null : explanation))}
          data-testid="revalidation-submit"
        >
          {t("review.revalidation.submit")}
        </button>
      </div>
    </Dialog>
  );
}
