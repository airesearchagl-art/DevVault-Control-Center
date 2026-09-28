import { ActionButton } from "../../components/ActionButton";
import { Row } from "../../components/DetailRow";
import type { IdeSessionsState } from "../../app/appState";
import type { DiscoveredIdeSession, ProviderKind, ProviderScanResult } from "../../domain/ideSessionDiscovery";
import type { Project } from "../../domain/project";
import {
  formatTimestamp,
  IDE_SESSION_BINDING_KEYS,
  IDE_SESSION_PROVIDER_KEYS,
  IDE_SESSION_SOURCE_KEYS,
  translate,
  type Translator,
} from "../../i18n";
import { useT } from "../../i18n/context";

export interface ReviewIdeSessionsProps {
  project: Project | null;
  ideSessions: IdeSessionsState;
  /** True once the Project registry has changed since `ideSessions` was computed (RF-P4B1-01). */
  stale: boolean;
  busy: boolean;
  onRefresh: () => void;
}

/** Sessions worth showing for `project`: exactly MATCHED to it, or AMBIGUOUS with it as a candidate — never a flat, unfiltered dump (Task Packet §21: "Do not claim ambiguous sessions belong to the Project"). */
function relevantSessions(result: ProviderScanResult, projectId: string): DiscoveredIdeSession[] {
  if (result.status !== "ok") return [];
  return result.sessions.filter(
    (session) => session.matchedProjectId === projectId || (session.binding === "AMBIGUOUS" && session.candidateProjectIds.includes(projectId)),
  );
}

function abbreviate(sessionId: string): string {
  return sessionId.length <= 12 ? sessionId : `${sessionId.slice(0, 8)}…`;
}

function ProviderSection({ provider, result, project, t }: { provider: ProviderKind; result: ProviderScanResult; project: Project; t: Translator }) {
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
  if (sessions.length === 0) {
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
  return (
    <div data-testid={`ide-sessions-provider-${provider}`} data-provider-status={result.complete ? "ok" : "incompleteWithResults"}>
      <h4 className="subhead">{label}</h4>
      {!result.complete && (
        <p className="muted small" data-testid="ide-sessions-incomplete-note">
          {t("ideSessions.reason.incompleteWithResults")}
        </p>
      )}
      {sessions.map((session) => (
        <div key={session.sessionId} className="ide-session-row" data-testid="ide-session-row" data-binding={session.binding}>
          <dl>
            <Row label={t("ideSessions.field.sessionId")} mono>
              {abbreviate(session.sessionId)}
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
        </div>
      ))}
    </div>
  );
}

export function ReviewIdeSessions({ project, ideSessions, stale, busy, onRefresh }: ReviewIdeSessionsProps) {
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
          <ProviderSection provider="CLAUDE_CODE" result={ideSessions.scan.claude} project={project} t={t} />
          <ProviderSection provider="CODEX" result={ideSessions.scan.codex} project={project} t={t} />
        </>
      )}
    </section>
  );
}
