import { describe, expect, it } from "vitest";
import { ELLIPSIS, sessionIdLabels } from "./sessionIdLabels";

/**
 * DF-03 (LRP-20260929-DVCC-007). Every ID here is synthetic: UUIDv7-shaped (a 48-bit millisecond
 * timestamp leads the ID, so IDs created close together share their first 8 hex characters) — the
 * pattern observed in the post-merge dogfood, without copying any real session ID.
 */

/** A UUIDv7-shaped ID: timestamp-first hex, version nibble 7, variant nibble 8. */
function uuid7(ms: number, tail: number): string {
  const ts = ms.toString(16).padStart(12, "0");
  const rand = tail.toString(16).padStart(19, "0");
  return `${ts.slice(0, 8)}-${ts.slice(8, 12)}-7${rand.slice(0, 3)}-8${rand.slice(3, 6)}-${rand.slice(6, 18)}`;
}

function assertUnique(labels: Map<string, string>) {
  expect(new Set(labels.values()).size).toBe(labels.size);
}

describe("sessionIdLabels", () => {
  it("defaults to <first 8>…<last 8>", () => {
    const id = uuid7(0x019c1a2b3c4d, 0xabc);
    expect(sessionIdLabels([id]).get(id)).toBe(`${id.slice(0, 8)}${ELLIPSIS}${id.slice(-8)}`);
  });

  it("keeps a short ID readable in full", () => {
    expect(sessionIdLabels(["t-1"]).get("t-1")).toBe("t-1");
    expect(sessionIdLabels(["0123456789abcdef0"]).get("0123456789abcdef0")).toBe("0123456789abcdef0");
  });

  it("IDs sharing their first 8 characters (same time bucket) display distinctly", () => {
    const base = 0x019c1a2b0000; // start of one 65,536 ms bucket: the first 8 hex chars stay equal within it
    const ids = [uuid7(base, 1), uuid7(base + 5, 2), uuid7(base + 900, 3), uuid7(base + 60_000, 4)];
    expect(new Set(ids.map((id) => id.slice(0, 8))).size).toBe(1); // the dogfood collision shape
    const labels = sessionIdLabels(ids);
    assertUnique(labels);
    for (const id of ids) expect(labels.get(id)).not.toBe(`${id.slice(0, 8)}${ELLIPSIS}`);
  });

  it("widens both sides deterministically when prefix AND suffix collide", () => {
    const a = "aaaaaaaa-1111-7000-8000-bbbbbbbbbbbb";
    const b = "aaaaaaaa-2222-7000-8000-bbbbbbbbbbbb";
    const labels = sessionIdLabels([a, b]);
    assertUnique(labels);
    // 8 -> 12 characters kept on each side separates them.
    expect(labels.get(a)).toBe(`aaaaaaaa-111${ELLIPSIS}bbbbbbbbbbbb`);
    expect(labels.get(b)).toBe(`aaaaaaaa-222${ELLIPSIS}bbbbbbbbbbbb`);
  });

  it("falls back to the full ID when no abbreviation can separate them", () => {
    const a = "x".repeat(20) + "A" + "x".repeat(20);
    const b = "x".repeat(20) + "B" + "x".repeat(20);
    const labels = sessionIdLabels([a, b]);
    expect(labels.get(a)).toBe(a);
    expect(labels.get(b)).toBe(b);
  });

  it("an unaffected ID keeps the short default label while colliding ones widen", () => {
    const a = "aaaaaaaa-1111-7000-8000-bbbbbbbbbbbb";
    const b = "aaaaaaaa-2222-7000-8000-bbbbbbbbbbbb";
    const c = uuid7(0x0000deadbeef, 7);
    const labels = sessionIdLabels([a, b, c]);
    expect(labels.get(c)).toBe(`${c.slice(0, 8)}${ELLIPSIS}${c.slice(-8)}`);
    assertUnique(labels);
  });

  it("is deterministic and order-independent; duplicate inputs map to one label", () => {
    const ids = [uuid7(0x019c1a2b3c4d, 1), uuid7(0x019c1a2b3c4e, 2), "aaaaaaaa-1111-7000-8000-bbbbbbbbbbbb", "aaaaaaaa-2222-7000-8000-bbbbbbbbbbbb"];
    const first = sessionIdLabels(ids);
    const reversed = sessionIdLabels([...ids].reverse());
    const again = sessionIdLabels([...ids, ids[0]]);
    for (const id of ids) {
      expect(reversed.get(id)).toBe(first.get(id));
      expect(again.get(id)).toBe(first.get(id));
    }
  });

  it("never produces duplicate visible labels (seeded bulk check, time-clustered IDs)", () => {
    let seed = 12345;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31);
    for (let round = 0; round < 25; round++) {
      const ids: string[] = [];
      const bucket = 0x019c00000000 + round * 1_000_000;
      for (let i = 0; i < 60; i++) ids.push(uuid7(bucket + (next() % 70_000), next() % 4096));
      // adversarial neighbours: same prefix and same last 8
      ids.push(`${ids[0].slice(0, 20)}ffff-${ids[0].slice(-12)}`);
      assertUnique(sessionIdLabels(ids));
    }
  });

  it("real-shape regression: the dogfood pattern (≈379 IDs, 8-char prefix groups of up to 4) is fully distinct", () => {
    const ids: string[] = [];
    let ms = 0x019b80000000;
    for (let i = 0; i < 379; i++) {
      ms += i % 5 === 0 ? 70_000 : 3_000; // bursts inside one 8-hex-char (~65 s) bucket
      ids.push(uuid7(ms, (i * 7919) % 0xfffff));
    }
    const prefixGroups = new Map<string, number>();
    for (const id of ids) prefixGroups.set(id.slice(0, 8), (prefixGroups.get(id.slice(0, 8)) ?? 0) + 1);
    expect(Math.max(...prefixGroups.values())).toBeGreaterThan(1); // the collision actually exists
    const labels = sessionIdLabels(ids);
    assertUnique(labels);
    for (const id of ids) expect(labels.get(id)!.includes(ELLIPSIS)).toBe(true); // still abbreviated
  });
});
