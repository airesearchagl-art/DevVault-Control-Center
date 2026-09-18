import { describe, expect, it } from "vitest";
import { createSerialQueue } from "./serialQueue";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("createSerialQueue", () => {
  it("runs tasks in enqueue order even when earlier tasks are slower", async () => {
    const run = createSerialQueue();
    const log: string[] = [];
    const task = (name: string, ms: number) => async () => {
      log.push(`start ${name}`);
      await sleep(ms);
      log.push(`end ${name}`);
      return name;
    };
    const results = await Promise.all([run(task("a", 15)), run(task("b", 1)), run(task("c", 5))]);
    expect(results).toEqual(["a", "b", "c"]);
    expect(log).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
  });

  it("keeps running later tasks after a failure", async () => {
    const run = createSerialQueue();
    const failing = run(async () => {
      throw new Error("boom");
    });
    const next = run(async () => "still runs");
    await expect(failing).rejects.toThrow("boom");
    await expect(next).resolves.toBe("still runs");
  });
});
