import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../test/memoryStorage";
import { loadSettings, parseSettings, saveLocale, serializeSettings } from "./settings";
import { SETTINGS_TARGET } from "./storage";

/**
 * Interface preferences: Japanese unless the Human chose otherwise, and a file that cannot be used
 * never stops the app, never guesses, and never touches project or review data.
 */

describe("loadSettings", () => {
  it("uses Japanese when the file does not exist (fresh install)", async () => {
    const storage = new MemoryStorage();
    await expect(loadSettings(storage)).resolves.toEqual({ locale: "ja", problem: null, raw: null });
  });

  it("returns the stored locale", async () => {
    const storage = new MemoryStorage();
    await storage.write(SETTINGS_TARGET, serializeSettings("en"));
    const loaded = await loadSettings(storage);
    expect(loaded.locale).toBe("en");
    expect(loaded.problem).toBeNull();
  });

  it.each([
    ["not json at all", "{{{"],
    ["an array", "[]"],
    ["a missing locale", '{"schemaVersion":1}'],
    ["an unknown locale", '{"schemaVersion":1,"locale":"de"}'],
    ["a locale of the wrong type", '{"schemaVersion":1,"locale":2}'],
  ])("falls back to Japanese and reports %s", async (_label, content) => {
    const storage = new MemoryStorage();
    // Written outside the storage API: content this unusable could only come from another program.
    storage.files.set("settings.json", content);
    const loaded = await loadSettings(storage);
    expect(loaded.locale).toBe("ja");
    expect(loaded.problem).toBe("invalid");
    // The unusable file is left exactly as it was.
    expect(storage.files.get("settings.json")).toBe(content);
  });

  it("falls back to Japanese when the file cannot be read at all", async () => {
    const storage = new MemoryStorage();
    await storage.write(SETTINGS_TARGET, serializeSettings("en"));
    storage.failingReads.set("settings.json", "IO_ERROR");
    const loaded = await loadSettings(storage);
    expect(loaded).toEqual({ locale: "ja", problem: "unreadable", raw: null });
  });

  it("reads no other file", async () => {
    const storage = new MemoryStorage();
    await storage.write(SETTINGS_TARGET, serializeSettings("en"));
    await storage.write({ kind: "projects" }, '{"schemaVersion":1,"projects":[]}');
    const before = new Map(storage.files);
    await loadSettings(storage);
    expect([...storage.files.entries()]).toEqual([...before.entries()]);
  });
});

describe("saveLocale", () => {
  it("writes only settings.json and round-trips the choice", async () => {
    const storage = new MemoryStorage();
    await storage.write({ kind: "projects" }, '{"schemaVersion":1,"projects":[]}');
    const projectsBefore = storage.files.get("projects.json");

    await saveLocale(storage, "en");
    expect((await loadSettings(storage)).locale).toBe("en");

    await saveLocale(storage, "ja");
    expect((await loadSettings(storage)).locale).toBe("ja");

    expect(storage.files.get("projects.json")).toBe(projectsBefore);
    expect([...storage.files.keys()].filter((path) => path !== "projects.json").sort()).toEqual([
      "settings.json",
      "settings.json.bak",
    ]);
  });

  it("stores a readable JSON document with the schema version", async () => {
    const storage = new MemoryStorage();
    await saveLocale(storage, "en");
    const written = storage.files.get("settings.json") ?? "";
    expect(JSON.parse(written)).toEqual({ schemaVersion: 1, locale: "en" });
    expect(written.endsWith("\n")).toBe(true);
  });
});

describe("parseSettings", () => {
  it("accepts a known locale and refuses anything else", () => {
    expect(parseSettings('{"locale":"ja"}')).toBe("ja");
    expect(parseSettings('{"locale":"en","schemaVersion":1}')).toBe("en");
    expect(parseSettings('{"locale":"fr"}')).toBeNull();
    expect(parseSettings("null")).toBeNull();
    expect(parseSettings("")).toBeNull();
  });
});
