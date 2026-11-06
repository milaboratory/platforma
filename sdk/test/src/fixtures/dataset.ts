/*
  Declarative dataset shapes. A shape lists axes and columns in pl7.app terms; `buildDataset`
  derives the xsv-import spec, renders the rows, and reads off the handles a consuming block
  wires itself with. Shapes are plain data, so a block extends one by spreading it.
*/

import type { AxisSpec, ColumnUniversalId, PColumnSpec } from "@platforma-sdk/model";
import { AnchoredIdDeriver } from "@platforma-sdk/model";
import type { XsvColumn, XsvImportSpec, XsvImportSpecInput } from "./xsv-spec";
import { renderTsv, xsvImportSpec } from "./xsv-spec";

/** One column of a shape: an xsv-import column, plus its role in the dataset. */
export type ShapeColumn = XsvColumn & {
  /**
   * `anchor`: the abundance a consumer's `datasetRef` points at. `sequence`: the column a
   * consumer's sequence options report. `subset`: the filter a consumer's `filterRef` takes.
   */
  role?: "anchor" | "sequence" | "subset";
};

/** An xsv-import spec input whose columns carry roles. */
export type DatasetShape = Omit<XsvImportSpecInput, "columns"> & { columns: ShapeColumn[] };

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
  /** Anchored id of the sequence column, as a consumer's sequence options report it. */
  sequenceId: ColumnUniversalId;
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

/** The spec a shape's column is published with, as far as its identity goes. */
function publishedSpec(shape: DatasetShape, c: ShapeColumn): PColumnSpec {
  const axes = c.spec.parentAxes ?? shape.axes.map((_, idx) => idx);
  return {
    kind: "PColumn",
    name: c.spec.name ?? c.column,
    valueType: c.spec.valueType,
    domain: c.spec.domain,
    axesSpec: axes.map(
      (idx): AxisSpec => ({
        name: shape.axes[idx].spec.name ?? shape.axes[idx].column,
        type: shape.axes[idx].spec.type,
        domain: shape.axes[idx].spec.domain,
      }),
    ),
  };
}

/** The anchored id of `column` against `anchor` as `main`, as a consumer's options report it. */
const anchoredId = (
  shape: DatasetShape,
  anchor: ShapeColumn,
  column: ShapeColumn,
): ColumnUniversalId =>
  new AnchoredIdDeriver({ main: publishedSpec(shape, anchor) }).deriveS(
    publishedSpec(shape, column),
  );

function roleColumn(shape: DatasetShape, role: ShapeColumn["role"]): ShapeColumn | undefined {
  const hits = shape.columns.filter((c) => c.role === role);
  if (hits.length > 1)
    throw new Error(`Shape has ${hits.length} ${role} columns: ${hits.map((c) => c.column)}`);
  return hits[0];
}

/** Derive the xsv-import spec of a shape. */
export function shapeSpec(shape: DatasetShape): XsvImportSpec {
  return xsvImportSpec({
    ...shape,
    columns: shape.columns.map(({ column, id, filterOutRegex, naRegex, allowNA, spec }) => ({
      column,
      id,
      filterOutRegex,
      naRegex,
      allowNA,
      spec,
    })),
  });
}

/** Render `rows` under `shape` into a dataset ready for `publishXsv`. */
export function buildDataset(shape: DatasetShape, rows: ShapeRow[]): SyntheticDataset {
  const anchor = roleColumn(shape, "anchor");
  if (anchor === undefined) throw new Error("Shape has no column with role 'anchor'");
  const sequence = roleColumn(shape, "sequence");
  if (sequence === undefined) throw new Error("Shape has no column with role 'sequence'");
  const subset = roleColumn(shape, "subset");
  const header = [...shape.axes.map((a) => a.column), ...shape.columns.map((c) => c.column)];
  if (shape.separator !== undefined && shape.separator !== "\t")
    throw new Error(
      `Datasets render as TSV; separator ${JSON.stringify(shape.separator)} is not supported`,
    );
  const repeated = header.filter((c, i) => header.indexOf(c) !== i);
  if (repeated.length > 0) throw new Error(`Shape repeats file columns: ${repeated.join(", ")}`);
  return {
    spec: shapeSpec(shape),
    content: renderTsv(header, rows),
    anchorColumn: anchor.column,
    sequenceId: anchoredId(shape, anchor, sequence),
    filterColumn: subset?.column,
    shape,
  };
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
  /**
   * Mark these keys with a `pl7.app/isSubset` column; unmarked rows are absent from it. The
   * column is named `name`, or by the built-in shape.
   */
  subset?: { members: string[]; label?: string; name?: string };
  /**
   * Rewrite the shape before it is built: add, rename, re-annotate, drop or reorder
   * columns. Fill added columns through `cells`.
   */
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
): SyntheticDataset {
  let shape = base;
  if (opts.subset !== undefined) {
    const subset: ShapeColumn = {
      column: "tag",
      // A subset column's members are the keys it has rows for, so unmarked rows are
      // skipped rather than imported as NA.
      filterOutRegex: "^$",
      spec: {
        name: opts.subset.name ?? "pl7.app/subset",
        valueType: "Int",
        parentAxes: [1],
        annotations: {
          "pl7.app/label": opts.subset.label ?? "Picked",
          "pl7.app/isSubset": "true",
        },
      },
      role: "subset",
    };
    shape = { ...shape, columns: [...shape.columns, subset] };
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
