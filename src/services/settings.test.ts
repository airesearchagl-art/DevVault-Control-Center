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
  /** What the app does: adopt what was loaded, then follow the Human's choices. */
  async function storeFor(storage: MemoryStorage) {
    const loaded = await loadSettings(storage);
    const store = createLocaleStore(storage, loaded.locale);
    store.adopt(loaded);
    return { store, loaded };
  }

  /**
   * The interface rule from `App`: follow the choice at once, and take it back to the language the
   * store reports when a write of the newest choice did not happen.
   */
  async function switchTo(store: ReturnType<typeof createLocaleStore>, locale: Locale): Promise<Locale> {
    const result = await store.save(locale);
    return !result.ok && !result.superseded ? result.locale : locale;
  }

  it("reports the language that is stored after a successful write", async () => {
    const storage = new MemoryStorage();
    const { store } = await storeFor(storage);
    const result = await store.save("en");
    expect(result).toEqual({ ok: true, locale: "en", superseded: false });
    expect(store.persisted).toBe("en");
    expect((await loadSettings(storage)).locale).toBe("en");
  });

  it("creates the file on the first choice of a fresh install", async () => {
    const storage = new MemoryStorage();
    const { store } = await storeFor(storage);
    expect(storage.files.has("settings.json")).toBe(false);
    await store.save("en");
    expect(JSON.parse(storage.files.get("settings.json") ?? "")).toEqual({ schemaVersion: 1, locale: "en" });
  });

  it.each([
    ["ja", "en"],
    ["en", "ja"],
  ] as const)("replaces a valid version 1 file (%s → %s)", async (from, to) => {
    const storage = new MemoryStorage();
    await storage.write(SETTINGS_TARGET, serializeSettings(from));
    const { store } = await storeFor(storage);
    expect(store.writable).toBe(true);

    const result = await store.save(to);
    expect(result.ok).toBe(true);
    expect((await loadSettings(storage)).locale).toBe(to);
  });

  it("keeps the stored language when the write fails, so the interface can go back to it", async () => {
    const storage = new ScriptedStorage();
    await storage.write(SETTINGS_TARGET, serializeSettings("en"));
    const { store } = await storeFor(storage);
    const before = new Map(storage.files);

    storage.script.push({ delay: 0, fail: true });
    const result = await store.save("ja");

    expect(result.ok).toBe(false);
    expect(result.refusal).toBe("write_failed");
    expect(result.superseded).toBe(false);
    // What the interface must return to, and what the next start-up would restore.
    expect(result.locale).toBe("en");
    expect(result.error?.code).toBe("WRITE_FAILED");
    expect(store.persisted).toBe("en");
    expect((await loadSettings(storage)).locale).toBe("en");
    expect([...storage.files.entries()]).toEqual([...before.entries()]);
  });

  it("leaves the last language chosen in the file however fast the switching is", async () => {
    const storage = new ScriptedStorage();
    const { store } = await storeFor(storage);

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
    const { store } = await storeFor(storage);

    storage.script.push({ delay: 10 }, { delay: 0, fail: true }, { delay: 0 });
    await Promise.all([store.save("en"), store.save("ja"), store.save("en")]);

    expect([...storage.files.keys()].sort()).toEqual(["projects.json", "settings.json", "settings.json.bak"]);
    expect(store.persisted).toBe("en");
  });

  describe("a file this version must not replace", () => {
    const unusable: [string, string][] = [
      ["a later schema version", '{"schemaVersion":2,"locale":"en"}'],
      ["a much later schema version with fields we do not know", '{"schemaVersion":99,"locale":"en","futureField":{"example":true}}'],
      ["a missing schema version", '{"locale":"en"}'],
      ["a schema version of the wrong type", '{"schemaVersion":"1","locale":"en"}'],
      ["a schema version of zero", '{"schemaVersion":0,"locale":"en"}'],
      ["content that is not JSON at all", "{{{"],
    ];

    it.each(unusable)("refuses to save over %s", async (_label, content) => {
      const storage = new MemoryStorage();
      // Written outside the storage API: content like this could only come from another program.
      storage.files.set("settings.json", content);
      await storage.write({ kind: "projects" }, '{"schemaVersion":1,"projects":[]}');
      const dataBefore = new Map(storage.files);

      const { store, loaded } = await storeFor(storage);
      expect(loaded.locale).toBe("ja");
      expect(loaded.problem).toBe("invalid");
      expect(store.writable).toBe(false);

      const result = await store.save("en");

      expect(result.ok).toBe(false);
      expect(result.refusal).toBe("blocked");
      expect(result.superseded).toBe(false);
      expect(result.locale).toBe("ja");
      expect(store.persisted).toBe("ja");
      // The file — and everything in it that this version does not know about — is untouched, and
      // no backup of it was created either.
      expect(storage.files.get("settings.json")).toBe(content);
      expect(storage.files.has("settings.json.bak")).toBe(false);
      expect([...storage.files.entries()]).toEqual([...dataBefore.entries()]);
    });

    it("stays refused however often the Human tries", async () => {
      const storage = new MemoryStorage();
      const future = '{"schemaVersion":2,"locale":"en","futureField":{"example":true}}';
      storage.files.set("settings.json", future);
      const { store } = await storeFor(storage);

      for (const locale of ["en", "ja", "en"] as const) {
        const result = await store.save(locale);
        expect(result.ok).toBe(false);
        expect(result.refusal).toBe("blocked");
      }
      expect(storage.files.get("settings.json")).toBe(future);
      expect(storage.files.has("settings.json.bak")).toBe(false);
    });

    it("refuses once the file has changed underneath, instead of overwriting the change", async () => {
      const storage = new MemoryStorage();
      await storage.write(SETTINGS_TARGET, serializeSettings("ja"));
      const { store } = await storeFor(storage);

      // Another program rewrites the file while DVCC is running.
      const foreign = '{"schemaVersion":2,"locale":"en"}';
      storage.files.set("settings.json", foreign);

      const result = await store.save("en");
      expect(result.ok).toBe(false);
      expect(result.refusal).toBe("blocked");
      expect(result.error?.code).toBe("CONFLICT");
      expect(store.writable).toBe(false);
      expect(storage.files.get("settings.json")).toBe(foreign);
    });

    it("never touches an unreadable file", async () => {
      const storage = new MemoryStorage();
      await storage.write(SETTINGS_TARGET, serializeSettings("en"));
      const content = storage.files.get("settings.json");
      storage.failingReads.set("settings.json", "IO_ERROR");

      const { store, loaded } = await storeFor(storage);
      expect(loaded.problem).toBe("unreadable");
      expect(store.writable).toBe(false);

      const result = await store.save("ja");
      expect(result.refusal).toBe("blocked");
      expect(storage.files.get("settings.json")).toBe(content);
    });
  });

  describe("which choice decides", () => {
    it("does not take the interface back over a newer choice when an older write fails", async () => {
      const storage = new ScriptedStorage();
      const { store } = await storeFor(storage);

      // The first write is slow and fails; the second is made before it finishes and succeeds.
      storage.script.push({ delay: 30, fail: true }, { delay: 0 });
      const [failed, succeeded] = await Promise.all([store.save("en"), store.save("ja")]);

      expect(failed.ok).toBe(false);
      expect(failed.superseded).toBe(true);
      expect(succeeded).toEqual({ ok: true, locale: "ja", superseded: false });
      expect(store.persisted).toBe("ja");
      expect((await loadSettings(storage)).locale).toBe("ja");
    });

    it("tells the same language apart from an older request for it", async () => {
      const storage = new ScriptedStorage();
      const { store } = await storeFor(storage);

      // ja → en (fails, slow) → ja (succeeds): the failure must not pull the interface off ja,
      // even though the language it asked for is not the newest one and the newest one is ja.
      storage.script.push({ delay: 30, fail: true }, { delay: 0 });
      const [failed, succeeded] = await Promise.all([store.save("en"), store.save("ja")]);
      expect(failed.superseded).toBe(true);
      expect(succeeded.ok).toBe(true);

      // …and the same request made again afterwards is a new one, not the superseded old one.
      storage.script.push({ delay: 0, fail: true });
      const later = await store.save("en");
      expect(later.ok).toBe(false);
      expect(later.superseded).toBe(false);
      expect(later.locale).toBe("ja");
    });

    it("does not roll back to an older language while the newest choice is still in flight", async () => {
      const storage = new ScriptedStorage();
      const { store } = await storeFor(storage);
      // The Human clicks three times before the first write finishes; the first one fails, and it
      // asked for the same language as the last one — which is exactly what makes comparing
      // languages, rather than requests, get this wrong.
      storage.script.push({ delay: 20, fail: true }, { delay: 0 }, { delay: 0 });

      let ui: Locale = "ja";
      const choose = (locale: Locale) => {
        ui = locale;
        return store.save(locale).then((result) => {
          if (!result.ok && !result.superseded) ui = result.locale;
          return result;
        });
      };

      const [failed] = await Promise.all([choose("en"), choose("ja"), choose("en")]);

      expect(failed.ok).toBe(false);
      expect(failed.superseded).toBe(true);
      expect(store.persisted).toBe("en");
      expect((await loadSettings(storage)).locale).toBe("en");
      expect(ui).toBe("en");
    });

    it.each([
      ["ja → en → ja", ["en", "ja"], [false, false]],
      ["ja → en → ja → en", ["en", "ja", "en"], [false, false, false]],
      ["a failed en, then ja", ["en", "ja"], [true, false]],
      ["a failed en, then ja, then en", ["en", "ja", "en"], [true, false, false]],
      ["a failed en, then en again", ["en", "en"], [true, false]],
      ["a failed en, then ja, then a failed en", ["en", "ja", "en"], [true, false, true]],
    ] as [string, Locale[], boolean[]][])("ends with the screen and the file agreeing (%s)", async (_label, sequence, failures) => {
      const storage = new ScriptedStorage();
      const { store } = await storeFor(storage);
      for (const fail of failures) storage.script.push({ delay: 0, fail });

      let ui: Locale = "ja";
      for (const locale of sequence) ui = await switchTo(store, locale);

      const onDisk = await loadSettings(storage);
      expect(ui).toBe(store.persisted);
      expect(ui).toBe(onDisk.locale);
    });
  });
});
