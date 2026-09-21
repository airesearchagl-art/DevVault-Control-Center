import { describe, expect, it } from "vitest";
import {
  CHATGPT_HOSTS,
  LAUNCHER_HOSTS,
  generateReviewId,
  isValidReviewId,
  normalizeChatgptThreadUrl,
  normalizeHead,
  normalizeLocalRoot,
  normalizeRepositoryUrl,
  parseAllowedHttpsUrl,
  parsePrNumber,
  suggestProjectId,
} from "./validation";

describe("parseAllowedHttpsUrl (URL parsing, not prefix matching)", () => {
  it.each([
    "https://github.com/example-org/project-alpha",
    "https://chatgpt.com/c/example-thread-alpha",
    "https://chat.openai.com/c/example-thread-beta",
    "https://GitHub.com/example-org/project-alpha",
  ])("accepts %s", (url) => {
    expect(parseAllowedHttpsUrl(url, LAUNCHER_HOSTS).ok).toBe(true);
  });

  it.each([
    ["https://github.com:443/example-org/project-alpha", "https://github.com/example-org/project-alpha"],
    ["https://chatgpt.com:443/c/example-thread-alpha", "https://chatgpt.com/c/example-thread-alpha"],
  ])("accepts the https default port :443 as canonical (%s)", (input, canonical) => {
    const parsed = parseAllowedHttpsUrl(input, LAUNCHER_HOSTS);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
    expect(parsed.value.port).toBe("");
    expect(parsed.value.href).toBe(canonical);
  });

  it.each([
    "https://github.com:8443/example-org/project-alpha",
    "https://github.com:80/example-org/project-alpha",
    "https://chatgpt.com:444/c/example-thread-alpha",
    "https://github.com:0/example-org/project-alpha",
  ])("rejects a non-default explicit port: %s", (url) => {
    expect(parseAllowedHttpsUrl(url, LAUNCHER_HOSTS).ok).toBe(false);
  });

  it.each([
    "javascript:alert(1)",
    "file:///C:/Windows/System32/calc.exe",
    "http://github.com/example-org/project-alpha",
    "https://github.com@evil.example/",
    "https://user:pass@github.com/example-org/project-alpha",
    "https://evil.example/github.com",
    "https://github.com.evil.example/",
    "https://api.github.com/repos/x/y",
    "https://github.com:8443/example-org/project-alpha",
    "github.com/example-org/project-alpha",
    "",
  ])("rejects %s", (url) => {
    expect(parseAllowedHttpsUrl(url, LAUNCHER_HOSTS).ok).toBe(false);
  });

  it("keeps GitHub URLs out of the ChatGPT field", () => {
    expect(normalizeChatgptThreadUrl("https://github.com/example-org/project-alpha").ok).toBe(false);
    expect(CHATGPT_HOSTS).not.toContain("github.com");
  });
});

describe("normalizeRepositoryUrl", () => {
  it("normalizes owner/repo URLs", () => {
    expect(normalizeRepositoryUrl("https://github.com/example-org/project-alpha/")).toEqual({
      ok: true,
      value: "https://github.com/example-org/project-alpha",
    });
    expect(normalizeRepositoryUrl(" https://github.com/example-org/project-alpha.git ")).toEqual({
      ok: true,
      value: "https://github.com/example-org/project-alpha",
    });
  });

  it.each([
    "https://github.com/example-org",
    "https://github.com/example-org/project-alpha/pull/1",
    "https://github.com/example-org/project-alpha?tab=readme",
    "https://gitlab.com/example-org/project-alpha",
  ])("rejects %s", (url) => {
    expect(normalizeRepositoryUrl(url).ok).toBe(false);
  });
});

describe("scalar validators", () => {
  it("normalizes HEAD SHAs", () => {
    expect(normalizeHead(" ABCDEF1 ")).toEqual({ ok: true, value: "abcdef1" });
    expect(normalizeHead("abc").ok).toBe(false);
    expect(normalizeHead("g123456").ok).toBe(false);
    expect(normalizeHead("0".repeat(41)).ok).toBe(false);
  });

  it("parses PR numbers", () => {
    expect(parsePrNumber("45")).toEqual({ ok: true, value: 45 });
    for (const bad of ["0", "-1", "4.5", "#45", "045", ""]) expect(parsePrNumber(bad).ok).toBe(false);
  });

  it("accepts only absolute drive paths for local roots", () => {
    expect(normalizeLocalRoot("C:\\example\\project-alpha").ok).toBe(true);
    expect(normalizeLocalRoot("d:/example/project").ok).toBe(true);
    for (const bad of ["\\\\server\\share", "//server/share", "relative\\path", "C:relative", ""]) {
      expect(normalizeLocalRoot(bad).ok).toBe(false);
    }
  });

  it("suggests project ids", () => {
    expect(suggestProjectId("Project Alpha")).toBe("project-alpha");
    expect(suggestProjectId("  Élan  v2 ")).toBe("elan-v2");
    expect(suggestProjectId("日本語")).toBe("");
  });

  it("generates review ids in the rv-YYYYMMDD-xxxxxx format", () => {
    const id = generateReviewId(new Date("2026-09-17T23:59:00Z"), () => 0);
    expect(id).toBe("rv-20260917-aaaaaa");
    const random = generateReviewId(new Date("2026-01-02T00:00:00Z"));
    expect(isValidReviewId(random)).toBe(true);
    expect(random.startsWith("rv-20260102-")).toBe(true);
  });
});
