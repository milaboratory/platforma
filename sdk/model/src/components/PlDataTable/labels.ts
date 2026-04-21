import type { AxisId, PColumn, PColumnSpec, PObjectId } from "@milaboratories/pl-model-common";
import {
  getAxisId,
  isLabelColumn,
  matchAxisId,
  PColumnName,
  Services,
  type RequireServices,
} from "@milaboratories/pl-model-common";
import type { PColumnDataUniversal, RenderCtxBase } from "../../render";
import { ColumnCollectionBuilder, collectCtxColumnSnapshotProviders } from "../../columns";
import { throwError } from "@milaboratories/helpers";

/**
 * Get all label columns visible in the current render context
 * (result pool + block outputs + prerun).
 */
export function getAllLabelColumns<A, U, S extends RequireServices<typeof Services.PFrameSpec>>(
  ctx: RenderCtxBase<A, U, S>,
): PColumn<PColumnDataUniversal>[] {
  const pframeSpec =
    ctx.services.pframeSpec ?? throwError("PFrameSpec service is required for label discovery.");
  const collection = new ColumnCollectionBuilder(pframeSpec)
    .addSources(collectCtxColumnSnapshotProviders(ctx))
    .build({ allowPartialColumnList: true });
  try {
    return collection
      .findColumns({ include: { name: PColumnName.Label, axes: [] } })
      .reduce<PColumn<PColumnDataUniversal>[]>((acc, hit) => {
        const data = hit.data?.get();
        return data === undefined ? acc : [...acc, { id: hit.id, spec: hit.spec, data }];
      }, []);
  } finally {
    collection.dispose();
  }
}

/** Get label columns matching the provided columns from the result pool */
export function getMatchingLabelColumns(
  columns: { spec: PColumnSpec }[],
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
  const colId = (
    id: PObjectId,
    domain?: Record<string, string>,
    contextDomain?: Record<string, string>,
  ): PObjectId => {
    let wid = id.toString();
    if (domain) {
      for (const k in domain) {
        wid += k;
        wid += domain[k];
      }
    }
    if (contextDomain) {
      for (const k in contextDomain) {
        wid += k;
        wid += contextDomain[k];
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
      const dataDomainLen =
        Object.keys(axisId.domain ?? {}).length + Object.keys(axisId.contextDomain ?? {}).length;
      const labelDomainLen =
        Object.keys(labelAxis.domain ?? {}).length +
        Object.keys(labelAxis.contextDomain ?? {}).length;
      if (dataDomainLen > labelDomainLen) {
        labelColumns.push({
          id: colId(labelColumn.id, axisId.domain, axisId.contextDomain),
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
