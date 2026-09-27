import { ActionButton } from "../../components/ActionButton";
import type { Project } from "../../domain/project";
import { useT } from "../../i18n/context";

export interface ReviewIdeHandoffProps {
  project: Project | null;
  busy: boolean;
  onCopy: () => void;
}

/**
 * Phase 4a (Human Decisions HD-P4-01..04, 2026-09-27): a Human-triggered "Copy IDE Handoff" action.
 * DVCC only copies a deterministic text (`src/domain/ideHandoff.ts`); it never opens, discovers,
 * resumes or controls an IDE/session.
 *
 * Deliberately a sibling of `ReviewHandoff`, not a branch inside it: `ReviewHandoff` returns `null`
 * when neither a required-fix nor a re-review handoff exists, and this card must stay visible
 * whenever the Project resolves regardless of that.
 */
export function ReviewIdeHandoff({ project, busy, onCopy }: ReviewIdeHandoffProps) {
  const t = useT();
  if (project === null) return null;

  return (
    <section className="card" data-testid="detail-ide-handoff">
      <header className="card-header">
        <h3>{t("ideHandoff.card.title")}</h3>
      </header>
      <p className="muted small">{t("ideHandoff.card.description")}</p>
      <ActionButton label={t("ideHandoff.action.copy")} testId="action-copy-ide-handoff" enabled={!busy} onClick={onCopy} />
    </section>
  );
}
