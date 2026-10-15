/*
  Declarative dataset shapes. A shape lists axes and columns in pl7.app terms; `buildDataset`
  derives the xsv-import spec, renders the rows, and reads off the handles a consuming block
  wires itself with. Shapes are plain data, so a block extends one by spreading it.
*/

import type { ColumnUniversalId } from "@platforma-sdk/model";
import type { XsvImportSpec, XsvValueType } from "./xsv-spec";
import { renderTsv, xsvImportSpec } from "./xsv-spec";

/** One axis of a shape: its file column and its pool identity. */
export type ShapeAxis = {
  column: string;
  name: string;
  type?: XsvValueType;
  domain?: Record<string, string>;
  annotations?: Record<string, string>;
  /** Rows whose cell matches are skipped by every column keyed on this axis. */
  filterOutRegex?: string;
};

/** One column of a shape: its file column, its pool identity, and its role in the dataset. */
export type ShapeColumn = {
  column: string;
  name: string;
  valueType: XsvValueType;
  /** Indexes into `axes` this column is keyed on; every axis when omitted. */
  parentAxes?: number[];
  domain?: Record<string, string>;
  annotations?: Record<string, string>;
  /** Rows whose cell matches are skipped, not imported. */
  filterOutRegex?: string;
  /**
   * `anchor`: the abundance a consumer's `datasetRef` points at. `sequence`: the column a
   * consumer's sequence options report. `subset`: the filter a consumer's `filterRef` takes.
   */
  role?: "anchor" | "sequence" | "subset";
};

export type DatasetShape = {
  axes: ShapeAxis[];
  columns: ShapeColumn[];
  /** Leading axes to partition the stored columns by; 0 is a single partition. */
  partitionKeyLength?: number;
  storageFormat?: "Binary" | "Json";
};

/** One row, keyed by file column. A missing cell is empty. */
export type ShapeRow = Record<string, string | number | undefined>;

/** A table ready to publish through xsv-import. */
export type PublishableDataset = {
  spec: XsvImportSpec;
  content: string;
};

/**
 * A table ready to publish through xsv-import, with the handles a consuming block needs to
 * wire itself to it.
 */
export type SyntheticDataset = PublishableDataset & {
  /** File column of the anchor abundance, the ref a consumer's `datasetRef` points at. */
  anchorColumn: string;
  /**
   * Anchored id of the sequence column, as a consumer's sequence options report it. Set
   * when the shape has exactly one column with role `sequence`.
   */
  sequenceId?: ColumnUniversalId;
  /** File column of the subset column, when the dataset has one. */
  filterColumn?: string;
  /** The shape this dataset was built from. */
  shape: DatasetShape;
};

export const ANCHOR_ANNOTATIONS = {
  "pl7.app/isAnchor": "true",
  "pl7.app/isAbundance": "true",
  "pl7.app/abundance/isPrimary": "true",
  "pl7.app/abundance/normalized": "false",
  "pl7.app/abundance/unit": "cells",
  "pl7.app/label": "Number of Cells",
};

/**
 * The anchored id of a column keyed on `axes` of the `main` anchor, as the model's
 * anchored-id helpers produce it: domain keys sorted, then `name`.
 */
export function anchoredColumnId(
  name: string,
  domain: Record<string, string> = {},
  axes: number[] = [1],
): ColumnUniversalId {
  return JSON.stringify({
    axes: axes.map((idx) => ({ anchor: "main", idx })),
    domain: Object.fromEntries(Object.entries(domain).sort(([a], [b]) => a.localeCompare(b))),
    name,
  }) as ColumnUniversalId;
}

function roleColumns(shape: DatasetShape, role: ShapeColumn["role"]): ShapeColumn[] {
  return shape.columns.filter((c) => c.role === role);
}

function roleColumn(shape: DatasetShape, role: ShapeColumn["role"]): ShapeColumn | undefined {
  const hits = roleColumns(shape, role);
  if (hits.length > 1)
    throw new Error(`Shape has ${hits.length} ${role} columns: ${hits.map((c) => c.column)}`);
  return hits[0];
}

/** The handles a consumer wires with, read off a shape's column roles. */
function shapeHandles(shape: DatasetShape) {
  const anchor = roleColumn(shape, "anchor");
  if (anchor === undefined) throw new Error("Shape has no column with role 'anchor'");
  const sequences = roleColumns(shape, "sequence");
  const sequence = sequences.length === 1 ? sequences[0] : undefined;
  return {
    anchorColumn: anchor.column,
    sequenceId:
      sequence === undefined
        ? undefined
        : anchoredColumnId(sequence.name, sequence.domain, sequence.parentAxes),
    filterColumn: roleColumn(shape, "subset")?.column,
  };
}

/** File columns of a shape, axes first, in the order its TSV must carry them. */
export function shapeHeader(shape: DatasetShape): string[] {
  return [...shape.axes.map((a) => a.column), ...shape.columns.map((c) => c.column)];
}

/** Derive the xsv-import spec of a shape. */
export function shapeSpec(shape: DatasetShape): XsvImportSpec {
  return xsvImportSpec({
    axes: shape.axes.map((a) => ({
      column: a.column,
      filterOutRegex: a.filterOutRegex,
      spec: {
        name: a.name,
        type: a.type ?? "String",
        domain: a.domain,
        annotations: a.annotations,
      },
    })),
    columns: shape.columns.map((c) => ({
      column: c.column,
      filterOutRegex: c.filterOutRegex,
      spec: {
        name: c.name,
        valueType: c.valueType,
        parentAxes: c.parentAxes,
        domain: c.domain,
        annotations: c.annotations,
      },
    })),
    partitionKeyLength: shape.partitionKeyLength,
    storageFormat: shape.storageFormat,
  });
}

/** Render `rows` under `shape` into a dataset ready for `publishXsv`. */
export function buildDataset(shape: DatasetShape, rows: ShapeRow[]): SyntheticDataset {
  return {
    spec: shapeSpec(shape),
    content: renderTsv(shapeHeader(shape), rows),
    ...shapeHandles(shape),
    shape,
  };
}

/**
 * A committed TSV under `shape`: the file's header must list the shape's file columns in
 * order, so a drift between the two fails here and not inside the import.
 */
export function datasetFromTsv(shape: DatasetShape, content: string): SyntheticDataset {
  const header = content.split(/\r?\n/, 1)[0].split("\t");
  const expected = shapeHeader(shape);
  if (header.join("\t") !== expected.join("\t"))
    throw new Error(
      `TSV header does not match the shape.\n  file:  ${header.join(", ")}\n  shape: ${expected.join(", ")}`,
    );
  return { spec: shapeSpec(shape), content, ...shapeHandles(shape), shape };
}

/** One row of a sequence dataset. `sample` defaults to "S1"; `label` to the key. */
export type SequenceRow = {
  key: string;
  seq: string;
  count: number;
  sample?: string;
  label?: string;
};

/**
 * Options shared by the built-in sequence shapes. Each hook extends one layer of the
 * dataset: `shape` the axes and columns, `cells` the rendered row, `subset` the filter.
 */
export type SequenceDatasetOptions = {
  /** Mark these keys with a `pl7.app/isSubset` column; unmarked rows are absent from it. */
  subset?: { members: string[]; label?: string };
  /** Columns appended after the built-in ones. Fill them through `cells`. */
  columns?: ShapeColumn[];
  /** Rewrite the shape before it is built: rename, re-annotate, drop or reorder columns. */
  shape?: (shape: DatasetShape) => DatasetShape;
  /** Extra cells for a row, keyed by file column. */
  cells?: (row: SequenceRow) => ShapeRow;
};

/** Build a sequence dataset from a base shape and the options every built-in shape takes. */
export function sequenceDataset(
  base: DatasetShape,
  rows: SequenceRow[],
  toRow: (row: SequenceRow) => ShapeRow,
  opts: SequenceDatasetOptions = {},
  subsetName = "pl7.app/subset",
): SyntheticDataset {
  let shape: DatasetShape = { ...base, columns: [...base.columns, ...(opts.columns ?? [])] };
  if (opts.subset !== undefined) {
    shape.columns.push({
      column: "tag",
      name: subsetName,
      valueType: "Int",
      parentAxes: [1],
      // A subset column's members are the keys it has rows for, so unmarked rows are
      // skipped rather than imported as NA.
      filterOutRegex: "^$",
      annotations: { "pl7.app/label": opts.subset.label ?? "Picked", "pl7.app/isSubset": "true" },
      role: "subset",
    });
  }
  if (opts.shape !== undefined) shape = opts.shape(shape);
  const members = new Set(opts.subset?.members ?? []);
  return buildDataset(
    shape,
    rows.map((r) => ({
      ...toRow(r),
      ...(opts.subset === undefined ? {} : { tag: members.has(r.key) ? 1 : undefined }),
      ...(opts.cells?.(r) ?? {}),
    })),
  );
}
