import { describe, expect, it } from "vitest";
import type { Project } from "./project";
import {
  bindClaudeSessions,
  bindCodexSessions,
  computeProjectBindingFingerprint,
  encodeClaudeWorkspacePath,
  isCodexManagedMirrorPath,
  isIdeSessionsStale,
  normalizeRepositoryIdentity,
  type CanonicalPaths,
  type ClaudeDiscoveryRaw,
  type CodexDiscoveryRaw,
  type CodexThreadRaw,
  type DiscoveredIdeSession,
} from "./ideSessionDiscovery";

const NOW = "2026-09-28T00:00:00.000Z";

function project(overrides: Partial<Project> = {}): Project {
  return {
    projectId: "project-alpha",
    displayName: "Project Alpha",
    repositoryUrl: null,
    localRoot: null,
    developmentIde: null,
    nextAction: "",
    notes: "PRIVATE_PROJECT_NOTES",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function canon(pairs: Record<string, string>): CanonicalPaths {
  return new Map(Object.entries(pairs));
}

describe("encodeClaudeWorkspacePath", () => {
  it("replaces ':', '\\' and '.' with '-', matching the observed provider rule", () => {
    expect(encodeClaudeWorkspacePath("C:\\Users\\alice\\.claude\\projects\\Alpha")).toBe(
      "C--Users-alice--claude-projects-Alpha",
    );
  });
});

describe("normalizeRepositoryIdentity (test F)", () => {
  it("normalizes HTTPS and SSH GitHub origin variants to the same identity", () => {
    const forms = [
      "https://github.com/example-org/alpha.git",
      "https://github.com/example-org/alpha",
      "git@github.com:example-org/alpha.git",
      "git@github.com:example-org/alpha",
      "HTTPS://GitHub.com/Example-Org/Alpha.GIT",
    ];
    const identities = forms.map((form) => normalizeRepositoryIdentity(form));
    expect(new Set(identities).size).toBe(1);
    expect(identities[0]).toBe("github.com/example-org/alpha");
  });

  it("returns null for an unsupported host or form", () => {
    expect(normalizeRepositoryIdentity("https://gitlab.com/example-org/alpha.git")).toBeNull();
    expect(normalizeRepositoryIdentity("not a url")).toBeNull();
  });
});

describe("isCodexManagedMirrorPath", () => {
  it("recognizes the Codex-managed sandbox mirror root", () => {
    expect(isCodexManagedMirrorPath("C:\\Users\\alice\\.codex\\project\\Alpha")).toBe(true);
    expect(isCodexManagedMirrorPath("\\\\?\\C:\\Users\\alice\\.codex\\project\\Alpha")).toBe(true);
    expect(isCodexManagedMirrorPath("C:\\work\\Alpha")).toBe(false);
  });
});

describe("bindClaudeSessions", () => {
  it("A: live exact canonical cwd is MATCHED", () => {
    const alpha = project({ projectId: "alpha", localRoot: "C:\\work\\alpha" });
    const raw: ClaudeDiscoveryRaw = {
      status: "ok",
      historical: [],
      live: [{ sessionId: "s-1", cwd: "\\\\?\\C:\\work\\alpha", updatedAtMs: 1000, version: "2.1.283" }],
    };
    const paths = canon({ "C:\\work\\alpha": "C:\\work\\alpha", "\\\\?\\C:\\work\\alpha": "C:\\work\\alpha" });
    const result = bindClaudeSessions(raw, [alpha], paths);
    expect(result.status).toBe("ok");
    const sessions = (result as { sessions: DiscoveredIdeSession[] }).sessions;
    expect(sessions).toEqual([
      expect.objectContaining({ sessionId: "s-1", sourceKind: "LIVE", binding: "MATCHED", matchedProjectId: "alpha" }),
    ]);
  });

  it("B: a historical forward-encoded candidate is AMBIGUOUS, never MATCHED", () => {
    const alpha = project({ projectId: "alpha", localRoot: "C:\\work\\alpha" });
    const encoded = encodeClaudeWorkspacePath("C:\\work\\alpha");
    const raw: ClaudeDiscoveryRaw = {
      status: "ok",
      historical: [{ encodedDirName: encoded, sessionId: "11111111-1111-1111-1111-111111111111", updatedAtMs: 1000 }],
      live: [],
    };
    const result = bindClaudeSessions(raw, [alpha], canon({}));
    const sessions = (result as { sessions: DiscoveredIdeSession[] }).sessions;
    expect(sessions[0].binding).toBe("AMBIGUOUS");
    expect(sessions[0].matchedProjectId).toBeNull();
  });

  it("C: two Project roots that encode to the same key are AMBIGUOUS for that historical session", () => {
    const a = project({ projectId: "a", localRoot: "C:\\work\\alpha" });
    // A differently-shaped but real absolute path that collides after encoding with the one above
    // (a folder literally named "work.alpha" vs a "work" folder containing an "alpha" folder).
    const b = project({ projectId: "b", localRoot: "C:\\work.alpha" });
    const encoded = encodeClaudeWorkspacePath("C:\\work\\alpha");
    expect(encodeClaudeWorkspacePath("C:\\work.alpha")).toBe(encoded);
    const raw: ClaudeDiscoveryRaw = {
      status: "ok",
      historical: [{ encodedDirName: encoded, sessionId: "22222222-2222-2222-2222-222222222222", updatedAtMs: null }],
      live: [],
    };
    const result = bindClaudeSessions(raw, [a, b], canon({}));
    const sessions = (result as { sessions: DiscoveredIdeSession[] }).sessions;
    expect(sessions[0].binding).toBe("AMBIGUOUS");
    expect(sessions[0].candidateProjectIds.sort()).toEqual(["a", "b"]);
  });

  it("K: no candidate Project encodes to the historical directory name -> NO_MATCH", () => {
    const alpha = project({ projectId: "alpha", localRoot: "C:\\work\\alpha" });
    const raw: ClaudeDiscoveryRaw = {
      status: "ok",
      historical: [{ encodedDirName: "C--completely-unrelated", sessionId: "33333333-3333-3333-3333-333333333333", updatedAtMs: null }],
      live: [],
    };
    const result = bindClaudeSessions(raw, [alpha], canon({}));
    const sessions = (result as { sessions: DiscoveredIdeSession[] }).sessions;
    expect(sessions[0].binding).toBe("NO_MATCH");
  });

  it("L: the provider itself is unavailable -> provider-level UNAVAILABLE, not a fabricated session list", () => {
    const raw: ClaudeDiscoveryRaw = { status: "unavailable", reason: "no .claude directory" };
    const result = bindClaudeSessions(raw, [], canon({}));
    expect(result.status).toBe("unavailable");
  });

  it("a live cwd that cannot be canonicalized (folder gone) is UNAVAILABLE at the session level", () => {
    const alpha = project({ projectId: "alpha", localRoot: "C:\\work\\alpha" });
    const raw: ClaudeDiscoveryRaw = {
      status: "ok",
      historical: [],
      live: [{ sessionId: "s-2", cwd: "C:\\work\\deleted", updatedAtMs: null, version: null }],
    };
    const result = bindClaudeSessions(raw, [alpha], canon({}));
    const sessions = (result as { sessions: DiscoveredIdeSession[] }).sessions;
    expect(sessions[0].binding).toBe("UNAVAILABLE");
  });

  it("deduplicates a session id that appears both live and historically, keeping the live (exact) evidence", () => {
    const alpha = project({ projectId: "alpha", localRoot: "C:\\work\\alpha" });
    const encoded = encodeClaudeWorkspacePath("C:\\work\\alpha");
    const raw: ClaudeDiscoveryRaw = {
      status: "ok",
      historical: [{ encodedDirName: encoded, sessionId: "same-id", updatedAtMs: 1 }],
      live: [{ sessionId: "same-id", cwd: "C:\\work\\alpha", updatedAtMs: 2, version: "2.1.283" }],
    };
    const result = bindClaudeSessions(raw, [alpha], canon({ "C:\\work\\alpha": "C:\\work\\alpha" }));
    const sessions = (result as { sessions: DiscoveredIdeSession[] }).sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sourceKind).toBe("LIVE");
    expect(sessions[0].binding).toBe("MATCHED");
  });
});

describe("bindCodexSessions", () => {
  function thread(overrides: Partial<CodexThreadRaw> = {}): CodexThreadRaw {
    return {
      id: "t-1",
      cwd: "C:\\work\\alpha",
      createdAt: 1000,
      updatedAt: 2000,
      cliVersion: "0.153.4",
      archived: false,
      gitOriginUrl: null,
      ...overrides,
    };
  }

  it("E: a unique git_origin_url match is MATCHED", () => {
    const alpha = project({ projectId: "alpha", repositoryUrl: "https://github.com/example-org/alpha.git" });
    const raw: CodexDiscoveryRaw = { status: "ok", threads: [thread({ gitOriginUrl: "git@github.com:example-org/alpha.git" })] };
    const result = bindCodexSessions(raw, [alpha], canon({}));
    const sessions = (result as { sessions: DiscoveredIdeSession[] }).sessions;
    expect(sessions[0].binding).toBe("MATCHED");
    expect(sessions[0].matchedProjectId).toBe("alpha");
  });

  it("G: two Projects share a repository identity and cwd is a mirror path -> AMBIGUOUS", () => {
    const a = project({ projectId: "a", repositoryUrl: "https://github.com/example-org/alpha.git" });
    const b = project({ projectId: "b", repositoryUrl: "https://github.com/example-org/alpha.git" });
    const raw: CodexDiscoveryRaw = {
      status: "ok",
      threads: [thread({ cwd: "C:\\Users\\alice\\.codex\\project\\alpha", gitOriginUrl: "https://github.com/example-org/alpha.git" })],
    };
    const result = bindCodexSessions(raw, [a, b], canon({}));
    const sessions = (result as { sessions: DiscoveredIdeSession[] }).sessions;
    expect(sessions[0].binding).toBe("AMBIGUOUS");
    expect(sessions[0].candidateProjectIds.sort()).toEqual(["a", "b"]);
  });

  it("H: two Projects share a repository identity but exactly one has the exact non-mirror cwd -> MATCHED", () => {
    const a = project({ projectId: "a", repositoryUrl: "https://github.com/example-org/alpha.git", localRoot: "C:\\work\\alpha-1" });
    const b = project({ projectId: "b", repositoryUrl: "https://github.com/example-org/alpha.git", localRoot: "C:\\work\\alpha-2" });
    const raw: CodexDiscoveryRaw = {
      status: "ok",
      threads: [thread({ cwd: "C:\\work\\alpha-2", gitOriginUrl: "https://github.com/example-org/alpha.git" })],
    };
    const paths = canon({ "C:\\work\\alpha-1": "C:\\work\\alpha-1", "C:\\work\\alpha-2": "C:\\work\\alpha-2" });
    const result = bindCodexSessions(raw, [a, b], paths);
    const sessions = (result as { sessions: DiscoveredIdeSession[] }).sessions;
    expect(sessions[0].binding).toBe("MATCHED");
    expect(sessions[0].matchedProjectId).toBe("b");
  });

  it("I: no git_origin_url but an exact non-mirror cwd -> MATCHED", () => {
    const alpha = project({ projectId: "alpha", localRoot: "C:\\work\\alpha" });
    const raw: CodexDiscoveryRaw = { status: "ok", threads: [thread({ cwd: "C:\\work\\alpha", gitOriginUrl: null })] };
    const result = bindCodexSessions(raw, [alpha], canon({ "C:\\work\\alpha": "C:\\work\\alpha" }));
    const sessions = (result as { sessions: DiscoveredIdeSession[] }).sessions;
    expect(sessions[0].binding).toBe("MATCHED");
    expect(sessions[0].matchedProjectId).toBe("alpha");
  });

  it("J: a mirror cwd whose basename resembles a registered Project is NEVER MATCHED", () => {
    const alpha = project({ projectId: "alpha", displayName: "Alpha", localRoot: "C:\\work\\alpha" });
    const raw: CodexDiscoveryRaw = {
      status: "ok",
      threads: [thread({ cwd: "C:\\Users\\alice\\.codex\\project\\alpha", gitOriginUrl: null })],
    };
    // Even if the mirror path happened to canonicalize (it should not be looked up at all).
    const paths = canon({ "C:\\work\\alpha": "C:\\work\\alpha", "C:\\Users\\alice\\.codex\\project\\alpha": "C:\\work\\alpha" });
    const result = bindCodexSessions(raw, [alpha], paths);
    const sessions = (result as { sessions: DiscoveredIdeSession[] }).sessions;
    expect(sessions[0].binding).not.toBe("MATCHED");
  });

  it("K: a recognized repository identity matching no Project -> NO_MATCH", () => {
    const alpha = project({ projectId: "alpha", repositoryUrl: "https://github.com/example-org/other.git" });
    const raw: CodexDiscoveryRaw = { status: "ok", threads: [thread({ gitOriginUrl: "https://github.com/example-org/alpha.git" })] };
    const result = bindCodexSessions(raw, [alpha], canon({}));
    const sessions = (result as { sessions: DiscoveredIdeSession[] }).sessions;
    expect(sessions[0].binding).toBe("NO_MATCH");
  });

  it("M: the provider schema is unsupported -> provider-level UNSUPPORTED_FORMAT", () => {
    const raw: CodexDiscoveryRaw = { status: "unsupportedFormat", reason: "missing column" };
    const result = bindCodexSessions(raw, [], canon({}));
    expect(result.status).toBe("unsupportedFormat");
  });

  it("L: the provider itself is unavailable -> provider-level UNAVAILABLE", () => {
    const raw: CodexDiscoveryRaw = { status: "unavailable", reason: "no state file" };
    const result = bindCodexSessions(raw, [], canon({}));
    expect(result.status).toBe("unavailable");
  });

  it("N: no title/prompt/preview/transcript field ever appears on the neutral session model", () => {
    const alpha = project({ projectId: "alpha", repositoryUrl: "https://github.com/example-org/alpha.git" });
    const raw: CodexDiscoveryRaw = { status: "ok", threads: [thread({ gitOriginUrl: "https://github.com/example-org/alpha.git" })] };
    const result = bindCodexSessions(raw, [alpha], canon({}));
    const sessions = (result as { sessions: DiscoveredIdeSession[] }).sessions;
    const keys = Object.keys(sessions[0]).sort();
    expect(keys).toEqual(
      [
        "archived",
        "binding",
        "candidateProjectIds",
        "createdAt",
        "matchedProjectId",
        "provider",
        "providerVersion",
        "reason",
        "sessionId",
        "sourceKind",
        "updatedAt",
      ].sort(),
    );
  });

  it("O: binding never mutates the Project array it was given", () => {
    const alpha = project({ projectId: "alpha", repositoryUrl: "https://github.com/example-org/alpha.git" });
    const projects = [alpha];
    const before = structuredClone(projects);
    const raw: CodexDiscoveryRaw = { status: "ok", threads: [thread({ gitOriginUrl: "https://github.com/example-org/alpha.git" })] };
    bindCodexSessions(raw, projects, canon({}));
    expect(projects).toEqual(before);
  });

  it("Project.notes never reaches the neutral session model (defense in depth for the privacy boundary)", () => {
    const alpha = project({ projectId: "alpha", repositoryUrl: "https://github.com/example-org/alpha.git", notes: "PRIVATE_PROJECT_NOTES" });
    const raw: CodexDiscoveryRaw = { status: "ok", threads: [thread({ gitOriginUrl: "https://github.com/example-org/alpha.git" })] };
    const result = bindCodexSessions(raw, [alpha], canon({}));
    expect(JSON.stringify(result)).not.toContain("PRIVATE_PROJECT_NOTES");
  });
});

describe("stale binding invalidation (Independent Review RF-P4B1-01)", () => {
  it("computeProjectBindingFingerprint is order-independent and changes on any binding-relevant edit", () => {
    const a = project({ projectId: "a", repositoryUrl: "https://github.com/example-org/a.git", localRoot: "C:\\work\\a" });
    const b = project({ projectId: "b", repositoryUrl: null, localRoot: "C:\\work\\b" });
    const original = computeProjectBindingFingerprint([a, b]);

    expect(computeProjectBindingFingerprint([b, a])).toBe(original); // order-independent

    const editedRepositoryUrl = { ...a, repositoryUrl: "https://github.com/example-org/renamed.git" };
    expect(computeProjectBindingFingerprint([editedRepositoryUrl, b])).not.toBe(original);

    const editedLocalRoot = { ...a, localRoot: "C:\\work\\a-moved" };
    expect(computeProjectBindingFingerprint([editedLocalRoot, b])).not.toBe(original);

    expect(computeProjectBindingFingerprint([a])).not.toBe(original); // a Project removed

    // A change to a field the binding never reads (displayName) must not affect the fingerprint.
    const renamedOnly = { ...a, displayName: "A totally different display name" };
    expect(computeProjectBindingFingerprint([renamedOnly, b])).toBe(original);
  });

  it("A: a loaded result becomes stale the instant the Project registry it was computed from is edited", () => {
    const a = project({ projectId: "a", repositoryUrl: "https://github.com/example-org/a.git" });
    const fingerprintAtLoadTime = computeProjectBindingFingerprint([a]);
    expect(isIdeSessionsStale(fingerprintAtLoadTime, [a])).toBe(false);

    const editedRepositoryUrl = { ...a, repositoryUrl: "https://github.com/example-org/a-renamed.git" };
    expect(isIdeSessionsStale(fingerprintAtLoadTime, [editedRepositoryUrl])).toBe(true);
  });

  it("B: a scan whose fingerprint was captured before Projects changed can never read as current, no matter when it resolves", () => {
    const a = project({ projectId: "a", localRoot: "C:\\work\\a" });
    // The fingerprint a scan-start captures, before the async scan itself has returned.
    const fingerprintCapturedAtScanStart = computeProjectBindingFingerprint([a]);

    // The Human edits Project "a" while that scan is still in flight.
    const projectsAfterEditDuringScan = [{ ...a, localRoot: "C:\\work\\a-moved" }];

    // The scan now resolves and would be dispatched as "loaded" carrying the pre-edit fingerprint.
    // Whoever renders it must treat it as stale against the CURRENT registry, not the one the scan
    // itself saw — the old result must never be displayed as if it still matches project "a"'s new
    // localRoot.
    expect(isIdeSessionsStale(fingerprintCapturedAtScanStart, projectsAfterEditDuringScan)).toBe(true);

    // Had nothing changed by the time it resolved, it must still read as current.
    expect(isIdeSessionsStale(fingerprintCapturedAtScanStart, [a])).toBe(false);
  });
});
