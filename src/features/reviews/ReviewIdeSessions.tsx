import { ActionButton } from "../../components/ActionButton";
import { Row } from "../../components/DetailRow";
import type { IdeSessionsState } from "../../app/appState";
import type { DiscoveredIdeSession, ProviderKind, ProviderScanResult } from "../../domain/ideSessionDiscovery";
import type { Project } from "../../domain/project";
import { evaluateLaunch, evaluateResume } from "../../domain/resumeIntent";
import { sessionIdLabels } from "../../domain/sessionIdLabels";
import {
  formatTimestamp,
  IDE_SESSION_BINDING_KEYS,
  IDE_SESSION_PROVIDER_KEYS,
  IDE_SESSION_SOURCE_KEYS,
  LAUNCH_REFUSAL_KEYS,
  RESUME_REFUSAL_KEYS,
  translate,
  type Translator,
} from "../../i18n";
import { useT } from "../../i18n/context";

/**
 * Phase 4b-2b "Resume in Codex". The row button only asks for a confirmation (`onRequest`); it never
 * starts anything itself. Offered on Codex rows only — no Claude Code launcher exists.
 */
export interface ResumeLaunchProps {
  /** The Human-configured executable; only whether it is set matters here (never displayed). */
  codexExecutablePath: string | null;
  /** Receives the full session and its presentation-only label. */
  onRequest: (session: DiscoveredIdeSession, label: string) => void;
}

export interface ReviewIdeSessionsProps {
  project: Project | null;
  ideSessions: IdeSessionsState;
  /** True once the Project registry has changed since `ideSessions` was computed (RF-P4B1-01). */
  stale: boolean;
  busy: boolean;
  onRefresh: () => void;
  /** Phase 4b-2a: receives the full discovered session — never its display label (the label is presentation only). */
  onCopyResume: (session: DiscoveredIdeSession) => void;
  resumeLaunch?: ResumeLaunchProps;
}

/** Sessions worth showing for `project`: exactly MATCHED to it, or AMBIGUOUS with it as a candidate — never a flat, unfiltered dump (Task Packet §21: "Do not claim ambiguous sessions belong to the Project"). */
function relevantSessions(result: ProviderScanResult, projectId: string): DiscoveredIdeSession[] {
  if (result.status !== "ok") return [];
  return result.sessions.filter(
    (session) => session.matchedProjectId === projectId || (session.binding === "AMBIGUOUS" && session.candidateProjectIds.includes(projectId)),
  );
}

interface SectionProps {
  provider: ProviderKind;
  result: ProviderScanResult;
  project: Project;
  stale: boolean;
  busy: boolean;
  onCopyResume: (session: DiscoveredIdeSession) => void;
  resumeLaunch?: ResumeLaunchProps;
  t: Translator;
}

function ProviderSection({ provider, result, project, stale, busy, onCopyResume, resumeLaunch, t }: SectionProps) {
  const label = t(IDE_SESSION_PROVIDER_KEYS[provider]);
  if (result.status === "unavailable") {
    return (
      <p className="muted small" data-testid={`ide-sessions-provider-${provider}`} data-provider-status="unavailable">
        {label} — {translate(t, result.reason)}
      </p>
    );
  }
  if (result.status === "unsupportedFormat") {
    return (
      <p className="muted small" data-testid={`ide-sessions-provider-${provider}`} data-provider-status="unsupportedFormat">
        {label} — {translate(t, result.reason)}
      </p>
    );
  }
  const sessions = relevantSessions(result, project.projectId);
  // HD-4B12-01: this Project's localRoot has no supported Claude historical key, so the absence of
  // a historical row proves nothing. Informational and fail-closed; never shows the path itself.
  const historyUnsupported = result.historicalBindingUnsupportedProjectIds?.includes(project.projectId) ?? false;
  const historyUnsupportedNote = historyUnsupported && (
    <p className="muted small" data-testid="ide-sessions-history-unsupported">
      {t("ideSessions.reason.historicalBindingUnsupported")}
    </p>
  );
  if (sessions.length === 0) {
    if (historyUnsupported) {
      return (
        <div data-testid={`ide-sessions-provider-${provider}`} data-provider-status="historyUnsupported">
          <p className="muted small">{label}</p>
          {historyUnsupportedNote}
          {!result.complete && <p className="muted small">{t("ideSessions.reason.incomplete")}</p>}
        </div>
      );
    }
    if (!result.complete) {
      // An incomplete scan found no relevant session, but that is not proof none exists: a cap or
      // timeout stopped enumeration early, so claiming NO_MATCH here would fabricate a conclusion the
      // scan never actually reached (Independent Review RF-P4B1-02 final closure, §4/§7).
      return (
        <p className="muted small" data-testid={`ide-sessions-provider-${provider}`} data-provider-status="incomplete">
          {label} — {t("ideSessions.reason.incomplete")}
        </p>
      );
    }
    return (
      <p className="muted small" data-testid={`ide-sessions-provider-${provider}`} data-provider-status="empty">
        {label} — {t("ideSessions.reason.noMatch")}
      </p>
    );
  }
  const labels = sessionIdLabels(sessions.map((session) => session.sessionId));
  const resumeBySession = new Map(sessions.map((session) => [session.sessionId, evaluateResume(session, project.projectId, stale)]));
  const anyEligible = [...resumeBySession.values()].some((resume) => resume.eligible);
  return (
    <div data-testid={`ide-sessions-provider-${provider}`} data-provider-status={result.complete ? "ok" : "incompleteWithResults"}>
      <h4 className="subhead">{label}</h4>
      {historyUnsupportedNote}
      {!result.complete && (
        <p className="muted small" data-testid="ide-sessions-incomplete-note">
          {t("ideSessions.reason.incompleteWithResults")}
        </p>
      )}
      {anyEligible && (
        // UI-only notes (HD-4B2-02/03): never copied, and they carry no path.
        <div className="muted small" data-testid="resume-notes">
          <p data-testid="resume-note-copy-only">{t("resume.note.copyOnly")}</p>
          <p data-testid="resume-note-run-from-workspace">{t("resume.note.runFromWorkspace")}</p>
          <p data-testid="resume-note-codex-may-be-open">{t("resume.note.codexMayBeOpen")}</p>
        </div>
      )}
      {sessions.map((session) => {
        const resume = resumeBySession.get(session.sessionId)!;
        return (
        <div key={session.sessionId} className="ide-session-row" data-testid="ide-session-row" data-binding={session.binding}>
          <dl>
            <Row label={t("ideSessions.field.sessionId")} mono testId="ide-session-id">
              {labels.get(session.sessionId)}
            </Row>
            <Row label={t("ideSessions.field.sourceKind")}>{t(IDE_SESSION_SOURCE_KEYS[session.sourceKind])}</Row>
            <Row label={t("detail.field.updated")}>{formatTimestamp(t, session.updatedAt)}</Row>
            <Row label={t("ideSessions.field.binding")}>
              <span data-state={session.binding}>{t(IDE_SESSION_BINDING_KEYS[session.binding])}</span>
            </Row>
            {session.binding === "MATCHED" && <Row label={t("ideSessions.field.matchedProject")}>{project.displayName}</Row>}
          </dl>
          <p className="muted small" data-testid="ide-session-reason">
            {translate(t, session.reason)}
          </p>
          <div data-testid="ide-session-resume" data-resume={resume.eligible ? "ELIGIBLE" : resume.reason}>
            <ActionButton
              label={t("resume.action.copy")}
              testId="action-copy-resume"
              enabled={resume.eligible && !busy}
              onClick={() => onCopyResume(session)}
              disabledReason={resume.eligible ? null : t(RESUME_REFUSAL_KEYS[resume.reason])}
            />
          </div>
          {resumeLaunch && session.provider === "CODEX" && (() => {
            const launch = evaluateLaunch(session, project, stale, resumeLaunch.codexExecutablePath);
            return (
              <div data-testid="ide-session-launch" data-launch={launch.eligible ? "ELIGIBLE" : launch.reason}>
                <ActionButton
                  label={t("resume.action.launch")}
                  testId="action-launch-resume"
                  enabled={launch.eligible && !busy}
                  onClick={() => resumeLaunch.onRequest(session, labels.get(session.sessionId) ?? "")}
                  disabledReason={launch.eligible ? null : t(LAUNCH_REFUSAL_KEYS[launch.reason])}
                />
              </div>
            );
          })()}
        </div>
        );
      })}
    </div>
  );
}

export function ReviewIdeSessions({ project, ideSessions, stale, busy, onRefresh, onCopyResume, resumeLaunch }: ReviewIdeSessionsProps) {
  const t = useT();
  if (project === null) return null;

  return (
    <section className="card" data-testid="detail-ide-sessions">
      <header className="card-header">
        <h3>{t("ideSessions.card.title")}</h3>
      </header>
      <ActionButton
        label={t("ideSessions.action.refresh")}
        testId="action-refresh-ide-sessions"
        enabled={!busy && ideSessions.status !== "refreshing"}
        onClick={onRefresh}
      />
      {ideSessions.status === "notObserved" && <p className="muted">{t("ideSessions.state.notObserved")}</p>}
      {ideSessions.status === "refreshing" && <p className="muted">{t("ideSessions.state.refreshing")}</p>}
      {ideSessions.status === "error" && (
        <p className="error-text" data-testid="ide-sessions-error">
          {t("ideSessions.state.error")}: {ideSessions.message}
        </p>
      )}
      {ideSessions.status === "loaded" && stale && (
        // A Project's binding-relevant fields (id / repositoryUrl / localRoot) changed since this
        // scan ran: its MATCHED/AMBIGUOUS content may no longer be correct, so it is never shown as
        // current (Independent Review RF-P4B1-01). Only a fresh Refresh can clear this.
        <p className="muted" data-testid="ide-sessions-stale">
          {t("ideSessions.state.stale")}
        </p>
      )}
      {ideSessions.status === "loaded" && !stale && (
        <>
          <ProviderSection provider="CLAUDE_CODE" result={ideSessions.scan.claude} project={project} stale={stale} busy={busy} onCopyResume={onCopyResume} t={t} />
          <ProviderSection
            provider="CODEX"
            result={ideSessions.scan.codex}
            project={project}
            stale={stale}
            busy={busy}
            onCopyResume={onCopyResume}
            resumeLaunch={resumeLaunch}
            t={t}
          />
        </>
      )}
    </section>
  );
}
