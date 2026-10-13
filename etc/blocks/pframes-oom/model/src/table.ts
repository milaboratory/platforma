import type { PColumn, PColumnValues, PObjectId, PTableDef } from "@platforma-sdk/model";

export function createOomTableDefinition(
  rows: number,
  runId: number,
): PTableDef<PColumn<PColumnValues>> {
  if (!Number.isInteger(rows) || rows < 1 || rows > 100000) {
    throw new Error("Rows must be an integer between 1 and 100000.");
  }
  // Both columns share a constant group, but have independent item axes.
  // N + N input records therefore produce N² joined records in native pframes.
  // A fresh domain prevents a repeated run from reusing a cached result.
  const columns = ["left", "right"].map((side) => ({
    id: `oom-${side}` as PObjectId,
    spec: {
      kind: "PColumn" as const,
      name: `oom/${side}`,
      valueType: "Int" as const,
      axesSpec: [
        { name: "oom/group", type: "Int" as const, domain: { run: String(runId) } },
        { name: `oom/${side}`, type: "Int" as const },
      ],
    },
    data: Array.from({ length: rows }, (_, i) => ({ key: [0, i], val: rows - i })),
  }));
  return {
    src: { type: "inner", entries: columns.map((column) => ({ type: "column", column })) },
    partitionFilters: [],
    filters: [],
    // Sorting forces consumption of the join even when the UI requests only its shape.
    sorting: columns.map(({ id }) => ({
      column: { type: "column", id },
      ascending: true,
      naAndAbsentAreLeastValues: true,
    })),
  };
}

export type HeapStressParams = {
  /** Records on the text side. Each carries one string of `stringLength` characters. */
  textRows: number;
  /** Records on the integer side. The join repeats every text value this many times. */
  intRows: number;
  /** Characters per string value. */
  stringLength: number;
  runId: number;
};

/**
 * Characters the text column may hold in total.
 *
 * The block model builds its inline data inside a QuickJS sandbox capped at 8 MB,
 * so the input is the one part of this block that must stay small. Amplification
 * is the integer side's job: it repeats every text value without costing the
 * sandbox anything.
 */
export const MAX_INLINE_TEXT_CHARS = 1024 * 1024;

/**
 * Joined records the parameters produce, the JS string bytes behind them, and the
 * inline characters the sandbox has to hold to describe them.
 */
export function heapStressEstimate(params: HeapStressParams): {
  rows: number;
  bytes: number;
  inlineChars: number;
} {
  const rows = params.textRows * params.intRows;
  return {
    rows,
    bytes: rows * params.stringLength,
    inlineChars: params.textRows * params.stringLength,
  };
}

/**
 * A join whose result is dominated by string values rather than by record count.
 *
 * `getData` hands `Int` columns back as typed arrays, which live outside the V8
 * heap, so an integer join can only exhaust the off-heap region. `String` columns
 * come back as a plain array of JS strings, one object per record, so this shape
 * is what drives the middle-layer worker's own heap to exhaustion.
 *
 * Few wide-string records crossed with many integer records keep the inline input
 * small — the block model runs in a QuickJS sandbox capped at 8 MB — while the
 * join still multiplies the strings into gigabytes.
 */
export function createHeapStressTableDefinition(
  params: HeapStressParams,
): PTableDef<PColumn<PColumnValues>> {
  const { textRows, intRows, stringLength, runId } = params;
  assertRange("Text rows", textRows, 1, 10000);
  assertRange("Int rows", intRows, 1, 100000);
  assertRange("String length", stringLength, 1, 100000);
  const inlineChars = textRows * stringLength;
  if (inlineChars > MAX_INLINE_TEXT_CHARS) {
    throw new Error(
      `Text rows x string length is ${inlineChars} characters, above the ${MAX_INLINE_TEXT_CHARS} the model sandbox can hold. ` +
        `Lower either, and raise int rows instead — it multiplies the payload without enlarging the input.`,
    );
  }

  const group = { name: "oom/group", type: "Int" as const, domain: { run: String(runId) } };
  const text: PColumn<PColumnValues> = {
    id: "oom-text" as PObjectId,
    spec: {
      kind: "PColumn",
      name: "oom/text",
      valueType: "String",
      axesSpec: [group, { name: "oom/text-item", type: "Int" }],
    },
    // Distinct per record, so no deduplication can collapse the payload.
    data: Array.from({ length: textRows }, (_, i) => ({
      key: [0, i],
      val: `${i}:`.padEnd(stringLength, "x"),
    })),
  };
  const counter: PColumn<PColumnValues> = {
    id: "oom-int" as PObjectId,
    spec: {
      kind: "PColumn",
      name: "oom/int",
      valueType: "Int",
      axesSpec: [group, { name: "oom/int-item", type: "Int" }],
    },
    data: Array.from({ length: intRows }, (_, i) => ({ key: [0, i], val: i })),
  };
  return {
    src: { type: "inner", entries: [text, counter].map((column) => ({ type: "column", column })) },
    partitionFilters: [],
    filters: [],
    sorting: [],
  };
}

// Internals

function assertRange(label: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}.`);
  }
}
