import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseProjectsFile, parseSessionFile, type ParseResult } from "../domain/schema";
import { describeHealthProblem, loadAll } from "../services/persistence";
import { MemoryStorage } from "../test/memoryStorage";
import { createTranslator, translate } from ".";

/**
 * What the Human reads when a file cannot be used.
 *
 * These sentences are written by DVCC, reach a banner or the detail pane, and used to be English in
 * a Japanese interface. The field names, file names and the messages the storage layer reports stay
 * as they are: they are identifiers, not language.
 */

const ja = createTranslator("ja");
const en = createTranslator("en");

function malformed<T>(result: ParseResult<T>) {
  if (result.status !== "malformed") throw new Error(`expected malformed, got ${result.status}`);
  return result.reason;
}

describe("schema reasons", () => {
  it("says in Japanese that projects must be an array", () => {
    const reason = malformed(parseProjectsFile('{"schemaVersion":1,"projects":{}}'));
    expect(reason.key).toBe("schema.projects.mustBeArray");
    expect(translate(ja, reason)).toBe("projects は配列である必要があります");
    expect(translate(en, reason)).toBe("projects must be an array");
  });

  it("names the field without translating it", () => {
    const reason = malformed(parseSessionFile('{"schemaVersion":1,"reviewSessionId":"rv-20260101-alpha1","projectId":"Not An Id"}', "rv-20260101-alpha1"));
    expect(reason.key).toBe("schema.session.invalidProjectId");
    expect(translate(ja, reason)).toBe("session.projectId は有効なプロジェクトIDではありません");
    expect(translate(en, reason)).toBe("session.projectId is not a valid project id");
  });

  it("keeps a field path as it is inside a Japanese sentence", () => {
    const reason = malformed(parseProjectsFile('{"schemaVersion":1,"projects":[{"projectId":"alpha"}]}'));
    expect(reason.params?.field).toBe("projects[0].displayName");
    expect(translate(ja, reason)).toContain("projects[0].displayName");
    expect(translate(ja, reason)).not.toMatch(/must be/);
  });

  it("carries the reason of a rejected thread URL through as its own message", () => {
    const session = {
      schemaVersion: 1,
      reviewSessionId: "rv-20260101-alpha1",
      projectId: "project-alpha",
      prNumber: null,
      reviewType: "PR review",
      reviewRound: 1,
      resourceState: "HOT",
      reviewState: "NEW",
      suspendedFrom: null,
      chatgptThreadTitle: null,
      chatgptThreadUrl: "http://chatgpt.com/c/x",
      nextAction: "",
      rounds: [{ round: 1, expectedHead: null, reviewedHead: null, requestSavedAt: null, resultCapturedAt: null, verdict: null, verdictConfirmedAt: null, verdictNote: null, archivedResults: [] }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const reason = malformed(parseSessionFile(JSON.stringify(session), "rv-20260101-alpha1"));
    expect(reason.key).toBe("schema.session.threadUrl");
    expect(reason.messageParams?.reason.key).toBe("validation.url.httpsOnly");
    expect(translate(ja, reason)).toBe("session.chatgptThreadUrl: https のURLのみ使用できます");
    expect(translate(en, reason)).toBe("session.chatgptThreadUrl: Only https URLs are allowed");
  });
});

describe("file health", () => {
  it("says in Japanese that a review has no session.json", async () => {
    const storage = new MemoryStorage();
    await storage.write({ kind: "projects" }, '{"schemaVersion":1,"projects":[]}');
    // A review folder that exists without its session.json: the history is there, the state is not.
    storage.files.set("reviews/rv-20260101-alpha1/events.jsonl", "");

    const loaded = await loadAll(storage);
    const problem = describeHealthProblem(loaded.reviews[0].health);
    if (!problem) throw new Error("expected a problem");
    expect(translate(ja, problem)).toBe("読み取れません: session.json がありません");
    expect(translate(en, problem)).toBe("could not be read: session.json is missing");
  });

  it("reports an unusable file and its unusable backup in one Japanese sentence", async () => {
    const storage = new MemoryStorage();
    storage.files.set("projects.json", "{{{");
    storage.files.set("projects.json.bak", "{{{");

    const loaded = await loadAll(storage);
    const problem = describeHealthProblem(loaded.projectsHealth);
    if (!problem) throw new Error("expected a problem");
    const sentence = translate(ja, problem);
    expect(sentence).toContain("バックアップも読み取れません");
    expect(sentence).not.toMatch(/backup is also/);
    expect(translate(en, problem)).toContain("the backup is also unreadable");
  });
});

describe("the sources that produce them", () => {
  /** A string literal that holds a sentence rather than a key, a path or a field name. */
  const LITERAL = /"([^"\\\n]*)"|'([^'\\\n]*)'/g;
  const KEY = /^[a-z][a-zA-Z]*(\.[a-zA-Z]+)+$/;

  it.each(["src/domain/schema.ts", "src/services/persistence.ts"])("%s holds no sentence of its own", (file) => {
    // Comments quote the words they explain; only the code is scanned.
    const source = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    const sentences: string[] = [];
    for (const [, double, single] of source.matchAll(LITERAL)) {
      const text = (double ?? single ?? "").trim();
      if (text === "" || KEY.test(text)) continue;
      // Two words made of letters, separated by a space: that is prose, not an identifier.
      if (/\p{Letter}+\s+\p{Letter}+/u.test(text)) sentences.push(text);
    }
    expect(sentences).toEqual([]);
  });
});
