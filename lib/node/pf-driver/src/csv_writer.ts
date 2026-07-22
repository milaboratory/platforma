import {
  Annotation,
  isValueNA,
  readAnnotation,
  ValueType,
  type PTableColumnSpec,
  type PTableVector,
  type TableRange,
} from "@milaboratories/pl-model-common";
import { isNil } from "@milaboratories/helpers";

/** Minimal subset of PTable required by streamPTableRows. */
export interface PTableDataSource {
  getData(
    columnIndices: number[],
    options?: { range?: TableRange; signal?: AbortSignal },
  ): Promise<PTableVector[]>;
}

// ── Public API (high-level → low-level) ──────────────────────────────

/** Format a CSV/TSV header row from column specs. Line ending is CRLF. */
export function formatHeader(specs: PTableColumnSpec[], separator: string): string {
  return (
    specs.map((spec) => escapeField(getNativeColumnLabel(spec), separator)).join(separator) + "\r\n"
  );
}

/** Format a single data row from parallel vectors. Line ending is CRLF. */
export function formatRow(vectors: PTableVector[], rowIndex: number, separator: string): string {
  return (
    vectors
      .map((vector) => escapeField(serializeValue(vector, rowIndex), separator))
      .join(separator) + "\r\n"
  );
}

/**
 * Async generator that streams CSV/TSV content chunk by chunk.
 *
 * The caller is responsible for providing a concrete `range` (already clipped
 * to the table shape). When `range` is undefined the generator does nothing
 * beyond emitting an optional BOM and header.
 */
export interface StreamPTableRowsOptions {
  pTable: PTableDataSource;
  specs: PTableColumnSpec[];
  columnIndices: number[];
  /**
   * Header names aligned 1:1 with `columnIndices`. When provided they are
   * written verbatim, letting callers supply disambiguated labels the spec's
   * intrinsic `pl7.app/label` may not carry. When omitted the header is derived
   * from `specs` via {@link getNativeColumnLabel}.
   */
  headerNames?: string[];
  range?: TableRange;
  chunkSize: number;
  separator: string;
  includeHeader: boolean;
  bom: boolean;
  signal?: AbortSignal;
}
export async function* streamPTableRows(options: StreamPTableRowsOptions): AsyncIterable<string> {
  const { pTable, columnIndices, headerNames, range, chunkSize, separator, signal, specs } =
    options;
  const { includeHeader, bom } = options;

  if (bom) {
    yield "\uFEFF";
  }

  if (includeHeader) {
    yield headerNames !== undefined
      ? headerNames.map((name) => escapeField(name, separator)).join(separator) + "\r\n"
      : formatHeader(
          columnIndices.map((index) => specs[index]),
          separator,
        );
  }

  if (isNil(range)) {
    return;
  }

  const end = range.offset + range.length;

  for (let from = range.offset; from < end; from += chunkSize) {
    signal?.throwIfAborted();

    const length = Math.min(chunkSize, end - from);
    const subRange: TableRange = { offset: from, length };

    const vectors = await pTable.getData(columnIndices, { range: subRange, signal });

    const rows: string[] = [];
    for (let rowIndex = 0; rowIndex < length; rowIndex++) {
      rows.push(formatRow(vectors, rowIndex, separator));
    }
    yield rows.join("");
  }
}

// ── Helpers (low-level) ──────────────────────────────────────────────

/** Extract a human-readable label from a PTableColumnSpec. */
export function getNativeColumnLabel(spec: PTableColumnSpec): string {
  const annotation = readAnnotation(spec.spec, Annotation.Label);
  return isNil(annotation) ? spec.spec.name : annotation.trim();
}

/**
 * RFC 4180 field escaping.
 * Quote if the field contains the separator, a double-quote, CR, or LF.
 * Embedded `"` are doubled.
 */
function escapeField(value: string, separator: string): string {
  return needsQuoting(value, separator) ? '"' + value.replace(/"/g, '""') + '"' : value;
}

/** Returns true when the value must be wrapped in double-quotes. */
function needsQuoting(value: string, separator: string): boolean {
  return (
    value.includes(separator) || value.includes('"') || value.includes("\r") || value.includes("\n")
  );
}

/**
 * Serialize one cell value from a typed vector to its string representation.
 *
 * - `null` / `undefined`  -> `""`
 * - `bigint`              -> `String(x)`
 * - `NaN` / `+Inf` / `-Inf` -> `""`
 */
function serializeValue(vector: PTableVector, rowIndex: number): string {
  const rawValue = vector.data[rowIndex];

  if (isNil(rawValue)) {
    return "";
  }

  if (isValueNA(vector, rowIndex)) {
    return "";
  }

  switch (vector.type) {
    case ValueType.Long: {
      // BigInt64Array element — may be stored as bigint
      return String(rawValue);
    }
    case ValueType.Float:
    case ValueType.Double: {
      const numeric = rawValue as number;
      return Number.isNaN(numeric) || !Number.isFinite(numeric) ? "" : String(numeric);
    }
    case ValueType.Int: {
      return String(rawValue);
    }
    case ValueType.String: {
      return rawValue as string;
    }
    case ValueType.Bytes: {
      return "";
    }
    default: {
      return String(rawValue);
    }
  }
}
