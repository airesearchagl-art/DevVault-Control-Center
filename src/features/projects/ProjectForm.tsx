import { useState, type ChangeEvent, type FormEvent } from "react";
import { Dialog, Field, FormError } from "../../components/Dialog";
import type { ProjectFormInput } from "../../domain/project";
import type { FieldErrors } from "../../domain/result";
import { suggestProjectId } from "../../domain/validation";
import { useT } from "../../i18n/context";

const IDE_SUGGESTIONS = ["Claude Code", "Codex", "VS Code", "Cursor"];

interface ProjectFormDialogProps {
  mode: "create" | "edit";
  initial: ProjectFormInput;
  /** Resolves to field errors, or null when saved (the parent closes the dialog). */
  onSubmit: (input: ProjectFormInput) => Promise<FieldErrors | null>;
  onCancel: () => void;
}

export function ProjectFormDialog({ mode, initial, onSubmit, onCancel }: ProjectFormDialogProps) {
  const [form, setForm] = useState<ProjectFormInput>(initial);
  const [idTouched, setIdTouched] = useState(mode === "edit" || initial.projectId !== "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const t = useT();

  const update = (key: keyof ProjectFormInput) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    if (key === "projectId") setIdTouched(true);
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "displayName" && !idTouched && mode === "create") next.projectId = suggestProjectId(value);
      return next;
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const result = await onSubmit(form);
    setSaving(false);
    if (result) setErrors(result);
  };

  return (
    <Dialog
      title={mode === "create" ? t("project.form.createTitle") : t("project.form.editTitle", { name: initial.displayName })}
      onClose={onCancel}
      testId="project-form"
    >
      <form onSubmit={submit} noValidate>
        <Field label={t("project.form.displayName")} htmlFor="project-displayName" error={errors.displayName}>
          <input id="project-displayName" value={form.displayName} onChange={update("displayName")} autoFocus data-testid="project-displayName" />
        </Field>
        <Field
          label={t("project.form.projectId")}
          htmlFor="project-projectId"
          error={errors.projectId}
          hint={mode === "create" ? t("project.form.projectIdHint") : t("project.form.projectIdLocked")}
        >
          <input
            id="project-projectId"
            value={form.projectId}
            onChange={update("projectId")}
            disabled={mode === "edit"}
            className="mono"
            data-testid="project-projectId"
          />
        </Field>
        <Field label={t("project.form.repositoryUrl")} htmlFor="project-repositoryUrl" error={errors.repositoryUrl} hint={t("project.form.repositoryUrlHint")}>
          <input id="project-repositoryUrl" value={form.repositoryUrl} onChange={update("repositoryUrl")} className="mono" data-testid="project-repositoryUrl" />
        </Field>
        <Field label={t("project.form.localRoot")} htmlFor="project-localRoot" error={errors.localRoot} hint={t("project.form.localRootHint")}>
          <input id="project-localRoot" value={form.localRoot} onChange={update("localRoot")} className="mono" data-testid="project-localRoot" />
        </Field>
        <Field label={t("project.form.ide")} htmlFor="project-developmentIde" error={errors.developmentIde} hint={t("project.form.ideHint")}>
          <input id="project-developmentIde" list="ide-suggestions" value={form.developmentIde} onChange={update("developmentIde")} data-testid="project-developmentIde" />
          <datalist id="ide-suggestions">
            {IDE_SUGGESTIONS.map((ide) => (
              <option key={ide} value={ide} />
            ))}
          </datalist>
        </Field>
        <Field label={t("project.form.nextAction")} htmlFor="project-nextAction" error={errors.nextAction}>
          <textarea id="project-nextAction" rows={2} value={form.nextAction} onChange={update("nextAction")} data-testid="project-nextAction" />
        </Field>
        <Field label={t("project.form.notes")} htmlFor="project-notes" error={errors.notes} hint={t("project.form.notesHint")}>
          <textarea id="project-notes" rows={3} value={form.notes} onChange={update("notes")} data-testid="project-notes" />
        </Field>
        <FormError message={errors._form} />
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            {t("dialog.cancel")}
          </button>
          <button type="submit" className="primary" disabled={saving} data-testid="project-submit">
            {mode === "create" ? t("project.form.submitCreate") : t("project.form.submitSave")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
