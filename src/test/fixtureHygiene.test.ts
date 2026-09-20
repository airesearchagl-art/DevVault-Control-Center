import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Repository hygiene for synthetic data (AC-15 / Privacy hard check): fixtures and docs must
 * not contain user-specific absolute paths, real ChatGPT thread URLs, non-example GitHub
 * repositories or secrets.
 */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCANNED_DIRS = ["fixtures", "docs"];

const FORBIDDEN: { name: string; pattern: RegExp }[] = [
  { name: "user profile path", pattern: /[a-z]:(\\\\|\\|\/)+users(\\\\|\\|\/)+/i },
  { name: "real ChatGPT thread URL", pattern: /(chatgpt\.com|chat\.openai\.com)\/(c|g|share)\/(?!example-)/i },
  { name: "non-example GitHub repository", pattern: /github\.com\/(?!example-org\/)[A-Za-z0-9-]+/i },
  { name: "GitHub token", pattern: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: "OpenAI / Anthropic key", pattern: /\bsk-(ant-)?[A-Za-z0-9_-]{20,}/ },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("synthetic fixture hygiene", () => {
  const files = SCANNED_DIRS.flatMap((dir) => walk(join(REPO_ROOT, dir)));

  it("scans at least the committed fixtures", () => {
    expect(files.some((file) => file.endsWith("projects.json"))).toBe(true);
  });

  for (const file of files) {
    it(`${relative(REPO_ROOT, file).replaceAll("\\", "/")} is clean`, () => {
      const text = readFileSync(file, "utf8");
      const hits = FORBIDDEN.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name);
      expect(hits).toEqual([]);
    });
  }

  it("the detector itself catches forbidden samples", () => {
    const samples = [
      "C:\\Users\\someone\\project",
      "C:\\\\Users\\\\someone",
      "https://chatgpt.com/c/68a1b2c3-real-thread",
      "https://github.com/some-private-org/app",
      `ghp_${"a".repeat(36)}`,
    ];
    for (const sample of samples) {
      expect(FORBIDDEN.some(({ pattern }) => pattern.test(sample)), sample).toBe(true);
    }
  });
});
