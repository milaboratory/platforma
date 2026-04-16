import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  PObjectId,
  ValueType,
  type PTableColumnSpec,
  type PTableVector,
  type TableRange,
} from "@milaboratories/pl-model-common";
import { isNil } from "@milaboratories/helpers";
import { streamPTableRows, type PTableDataSource } from "../csv_writer";

// ── Test infrastructure ─────────────────────────────────────────────

/** Temporary files created during tests, cleaned up in afterEach. */
const temporaryFiles: string[] = [];

afterEach(async () => {
  for (const filePath of temporaryFiles) {
    await fs.promises.unlink(filePath).catch(() => {});
    await fs.promises.unlink(filePath + ".part").catch(() => {});
  }
  temporaryFiles.length = 0;
});

function temporaryFilePath(name: string): string {
  const filePath = path.join(os.tmpdir(), `pf-driver-test-${Date.now()}-${name}`);
  temporaryFiles.push(filePath);
  return filePath;
}

// ── Spec / vector builders (mirrors csv_writer.test.ts) ─────────────

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

function makeColumnSpec(name: string, valueType: string, label?: string): PTableColumnSpec {
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
      valueType,
      axesSpec: [],
      annotations,
    },
  } as PTableColumnSpec;
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

function makeStringVector(values: (null | string)[]): PTableVector {
  return { type: ValueType.String, data: values };
}

/**
 * Build a mock PTableDataSource that returns data slice-by-slice
 * by reading from full-length column vectors according to the requested range.
 */
function makePTableDataSource(
  fullVectors: PTableVector[],
  specs: PTableColumnSpec[],
): PTableDataSource & { getSpec(): PTableColumnSpec[]; getShape(): { rows: number } } {
  const rowCount = vectorLength(fullVectors[0]);
  return {
    getData: async (
      columnIndices: number[],
      options?: { range?: TableRange; signal?: AbortSignal },
    ) => {
      options?.signal?.throwIfAborted();
      const range = isNil(options?.range) ? { offset: 0, length: rowCount } : options!.range!;
      return columnIndices.map((columnIndex) => sliceVector(fullVectors[columnIndex], range));
    },
    getSpec: () => specs,
    getShape: () => ({ rows: rowCount }),
  };
}

// ── Download pipeline (mirrors driver_impl.ts downloadPTable logic) ─

interface DownloadOptions {
  path: string;
  format: "csv" | "tsv";
  columnIndices: number[];
  range?: TableRange;
  chunkSize?: number;
  includeHeader?: boolean;
  bom?: boolean;
  signal?: AbortSignal;
}

interface DownloadResult {
  path: string;
  rowsWritten: number;
  bytesWritten: number;
}

/**
 * Replicates the exact file I/O pipeline from driver_impl.ts downloadPTable,
 * but using a mock PTableDataSource instead of the full pool machinery.
 */
async function downloadPTableFromSource(
  pTable: PTableDataSource & { getSpec(): PTableColumnSpec[]; getShape(): { rows: number } },
  options: DownloadOptions,
): Promise<DownloadResult> {
  const shape = pTable.getShape();
  const effectiveRange = clipRange(options.range, shape);
  const specs = pTable.getSpec();
  const separator = options.format === "tsv" ? "\t" : ",";

  const partPath = options.path + ".part";
  const writeStream = fs.createWriteStream(partPath, { flags: "w" });
  const iterable = streamPTableRows(
    pTable,
    options.columnIndices,
    effectiveRange,
    options.chunkSize ?? 50_000,
    separator,
    options.signal,
    specs,
    options.includeHeader ?? true,
    options.bom ?? false,
  );

  try {
    await pipeline(Readable.from(iterable, { objectMode: false }), writeStream, {
      signal: options.signal,
    });
    await fs.promises.rename(partPath, options.path);
  } catch (error) {
    await fs.promises.unlink(partPath).catch(() => {});
    throw error;
  }

  return {
    path: options.path,
    rowsWritten: effectiveRange.length,
    bytesWritten: writeStream.bytesWritten,
  };
}

function clipRange(range: undefined | TableRange, shape: { rows: number }): TableRange {
  if (isNil(range)) {
    return { offset: 0, length: shape.rows };
  }
  const clampedOffset = Math.min(range.offset, shape.rows);
  const clampedLength = Math.min(range.length, shape.rows - clampedOffset);
  return { offset: clampedOffset, length: clampedLength };
}

// ── CSV parser (RFC 4180, minimal inline implementation) ────────────

interface ParsedCsv {
  rows: string[][];
}

function parseCsv(content: string, separator: string): ParsedCsv {
  const rows: string[][] = [];
  let position = 0;

  // Strip BOM if present
  if (content.charCodeAt(0) === 0xfeff) {
    position = 1;
  }

  while (position < content.length) {
    const { fields, nextPosition } = parseRow(content, position, separator);
    rows.push(fields);
    position = nextPosition;
  }

  return { rows };
}

function parseRow(
  content: string,
  startPosition: number,
  separator: string,
): { fields: string[]; nextPosition: number } {
  const fields: string[] = [];
  let position = startPosition;

  while (position < content.length) {
    const { value, nextPosition } = parseField(content, position, separator);
    fields.push(value);
    position = nextPosition;

    if (position < content.length && content[position] === separator) {
      position += separator.length;
      continue;
    }

    // Consume CRLF or LF line ending
    if (position < content.length && content[position] === "\r") {
      position++;
    }
    if (position < content.length && content[position] === "\n") {
      position++;
    }
    break;
  }

  return { fields, nextPosition: position };
}

function parseField(
  content: string,
  startPosition: number,
  separator: string,
): { value: string; nextPosition: number } {
  if (startPosition < content.length && content[startPosition] === '"') {
    return parseQuotedField(content, startPosition);
  }
  return parseUnquotedField(content, startPosition, separator);
}

function parseQuotedField(
  content: string,
  startPosition: number,
): { value: string; nextPosition: number } {
  let position = startPosition + 1; // skip opening quote
  const parts: string[] = [];

  while (position < content.length) {
    if (content[position] === '"') {
      if (position + 1 < content.length && content[position + 1] === '"') {
        parts.push('"');
        position += 2;
      } else {
        position++; // skip closing quote
        break;
      }
    } else {
      parts.push(content[position]);
      position++;
    }
  }

  return { value: parts.join(""), nextPosition: position };
}

function parseUnquotedField(
  content: string,
  startPosition: number,
  separator: string,
): { value: string; nextPosition: number } {
  let position = startPosition;

  while (position < content.length) {
    if (
      content[position] === separator ||
      content[position] === "\r" ||
      content[position] === "\n"
    ) {
      break;
    }
    // Check multi-char separator (tab is single char, but be safe)
    if (separator.length > 1 && content.startsWith(separator, position)) {
      break;
    }
    position++;
  }

  return { value: content.slice(startPosition, position), nextPosition: position };
}

// ── Vector helpers ──────────────────────────────────────────────────

function vectorLength(vector: PTableVector): number {
  return vector.data.length;
}

function sliceVector(vector: PTableVector, range: TableRange): PTableVector {
  const { offset, length } = range;
  switch (vector.type) {
    case ValueType.Int:
      return {
        type: vector.type,
        data: (vector.data as Int32Array).slice(offset, offset + length),
      };
    case ValueType.Double:
    case ValueType.Float:
      return {
        type: vector.type,
        data: (vector.data as Float64Array).slice(offset, offset + length),
      };
    case ValueType.Long:
      return {
        type: vector.type,
        data: (vector.data as BigInt64Array).slice(offset, offset + length),
      };
    case ValueType.String:
      return {
        type: vector.type,
        data: (vector.data as (null | string)[]).slice(offset, offset + length),
      };
    default:
      return { type: vector.type, data: vector.data.slice(offset, offset + length) };
  }
}

/**
 * Serialize a PTableVector cell to its expected CSV string representation.
 * Mirrors the serialization in csv_writer.ts serializeValue.
 */
function expectedCellString(vector: PTableVector, rowIndex: number): string {
  const rawValue = vector.data[rowIndex];
  if (isNil(rawValue)) return "";
  switch (vector.type) {
    case ValueType.Long:
      return String(rawValue);
    case ValueType.Float:
    case ValueType.Double: {
      const numeric = rawValue as number;
      return Number.isNaN(numeric) || !Number.isFinite(numeric) ? "" : String(numeric);
    }
    case ValueType.Int:
      return String(rawValue);
    case ValueType.String:
      return rawValue as string;
    default:
      return String(rawValue);
  }
}

// ── Tests ───────────────────────────────────────────────────────────

describe("downloadPTable integration", () => {
  // ── 1. Roundtrip small table ────────────────────────────────────

  it("roundtrips a small mixed-type table through CSV", async () => {
    const specs = [
      makeAxisSpec("id", "ID"),
      makeColumnSpec("score", "Double", "Score"),
      makeColumnSpec("name", "String", "Name"),
      makeColumnSpec("big", "Long", "Big"),
    ];
    const intValues = makeIntVector([1, 2, 3, 4, 5]);
    const doubleValues = makeDoubleVector([1.5, 2.7, 0, -3.14, 100.001]);
    const stringValues = makeStringVector(["alice", "bob", null, "dave", "eve"]);
    const longValues = makeLongVector([0n, 9007199254740993n, -1n, 42n, -9007199254740993n]);

    const fullVectors = [intValues, doubleValues, stringValues, longValues];
    const pTable = makePTableDataSource(fullVectors, specs);
    const columnIndices = [0, 1, 2, 3];

    const filePath = temporaryFilePath("roundtrip.csv");
    const result = await downloadPTableFromSource(pTable, {
      path: filePath,
      format: "csv",
      columnIndices,
    });

    expect(result.rowsWritten).toBe(5);
    expect(result.bytesWritten).toBeGreaterThan(0);

    const fileContent = await fs.promises.readFile(filePath, "utf-8");
    const parsed = parseCsv(fileContent, ",");

    // First row is header
    expect(parsed.rows[0]).toEqual(["ID", "Score", "Name", "Big"]);

    // Compare data rows against getData
    const allData = await pTable.getData(columnIndices, { range: { offset: 0, length: 5 } });
    for (let rowIndex = 0; rowIndex < 5; rowIndex++) {
      const expectedRow = columnIndices.map((columnIndex) =>
        expectedCellString(allData[columnIndex], rowIndex),
      );
      expect(parsed.rows[rowIndex + 1]).toEqual(expectedRow);
    }
  });

  // ── 2. Range slicing ───────────────────────────────────────────

  it("slices a 100-row table with range offset=25 length=50", async () => {
    const specs = [makeAxisSpec("idx", "Index"), makeColumnSpec("val", "Int", "Value")];
    const indices = Array.from({ length: 100 }, (_, i) => i);
    const values = Array.from({ length: 100 }, (_, i) => i * 10);
    const fullVectors = [makeIntVector(indices), makeIntVector(values)];
    const pTable = makePTableDataSource(fullVectors, specs);

    const filePath = temporaryFilePath("range.csv");
    const result = await downloadPTableFromSource(pTable, {
      path: filePath,
      format: "csv",
      columnIndices: [0, 1],
      range: { offset: 25, length: 50 },
      chunkSize: 20,
    });

    expect(result.rowsWritten).toBe(50);

    const fileContent = await fs.promises.readFile(filePath, "utf-8");
    const parsed = parseCsv(fileContent, ",");

    // Header + 50 data rows
    expect(parsed.rows.length).toBe(51);
    expect(parsed.rows[0]).toEqual(["Index", "Value"]);

    // Verify data matches rows 25..74
    const allData = await pTable.getData([0, 1], { range: { offset: 25, length: 50 } });
    for (let rowIndex = 0; rowIndex < 50; rowIndex++) {
      expect(parsed.rows[rowIndex + 1]).toEqual([
        expectedCellString(allData[0], rowIndex),
        expectedCellString(allData[1], rowIndex),
      ]);
    }

    // Spot-check first and last
    expect(parsed.rows[1]).toEqual(["25", "250"]);
    expect(parsed.rows[50]).toEqual(["74", "740"]);
  });

  // ── 3. Escape edge cases ───────────────────────────────────────

  it("handles escape edge cases: quotes, commas, CRLF, unicode, bigint boundary, null, NaN, Infinity", async () => {
    const specs = [
      makeColumnSpec("text", "String", "Text"),
      makeColumnSpec("number", "Double", "Number"),
      makeColumnSpec("big", "Long", "Big"),
    ];

    const stringValues = makeStringVector([
      'has "quotes"', // embedded double-quotes
      "has,comma", // embedded comma
      "has\r\nCRLF", // embedded CRLF
      "кириллица 日本語 🎉", // unicode + emoji
      null, // null
      "plain", // plain string for NaN row
      "plain2", // plain string for +Infinity row
      "plain3", // plain string for -Infinity row
    ]);
    const doubleValues = makeDoubleVector([42.5, -0.001, 3.14, 99.9, 0, NaN, Infinity, -Infinity]);
    const longValues = makeLongVector([
      9223372036854775807n, // max i64
      -9223372036854775808n, // min i64
      0n,
      1n,
      -1n,
      100n,
      200n,
      300n,
    ]);

    const fullVectors = [stringValues, doubleValues, longValues];
    const pTable = makePTableDataSource(fullVectors, specs);

    const filePath = temporaryFilePath("escape.csv");
    await downloadPTableFromSource(pTable, {
      path: filePath,
      format: "csv",
      columnIndices: [0, 1, 2],
    });

    const fileContent = await fs.promises.readFile(filePath, "utf-8");
    const parsed = parseCsv(fileContent, ",");

    // Skip header, verify data roundtrip
    const dataRows = parsed.rows.slice(1);
    expect(dataRows.length).toBe(8);

    // Row 0: quotes
    expect(dataRows[0][0]).toBe('has "quotes"');
    expect(dataRows[0][1]).toBe("42.5");
    expect(dataRows[0][2]).toBe("9223372036854775807");

    // Row 1: comma
    expect(dataRows[1][0]).toBe("has,comma");
    expect(dataRows[1][2]).toBe("-9223372036854775808");

    // Row 2: CRLF
    expect(dataRows[2][0]).toBe("has\r\nCRLF");

    // Row 3: unicode
    expect(dataRows[3][0]).toBe("кириллица 日本語 🎉");

    // Row 4: null string → empty
    expect(dataRows[4][0]).toBe("");

    // Row 5: NaN → empty
    expect(dataRows[5][1]).toBe("");

    // Row 6: +Infinity → empty
    expect(dataRows[6][1]).toBe("");

    // Row 7: -Infinity → empty
    expect(dataRows[7][1]).toBe("");
  });

  // ── 4. Cancel mid-stream ───────────────────────────────────────

  it("cleans up .part file and rejects on abort", async () => {
    const rowCount = 5000;
    const specs = [makeAxisSpec("v", "Value")];
    const values = Array.from({ length: rowCount }, (_, i) => i);
    const fullVectors = [makeIntVector(values)];

    // Slow data source that yields one chunk at a time
    const slowPTable: PTableDataSource & {
      getSpec(): PTableColumnSpec[];
      getShape(): { rows: number };
    } = {
      getData: async (
        columnIndices: number[],
        options?: { range?: TableRange; signal?: AbortSignal },
      ) => {
        options?.signal?.throwIfAborted();
        // Add a small delay so the abort has time to fire
        await new Promise((resolve) => setTimeout(resolve, 5));
        options?.signal?.throwIfAborted();
        const range = isNil(options?.range) ? { offset: 0, length: rowCount } : options!.range!;
        return columnIndices.map((columnIndex) => sliceVector(fullVectors[columnIndex], range));
      },
      getSpec: () => specs,
      getShape: () => ({ rows: rowCount }),
    };

    const filePath = temporaryFilePath("cancel.csv");
    const controller = new AbortController();

    // Abort after a short delay
    setTimeout(() => controller.abort(), 15);

    await expect(
      downloadPTableFromSource(slowPTable, {
        path: filePath,
        format: "csv",
        columnIndices: [0],
        chunkSize: 100,
        signal: controller.signal,
      }),
    ).rejects.toThrow();

    // .part file should be cleaned up
    const partExists = fs.existsSync(filePath + ".part");
    expect(partExists).toBe(false);

    // Final file should NOT exist
    const finalExists = fs.existsSync(filePath);
    expect(finalExists).toBe(false);
  });

  // ── 5. TSV format ──────────────────────────────────────────────

  it("produces valid TSV with tab separator and quotes TABs in values", async () => {
    const specs = [makeAxisSpec("id", "ID"), makeColumnSpec("name", "String", "Name")];
    const fullVectors = [
      makeIntVector([1, 2, 3]),
      makeStringVector(["plain", "has\ttab", "normal"]),
    ];
    const pTable = makePTableDataSource(fullVectors, specs);

    const filePath = temporaryFilePath("output.tsv");
    const result = await downloadPTableFromSource(pTable, {
      path: filePath,
      format: "tsv",
      columnIndices: [0, 1],
    });

    expect(result.rowsWritten).toBe(3);

    const fileContent = await fs.promises.readFile(filePath, "utf-8");
    const parsed = parseCsv(fileContent, "\t");

    expect(parsed.rows[0]).toEqual(["ID", "Name"]);
    expect(parsed.rows[1]).toEqual(["1", "plain"]);
    expect(parsed.rows[2]).toEqual(["2", "has\ttab"]);
    expect(parsed.rows[3]).toEqual(["3", "normal"]);

    // Verify raw content uses tab separators
    const lines = fileContent.split("\r\n").filter((line) => line.length > 0);
    expect(lines[0]).toBe("ID\tName");
  });

  // ── 6. BOM flag ────────────────────────────────────────────────

  it("prepends UTF-8 BOM when bom=true", async () => {
    const specs = [makeAxisSpec("v", "V")];
    const fullVectors = [makeIntVector([1])];
    const pTable = makePTableDataSource(fullVectors, specs);

    const filePath = temporaryFilePath("bom.csv");
    await downloadPTableFromSource(pTable, {
      path: filePath,
      format: "csv",
      columnIndices: [0],
      bom: true,
    });

    const rawBytes = await fs.promises.readFile(filePath);
    // UTF-8 BOM: 0xEF 0xBB 0xBF
    expect(rawBytes[0]).toBe(0xef);
    expect(rawBytes[1]).toBe(0xbb);
    expect(rawBytes[2]).toBe(0xbf);

    // Also check string-level BOM
    const fileContent = await fs.promises.readFile(filePath, "utf-8");
    expect(fileContent.charCodeAt(0)).toBe(0xfeff);
  });

  it("does NOT prepend BOM when bom=false", async () => {
    const specs = [makeAxisSpec("v", "V")];
    const fullVectors = [makeIntVector([1])];
    const pTable = makePTableDataSource(fullVectors, specs);

    const filePath = temporaryFilePath("nobom.csv");
    await downloadPTableFromSource(pTable, {
      path: filePath,
      format: "csv",
      columnIndices: [0],
      bom: false,
    });

    const rawBytes = await fs.promises.readFile(filePath);
    // First byte should NOT be BOM
    expect(rawBytes[0]).not.toBe(0xef);
  });

  // ── 7. Concurrent download + getData ───────────────────────────

  it("concurrent download and getData do not block each other", async () => {
    const largeRowCount = 2000;
    const specs = [makeAxisSpec("v", "Value")];
    const values = Array.from({ length: largeRowCount }, (_, i) => i);
    const fullVectors = [makeIntVector(values)];

    // Slow data source for download: 10ms delay per chunk
    let downloadGetDataCallCount = 0;
    const slowDownloadPTable: PTableDataSource & {
      getSpec(): PTableColumnSpec[];
      getShape(): { rows: number };
    } = {
      getData: async (
        columnIndices: number[],
        options?: { range?: TableRange; signal?: AbortSignal },
      ) => {
        downloadGetDataCallCount++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        const range = isNil(options?.range)
          ? { offset: 0, length: largeRowCount }
          : options!.range!;
        return columnIndices.map((columnIndex) => sliceVector(fullVectors[columnIndex], range));
      },
      getSpec: () => specs,
      getShape: () => ({ rows: largeRowCount }),
    };

    // Fast data source for "UI getData" — different table, no delay
    const fastPTable = makePTableDataSource(
      [makeIntVector([100, 200, 300])],
      [makeAxisSpec("x", "X")],
    );

    const filePath = temporaryFilePath("concurrent.csv");

    // Start download (slow, many chunks)
    const downloadPromise = downloadPTableFromSource(slowDownloadPTable, {
      path: filePath,
      format: "csv",
      columnIndices: [0],
      chunkSize: 100,
    });

    // Concurrently call getData on the fast table — should resolve immediately
    const getDataStartTime = performance.now();
    const getDataResult = await fastPTable.getData([0], { range: { offset: 0, length: 3 } });
    const getDataDuration = performance.now() - getDataStartTime;

    // getData should complete nearly instantly (< 50ms), well before download finishes
    expect(getDataDuration).toBeLessThan(50);
    expect(vectorLength(getDataResult[0])).toBe(3);

    // Wait for download to complete
    const downloadResult = await downloadPromise;
    expect(downloadResult.rowsWritten).toBe(largeRowCount);

    // Download should have made multiple getData calls (2000 rows / 100 chunk = 20)
    expect(downloadGetDataCallCount).toBe(20);
  });
});
