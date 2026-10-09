import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { initialAppState, type AppState } from "../../app/appState";
import { controlReadSourceFrom } from "../../app/controlReadSource";
import type { DiscoveredIdeSession } from "../ideSessionDiscovery";
import { message } from "../message";
import type { Project } from "../project";
import { createReviewSession, emptyReviewForm, type ReviewSession } from "../review";
import type { LoadedReview } from "../../services/persistence";
import { CONTROL_READ_CONTRACT, type ControlReadResult, type ControlReadSource } from "./contract";
import { readControl } from "./readControl";

/**
 * Least disclosure (Task Packet rev 3.2 §11): synthetic sentinels are planted in every source field
 * Control Read must not disclose, and no response — success, error or evidence reference — may
 * contain any of them.
 */

const SENTINELS = {
  localRoot: "C:\\SENTINEL-ROOT\\alpha",
  displayName: "SENTINEL_DISPLAY_NAME",
  notes: "SENTINEL_NOTES ghp_SENTINELTOKEN0000000000000000000000000000",
  nextAction: "SENTINEL_PROJECT_NEXT_ACTION sk-SENTINELKEY000000000000",
  developmentIde: "SENTINEL_IDE_LABEL",
  reviewType: "SENTINEL_REVIEW_TYPE",
  threadTitle: "SENTINEL_THREAD_TITLE",
  threadUrl: "https://chatgpt.com/c/sentinel-thread-0000",
  reviewNextAction: "SENTINEL_REVIEW_NEXT_ACTION AKIASENTINEL00000000",
  verdictNote: "SENTINEL_VERDICT_NOTE",
  revalidation: "SENTINEL_REVALIDATION_EXPLANATION",
  branch: "SENTINEL_BRANCH",
  errorMessage: "SENTINEL_ERROR_MESSAGE at C:\\SENTINEL-ROOT\\error",
  errorCode: "SENTINEL_ERROR_CODE",
  healthReason: "C:\\SENTINEL-ROOT\\health-reason",
  setAside: "SENTINEL_SET_ASIDE",
  quarantinedAs: "SENTINEL_QUARANTINED.json.corrupt-1",
  ioCode: "SENTINEL_IO_CODE",
  providerSessionId: "019c1a2b-3c4d-7e5f-8a9b-sentinel0001",
  providerCwd: "C:\\SENTINEL-ROOT\\provider-cwd",
  checkpoint: "SENTINEL_CHECKPOINT_BODY",
  resultBody: "SENTINEL_RESULT_BODY",
  unknownKeyValue: "SENTINEL_UNKNOWN_KEY_VALUE",
  unknownKeyName: "C:\\SENTINEL-KEY",
} as const;

const TOKEN_PATTERNS = [/gh[pousr]_[A-Za-z0-9]{8,}/, /sk-[A-Za-z0-9]{8,}/, /AKIA[0-9A-Z]{12,}/];

/** The approved variants (test oracle written from the Task Packet grammar). */
const EVIDENCE_REF_ORACLE: readonly RegExp[] = [
  /^dvcc:project\/[a-z0-9][a-z0-9-]{1,63}$/,
  /^dvcc:project\/[a-z0-9][a-z0-9-]{1,63}\/repository$/,
  /^dvcc:project\/[a-z0-9][a-z0-9-]{1,63}\/local-root$/,
  /^dvcc:review\/rv-\d{8}-[a-z0-9]{6}$/,
  /^dvcc:review\/rv-\d{8}-[a-z0-9]{6}\/field\/(review-state|resource-state|pr-number)$/,
  /^dvcc:review\/rv-\d{8}-[a-z0-9]{6}\/round\/[1-9]\d{0,2}\/(expected-head|reviewed-head|result|verdict|judgment|risk-tier)$/,
  /^dvcc:git-observation\/[a-z0-9][a-z0-9-]{1,63}\/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/,
];

const PROJECT_ID = "project-alpha";
const REVIEW_ID = "rv-20261004-alpha1";
const ENV = { now: () => "2026-10-04T02:00:00.000Z", newSnapshotId: () => "snap-00000000-0000-4000-8000-000000000000" };

function sentinelProject(): Project {
  return {
    projectId: PROJECT_ID,
    displayName: SENTINELS.displayName,
    repositoryUrl: "https://github.com/example-org/example-app",
    localRoot: SENTINELS.localRoot,
    developmentIde: SENTINELS.developmentIde,
    nextAction: SENTINELS.nextAction,
    notes: SENTINELS.notes,
    createdAt: "2026-09-20T03:00:00.000Z",
    updatedAt: "2026-09-20T03:00:00.000Z",
  };
}

function sentinelSession(id = REVIEW_ID): ReviewSession {
  const created = createReviewSession(emptyReviewForm(PROJECT_ID), new Set([PROJECT_ID]), id, "2026-10-04T01:00:00.000Z");
  if (!created.ok) throw new Error("fixture session");
  const session = created.value.session;
  return {
    ...session,
    reviewType: SENTINELS.reviewType,
    chatgptThreadTitle: SENTINELS.threadTitle,
    chatgptThreadUrl: SENTINELS.threadUrl,
    nextAction: SENTINELS.reviewNextAction,
    reviewState: "FIX_REQUIRED",
    rounds: [
      {
        ...session.rounds[0],
        expectedHead: "1111111111111111111111111111111111111111",
        reviewedHead: "1111111111111111111111111111111111111111",
        resultCapturedAt: "2026-10-04T01:10:00.000Z",
        verdict: "FIX_REQUIRED",
        verdictConfirmedAt: "2026-10-04T01:20:00.000Z",
        verdictNote: SENTINELS.verdictNote,
        revalidation: { reason: "NEW_COMMIT_BINDING", priorReviews: [], explanation: SENTINELS.revalidation } as never,
      },
    ],
  };
}

function sentinelReviews(): LoadedReview[] {
  return [
    { reviewId: REVIEW_ID, session: sentinelSession(), health: { status: "restored_from_backup", cause: "corrupt_primary", quarantinedAs: SENTINELS.quarantinedAs } },
    {
      reviewId: "rv-20261004-unread",
      session: null,
      health: { status: "unreadable", reason: message("health.sessionMissing", { path: SENTINELS.healthReason } as never), setAside: [SENTINELS.setAside] as never },
    },
    { reviewId: "rv-20261004-ioerr1", session: null, health: { status: "io_error", reason: message("health.sessionMissing", { path: SENTINELS.healthReason } as never), code: SENTINELS.ioCode } },
  ];
}

function sentinelAppState(observation: "ok" | "error"): AppState {
  const project = sentinelProject();
  const discovered: DiscoveredIdeSession = {
    provider: "CODEX",
    sessionId: SENTINELS.providerSessionId,
    sourceKind: "LIVE",
    createdAt: null,
    updatedAt: null,
    providerVersion: SENTINELS.providerCwd,
    archived: false,
    binding: "MATCHED",
    matchedProjectId: PROJECT_ID,
    candidateProjectIds: [],
    reason: message("health.sessionMissing", { path: SENTINELS.providerCwd } as never),
  } as unknown as DiscoveredIdeSession;
  return {
    ...initialAppState,
    phase: "ready",
    projects: [project],
    projectsHealth: { status: "restored_from_backup", cause: "corrupt_primary", quarantinedAs: SENTINELS.quarantinedAs },
    reviews: sentinelReviews(),
    selectedReviewId: REVIEW_ID,
    artifacts: {
      [REVIEW_ID]: { checkpoint: SENTINELS.checkpoint, latestResult: { round: 1, text: SENTINELS.resultBody }, events: [], skippedEventLines: 0, errors: [SENTINELS.healthReason] },
    },
    gitObservations: {
      [PROJECT_ID]: {
        localRoot: project.localRoot,
        projectCreatedAt: project.createdAt,
        observation:
          observation === "ok"
            ? { status: "OK", head: "1111111111111111111111111111111111111111", branch: SENTINELS.branch, detached: false, dirty: false, observedAt: "2026-10-04T01:30:00.123Z" }
            : {
                status: "ERROR",
                head: null,
                branch: SENTINELS.branch,
                detached: null,
                dirty: null,
                observedAt: "2026-10-04T01:30:00.123Z",
                errorCode: SENTINELS.errorCode,
                errorMessage: SENTINELS.errorMessage,
              },
      },
    },
    ideSessions: {
      status: "loaded",
      scan: { claude: { status: "ok", sessions: [], complete: true }, codex: { status: "ok", sessions: [discovered], complete: true } },
      fingerprint: `[{"projectId":"${PROJECT_ID}","localRoot":"${SENTINELS.providerCwd.replace(/\\/g, "\\\\")}"}]`,
    } as AppState["ideSessions"],
  };
}

function allResponses(src: ControlReadSource): ControlReadResult[] {
  const base = { contract: CONTROL_READ_CONTRACT, version: 1 };
  return [
    readControl({ ...base, operation: "get_control_snapshot", project_id: PROJECT_ID }, src, ENV),
    readControl({ ...base, operation: "get_project_state", project_id: PROJECT_ID }, src, ENV),
    readControl({ ...base, operation: "get_review_state", review_session_id: REVIEW_ID }, src, ENV),
    readControl({ ...base, operation: "get_review_state", review_session_id: "rv-20261004-unread" }, src, ENV),
    readControl({ ...base, operation: "get_review_state", review_session_id: "rv-20261004-ioerr1" }, src, ENV),
    readControl({ ...base, operation: "get_run_state", run_id: SENTINELS.unknownKeyValue }, src, ENV),
    readControl({ ...base, operation: "get_control_snapshot", project_id: PROJECT_ID, [SENTINELS.unknownKeyName]: SENTINELS.unknownKeyValue, include_notes: SENTINELS.notes }, src, ENV),
    readControl({ ...base, operation: "get_project_state", project_id: SENTINELS.displayName }, src, ENV),
    readControl({ ...base, operation: "get_project_state", project_id: PROJECT_ID }, { ...src, projectsHealth: { status: "unreadable" } }, ENV),
  ];
}

function collectRefs(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((item) => collectRefs(item, into));
  else if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "evidence_ref" && typeof item === "string") into.push(item);
      else if (key === "derived_from" && Array.isArray(item)) into.push(...item.filter((ref): ref is string => typeof ref === "string"));
      else collectRefs(item, into);
    }
  }
  return into;
}

describe("Control Read least disclosure", () => {
  for (const observation of ["ok", "error"] as const) {
    it(`no sentinel reaches any response (observation ${observation})`, () => {
      const src = controlReadSourceFrom(sentinelAppState(observation));
      const responses = allResponses(src);
      expect(responses.filter((response) => !("error" in response))).toHaveLength(3);
      for (const response of responses) {
        const text = JSON.stringify(response);
        for (const [name, sentinel] of Object.entries(SENTINELS)) {
          expect(text.includes(sentinel), `${name} leaked into ${text.slice(0, 160)}`).toBe(false);
          expect(text.includes(JSON.stringify(sentinel).slice(1, -1)), `${name} (escaped) leaked`).toBe(false);
        }
        expect(text).not.toMatch(/SENTINEL/);
        for (const pattern of TOKEN_PATTERNS) expect(text).not.toMatch(pattern);
      }
    });
  }

  it("emits evidence references only in the seven approved variants, free of sentinels", () => {
    const refs = allResponses(controlReadSourceFrom(sentinelAppState("ok"))).flatMap((response) => collectRefs(response));
    expect(refs.length).toBeGreaterThan(10);
    for (const ref of refs) {
      expect(EVIDENCE_REF_ORACLE.filter((pattern) => pattern.test(ref)), ref).toHaveLength(1);
      expect(ref).not.toMatch(/SENTINEL|\\|\s|:\/\/|\.\./);
    }
  });

  it("reports unreadable and refused targets by code and reason only", () => {
    const responses = allResponses(controlReadSourceFrom(sentinelAppState("ok")));
    expect(responses[3]).toEqual({ contract: "dvcc.control-read", version: 1, error: { code: "TARGET_UNAVAILABLE", reason: "UNREADABLE" } });
    expect(responses[4]).toEqual({ contract: "dvcc.control-read", version: 1, error: { code: "TARGET_UNAVAILABLE", reason: "IO_ERROR" } });
    expect(responses[6]).toEqual({
      contract: "dvcc.control-read",
      version: 1,
      error: { code: "INVALID_REQUEST", reason: "UNRECOGNIZED_FIELD", fields: ["include_notes"], unlisted_field_count: 1 },
    });
    expect(responses[8]).toEqual({ contract: "dvcc.control-read", version: 1, error: { code: "SOURCE_UNAVAILABLE", reason: "REGISTRY_UNREADABLE" } });
  });

  it("passes only five AppState keys to the projection", () => {
    const src = controlReadSourceFrom(sentinelAppState("ok"));
    expect(Object.keys(src).sort()).toEqual(["gitObservations", "phase", "projects", "projectsHealth", "reviews"]);
  });
});

describe("Control Read source shape (helper reuse, closed references)", () => {
  const read = (path: string) => readFileSync(path, "utf8");
  const PRODUCT = {
    contract: read("src/domain/controlRead/contract.ts"),
    evidenceRef: read("src/domain/controlRead/evidenceRef.ts"),
    projection: read("src/domain/controlRead/projection.ts"),
    readControl: read("src/domain/controlRead/readControl.ts"),
    controlReadSource: read("src/app/controlReadSource.ts"),
    copyAction: read("src/app/copyControlSnapshotAction.ts"),
  };

  it("brands EvidenceRef only inside evidenceRef.ts, and builds 'dvcc:' references nowhere else", () => {
    for (const [name, text] of Object.entries(PRODUCT)) {
      if (name === "evidenceRef") continue;
      expect(text, name).not.toMatch(/as\s+EvidenceRef\b/);
      expect(text, name).not.toMatch(/["'`]dvcc:/);
    }
    expect(PRODUCT.evidenceRef.match(/as\s+EvidenceRef\b/g)).toHaveLength(1);
  });

  it("reuses the existing validators instead of its own ID / repository rules", () => {
    expect(PRODUCT.evidenceRef).toMatch(/import \{ isIsoTimestamp, isValidProjectId, isValidReviewId \} from "\.\.\/validation";/);
    expect(PRODUCT.evidenceRef).toMatch(/import \{ MAX_REVIEW_ROUNDS \} from "\.\.\/limits";/);
    expect(PRODUCT.readControl).toMatch(/import \{ isValidProjectId, isValidReviewId \} from "\.\.\/validation";/);
    expect(PRODUCT.projection).toMatch(/import \{ normalizeRepositoryUrl \} from "\.\.\/validation";/);
    for (const [name, text] of Object.entries(PRODUCT)) {
      // No regular expression that re-encodes a project ID, review ID, HEAD or repository shape.
      expect(text, name).not.toMatch(/\/\^?\[a-z0-9\]\[a-z0-9-\]/);
      expect(text, name).not.toMatch(/\/\^?rv-/);
      expect(text, name).not.toMatch(/\[0-9a-f\]\{(7|40)/i);
      expect(text, name).not.toMatch(/\/[^/\n]*github\\?\.com[^/\n]*\//);
    }
  });

  it("never touches the fields it must not disclose", () => {
    for (const name of ["projection", "readControl", "controlReadSource", "copyAction"] as const) {
      const text = PRODUCT[name];
      for (const forbidden of [".displayName", ".notes", ".nextAction", ".reviewType", ".chatgptThread", ".verdictNote", ".branch", ".errorMessage", ".explanation", ".setAside", ".quarantinedAs", ".health.reason", ".artifacts", "ideSessions"]) {
        expect(text.includes(forbidden), `${name} references ${forbidden}`).toBe(false);
      }
    }
  });
});
