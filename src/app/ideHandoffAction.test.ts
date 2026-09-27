import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n";
import type { Project } from "../domain/project";
import { renderIdeHandoff, buildIdeHandoff } from "../domain/ideHandoff";
import { newRound, type ReviewSession, type RoundRecord } from "../domain/review";
import type { ToastKind } from "./appState";
import { copyIdeHandoffAction } from "./ideHandoffAction";

const NOW = "2026-09-28T00:00:00.000Z";

function project(): Project {
  return {
    projectId: "project-alpha",
    displayName: "Project Alpha",
    repositoryUrl: "https://github.com/example-org/project-alpha",
    localRoot: "C:\\Users\\forbidden-account\\project-alpha",
    developmentIde: "Claude Code",
    nextAction: "PROJECT_LEVEL_NEXT_ACTION_MUST_NOT_BE_USED",
    notes: "PRIVATE_NOTES",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function round(): RoundRecord {
  return { ...newRound(1, "0123456789abcdef0123456789abcdef01234567"), reviewedHead: "fedcba9876543210fedcba9876543210fedcba98" };
}

function session(r: RoundRecord): ReviewSession {
  return {
    schemaVersion: 1,
    reviewSessionId: "rv-20260928-p3a001",
    projectId: "project-alpha",
    prNumber: 4,
    reviewType: "PR review",
    reviewRound: r.round,
    resourceState: "HOT",
    reviewState: "FIX_REQUIRED",
    suspendedFrom: null,
    chatgptThreadTitle: null,
    chatgptThreadUrl: null,
    nextAction: "Review-level next action",
    rounds: [r],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

/** Records every `notify` call in order; the only observation channel besides `copy` itself. */
function recorder() {
  const calls: [ToastKind, string][] = [];
  return { calls, notify: (kind: ToastKind, message: string) => { calls.push([kind, message]); } };
}

describe("copyIdeHandoffAction (Independent Review P3-01)", () => {
  it("on copy failure: shows error feedback, never success feedback, and leaves Project/ReviewSession untouched", async () => {
    const p = project();
    const r = round();
    const s = session(r);
    const pBefore = structuredClone(p);
    const sBefore = structuredClone(s);
    const t = createTranslator("en");
    const { calls, notify } = recorder();
    const failingCopy = async () => {
      throw new Error("clipboard write failed");
    };

    await copyIdeHandoffAction(p, s, true, t, failingCopy, notify);

    // Error feedback is shown, with the clipboard error detail, using the exact toast contract.
    expect(calls).toEqual([["error", "Copying the IDE handoff failed: clipboard write failed"]]);
    // No success feedback: "info" never appears alongside or instead of the error.
    expect(calls.some(([kind]) => kind === "info")).toBe(false);

    // `copy` and `notify` are this function's only side-effecting capabilities (see its doc
    // comment): with both accounted for above and nothing else in scope to call, there is no
    // remaining channel through which a persistence write, event append or file change could occur.
    // The domain objects handed to it are also byte-for-byte unchanged, matching the accepted
    // "reducer/domain state before/after identical" evidence form.
    expect(p).toEqual(pBefore);
    expect(s).toEqual(sBefore);
  });

  it("on copy success: shows success feedback, never error feedback, and copies exactly the rendered handoff", async () => {
    const p = project();
    const r = round();
    const s = session(r);
    const t = createTranslator("en");
    const { calls, notify } = recorder();
    const copied: string[] = [];
    const succeedingCopy = async (text: string) => {
      copied.push(text);
    };

    await copyIdeHandoffAction(p, s, false, t, succeedingCopy, notify);

    expect(calls).toEqual([["info", "Copied the IDE handoff to the clipboard"]]);
    expect(calls.some(([kind]) => kind === "error")).toBe(false);
    expect(copied).toEqual([renderIdeHandoff(t, buildIdeHandoff(p, s, r, false))]);
  });
});
