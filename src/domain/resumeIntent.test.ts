import { describe, expect, it } from "vitest";
import type { DiscoveredIdeSession } from "./ideSessionDiscovery";
import { evaluateResume, parseSessionId, renderResumeCommand, type ResumeIntent } from "./resumeIntent";
import { sessionIdLabels } from "./sessionIdLabels";

/** Synthetic IDs only (no real session ID). */
const UUID_V7 = "019c1a2b-3c4d-7e5f-8a9b-0c1d2e3f4a5b";
const UUID_V7_SAME_PREFIX = "019c1a2b-9f00-7ccc-8ccc-0000cafe0003";
const UUID_V4 = "3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f";
const PROJECT = "project-alpha";

function session(overrides: Partial<DiscoveredIdeSession> = {}): DiscoveredIdeSession {
  return {
    provider: "CODEX",
    sessionId: UUID_V7,
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
  };
}

function refusal(s: DiscoveredIdeSession, projectId = PROJECT, stale = false) {
  const result = evaluateResume(s, projectId, stale);
  return result.eligible ? "ELIGIBLE" : result.reason;
}

describe("evaluateResume — eligibility (Task Packet §22)", () => {
  it("A: Codex HISTORICAL + MATCHED + non-archived + valid lowercase UUID + not stale -> ELIGIBLE", () => {
    const result = evaluateResume(session(), PROJECT, false);
    expect(result).toEqual({ eligible: true, intent: { provider: "CODEX", sessionId: UUID_V7, projectId: PROJECT } });
  });

  it("B: AMBIGUOUS -> NOT_MATCHED", () => {
    expect(refusal(session({ binding: "AMBIGUOUS", matchedProjectId: null, candidateProjectIds: [PROJECT, "other"] }))).toBe("NOT_MATCHED");
  });

  it("C: NO_MATCH -> NOT_MATCHED", () => {
    expect(refusal(session({ binding: "NO_MATCH", matchedProjectId: null }))).toBe("NOT_MATCHED");
  });

  it("D: UNAVAILABLE / UNSUPPORTED_FORMAT -> refused", () => {
    expect(refusal(session({ binding: "UNAVAILABLE", matchedProjectId: null }))).toBe("NOT_MATCHED");
    expect(refusal(session({ binding: "UNSUPPORTED_FORMAT", matchedProjectId: null }))).toBe("NOT_MATCHED");
  });

  it("E: stale MATCHED -> STALE_DISCOVERY, checked before everything else", () => {
    expect(refusal(session(), PROJECT, true)).toBe("STALE_DISCOVERY");
    expect(refusal(session({ binding: "AMBIGUOUS", archived: true, sessionId: "bad" }), PROJECT, true)).toBe("STALE_DISCOVERY");
  });

  it("F: Claude LIVE MATCHED -> ALREADY_ACTIVE", () => {
    expect(refusal(session({ provider: "CLAUDE_CODE", sourceKind: "LIVE", sessionId: UUID_V4, archived: null }))).toBe("ALREADY_ACTIVE");
  });

  it("G: an (impossible) Claude HISTORICAL MATCHED is never eligible and never yields a command", () => {
    const result = evaluateResume(session({ provider: "CLAUDE_CODE", sourceKind: "HISTORICAL", sessionId: UUID_V4, archived: null }), PROJECT, false);
    expect(result.eligible).toBe(false);
    expect(result).toEqual({ eligible: false, reason: "PROVIDER_NOT_SUPPORTED" });
  });

  it("H: Codex archived -> ARCHIVED; an unknown archived state fails closed to ARCHIVED", () => {
    expect(refusal(session({ archived: true }))).toBe("ARCHIVED");
    expect(refusal(session({ archived: null }))).toBe("ARCHIVED");
  });

  it("I: an invalid session ID -> INVALID_SESSION_ID", () => {
    expect(refusal(session({ sessionId: "019c1a2b; rm -rf ~" }))).toBe("INVALID_SESSION_ID");
    expect(refusal(session({ sessionId: UUID_V7.toUpperCase() }))).toBe("INVALID_SESSION_ID");
  });

  it("J: an incomplete provider scan does not enter into it — an individually MATCHED valid Codex row stays eligible", () => {
    // evaluateResume has no scan-completeness input at all: a row's own evidence decides.
    expect(evaluateResume.length).toBe(3);
    expect(refusal(session())).toBe("ELIGIBLE");
  });

  it("K: the visible label is irrelevant — the command is built from the full sessionId only", () => {
    const ids = [UUID_V7, UUID_V7_SAME_PREFIX, "019c1a2b-9f00-7ddd-8ddd-0000cafe0003"];
    const labels = sessionIdLabels(ids);
    for (const id of ids) {
      expect(labels.get(id)).not.toBe(id); // the label really is abbreviated
      const result = evaluateResume(session({ sessionId: id }), PROJECT, false);
      if (!result.eligible) throw new Error("expected eligible");
      expect(renderResumeCommand(result.intent)).toBe(`codex resume ${id}`);
    }
    // A label substituted for the ID can never pass: it contains "…" and fails the strict parser.
    for (const label of labels.values()) {
      expect(refusal(session({ sessionId: label }))).toBe("INVALID_SESSION_ID");
    }
  });

  it("L: a row MATCHED to a different Project than the selected one -> refused", () => {
    expect(refusal(session({ matchedProjectId: "project-other" }))).toBe("NOT_MATCHED");
    expect(refusal(session(), "project-other")).toBe("NOT_MATCHED");
  });

  it("an unknown future provider is PROVIDER_NOT_SUPPORTED", () => {
    expect(refusal(session({ provider: "OTHER_IDE" as never }))).toBe("PROVIDER_NOT_SUPPORTED");
  });

  it("never mutates the session it evaluates", () => {
    const s = Object.freeze(session());
    expect(() => evaluateResume(s, PROJECT, false)).not.toThrow();
  });
});

describe("parseSessionId — strict lowercase UUID only (Task Packet §8 / §20 / §23)", () => {
  it("accepts synthetic lowercase UUIDv4 and UUIDv7, returning the same string unchanged", () => {
    expect(parseSessionId(UUID_V4)).toBe(UUID_V4);
    expect(parseSessionId(UUID_V7)).toBe(UUID_V7);
  });

  const NEGATIVE: Record<string, unknown> = {
    semicolon: `${UUID_V7};`,
    ampersand: `${UUID_V7}&whoami`,
    pipe: `${UUID_V7}|more`,
    backtick: `${UUID_V7}\`id\``,
    subshell: `$(${UUID_V7})`,
    space: `${UUID_V7} `,
    leadingSpace: ` ${UUID_V7}`,
    innerSpace: "019c1a2b 3c4d-7e5f-8a9b-0c1d2e3f4a5b",
    tab: `${UUID_V7}\t`,
    newline: `${UUID_V7}\n`,
    crlf: `${UUID_V7}\r\n`,
    doubleQuote: `"${UUID_V7}"`,
    singleQuote: `'${UUID_V7}'`,
    relativePath: `../${UUID_V7}`,
    absolutePath: `C:\\${UUID_V7}`,
    jsonlPath: `C:\\Users\\x\\.claude\\projects\\p\\${UUID_V7}.jsonl`,
    flag: "--last",
    flagWithValue: `--all ${UUID_V7}`,
    name: "my-session-name",
    url: `https://example.com/${UUID_V7}`,
    uppercase: UUID_V7.toUpperCase(),
    mixedCase: "019C1a2b-3c4d-7e5f-8a9b-0c1d2e3f4a5b",
    chars35: UUID_V7.slice(0, 35),
    chars37: `${UUID_V7}0`,
    noHyphens: UUID_V7.replace(/-/g, ""),
    malformedVariant: "019c1a2b-3c4d-7e5f-ca9b-0c1d2e3f4a5b",
    malformedVersion0: "019c1a2b-3c4d-0e5f-8a9b-0c1d2e3f4a5b",
    malformedVersion9: "019c1a2b-3c4d-9e5f-8a9b-0c1d2e3f4a5b",
    nonHex: "019c1a2b-3c4d-7e5f-8a9b-0c1d2e3f4a5g",
    ellipsisLabel: "019c1a2b…0c1d2e3f4a5b",
    empty: "",
    notAString: 42,
    nullValue: null,
  };

  for (const [name, value] of Object.entries(NEGATIVE)) {
    it(`rejects ${name} (no normalization)`, () => {
      expect(parseSessionId(value)).toBeNull();
      if (typeof value === "string") {
        expect(evaluateResume(session({ sessionId: value }), PROJECT, false)).toEqual({ eligible: false, reason: "INVALID_SESSION_ID" });
      }
    });
  }
});

describe("renderResumeCommand — exact one-line output (Task Packet §12 / §19 / §24)", () => {
  function intent(id: string): ResumeIntent {
    const result = evaluateResume(session({ sessionId: id }), PROJECT, false);
    if (!result.eligible) throw new Error("fixture must be eligible");
    return result.intent;
  }

  it("is exactly `codex resume <uuid>`", () => {
    expect(renderResumeCommand(intent(UUID_V7))).toBe(`codex resume ${UUID_V7}`);
    expect(renderResumeCommand(intent(UUID_V4))).toBe(`codex resume ${UUID_V4}`);
  });

  it("is one line with exactly three space-separated tokens and nothing else", () => {
    const command = renderResumeCommand(intent(UUID_V7));
    expect(command).not.toMatch(/[\r\n]/);
    expect(command.split(" ")).toEqual(["codex", "resume", UUID_V7]);
    expect(command).toMatch(/^codex resume [0-9a-f-]{36}$/);
  });

  it("contains no quote, path, option, shell operator, project or repository information", () => {
    const command = renderResumeCommand(intent(UUID_V7));
    for (const forbidden of ['"', "'", "\\", "/", ":", "--", " -", "&", ";", "|", ">", "<", "$", "`", "=", "cd ", PROJECT, "github", "http"]) {
      expect(command).not.toContain(forbidden);
    }
  });

  it("the intent itself carries only provider, full session ID and project ID", () => {
    expect(Object.keys(intent(UUID_V7)).sort()).toEqual(["projectId", "provider", "sessionId"]);
  });
});
