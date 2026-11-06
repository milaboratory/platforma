/*
  Builders for the spec an xsv-import block takes in its block data. The types mirror the
  block's import spec (`Spec` in its model package); the block's UI keeps per-item state
  (`id`, `disabled`, `expanded`) around each axis and column, so the block data a test
  writes has to carry the same wrapper.
*/

import type { AxisValueType } from "@platforma-sdk/model";

export type XsvValueType = "Int" | "Long" | "Float" | "Double" | "String";

type XsvRowParams = {
  /** Column label in the file. */
  column: string;
  /** Rows whose cell matches are skipped before anything else. */
  filterOutRegex?: string;
  /** Cells that match are NA; default checks the value parses as the declared type. */
  naRegex?: string;
  allowNA?: boolean;
};

export type XsvAxis = XsvRowParams & {
  spec: {
    /** Defaults to the file column label. */
    name?: string;
    /** An axis keys rows, so it cannot be a floating-point type. */
    type: AxisValueType;
    domain?: Record<string, string>;
    annotations?: Record<string, string>;
    parentAxes?: number[];
  };
};

export type XsvColumn = XsvRowParams & {
  /** Column id in the pool and saved file name; defaults to the label with `_` for symbols. */
  id?: string;
  spec: {
    /** Defaults to the file column label. */
    name?: string;
    valueType: XsvValueType;
    domain?: Record<string, string>;
    annotations?: Record<string, string>;
    /** Indexes into `axes` of the axes this column is keyed on; all of them when omitted. */
    parentAxes?: number[];
  };
};

export type XsvItem<T> = { id: string; disabled: boolean; expanded: boolean; payload: T };

export type XsvImportSpecInput = {
  axes: XsvAxis[];
  columns: XsvColumn[];
  separator?: string;
  commentLinePrefix?: string;
  skipEmptyLines?: boolean;
  columnNamePrefix?: string;
  storageFormat?: "Binary" | "Json";
  /** Leading axes to partition the stored columns by; 0 is a single partition. */
  partitionKeyLength?: number;
};

export type XsvImportSpec = Omit<XsvImportSpecInput, "axes" | "columns"> & {
  axes: XsvItem<XsvAxis>[];
  columns: XsvItem<XsvColumn>[];
};

/** An item with an id fixed by its position, so one input always gives the same block data. */
const item =
  (kind: string) =>
  <T>(payload: T, idx: number): XsvItem<T> => ({
    id: `${kind}-${idx}`,
    disabled: false,
    expanded: false,
    payload,
  });

export function xsvImportSpec(input: XsvImportSpecInput): XsvImportSpec {
  return {
    ...input,
    axes: input.axes.map(item("axis")),
    columns: input.columns.map(item("column")),
    storageFormat: input.storageFormat ?? "Binary",
  };
}

/**
 * Render rows to TSV with `columns` as the header; a missing cell is empty. A cell holding
 * a tab or line break is rejected: TSV has no escaping, so it would change the table.
 */
export function renderTsv(
  columns: string[],
  rows: Record<string, string | number | undefined>[],
): string {
  const cell = (value: string | number | undefined): string => {
    const text = value === undefined ? "" : String(value);
    if (/[\t\r\n]/.test(text))
      throw new Error(`TSV cell holds a tab or line break: ${JSON.stringify(text)}`);
    return text;
  };
  const lines = [columns.map(cell).join("\t")];
  for (const row of rows) {
    lines.push(columns.map((c) => cell(row[c])).join("\t"));
  }
  return lines.join("\n") + "\n";
}
