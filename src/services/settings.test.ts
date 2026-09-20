import { describe, expect, it } from "vitest";
import type { Locale } from "../i18n/locale";
import { MemoryStorage } from "../test/memoryStorage";
import { createLocaleStore, loadSettings, parseSettings, saveLocale, serializeSettings } from "./settings";
import { SETTINGS_TARGET, StorageError, type StorageTarget, type WritePrecondition } from "./storage";

/**
 * Interface preferences: Japanese unless the Human chose otherwise, and a file that cannot be used
 * never stops the app, never guesses, and never touches project or review data.
 */

/** A backend whose writes take a scripted time and may fail, to pin down ordering and failure. */
class ScriptedStorage extends MemoryStorage {
  /** One entry per write attempt, in order. */
  readonly script: { delay: number; fail?: boolean }[] = [];
  /** The locale of every write that reached the file, in the order it landed. */
  readonly landed: string[] = [];

  override async write(target: StorageTarget, content: string, precondition?: WritePrecondition): Promise<void> {
    const step = this.script.shift() ?? { delay: 0 };
    if (step.delay > 0) await new Promise((resolve) => setTimeout(resolve, step.delay));
    if (step.fail) throw new StorageError("WRITE_FAILED", "injected write failure");
    await super.write(target, content, precondition);
    this.landed.push(String((JSON.parse(content) as { locale?: unknown }).locale));
  }
}

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
    ["a missing schema version", '{"locale":"en"}'],
    ["a schema version of the wrong type", '{"schemaVersion":"1","locale":"en"}'],
    ["a schema version of zero", '{"schemaVersion":0,"locale":"en"}'],
    ["a schema version from a later version of the app", '{"schemaVersion":2,"locale":"en"}'],
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
  it("accepts a known locale of this schema version and refuses anything else", () => {
    expect(parseSettings('{"schemaVersion":1,"locale":"ja"}')).toBe("ja");
    expect(parseSettings('{"locale":"en","schemaVersion":1}')).toBe("en");
    expect(parseSettings('{"schemaVersion":1,"locale":"fr"}')).toBeNull();
    // The version is not optional: without it nothing else in the file can be trusted to mean what
    // this version of the app reads it as.
    expect(parseSettings('{"locale":"ja"}')).toBeNull();
    expect(parseSettings('{"schemaVersion":2,"locale":"ja"}')).toBeNull();
    expect(parseSettings("null")).toBeNull();
    expect(parseSettings("")).toBeNull();
  });
});

describe("createLocaleStore", () => {
  it("reports the language that is stored after a successful write", async () => {
    const storage = new MemoryStorage();
    const store = createLocaleStore(storage, "ja");
    const result = await store.save("en");
    expect(result).toEqual({ ok: true, locale: "en", superseded: false });
    expect(store.persisted).toBe("en");
    expect((await loadSettings(storage)).locale).toBe("en");
  });

  it("keeps the stored language when the write fails, so the interface can go back to it", async () => {
    const storage = new ScriptedStorage();
    await saveLocale(storage, "en");
    const store = createLocaleStore(storage, "en");
    const projectsBefore = new Map(storage.files);

    storage.script.push({ delay: 0, fail: true });
    const result = await store.save("ja");

    expect(result.ok).toBe(false);
    expect(result.superseded).toBe(false);
    // What the interface must return to, and what the next start-up would restore.
    expect(result.locale).toBe("en");
    expect(result.error?.code).toBe("WRITE_FAILED");
    expect(store.persisted).toBe("en");
    expect((await loadSettings(storage)).locale).toBe("en");
    expect([...storage.files.entries()]).toEqual([...projectsBefore.entries()]);
  });

  it("does not take the interface back over a newer choice when an older write fails", async () => {
    const storage = new ScriptedStorage();
    const store = createLocaleStore(storage, "ja");

    // The first write is slow and fails; the second is made before it finishes and succeeds.
    storage.script.push({ delay: 30, fail: true }, { delay: 0 });
    const [failed, succeeded] = await Promise.all([store.save("en"), store.save("ja")]);

    expect(failed.ok).toBe(false);
    expect(failed.superseded).toBe(true);
    expect(succeeded).toEqual({ ok: true, locale: "ja", superseded: false });
    expect(store.persisted).toBe("ja");
    expect((await loadSettings(storage)).locale).toBe("ja");
  });

  it("leaves the last language chosen in the file however fast the switching is", async () => {
    const storage = new ScriptedStorage();
    const store = createLocaleStore(storage, "ja");

    // Descending durations: without serialization the first write would land last.
    storage.script.push({ delay: 40 }, { delay: 20 }, { delay: 5 }, { delay: 0 });
    const chosen: Locale[] = ["en", "ja", "en", "ja"];
    await Promise.all(chosen.map((locale) => store.save(locale)));

    expect(storage.landed).toEqual(chosen);
    const final = chosen[chosen.length - 1];
    expect(store.persisted).toBe(final);
    expect((await loadSettings(storage)).locale).toBe(final);
  });

  it("serializes writes made through saveLocale directly", async () => {
    const storage = new ScriptedStorage();
    storage.script.push({ delay: 30 }, { delay: 0 });
    await Promise.all([saveLocale(storage, "en"), saveLocale(storage, "ja")]);
    expect(storage.landed).toEqual(["en", "ja"]);
    expect((await loadSettings(storage)).locale).toBe("ja");
  });

  it("writes nothing but settings.json while the language is switched", async () => {
    const storage = new ScriptedStorage();
    await storage.write({ kind: "projects" }, '{"schemaVersion":1,"projects":[]}');
    const store = createLocaleStore(storage, "ja");

    storage.script.push({ delay: 10 }, { delay: 0, fail: true }, { delay: 0 });
    await Promise.all([store.save("en"), store.save("ja"), store.save("en")]);

    expect([...storage.files.keys()].sort()).toEqual(["projects.json", "settings.json", "settings.json.bak"]);
    expect(store.persisted).toBe("en");
  });
});
