import { describe, expect, it, vi } from "vitest";
import type { DiscoveredIdeSession } from "../domain/ideSessionDiscovery";
import { sessionIdLabels } from "../domain/sessionIdLabels";
import { createTranslator } from "../i18n";
import type { ToastKind } from "./appState";
import { copyResumeCommandAction } from "./copyResumeCommandAction";

const t = createTranslator("en");
const FULL_ID = "019c1a2b-3c4d-7e5f-8a9b-0c1d2e3f4a5b";
const PROJECT = "project-alpha";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

function session(overrides: Partial<DiscoveredIdeSession> = {}): DiscoveredIdeSession {
  return deepFreeze({
    provider: "CODEX",
    sessionId: FULL_ID,
    sourceKind: "HISTORICAL",
    binding: "MATCHED",
    matchedProjectId: PROJECT,
    candidateProjectIds: [],
    createdAt: null,
    updatedAt: null,
    providerVersion: "0.153.4",
    archived: false,
    reason: { key: "ideSessions.reason.matchedRepositoryIdentity" },
    ...overrides,
  } as DiscoveredIdeSession);
}

function harness(copyImpl: (text: string) => Promise<void> = async () => undefined) {
  const copy = vi.fn(copyImpl);
  const toasts: { kind: ToastKind; message: string }[] = [];
  const notify = (kind: ToastKind, message: string) => toasts.push({ kind, message });
  return { copy, toasts, notify };
}

describe("copyResumeCommandAction (Task Packet §13 / §14 / §25)", () => {
  it("success: copies exactly `codex resume <full id>` and shows one success toast, no error toast", async () => {
    const h = harness();
    const s = session();
    const before = JSON.stringify(s);
    await copyResumeCommandAction(s, PROJECT, false, t, h.copy, h.notify);
    expect(h.copy).toHaveBeenCalledTimes(1);
    expect(h.copy).toHaveBeenCalledWith(`codex resume ${FULL_ID}`);
    expect(h.toasts).toEqual([{ kind: "info", message: t("resume.toast.copied") }]);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("clipboard failure: one error toast, no success toast", async () => {
    const h = harness(async () => {
      throw new Error("clipboard unavailable");
    });
    await copyResumeCommandAction(session(), PROJECT, false, t, h.copy, h.notify);
    expect(h.copy).toHaveBeenCalledTimes(1);
    expect(h.toasts).toHaveLength(1);
    expect(h.toasts[0].kind).toBe("error");
    expect(h.toasts.some((toast) => toast.message === t("resume.toast.copied"))).toBe(false);
  });

  const INELIGIBLE: [string, DiscoveredIdeSession, string | null, boolean, string][] = [
    ["stale discovery", session(), PROJECT, true, "resume.refusal.staleDiscovery"],
    ["AMBIGUOUS", session({ binding: "AMBIGUOUS", matchedProjectId: null, candidateProjectIds: [PROJECT] }), PROJECT, false, "resume.refusal.notMatched"],
    ["other Project selected", session(), "project-other", false, "resume.refusal.notMatched"],
    ["no Project selected", session(), null, false, "resume.refusal.notMatched"],
    ["Claude LIVE", session({ provider: "CLAUDE_CODE", sourceKind: "LIVE", archived: null }), PROJECT, false, "resume.refusal.alreadyActive"],
    ["archived", session({ archived: true }), PROJECT, false, "resume.refusal.archived"],
    ["invalid ID", session({ sessionId: `${FULL_ID} && calc` }), PROJECT, false, "resume.refusal.invalidSessionId"],
  ];

  for (const [name, s, projectId, stale, key] of INELIGIBLE) {
    it(`ineligible (${name}): copy is never called; one localized refusal; nothing mutated`, async () => {
      const h = harness();
      const before = JSON.stringify(s);
      await copyResumeCommandAction(s, projectId, stale, t, h.copy, h.notify);
      expect(h.copy).not.toHaveBeenCalled();
      expect(h.toasts).toEqual([{ kind: "warning", message: t(key as never) }]);
      expect(JSON.stringify(s)).toBe(before);
    });
  }

  it("label-vs-ID: a session carrying its abbreviated display label instead of its ID is refused, never copied", async () => {
    const ids = [FULL_ID, "019c1a2b-9f00-7ccc-8ccc-0000cafe0003"];
    const label = sessionIdLabels(ids).get(FULL_ID)!;
    expect(label).not.toBe(FULL_ID);
    const h = harness();
    await copyResumeCommandAction(session({ sessionId: label }), PROJECT, false, t, h.copy, h.notify);
    expect(h.copy).not.toHaveBeenCalled();
  });

  it("the copied text contains only the executable, `resume` and the full UUID", async () => {
    const h = harness();
    await copyResumeCommandAction(session(), PROJECT, false, t, h.copy, h.notify);
    const copied = h.copy.mock.calls[0][0];
    expect(copied.split(" ")).toEqual(["codex", "resume", FULL_ID]);
    for (const note of ["resume.note.copyOnly", "resume.note.runFromWorkspace", "resume.note.codexMayBeOpen"] as const) {
      expect(copied).not.toContain(t(note));
    }
  });

  it("the seam's only side-effecting capabilities are `copy` and `notify` (no storage/event/launcher parameter exists)", () => {
    expect(copyResumeCommandAction.length).toBe(6);
  });
});
