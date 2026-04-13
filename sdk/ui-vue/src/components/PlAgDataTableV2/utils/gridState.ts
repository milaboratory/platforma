import type { PlDataTableGridStateCore, PlTableColumnIdJson } from "@platforma-sdk/model";
import type { GridState } from "ag-grid-enterprise";

export function makePartialState(state: GridState): PlDataTableGridStateCore {
  return {
    columnOrder: state.columnOrder as { orderedColIds: PlTableColumnIdJson[] } | undefined,
    sort: state.sort as
      | { sortModel: { colId: PlTableColumnIdJson; sort: "asc" | "desc" }[] }
      | undefined,
    columnVisibility: state.columnVisibility as { hiddenColIds: PlTableColumnIdJson[] } | undefined,
  };
}
