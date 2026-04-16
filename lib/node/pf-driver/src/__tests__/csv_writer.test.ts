import { describe, expect, it } from "vitest";
import {
  PObjectId,
  ValueType,
  type PTableColumnSpec,
  type PTableVector,
  type TableRange,
} from "@milaboratories/pl-model-common";
import { formatHeader, formatRow, streamPTableRows, type PTableDataSource } from "../csv_writer";

// ── Helpers ──────────────────────────────────────────────────────────

function makeAxisSpec(name: string, label?: string): PTableColumnSpec {
  const annotations: Record<string, string> = {};
  if (label !== undefined) {
    annotations["pl7.app/label"] = label;
  }
  return {
    type: "axis",
    id: { name, type: "Int" },
    spec: { name, type: "Int", annotations },
  } as PTableColumnSpec;
}

function makeColumnSpec(name: string, label?: string): PTableColumnSpec {
  const annotations: Record<string, string> = {};
  if (label !== undefined) {
    annotations["pl7.app/label"] = label;
  }
  return {
    type: "column",
    id: `col:${name}` as PObjectId,
    spec: {
      kind: "PColumn",
      name,
      valueType: "String",
      axesSpec: [],
      annotations,
    },
  } as PTableColumnSpec;
}

function makeStringVector(values: (null | string)[]): PTableVector {
  return { type: ValueType.String, data: values };
}

function makeIntVector(values: number[]): PTableVector {
  return { type: ValueType.Int, data: new Int32Array(values) };
}

function makeDoubleVector(values: number[]): PTableVector {
  return { type: ValueType.Double, data: new Float64Array(values) };
}

function makeLongVector(values: bigint[]): PTableVector {
  return { type: ValueType.Long, data: new BigInt64Array(values) };
}

function makeVectorWithNaBits(
  type: typeof ValueType.Int,
  data: number[],
  naBits: number[],
): PTableVector {
  const isNA = new Uint8Array(Math.ceil(data.length / 8));
  for (const bit of naBits) {
    const chunkIndex = Math.floor(bit / 8);
    const mask = 1 << (7 - (bit % 8));
    isNA[chunkIndex] |= mask;
  }
  return { type, data: new Int32Array(data), isNA };
}

function makeMockPTable(vectorsByChunk: PTableVector[][]): PTableDataSource {
  let callIndex = 0;
  return {
    getData: async (
      _columnIndices: number[],
      _options?: { range?: TableRange; signal?: AbortSignal },
    ) => {
      const vectors = vectorsByChunk[callIndex];
      callIndex++;
      return vectors;
    },
  };
}

async function collectStream(iter: AsyncIterable<string>): Promise<string> {
  const parts: string[] = [];
  for await (const chunk of iter) {
    parts.push(chunk);
  }
  return parts.join("");
}

// ── formatHeader ─────────────────────────────────────────────────────

describe("formatHeader", () => {
  it("uses annotation label when available", () => {
    const specs = [makeAxisSpec("id", "Row ID"), makeColumnSpec("value", "Score")];
    expect(formatHeader(specs, ",")).toBe("Row ID,Score\r\n");
  });

  it("falls back to spec name when no label annotation", () => {
    const specs = [makeAxisSpec("sample"), makeColumnSpec("count")];
    expect(formatHeader(specs, ",")).toBe("sample,count\r\n");
  });

  it("escapes header containing separator", () => {
    const specs = [makeAxisSpec("a,b", "a,b")];
    expect(formatHeader(specs, ",")).toBe('"a,b"\r\n');
  });

  it("escapes header containing double-quote", () => {
    const specs = [makeAxisSpec('a"b', 'a"b')];
    expect(formatHeader(specs, ",")).toBe('"a""b"\r\n');
  });

  it("uses tab separator for TSV", () => {
    const specs = [makeAxisSpec("x", "X"), makeAxisSpec("y", "Y")];
    expect(formatHeader(specs, "\t")).toBe("X\tY\r\n");
  });
});

// ── formatRow ────────────────────────────────────────────────────────

describe("formatRow", () => {
  it("formats simple string values", () => {
    const vectors = [makeStringVector(["hello", "world"])];
    expect(formatRow(vectors, 0, ",")).toBe("hello\r\n");
    expect(formatRow(vectors, 1, ",")).toBe("world\r\n");
  });

  it("formats integer values", () => {
    const vectors = [makeIntVector([42, -1])];
    expect(formatRow(vectors, 0, ",")).toBe("42\r\n");
    expect(formatRow(vectors, 1, ",")).toBe("-1\r\n");
  });

  it("escapes field containing comma", () => {
    const vectors = [makeStringVector(["a,b"])];
    expect(formatRow(vectors, 0, ",")).toBe('"a,b"\r\n');
  });

  it("escapes field containing double-quote by doubling", () => {
    const vectors = [makeStringVector(['say "hi"'])];
    expect(formatRow(vectors, 0, ",")).toBe('"say ""hi"""\r\n');
  });

  it("escapes field containing CRLF", () => {
    const vectors = [makeStringVector(["line1\r\nline2"])];
    expect(formatRow(vectors, 0, ",")).toBe('"line1\r\nline2"\r\n');
  });

  it("escapes field containing bare LF", () => {
    const vectors = [makeStringVector(["line1\nline2"])];
    expect(formatRow(vectors, 0, ",")).toBe('"line1\nline2"\r\n');
  });

  it("handles unicode characters", () => {
    const vectors = [makeStringVector(["кириллица"]), makeStringVector(["日本語"])];
    expect(formatRow(vectors, 0, ",")).toBe("кириллица,日本語\r\n");
  });

  it("serializes bigint values", () => {
    const vectors = [makeLongVector([9007199254740993n, -9007199254740993n])];
    expect(formatRow(vectors, 0, ",")).toBe("9007199254740993\r\n");
    expect(formatRow(vectors, 1, ",")).toBe("-9007199254740993\r\n");
  });

  it("serializes null as empty string", () => {
    const vectors = [makeStringVector([null])];
    expect(formatRow(vectors, 0, ",")).toBe("\r\n");
  });

  it("serializes NaN as empty string", () => {
    const vectors = [makeDoubleVector([NaN])];
    expect(formatRow(vectors, 0, ",")).toBe("\r\n");
  });

  it("serializes +Infinity as empty string", () => {
    const vectors = [makeDoubleVector([Infinity])];
    expect(formatRow(vectors, 0, ",")).toBe("\r\n");
  });

  it("serializes -Infinity as empty string", () => {
    const vectors = [makeDoubleVector([-Infinity])];
    expect(formatRow(vectors, 0, ",")).toBe("\r\n");
  });

  it("serializes NA-flagged values as empty string", () => {
    const vectors = [makeVectorWithNaBits(ValueType.Int, [42, 99, 7], [1])];
    expect(formatRow(vectors, 0, ",")).toBe("42\r\n");
    expect(formatRow(vectors, 1, ",")).toBe("\r\n");
    expect(formatRow(vectors, 2, ",")).toBe("7\r\n");
  });

  it("quotes field containing TAB when TSV separator", () => {
    const vectors = [makeStringVector(["has\ttab"])];
    expect(formatRow(vectors, 0, "\t")).toBe('"has\ttab"\r\n');
  });

  it("does not quote field without special chars in TSV", () => {
    const vectors = [makeStringVector(["plain"])];
    expect(formatRow(vectors, 0, "\t")).toBe("plain\r\n");
  });
});

// ── streamPTableRows ─────────────────────────────────────────────────

describe("streamPTableRows", () => {
  it("emits BOM when requested", async () => {
    const pTable = makeMockPTable([]);
    const result = await collectStream(
      streamPTableRows(pTable, [], undefined, 100, ",", undefined, [], false, true),
    );
    expect(result).toBe("\uFEFF");
  });

  it("does not emit BOM when not requested", async () => {
    const pTable = makeMockPTable([]);
    const result = await collectStream(
      streamPTableRows(pTable, [], undefined, 100, ",", undefined, [], false, false),
    );
    expect(result).toBe("");
  });

  it("skips header when includeHeader is false", async () => {
    const specs = [makeAxisSpec("id", "ID")];
    const vectors = [[makeIntVector([1, 2])]];
    const pTable = makeMockPTable(vectors);
    const range: TableRange = { offset: 0, length: 2 };

    const result = await collectStream(
      streamPTableRows(pTable, [0], range, 100, ",", undefined, specs, false, false),
    );
    expect(result).toBe("1\r\n2\r\n");
  });

  it("includes header when includeHeader is true", async () => {
    const specs = [makeAxisSpec("id", "ID")];
    const vectors = [[makeIntVector([1])]];
    const pTable = makeMockPTable(vectors);
    const range: TableRange = { offset: 0, length: 1 };

    const result = await collectStream(
      streamPTableRows(pTable, [0], range, 100, ",", undefined, specs, true, false),
    );
    expect(result).toBe("ID\r\n1\r\n");
  });

  it("chunks data correctly across multiple getData calls", async () => {
    const specs = [makeAxisSpec("v", "Value")];
    // Two chunks: first has 2 rows, second has 1 row
    const vectors = [[makeIntVector([10, 20])], [makeIntVector([30])]];
    const pTable = makeMockPTable(vectors);
    const range: TableRange = { offset: 0, length: 3 };

    const result = await collectStream(
      streamPTableRows(pTable, [0], range, 2, ",", undefined, specs, false, false),
    );
    expect(result).toBe("10\r\n20\r\n30\r\n");
  });

  it("handles range with non-zero offset", async () => {
    const specs = [makeAxisSpec("v", "Value")];
    const vectors = [[makeIntVector([50, 60])]];
    const pTable: PTableDataSource = {
      getData: async (_cols, options) => {
        expect(options?.range).toEqual({ offset: 5, length: 2 });
        return vectors[0];
      },
    };
    const range: TableRange = { offset: 5, length: 2 };

    const result = await collectStream(
      streamPTableRows(pTable, [0], range, 100, ",", undefined, specs, false, false),
    );
    expect(result).toBe("50\r\n60\r\n");
  });

  it("yields nothing for data when range is undefined", async () => {
    const specs = [makeAxisSpec("v", "Value")];
    const pTable = makeMockPTable([]);

    const result = await collectStream(
      streamPTableRows(pTable, [0], undefined, 100, ",", undefined, specs, true, false),
    );
    expect(result).toBe("Value\r\n");
  });

  it("respects abort signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const specs = [makeAxisSpec("v", "Value")];
    const pTable = makeMockPTable([[makeIntVector([1])]]);
    const range: TableRange = { offset: 0, length: 1 };

    await expect(
      collectStream(
        streamPTableRows(pTable, [0], range, 1, ",", controller.signal, specs, false, false),
      ),
    ).rejects.toThrow();
  });

  it("emits BOM + header + data in correct order", async () => {
    const specs = [makeAxisSpec("x", "X"), makeColumnSpec("y", "Y")];
    const vectors = [[makeIntVector([1]), makeStringVector(["a"])]];
    const pTable = makeMockPTable(vectors);
    const range: TableRange = { offset: 0, length: 1 };

    const result = await collectStream(
      streamPTableRows(pTable, [0, 1], range, 100, ",", undefined, specs, true, true),
    );
    expect(result).toBe("\uFEFFX,Y\r\n1,a\r\n");
  });

  it("works with TSV separator", async () => {
    const specs = [makeAxisSpec("a", "A"), makeAxisSpec("b", "B")];
    const vectors = [[makeIntVector([1]), makeStringVector(["hello"])]];
    const pTable = makeMockPTable(vectors);
    const range: TableRange = { offset: 0, length: 1 };

    const result = await collectStream(
      streamPTableRows(pTable, [0, 1], range, 100, "\t", undefined, specs, true, false),
    );
    expect(result).toBe("A\tB\r\n1\thello\r\n");
  });
});
