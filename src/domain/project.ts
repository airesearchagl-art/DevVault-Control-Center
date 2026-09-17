import { err, ok, type FieldErrors, type Result } from "./result";
import { isValidProjectId, normalizeLocalRoot, normalizeRepositoryUrl } from "./validation";

export interface Project {
  projectId: string;
  displayName: string;
  repositoryUrl: string | null;
  localRoot: string | null;
  /** Label only (e.g. "Claude Code"). v0.1 does not launch IDEs. */
  developmentIde: string | null;
  nextAction: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/** Raw form values (all strings). */
export interface ProjectFormInput {
  projectId: string;
  displayName: string;
  repositoryUrl: string;
  localRoot: string;
  developmentIde: string;
  nextAction: string;
  notes: string;
}

export const DISPLAY_NAME_MAX = 120;
export const LABEL_MAX = 80;
export const TEXT_MAX = 20_000;

export function emptyProjectForm(): ProjectFormInput {
  return { projectId: "", displayName: "", repositoryUrl: "", localRoot: "", developmentIde: "", nextAction: "", notes: "" };
}

export function projectToForm(project: Project): ProjectFormInput {
  return {
    projectId: project.projectId,
    displayName: project.displayName,
    repositoryUrl: project.repositoryUrl ?? "",
    localRoot: project.localRoot ?? "",
    developmentIde: project.developmentIde ?? "",
    nextAction: project.nextAction,
    notes: project.notes,
  };
}

type ProjectFields = Omit<Project, "projectId" | "createdAt" | "updatedAt">;

function validateFields(input: ProjectFormInput): Result<ProjectFields, FieldErrors> {
  const errors: FieldErrors = {};
  const displayName = input.displayName.trim();
  if (displayName === "") errors.displayName = "Display name is required";
  else if (displayName.length > DISPLAY_NAME_MAX) errors.displayName = `Display name must be at most ${DISPLAY_NAME_MAX} characters`;

  let repositoryUrl: string | null = null;
  if (input.repositoryUrl.trim() !== "") {
    const result = normalizeRepositoryUrl(input.repositoryUrl);
    if (result.ok) repositoryUrl = result.value;
    else errors.repositoryUrl = result.error;
  }

  let localRoot: string | null = null;
  if (input.localRoot.trim() !== "") {
    const result = normalizeLocalRoot(input.localRoot);
    if (result.ok) localRoot = result.value;
    else errors.localRoot = result.error;
  }

  const developmentIde = input.developmentIde.trim();
  if (developmentIde.length > LABEL_MAX) errors.developmentIde = `IDE label must be at most ${LABEL_MAX} characters`;
  if (input.nextAction.length > TEXT_MAX) errors.nextAction = "Next action is too long";
  if (input.notes.length > TEXT_MAX) errors.notes = "Notes are too long";

  if (Object.keys(errors).length > 0) return err(errors);
  return ok({
    displayName,
    repositoryUrl,
    localRoot,
    developmentIde: developmentIde === "" ? null : developmentIde,
    nextAction: input.nextAction.trim(),
    notes: input.notes.trim(),
  });
}

export function createProject(
  input: ProjectFormInput,
  existingIds: ReadonlySet<string>,
  now: string,
): Result<Project, FieldErrors> {
  const projectId = input.projectId.trim();
  const idError = !isValidProjectId(projectId)
    ? "Project ID must be 2–64 characters: lowercase letters, digits and hyphens, starting with a letter or digit"
    : existingIds.has(projectId)
      ? "Project ID is already used"
      : null;
  const fields = validateFields(input);
  if (idError !== null || !fields.ok) {
    return err({ ...(fields.ok ? {} : fields.error), ...(idError !== null ? { projectId: idError } : {}) });
  }
  return ok({ projectId, ...fields.value, createdAt: now, updatedAt: now });
}

/** `projectId` is immutable; `input.projectId` is ignored. */
export function updateProject(existing: Project, input: ProjectFormInput, now: string): Result<Project, FieldErrors> {
  const fields = validateFields(input);
  if (!fields.ok) return fields;
  return ok({ ...existing, ...fields.value, updatedAt: now });
}
