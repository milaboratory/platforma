import type { AxisId, PColumn, PColumnIdAndSpec, PObjectId } from "@milaboratories/pl-model-common";
import {
  getAxisId,
  isLabelColumn,
  matchAxisId,
  PColumnName,
} from "@milaboratories/pl-model-common";
import type { AxisLabelProvider, ColumnProvider, PColumnDataUniversal } from "../../render";
import { PColumnCollection } from "../../render";

/** Get all label columns from the result pool */
export function getAllLabelColumns(
  resultPool: AxisLabelProvider & ColumnProvider,
): PColumn<PColumnDataUniversal>[] | undefined {
  return new PColumnCollection()
    .addAxisLabelProvider(resultPool)
    .addColumnProvider(resultPool)
    .getColumns(
      {
        name: PColumnName.Label,
        axes: [{}], // exactly one axis
      },
      { dontWaitAllData: true, overrideLabelAnnotation: false },
    );
}

/** Get label columns matching the provided columns from the result pool */
export function getMatchingLabelColumns(
  columns: PColumnIdAndSpec[],
  allLabelColumns: PColumn<PColumnDataUniversal>[],
): PColumn<PColumnDataUniversal>[] {
  // split input columns into label and value columns
  const inputLabelColumns: typeof columns = [];
  const inputValueColumns: typeof columns = [];
  for (const column of columns) {
    if (isLabelColumn(column.spec)) {
      inputLabelColumns.push(column);
    } else {
      inputValueColumns.push(column);
    }
  }

  // collect distinct axes of value columns
  const unlabeledAxes: AxisId[] = [];
  for (const column of inputValueColumns) {
    for (const axis of column.spec.axesSpec) {
      const axisId = getAxisId(axis);
      if (!unlabeledAxes.some((id) => matchAxisId(id, axisId))) {
        unlabeledAxes.push(axisId);
      }
    }
  }

  // remove axes matched by input label columns
  for (const labelColumn of inputLabelColumns) {
    const labelAxisId = getAxisId(labelColumn.spec.axesSpec[0]);
    const labelMatch = unlabeledAxes.findIndex((axisId) => matchAxisId(axisId, labelAxisId));
    if (labelMatch !== -1) {
      unlabeledAxes.splice(labelMatch, 1);
    }
  }

  // warning: changing this id will break backward compatibility
  const colId = (id: PObjectId, domain?: Record<string, string>): PObjectId => {
    let wid = id.toString();
    if (domain) {
      for (const k in domain) {
        wid += k;
        wid += domain[k];
      }
    }
    return wid as PObjectId;
  };

  // search label columns for unmatched axes
  const labelColumns: typeof allLabelColumns = [];
  for (const labelColumn of allLabelColumns) {
    const labelAxis = labelColumn.spec.axesSpec[0];
    const labelAxisId = getAxisId(labelAxis);
    const labelMatch = unlabeledAxes.findIndex((axisId) => matchAxisId(axisId, labelAxisId));
    if (labelMatch !== -1) {
      const axisId = unlabeledAxes[labelMatch];
      const dataDomainLen = Object.keys(axisId.domain ?? {}).length;
      const labelDomainLen = Object.keys(labelAxis.domain ?? {}).length;
      if (dataDomainLen > labelDomainLen) {
        labelColumns.push({
          id: colId(labelColumn.id, axisId.domain),
          spec: {
            ...labelColumn.spec,
            axesSpec: [{ ...axisId, annotations: labelAxis.annotations }],
          },
          data: labelColumn.data,
        });
      } else {
        labelColumns.push(labelColumn);
      }
      unlabeledAxes.splice(labelMatch, 1);
    }
  }
  return labelColumns;
}
