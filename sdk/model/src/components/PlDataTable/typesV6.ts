import type { CanonicalizedJson, PTableColumnSpec } from "@milaboratories/pl-model-common";
import type { PlDataTableFiltersWithMeta, PlDataTableSheetState, PTableParamsV2 } from "./typesV7";

/**
 * v6 colId scheme: bare canonicalized `PTableColumnSpec` (full spec including
 * all annotations and `pl7.app/trace`). v7 dropped the spec body and now uses
 * `CanonicalizedJson<PTableColumnId>` — orders of magnitude smaller.
 */
export type PlDataTableV6ColIdJson = CanonicalizedJson<PTableColumnSpec>;

export type PlDataTableGridStateV6 = {
  columnOrder?: { orderedColIds: PlDataTableV6ColIdJson[] };
  sort?: { sortModel: { colId: PlDataTableV6ColIdJson; sort: "asc" | "desc" }[] };
  columnVisibility?: { hiddenColIds: PlDataTableV6ColIdJson[] };
};

export type PlDataTableStateV2V6CacheEntry = {
  sourceId: string;
  gridState: PlDataTableGridStateV6;
  sheetsState: PlDataTableSheetState[];
  filtersState: null | PlDataTableFiltersWithMeta;
  defaultFiltersState: null | PlDataTableFiltersWithMeta;
  searchString?: string;
};

export type PlDataTableStateV2V6 = {
  version: 6;
  stateCache: PlDataTableStateV2V6CacheEntry[];
  pTableParams: PTableParamsV2;
};
