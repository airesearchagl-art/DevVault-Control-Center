import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REVIEW_EVENT_TYPES } from "../domain/events";
import { FRESHNESS_STATES } from "../domain/freshness";
import { GIT_STATUSES } from "../domain/git";
import { RESOURCE_STATES, REVIEW_STATES, VERDICTS } from "../domain/states";
import { en } from "./en";
import {
  createTranslator,
  EVENT_TYPE_KEYS,
  formatParts,
  formatTimestamp,
  FRESHNESS_KEYS,
  GIT_STATUS_KEYS,
  RESOURCE_HINT_KEYS,
  RESOURCE_STATE_KEYS,
  REVIEW_STATE_KEYS,
  VERDICT_KEYS,
} from "./index";
import { ja } from "./ja";
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALES,
  LOCALE_NATIVE_NAMES,
} from "./locale";

/**
 * Translation parity gate (Localization Foundation v0.2.1): Japanese and English must describe
 * exactly the same interface. A missing key already fails to compile — these tests cover what the
 * compiler cannot see: blanks, duplicates, placeholder drift and untranslated copies.
 */

const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/g;
const placeholders = (text: string): string[] =>
  [...text.matchAll(PLACEHOLDER)].map((match) => match[1]).sort();

/** Keys whose value is intentionally identical in both languages (names, glyphs, file names). */
const SHARED_VALUES = new Set([
  "health.reason.text",
  "schema.session.threadUrl",
  "app.name",
  "app.subtitle",
  "app.dataDir.envTag",
  "queue.item.prRound",
  "detail.header.pr",
  "detail.field.pr",
  "detail.field.threadUrl",
  "detail.field.ide",
  "detail.value.prNumber",
  "detail.value.round",
  "detail.checkpoint.file",
  "detail.events.file",
  "detail.events.stateChange",
  "detail.events.noState",
  "detail.events.note",
  "detail.truncated",
  "git.branch.detached",
  "freshness.shortHeadUnknown",
  "review.verdict.separator",
  "notice.label.projects",
  "time.unknown",
]);

describe("locales", () => {
  it("offers Japanese and English, with Japanese as the default", () => {
    expect([...LOCALES]).toEqual(["ja", "en"]);
    expect(DEFAULT_LOCALE).toBe("ja");
    expect(LOCALE_NATIVE_NAMES.ja).toBe("日本語");
    expect(LOCALE_NATIVE_NAMES.en).toBe("English");
  });

  it("recognizes only supported locales", () => {
    expect(isLocale("ja")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("JA")).toBe(false);
    expect(isLocale("de")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});

describe("translation parity", () => {
  it("has the same key set in both dictionaries", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ja).sort());
  });

  it("has no empty or whitespace-only translation", () => {
    for (const [dictionary, name] of [
      [ja, "ja"],
      [en, "en"],
    ] as const) {
      const blanks = Object.entries(dictionary)
        .filter(([, value]) => typeof value !== "string" || value.trim() === "")
        .map(([key]) => key);
      expect(blanks, `${name} has blank values`).toEqual([]);
    }
  });

  it("declares every key exactly once in the source files", () => {
    for (const file of ["ja.ts", "en.ts"]) {
      const source = readFileSync(
        new URL(`./${file}`, import.meta.url),
        "utf8",
      );
      const keys = [...source.matchAll(/^ {2}"([^"]+)":/gm)].map(
        (match) => match[1],
      );
      const duplicates = keys.filter(
        (key, index) => keys.indexOf(key) !== index,
      );
      expect(duplicates, `${file} declares a key twice`).toEqual([]);
    }
  });

  it("uses the same placeholders in both languages", () => {
    for (const key of Object.keys(ja) as (keyof typeof ja)[]) {
      expect(placeholders(en[key]), `placeholders differ for ${key}`).toEqual(
        placeholders(ja[key]),
      );
    }
  });

  it("actually translates everything that is not a shared name or glyph", () => {
    const untranslated = (Object.keys(ja) as (keyof typeof ja)[]).filter(
      (key) => ja[key] === en[key] && !SHARED_VALUES.has(key),
    );
    expect(
      untranslated,
      "these keys hold the same text in both languages",
    ).toEqual([]);
  });

  it("keeps a plural variant in both dictionaries when one language needs it", () => {
    const variants = Object.keys(ja).filter((key) => key.endsWith("_one"));
    expect(variants.length).toBeGreaterThan(0);
    for (const variant of variants) {
      const base = variant.slice(0, -"_one".length);
      expect(Object.keys(ja)).toContain(base);
      expect(Object.keys(en)).toContain(base);
    }
  });
});

describe("every persisted value has a label in both languages", () => {
  it("covers review states, resource states, verdicts, freshness, Git status and event types", () => {
    const groups = [
      [REVIEW_STATES, REVIEW_STATE_KEYS],
      [RESOURCE_STATES, RESOURCE_STATE_KEYS],
      [RESOURCE_STATES, RESOURCE_HINT_KEYS],
      [VERDICTS, VERDICT_KEYS],
      [FRESHNESS_STATES, FRESHNESS_KEYS],
      [GIT_STATUSES, GIT_STATUS_KEYS],
      [REVIEW_EVENT_TYPES, EVENT_TYPE_KEYS],
    ] as const;
    for (const [values, keys] of groups) {
      for (const value of values) {
        const key = (keys as Record<string, keyof typeof ja>)[value];
        expect(key, `no label key for ${value}`).toBeDefined();
        expect(ja[key]).toBeTruthy();
        expect(en[key]).toBeTruthy();
      }
    }
  });
});

describe("createTranslator", () => {
  it("returns the text of the requested language", () => {
    expect(createTranslator("ja")("app.actions.reload")).toBe("再読み込み");
    expect(createTranslator("en")("app.actions.reload")).toBe("Reload");
  });

  it("substitutes named parameters", () => {
    expect(
      createTranslator("en")("toast.projectCreated", { name: "Project Alpha" }),
    ).toBe("Project “Project Alpha” created");
    expect(
      createTranslator("ja")("toast.projectCreated", { name: "Project Alpha" }),
    ).toBe("プロジェクト「Project Alpha」を作成しました");
  });

  it("leaves a placeholder alone when no value was supplied", () => {
    expect(createTranslator("en")("toast.projectCreated")).toBe(
      "Project “{name}” created",
    );
    expect(
      createTranslator("en")("toast.projectCreated", { other: "x" }),
    ).toContain("{name}");
  });

  it("uses the singular variant for a count of one in English only", () => {
    const english = createTranslator("en");
    expect(english("toast.gitRefreshedAll", { count: 1 })).toBe(
      "Git state refreshed for 1 project.",
    );
    expect(english("toast.gitRefreshedAll", { count: 3 })).toBe(
      "Git state refreshed for 3 projects.",
    );
    const japanese = createTranslator("ja");
    expect(japanese("toast.gitRefreshedAll", { count: 1 })).toBe(
      "1件のプロジェクトのGit状態を更新しました。",
    );
    expect(japanese("toast.gitRefreshedAll", { count: 3 })).toBe(
      "3件のプロジェクトのGit状態を更新しました。",
    );
  });
});

describe("formatParts", () => {
  it("splits a sentence around the placeholders that carry markup", () => {
    const parts = formatParts("Fix or restore {file} in the data folder.", {
      file: "NODE",
    });
    expect(parts).toEqual(["Fix or restore ", "NODE", " in the data folder."]);
  });

  it("keeps Japanese word order, where the marked-up part comes first", () => {
    const parts = formatParts(
      "データフォルダ内の {file} を修正してください。",
      { file: "NODE" },
    );
    expect(parts).toEqual([
      "データフォルダ内の ",
      "NODE",
      " を修正してください。",
    ]);
  });

  it("leaves placeholders it was given no node for", () => {
    expect(formatParts("a {x} b", {})).toEqual(["a {x} b"]);
  });
});

describe("formatTimestamp", () => {
  const iso = new Date(2026, 8, 20, 14, 5).toISOString();

  it("uses the locale's own pattern", () => {
    expect(formatTimestamp(createTranslator("ja"), iso)).toBe(
      "2026/09/20 14:05",
    );
    expect(formatTimestamp(createTranslator("en"), iso)).toBe(
      "2026-09-20 14:05",
    );
  });

  it("shows a placeholder for no timestamp and passes an unparseable value through", () => {
    expect(formatTimestamp(createTranslator("ja"), null)).toBe("—");
    expect(formatTimestamp(createTranslator("en"), "not-a-date")).toBe(
      "not-a-date",
    );
  });
});
