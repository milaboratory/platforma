import { describe, expect, it } from "vitest";
import { MAX_BATCH_ENTRIES, readBatch, succeededEntry } from "./batch";
import type { BatchEntry } from "./batch";
import { failedEntry } from "./unreadable";

type Envelope = { isError?: boolean; content: { text: string }[] };

function errorText(result: unknown): string {
  const r = result as Envelope;
  expect(r.isError).toBe(true);
  return r.content[0].text;
}

function entries(result: unknown): Record<string, BatchEntry> {
  const r = result as Envelope;
  expect(r.isError).not.toBe(true);
  return JSON.parse(r.content[0].text);
}

function ids(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `block-${i}`);
}

describe("readBatch refuses a bad list before reading anything", () => {
  it("refuses a list longer than the maximum, naming the count and the maximum", async () => {
    let called = 0;
    const result = await readBatch(ids(MAX_BATCH_ENTRIES + 1), async () => {
      called++;
      return succeededEntry(null);
    });
    const text = errorText(result);
    expect(text).toContain(String(MAX_BATCH_ENTRIES + 1));
    expect(text).toContain(String(MAX_BATCH_ENTRIES));
    expect(called).toBe(0);
  });

  it("refuses an empty list", async () => {
    let called = 0;
    const result = await readBatch([], async () => {
      called++;
      return succeededEntry(null);
    });
    expect(errorText(result)).toMatch(/empty/);
    expect(called).toBe(0);
  });

  it("refuses a list naming one id twice, naming that id", async () => {
    let called = 0;
    const result = await readBatch(["a", "b", "a"], async () => {
      called++;
      return succeededEntry(null);
    });
    expect(errorText(result)).toContain("a");
    expect(called).toBe(0);
  });

  it("reads a list at exactly the maximum, so the refusal is over and not at it", async () => {
    const result = await readBatch(ids(MAX_BATCH_ENTRIES), async (id) => succeededEntry(id));
    expect(Object.keys(entries(result))).toHaveLength(MAX_BATCH_ENTRIES);
  });
});

describe("readBatch reads each id once, in order", () => {
  it("returns one entry per id holding what its read produced", async () => {
    const result = await readBatch(["a", "b", "c"], async (id) => succeededEntry(`${id}-value`));
    expect(entries(result)).toEqual({
      a: { ok: true, value: "a-value" },
      b: { ok: true, value: "b-value" },
      c: { ok: true, value: "c-value" },
    });
  });

  it("calls the read once per id, in the order sent", async () => {
    const seen: string[] = [];
    await readBatch(["c", "a", "b"], async (id) => {
      seen.push(id);
      return succeededEntry(null);
    });
    expect(seen).toEqual(["c", "a", "b"]);
  });

  it("starts the second read only after the first has settled", async () => {
    const events: string[] = [];
    await readBatch(["a", "b"], async (id) => {
      events.push(`start ${id}`);
      await new Promise((r) => setTimeout(r, 5));
      events.push(`end ${id}`);
      return succeededEntry(null);
    });
    expect(events).toEqual(["start a", "end a", "start b", "end b"]);
  });

  it("turns a thrown read into that id's failed entry and keeps the others", async () => {
    const result = await readBatch(["a", "b", "c"], async (id) => {
      if (id === "b") throw new Error("boom");
      return succeededEntry(id);
    });
    const got = entries(result);
    expect(got.a).toEqual({ ok: true, value: "a" });
    expect(got.c).toEqual({ ok: true, value: "c" });
    expect(got.b).toMatchObject({ ok: false });
    expect((got.b as { error: string }).error).toMatch(/Reading the block failed: boom/);
  });
});

describe("the two wrappers shape one pair two ways", () => {
  it("turns a pair into an entry whose ok is false, carrying both sentences", () => {
    const entry = failedEntry({ message: "m", hint: "h" });
    expect(entry).toEqual({ ok: false, error: "m", hint: "h" });
  });
});
