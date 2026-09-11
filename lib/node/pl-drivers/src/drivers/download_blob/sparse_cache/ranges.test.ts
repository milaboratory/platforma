import { Ranges, normalizeRanges, readRangesFile, rangesFileName } from "./ranges";
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { ConsoleLoggerAdapter } from "@milaboratories/ts-helpers";
import { CorruptedRangesError } from "./cache";

describe("normalizeRanges", () => {
  const cases: { name: string; input: Ranges; expected: Ranges }[] = [
    {
      name: "empty ranges",
      input: { ranges: [] },
      expected: { ranges: [] },
    },
    {
      name: "single range",
      input: { ranges: [{ from: 0, to: 10 }] },
      expected: { ranges: [{ from: 0, to: 10 }] },
    },
    {
      name: "two unsorted non-overlapping ranges",
      input: {
        ranges: [
          { from: 20, to: 30 },
          { from: 0, to: 10 },
        ],
      },
      expected: {
        ranges: [
          { from: 0, to: 10 },
          { from: 20, to: 30 },
        ],
      },
    },
    {
      name: "two overlapping ranges",
      input: {
        ranges: [
          { from: 0, to: 10 },
          { from: 5, to: 15 },
        ],
      },
      expected: { ranges: [{ from: 0, to: 15 }] },
    },
    {
      name: "two adjacent ranges",
      input: {
        ranges: [
          { from: 0, to: 10 },
          { from: 10, to: 20 },
        ],
      },
      expected: { ranges: [{ from: 0, to: 20 }] },
    },
    {
      name: "multiple overlapping ranges",
      input: {
        ranges: [
          { from: 0, to: 10 },
          { from: 5, to: 15 },
          { from: 12, to: 20 },
        ],
      },
      expected: { ranges: [{ from: 0, to: 20 }] },
    },
    {
      name: "inner range",
      input: {
        ranges: [
          { from: 0, to: 20 },
          { from: 5, to: 15 },
        ],
      },
      expected: { ranges: [{ from: 0, to: 20 }] },
    },
    {
      name: "inner range with outer range",
      input: {
        ranges: [
          { from: 5, to: 15 },
          { from: 20, to: 30 },
          { from: 0, to: 20 },
        ],
      },
      expected: { ranges: [{ from: 0, to: 30 }] },
    },
    {
      name: "more than 1 range in expected",
      input: {
        ranges: [
          { from: 25, to: 30 },
          { from: 20, to: 25 },

          { from: 0, to: 8 },
          { from: 2, to: 10 },
          { from: 1, to: 9 },

          { from: 40, to: 50 },
          { from: 45, to: 47 },
        ],
      },
      expected: {
        ranges: [
          { from: 0, to: 10 },
          { from: 20, to: 30 },
          { from: 40, to: 50 },
        ],
      },
    },
  ];

  for (const tc of cases) {
    it(tc.name, () => {
      normalizeRanges(tc.input);

      expect(tc.input).toEqual(tc.expected);
    });
  }
});

describe("readRangesFile", () => {
  const logger = new ConsoleLoggerAdapter();

  async function withRangesFile(
    content: string | undefined,
    body: (path: string) => Promise<void>,
  ) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ranges-test-"));
    try {
      const file = rangesFileName(path.join(dir, "blob"));
      if (content !== undefined) await fs.writeFile(file, content);
      await body(file);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  it("reads and normalizes a valid file", async () => {
    await withRangesFile(
      JSON.stringify({
        ranges: [
          { from: 20, to: 30 },
          { from: 0, to: 10 },
        ],
      }),
      async (file) => {
        expect(await readRangesFile(logger, file)).toEqual({
          ranges: [
            { from: 0, to: 10 },
            { from: 20, to: 30 },
          ],
        });
      },
    );
  });

  it("returns empty ranges when the file does not exist", async () => {
    await withRangesFile(undefined, async (file) => {
      expect(await readRangesFile(logger, file)).toEqual({ ranges: [] });
    });
  });

  it("throws CorruptedRangesError on malformed JSON", async () => {
    await withRangesFile("{ not json", async (file) => {
      await expect(readRangesFile(logger, file)).rejects.toThrow(CorruptedRangesError);
    });
  });

  // Valid JSON of the wrong shape reaches the schema, not JSON.parse. It is the
  // only path that depends on the validation library's error type being caught.
  const wrongShapes: { name: string; content: unknown }[] = [
    { name: "ranges is not an array", content: { ranges: 42 } },
    { name: "ranges key is absent", content: {} },
    { name: "a range is missing `to`", content: { ranges: [{ from: 0 }] } },
    { name: "a range bound is a string", content: { ranges: [{ from: "0", to: 10 }] } },
    { name: "root is an array", content: [{ from: 0, to: 10 }] },
  ];

  for (const tc of wrongShapes) {
    it(`throws CorruptedRangesError when ${tc.name}`, async () => {
      await withRangesFile(JSON.stringify(tc.content), async (file) => {
        await expect(readRangesFile(logger, file)).rejects.toThrow(CorruptedRangesError);
      });
    });
  }
});
