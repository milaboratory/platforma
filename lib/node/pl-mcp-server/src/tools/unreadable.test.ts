import { describe, expect, it } from "vitest";
import type { PTableColumnSpec } from "@milaboratories/pl-middle-layer";
import {
  batchTooLarge,
  blockHasNoOutputs,
  blockReadFailed,
  blockStateNotAvailable,
  duplicateBlockId,
  emptyBlockList,
  noLogHandles,
  toolError,
  emptyColumnList,
  tableReadFailed,
  unreadableColumns,
  unreadableColumnsError,
  unresolvedHandle,
} from "./unreadable";

function textOf(failure: { message: string; hint: string }): string {
  const envelope = toolError(failure) as { content: { text: string }[]; isError?: boolean };
  expect(envelope.isError).toBe(true);
  return envelope.content[0].text;
}

function column(name: string, valueType: string): PTableColumnSpec {
  return {
    type: "column",
    id: `${name}-id` as never,
    spec: { kind: "PColumn", name, valueType, axesSpec: [] } as never,
  };
}

function axis(name: string, type: string): PTableColumnSpec {
  return { type: "axis", id: { name, type } as never, spec: { name, type } as never };
}

describe("the error builders", () => {
  it("carry both a message and a hint", () => {
    expect(textOf(blockStateNotAvailable())).toMatch(
      /not available yet[\s\S]*Hint: .*calculationStatus/,
    );
    expect(textOf(emptyColumnList())).toMatch(/columns list is empty[\s\S]*Hint: .*Omit columns/);
    expect(textOf(unreadableColumnsError([{ index: 1, name: "raw", valueType: "Bytes" }]))).toMatch(
      /cannot return[\s\S]*Hint: .*without those indices/,
    );
    expect(textOf(tableReadFailed("spec", new Error("boom")))).toMatch(
      /spec failed: boom[\s\S]*Hint: .*stale/,
    );
    expect(textOf(tableReadFailed("data", new Error("boom")))).toMatch(
      /data failed: boom[\s\S]*Hint: .*row range/,
    );
  });

  it("names every flagged column, not only the first", () => {
    const text = textOf(
      unreadableColumnsError([
        { index: 1, name: "raw", valueType: "Bytes" },
        { index: 4, name: "blob", valueType: "Bytes" },
      ]),
    );
    expect(text).toContain("raw (index 1, type Bytes)");
    expect(text).toContain("blob (index 4, type Bytes)");
  });
});

describe("unreadableColumns", () => {
  const spec = [column("id", "Int"), column("raw", "Bytes"), axis("sample", "String")];

  it("returns nothing when every requested column can be read", () => {
    expect(unreadableColumns(spec, [0, 2])).toEqual([]);
  });

  it("flags a requested column whose value type cannot be returned", () => {
    expect(unreadableColumns(spec, [0, 1])).toEqual([
      { index: 1, name: "raw", valueType: "Bytes" },
    ]);
  });

  it("ignores an unreadable column outside the requested indices", () => {
    expect(unreadableColumns(spec, [0])).toEqual([]);
  });
});

describe("unresolvedHandle", () => {
  it("carries the value, both read errors and a hint", () => {
    const entry = unresolvedHandle("a".repeat(64), "no table", "no frame");
    expect(entry._type).toBe("UnresolvedHandle");
    expect(entry.handle).toBe("a".repeat(64));
    expect(entry.pTableError).toBe("no table");
    expect(entry.pFrameError).toBe("no frame");
    expect(entry.hint).toMatch(/may not be a table handle/);
  });
});

describe("the six new builders", () => {
  it("each carry a message and a hint", () => {
    expect(textOf(batchTooLarge(12, 10))).toMatch(/asked for 12 blocks[\s\S]*Hint: .*at most 10/);
    expect(textOf(emptyBlockList())).toMatch(
      /list of block ids is empty[\s\S]*Hint: .*get_project_overview/,
    );
    expect(textOf(duplicateBlockId("b1"))).toMatch(/more than once: b1[\s\S]*Hint: .*once/);
    expect(textOf(blockHasNoOutputs())).toMatch(/no outputs yet[\s\S]*Hint: .*run_block/);
    expect(textOf(noLogHandles())).toMatch(/No log handles[\s\S]*Hint: .*get_block_outputs/);
    expect(textOf(blockReadFailed(new Error("boom")))).toMatch(
      /Reading the block failed: boom[\s\S]*Hint:/,
    );
  });
});
