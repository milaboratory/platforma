import type { AxisId, PTableColumnSpec } from "@platforma-sdk/model";
import {
  getAxisId,
  isColumnHidden,
  isLabelColumn as isLabelColumnSpec,
  isLinkerColumn as isLinkerColumnSpec,
  matchAxisId,
} from "@platforma-sdk/model";

export type LabelColumnInfo = {
  readonly axisId: AxisId;
  readonly labelColumnIdx: number;
};

/**
 * Filters out partitioned axes, label columns, hidden columns and linker columns.
 * Records label column associations for later axis-to-label resolution.
 */
export function filterColumns(
  fullSpecs: PTableColumnSpec[],
  sheetAxesIds: AxisId[],
): { filteredIndices: number[]; labelColumns: LabelColumnInfo[] } {
  const isPartitionedAxis = (axisId: AxisId) => sheetAxesIds.some((id) => matchAxisId(id, axisId));

  const labelColumns: LabelColumnInfo[] = [];

  const setLabelColumnIndex = (axisId: AxisId, labelColumnIdx: number) => {
    const alreadyExists = labelColumns.some((info) => matchAxisId(info.axisId, axisId));
    if (!alreadyExists) {
      labelColumns.push({ axisId, labelColumnIdx });
    } else {
      console.warn(`multiple label columns match axisId: ${JSON.stringify(axisId)}`);
    }
  };

  const filteredIndices = fullSpecs
    .entries()
    .filter(([i, spec]) => {
      switch (spec.type) {
        case "axis":
          return !isPartitionedAxis(spec.id);
        case "column":
          if (isLabelColumnSpec(spec.spec)) {
            const labeledAxisId = getAxisId(spec.spec.axesSpec[0]);
            if (!isPartitionedAxis(labeledAxisId)) {
              setLabelColumnIndex(labeledAxisId, i);
            }
            return false;
          }
          return !isColumnHidden(spec.spec) && !isLinkerColumnSpec(spec.spec);
      }
    })
    .map(([i]) => i)
    .toArray();

  return { filteredIndices, labelColumns };
}

/**
 * Resolves an axis ID to its label column index, or -1 if no label column is found.
 */
export function getLabelColumnIndex(labelColumns: LabelColumnInfo[], axisId: AxisId): number {
  return labelColumns.find((info) => matchAxisId(info.axisId, axisId))?.labelColumnIdx ?? -1;
}
