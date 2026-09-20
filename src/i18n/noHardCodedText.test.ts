import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The gate behind the rule: user-facing strings live in `src/i18n`.
 *
 * It reads every component under the three directories that render, and looks in the two places a
 * forgotten sentence shows up: text written straight into JSX, and the attributes a Human reads.
 * Anything it finds must either come from `t(...)` or be on the list below — which is deliberately
 * short, and is exactly the set of things that are not language: file names and their fragments,
 * key names, punctuation and glyphs.
 */

const RENDERING_DIRECTORIES = ["src/app", "src/components", "src/features"];

/** Not words: file names and their fragments, keyboard keys, punctuation and separators. */
const NOT_LANGUAGE = new Set([
  "projects.json",
  "session.json",
  "reviews/",
  "/session.json",
  "result-r",
  ".md",
  "-previous-….md",
  "Ctrl",
  "V",
  "+",
  "×",
  "·",
  "—",
  "…",
  "∅",
  "[",
  "]",
  "(",
  ")",
  "/",
  "→",
  "….corrupt-…",
]);

function componentFiles(): string[] {
  const out: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith(".tsx")) out.push(path);
    }
  };
  for (const directory of RENDERING_DIRECTORIES) walk(directory);
  return out;
}

/** Text between two tags, on one line, that is not an expression. */
const JSX_TEXT = />([^<>{}\n]+)</g;

/**
 * A generic type annotation (`): Promise<T>`) looks exactly like JSX text to the pattern above, so
 * anything carrying code punctuation is skipped. A sentence that needs a colon or parentheses is
 * therefore not caught here — the compile-time key type and the parity test are the gates for that;
 * this one catches the plain sentence someone typed into a component in a hurry.
 */
const CODE_PUNCTUATION = /[(){};:=|]/;

/** The attributes whose value a Human reads. `title` doubles as the native tooltip. */
const TEXT_ATTRIBUTE = /\s(?:placeholder|title|aria-label|label|hint|confirmLabel|reasonLabel|alt)="([^"]*)"/g;

function findings(rawSource: string): string[] {
  // An arrow ends in `>` and a return type often begins with a generic, which together look like a
  // tag around the type name; the arrow is not JSX, so it is taken out of the way first.
  const source = rawSource.replaceAll("=>", "**");
  const found: string[] = [];
  for (const [, text] of source.matchAll(JSX_TEXT)) {
    const trimmed = text.trim();
    if (trimmed === "" || NOT_LANGUAGE.has(trimmed)) continue;
    if (!/\p{Letter}/u.test(trimmed) || CODE_PUNCTUATION.test(trimmed)) continue;
    found.push(trimmed);
  }
  for (const [, value] of source.matchAll(TEXT_ATTRIBUTE)) {
    const trimmed = value.trim();
    if (trimmed === "" || NOT_LANGUAGE.has(trimmed)) continue;
    if (!/\p{Letter}/u.test(trimmed)) continue;
    found.push(trimmed);
  }
  return found;
}

describe("no hard-coded user-facing text", () => {
  const files = componentFiles();

  it("finds the components to check", () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it.each(componentFiles())("%s renders only translated text", (file) => {
    expect(findings(readFileSync(file, "utf8"))).toEqual([]);
  });

  it("would notice a sentence written straight into a component", () => {
    // A guard for the guard: the shapes it must keep catching.
    expect(findings("<p>Nothing was changed.</p>")).toEqual(["Nothing was changed."]);
    expect(findings('<input placeholder="Filter reviews" />')).toEqual(["Filter reviews"]);
    expect(findings('<button aria-label="Close dialog">×</button>')).toEqual(["Close dialog"]);
    // And the shapes it must not: a translated call, an expression, a file name.
    expect(findings("<p>{t(\"app.fatal.body\")}</p>")).toEqual([]);
    expect(findings('<input placeholder={t("queue.filter.placeholder")} />')).toEqual([]);
    expect(findings("<code>projects.json</code>")).toEqual([]);
  });
});
