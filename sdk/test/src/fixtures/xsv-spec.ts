/*
  Builders for the spec an xsv-import block takes in its block data. The types mirror the
  block's import spec (`Spec` in its model package); the block's UI keeps per-item state
  (`id`, `disabled`, `expanded`) around each axis and column, so the block data a test
  writes has to carry the same wrapper.
*/

import { randomUUID } from "node:crypto";

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
    type: XsvValueType;
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

const item = <T>(payload: T): XsvItem<T> => ({
  id: randomUUID(),
  disabled: false,
  expanded: false,
  payload,
});

export function xsvImportSpec(input: XsvImportSpecInput): XsvImportSpec {
  return {
    ...input,
    axes: input.axes.map(item),
    columns: input.columns.map(item),
    storageFormat: input.storageFormat ?? "Binary",
  };
}

/** Render rows to TSV with `columns` as the header; a missing cell is empty. */
export function renderTsv(
  columns: string[],
  rows: Record<string, string | number | undefined>[],
): string {
  const lines = [columns.join("\t")];
  for (const row of rows) {
    lines.push(columns.map((c) => (row[c] === undefined ? "" : String(row[c]))).join("\t"));
  }
  return lines.join("\n") + "\n";
}
