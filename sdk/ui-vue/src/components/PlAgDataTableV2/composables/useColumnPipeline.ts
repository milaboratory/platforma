import type {
  AxesSpec,
  AxisId,
  PFrameDriver,
  PlDataTableModel,
  PlDataTableSheet,
  PlTableColumnIdJson,
  PTableColumnSpec,
  PTableValue,
} from "@platforma-sdk/model";
import { getAxisId } from "@platforma-sdk/model";
import type { ColDef, GridApi, IServerSideDatasource } from "ag-grid-enterprise";
import type { PlAgDataTableV2Row } from "../../PlAgDataTable/types";
import type { PTableHidden } from "../../PlAgDataTable/sources/common";
import type { CellButtonAxisParameters, ColumnPipelineResult } from "../types";
import { makeRowNumberColDef } from "../../PlAgDataTable/sources/row-number";
import { buildIndexMapping } from "../utils/indexMapping";
import { filterColumns, getLabelColumnIndex } from "../utils/columnFiltering";
import { sortColumns } from "../utils/columnSorting";
import { computeDefaultHidden, makeColDef } from "../utils/colDefBuilder";
import { buildDatasource } from "../utils/datasourceBuilder";
import { isNil, uniq } from "es-toolkit";

export type ColumnPipelineOptions = {
  readonly model: PlDataTableModel;
  readonly sheets: PlDataTableSheet[];
  readonly hiddenColIds: PlTableColumnIdJson[] | undefined;
  readonly cellButtonAxisParams?: CellButtonAxisParameters;
  readonly signal: AbortSignal;
  readonly onDataRendered: (api: GridApi<PlAgDataTableV2Row>) => void;
};

export function useColumnPipeline(params: { pfDriver: PFrameDriver }): {
  runPipeline: (options: ColumnPipelineOptions) => Promise<ColumnPipelineResult>;
} {
  const { pfDriver } = params;

  async function runPipeline(options: ColumnPipelineOptions): Promise<ColumnPipelineResult> {
    const { model, sheets, signal, onDataRendered, cellButtonAxisParams } = options;

    // Step 1: fetchSpecs
    const [fullSpecs, visibleSpecs] = await Promise.all([
      pfDriver.getSpec(model.fullTableHandle),
      pfDriver.getSpec(model.visibleTableHandle),
    ]);

    if (signal.aborted) throw new Error("pipeline aborted");

    // Step 2: buildIndexMapping
    const specsToVisibleMapping = buildIndexMapping(fullSpecs, visibleSpecs);

    // Step 3: filterColumns
    const sheetAxesIds: AxisId[] = sheets.map((sheet) => getAxisId(sheet.axis));
    const { filteredIndices, labelColumns } = filterColumns(fullSpecs, sheetAxesIds);

    // Step 4: sortColumns
    const sortedIndices = sortColumns(filteredIndices, fullSpecs);

    // Step 5: resolveLabels — fields are the sorted indices; indices replace axes with their label columns
    const fields = [...sortedIndices];
    const indices = sortedIndices.map((i) => {
      const spec = fullSpecs[i];
      if (spec.type === "axis") {
        const labelIdx = getLabelColumnIndex(labelColumns, spec.id);
        if (labelIdx !== -1) {
          return labelIdx;
        }
      }
      return i;
    });

    // Step 6: computeDefaultHidden
    const resolvedHiddenColIds = isNil(options.hiddenColIds)
      ? computeDefaultHidden(fields, indices, fullSpecs)
      : options.hiddenColIds;

    // Step 7: buildColDefs
    const columnDefs: ColDef<PlAgDataTableV2Row, PTableValue | PTableHidden>[] = [
      makeRowNumberColDef(),
      ...fields.map((field, index) =>
        makeColDef(
          field,
          fullSpecs[field],
          fullSpecs[indices[index]],
          resolvedHiddenColIds,
          cellButtonAxisParams,
        ),
      ),
    ];

    // Compute axes spec from the visible table
    const visibleAxesIndices: number[] = [];
    const axesSpec: AxesSpec = visibleSpecs
      .entries()
      .filter(([i, spec]) => {
        if (spec.type === "axis") {
          visibleAxesIndices.push(i);
          return true;
        }
        return false;
      })
      .map(([, spec]) => {
        if (spec.type !== "axis") throw new Error("unreachable");
        return spec.spec;
      })
      .toArray();

    // Build request indices: only non-hidden fields mapped to visible spec
    const requestIndicesFromFields: number[] = [];
    const fieldResultMapping: number[] = [];
    fields.forEach((field) => {
      const visibleSpecIdx = specsToVisibleMapping.get(field);
      if (visibleSpecIdx !== undefined && visibleSpecIdx !== -1) {
        fieldResultMapping.push(requestIndicesFromFields.length);
        requestIndicesFromFields.push(visibleSpecIdx);
      } else {
        fieldResultMapping.push(-1);
      }
    });

    const requestIndices = uniq([...requestIndicesFromFields, ...visibleAxesIndices]);
    const axesResultIndices = visibleAxesIndices.map((vi) => requestIndices.indexOf(vi));

    // Step 8: buildDatasource
    const datasource: IServerSideDatasource<PlAgDataTableV2Row> = buildDatasource({
      pfDriver,
      visibleTableHandle: model.visibleTableHandle,
      fields,
      requestIndices,
      fieldResultMapping,
      axesResultIndices,
      signal,
      onDataRendered,
    });

    // Compute filterable / visible-filterable columns from the column defs
    const filterableColumns: PTableColumnSpec[] = fields.map(
      (_field, index) => fullSpecs[indices[index]],
    );
    const visibleFilterableColumns: PTableColumnSpec[] = fields.reduce<PTableColumnSpec[]>(
      (acc, field, index) => {
        const colDef = columnDefs[index + 1]; // offset by 1 for row number column
        if (colDef.hide !== true) {
          acc.push(fullSpecs[indices[index]]);
        }
        return acc;
      },
      [],
    );

    return {
      columnDefs,
      datasource,
      axesSpec,
      filterableColumns,
      visibleFilterableColumns,
    };
  }

  return { runPipeline };
}
