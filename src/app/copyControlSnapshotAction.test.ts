import { describe, expect, it, vi } from "vitest";
import type { ControlReadSource } from "../domain/controlRead/contract";
import { createReviewSession, emptyReviewForm } from "../domain/review";
import { createTranslator } from "../i18n";
import { copyControlSnapshotAction } from "./copyControlSnapshotAction";

const t = createTranslator("en");
const ENV = { now: () => "2026-10-04T02:00:00.000Z", newSnapshotId: () => "snap-00000000-0000-4000-8000-000000000000" };

function source(parts: Partial<ControlReadSource> = {}): ControlReadSource {
  const created = createReviewSession(emptyReviewForm("project-alpha"), new Set(["project-alpha"]), "rv-20261004-alpha1", "2026-10-04T01:00:00.000Z");
  if (!created.ok) throw new Error("fixture");
  return {
    phase: "ready",
    projects: [{ projectId: "project-alpha", repositoryUrl: null, localRoot: "C:\\SENTINEL-ROOT\\alpha", createdAt: "2026-09-20T03:00:00.000Z" }],
    projectsHealth: { status: "ok" },
    reviews: [{ reviewId: "rv-20261004-alpha1", session: created.value.session, health: { status: "ok" } }],
    gitObservations: {},
    ...parts,
  };
}

describe("copyControlSnapshotAction", () => {
  it("reads once, copies the sanitized snapshot JSON once, and confirms", async () => {
    const copy = vi.fn(async (_text: string) => {});
    const notify = vi.fn();
    await copyControlSnapshotAction("project-alpha", source(), ENV, t, copy, notify);
    expect(copy).toHaveBeenCalledTimes(1);
    const text = copy.mock.calls[0][0];
    const parsed = JSON.parse(text);
    expect(parsed).toMatchObject({ contract: "dvcc.control-read", version: 1, operation: "get_control_snapshot", snapshot_id: ENV.newSnapshotId() });
    expect(parsed.data.project.project_id).toBe("project-alpha");
    expect(text).not.toMatch(/SENTINEL/);
    expect(notify).toHaveBeenCalledWith("info", t("controlRead.toast.copied"));
  });

  it("reports a refusal by its code only and copies nothing", async () => {
    const copy = vi.fn(async (_text: string) => {});
    const notify = vi.fn();
    await copyControlSnapshotAction("project-alpha", source({ projectsHealth: { status: "unreadable" } }), ENV, t, copy, notify);
    expect(copy).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("warning", t("controlRead.toast.unavailable", { code: "SOURCE_UNAVAILABLE" }));
    await copyControlSnapshotAction("project-absent", source(), ENV, t, copy, notify);
    expect(notify).toHaveBeenLastCalledWith("warning", t("controlRead.toast.unavailable", { code: "TARGET_NOT_FOUND" }));
    expect(copy).not.toHaveBeenCalled();
  });

  it("reports a failed copy with a fixed sentence, never the underlying error", async () => {
    const notify = vi.fn();
    await copyControlSnapshotAction(
      "project-alpha",
      source(),
      ENV,
      t,
      async () => {
        throw new Error("C:\\SENTINEL-ROOT\\clipboard failure detail");
      },
      notify,
    );
    expect(notify).toHaveBeenCalledWith("error", t("controlRead.toast.copyFailed"));
    expect(JSON.stringify(notify.mock.calls)).not.toMatch(/SENTINEL/);
  });

  it("imports no storage, hub, launcher, Tauri or provider capability", async () => {
    const text = (await import("node:fs")).readFileSync("src/app/copyControlSnapshotAction.ts", "utf8");
    const imports = text.split("\n").filter((line) => line.startsWith("import "));
    expect(imports.map((line) => line.replace(/^.* from "(.*)";$/, "$1")).sort()).toEqual([
      "../domain/controlRead/contract",
      "../domain/controlRead/readControl",
      "../i18n",
      "./appState",
    ]);
    expect(imports.find((line) => line.includes("./appState"))).toBe('import type { ToastKind } from "./appState";');
  });
});
