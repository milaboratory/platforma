import type { AxisId, AxisSpec, PColumnSpec } from "./spec/spec";
import type { ColumnUniversalId } from "./spec/ids";

export type PTableColumnSpecAxis = {
  type: "axis";
  id: AxisId;
  spec: AxisSpec;
};

export type PTableColumnSpecColumn = {
  type: "column";
  /**
   * Leaf column id as it appears in the SpecQuery — may be a rich
   * {@link ColumnUniversalId} (Discovered / Overridden / Filtered) or a bare
   * {@link PObjectId}. The host resolver strips to bare via `extractPObjectId`
   * before physical lookup.
   */
  id: ColumnUniversalId;
  spec: PColumnSpec;
};

/** Unified spec object for axes and columns */
export type PTableColumnSpec = PTableColumnSpecAxis | PTableColumnSpecColumn;

export type PTableColumnIdAxis = {
  type: "axis";
  id: AxisId;
};

export type PTableColumnIdColumn = {
  type: "column";
  /** @see PTableColumnSpecColumn.id */
  id: ColumnUniversalId;
};

/** Unified PTable column identifier */
export type PTableColumnId = PTableColumnIdAxis | PTableColumnIdColumn;

export function getPTableColumnId(spec: PTableColumnSpec): PTableColumnId {
  switch (spec.type) {
    case "axis":
      return {
        type: "axis",
        id: spec.id,
      };
    case "column":
      return {
        type: "column",
        id: spec.id,
      };
  }
}
