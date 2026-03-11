import { isNil } from "es-toolkit";
import {
  parseJson,
  PlTableColumnIdJson,
  PTableColumnSpec,
  PTableValue,
} from "@platforma-sdk/model";
import { ref } from "vue";
import { PTableHidden } from "../sources/common";
import { watchCached } from "@milaboratories/uikit";
import { ColDef, ColGroupDef } from "ag-grid-enterprise";
import { PlAgDataTableRowNumberColId } from "../sources/row-number";
import { PlAgDataTableV2Row } from "../types";

export function useFilterableColumns(
  getSourceId: () => string | null,
  getColumnDefs: () => null | undefined | ColDef<PlAgDataTableV2Row, PTableValue | PTableHidden>[],
) {
  const filterableColumns = ref<PTableColumnSpec[]>([]);
  const visibleFilterableColumns = ref<PTableColumnSpec[]>([]);

  // Propagate columns for filter component
  watchCached(
    () => [getColumnDefs(), getSourceId()] as const,
    ([columnDefs, sourceId]) => {
      if (isNil(sourceId)) {
        filterableColumns.value = [];
        visibleFilterableColumns.value = [];
        return;
      }

      const dataColDefs = getDataColDefs(columnDefs);
      const cols = dataColDefs
        .filter((def): def is typeof def & { colId: string } => !isNil(def.colId))
        .flatMap((def) => ({
          id: parseJson(def.colId satisfies string as PlTableColumnIdJson).labeled,
          hide: def.hide,
        }));

      filterableColumns.value = cols.map((c) => c.id);
      visibleFilterableColumns.value = cols.filter((c) => !c.hide).map((c) => c.id);
    },
    { immediate: true },
  );

  return [filterableColumns, visibleFilterableColumns] as const;
}

function getDataColDefs(
  columnDefs: ColDef<PlAgDataTableV2Row, PTableValue | PTableHidden>[] | null | undefined,
): ColDef<PlAgDataTableV2Row, PTableValue | PTableHidden>[] {
  if (!columnDefs) return [];
  return columnDefs
    .filter(isColDef)
    .filter((def) => def.colId && def.colId !== PlAgDataTableRowNumberColId);
}

function isColDef<TData, TValue>(
  def: ColDef<TData, TValue> | ColGroupDef<TData>,
): def is ColDef<TData, TValue> {
  return !("children" in def);
}
