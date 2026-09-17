import { useState, type ChangeEvent, type FormEvent } from "react";
import { Dialog, Field, FormError } from "../../components/Dialog";
import type { Project } from "../../domain/project";
import { REVIEW_TYPE_SUGGESTIONS, type ReviewFormInput, type ReviewMetadataInput } from "../../domain/review";
import type { FieldErrors } from "../../domain/result";
import { RESOURCE_STATE_HINTS, RESOURCE_STATES } from "../../domain/states";

function MetadataFields<T extends ReviewMetadataInput>({
  form,
  errors,
  update,
  roundLabel,
}: {
  form: T;
  errors: FieldErrors;
  update: (key: keyof ReviewMetadataInput) => (event: ChangeEvent<HTMLInputElement>) => void;
  roundLabel: string;
}) {
  return (
    <>
      <div className="field-row">
        <Field label="Review type" htmlFor="review-reviewType" error={errors.reviewType}>
          <input id="review-reviewType" list="review-type-suggestions" value={form.reviewType} onChange={update("reviewType")} data-testid="review-reviewType" />
          <datalist id="review-type-suggestions">
            {REVIEW_TYPE_SUGGESTIONS.map((type) => (
              <option key={type} value={type} />
            ))}
          </datalist>
        </Field>
        <Field label="PR number" htmlFor="review-prNumber" error={errors.prNumber} hint="Optional">
          <input id="review-prNumber" inputMode="numeric" value={form.prNumber} onChange={update("prNumber")} data-testid="review-prNumber" />
        </Field>
      </div>
      <Field
        label={`Expected HEAD (${roundLabel})`}
        htmlFor="review-expectedHead"
        error={errors.expectedHead}
        hint="Commit SHA you expect the reviewer to review (optional, recorded by you — not fetched from Git)."
      >
        <input id="review-expectedHead" value={form.expectedHead} onChange={update("expectedHead")} className="mono" data-testid="review-expectedHead" />
      </Field>
      <Field label="ChatGPT thread title" htmlFor="review-chatgptThreadTitle" error={errors.chatgptThreadTitle} hint="Optional">
        <input id="review-chatgptThreadTitle" value={form.chatgptThreadTitle} onChange={update("chatgptThreadTitle")} data-testid="review-chatgptThreadTitle" />
      </Field>
      <Field
        label="ChatGPT thread URL"
        htmlFor="review-chatgptThreadUrl"
        error={errors.chatgptThreadUrl}
        hint="https://chatgpt.com/... or https://chat.openai.com/... (optional)"
      >
        <input id="review-chatgptThreadUrl" value={form.chatgptThreadUrl} onChange={update("chatgptThreadUrl")} className="mono" data-testid="review-chatgptThreadUrl" />
      </Field>
    </>
  );
}

interface CreateReviewDialogProps {
  projects: Project[];
  initial: ReviewFormInput;
  onSubmit: (input: ReviewFormInput) => Promise<FieldErrors | null>;
  onCancel: () => void;
}

export function CreateReviewDialog({ projects, initial, onSubmit, onCancel }: CreateReviewDialogProps) {
  const [form, setForm] = useState<ReviewFormInput>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const update = (key: keyof ReviewFormInput) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const result = await onSubmit(form);
    setSaving(false);
    if (result) setErrors(result);
  };

  return (
    <Dialog title="Create review" onClose={onCancel} testId="review-form">
      <form onSubmit={submit} noValidate>
        <Field label="Project" htmlFor="review-projectId" error={errors.projectId}>
          <select id="review-projectId" value={form.projectId} onChange={update("projectId")} data-testid="review-projectId">
            <option value="">Select a project…</option>
            {projects.map((project) => (
              <option key={project.projectId} value={project.projectId}>
                {project.displayName} ({project.projectId})
              </option>
            ))}
          </select>
        </Field>
        <MetadataFields form={form} errors={errors} update={update} roundLabel="R1" />
        <Field label="Next action" htmlFor="review-nextAction" error={errors.nextAction}>
          <textarea id="review-nextAction" rows={2} value={form.nextAction} onChange={update("nextAction")} data-testid="review-nextAction" />
        </Field>
        <fieldset className="field">
          <legend>Resource state</legend>
          <div className="segmented">
            {RESOURCE_STATES.map((resource) => (
              <label key={resource} className={form.resourceState === resource ? "selected" : ""} title={RESOURCE_STATE_HINTS[resource]}>
                <input
                  type="radio"
                  name="review-resourceState"
                  value={resource}
                  checked={form.resourceState === resource}
                  onChange={() => setForm((current) => ({ ...current, resourceState: resource }))}
                  data-testid={`review-resource-${resource}`}
                />
                {resource}
              </label>
            ))}
          </div>
        </fieldset>
        <FormError message={errors._form} />
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saving} data-testid="review-submit">
            Create review
          </button>
        </div>
      </form>
    </Dialog>
  );
}

interface EditReviewDialogProps {
  title: string;
  roundLabel: string;
  initial: ReviewMetadataInput;
  onSubmit: (input: ReviewMetadataInput) => Promise<FieldErrors | null>;
  onCancel: () => void;
}

export function EditReviewDialog({ title, roundLabel, initial, onSubmit, onCancel }: EditReviewDialogProps) {
  const [form, setForm] = useState<ReviewMetadataInput>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const update = (key: keyof ReviewMetadataInput) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const result = await onSubmit(form);
    setSaving(false);
    if (result) setErrors(result);
  };

  return (
    <Dialog title={title} onClose={onCancel} testId="review-edit-form">
      <form onSubmit={submit} noValidate>
        <MetadataFields form={form} errors={errors} update={update} roundLabel={roundLabel} />
        <FormError message={errors._form} />
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saving} data-testid="review-edit-submit">
            Save review
          </button>
        </div>
      </form>
    </Dialog>
  );
}
