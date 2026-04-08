// If you need to export something from previous versions,
// that mean you don't forget update deps to the latest version of the package.
export type {
  PlTableColumnId,
  PlTableColumnIdJson,
  PlDataTableGridStateCore,
  PlDataTableSheet,
  PlDataTableSheetState,
  PlDataTableStateV2CacheEntry,
  PTableParamsV2,
  PlDataTableStateV2Normalized,
  PlDataTableModel,
  PlDataTableFilters,
  PlDataTableFiltersWithMeta,
} from "./typesV5";

export type { PlDataTableStateV2 } from "./state-migration";
export {
  upgradePlDataTableStateV2,
  createDefaultPTableParams,
  createPlDataTableStateV2,
} from "./state-migration";

export { createPlDataTableSheet } from "./createPlDataTableSheet";
export { createPlDataTable, discoverColumns } from "./createPlDataTable";
export { createPlDataTableV2 } from "./createPlDataTable/createPlDataTableV2";
export { createPlDataTableV3 } from "./createPlDataTable/createPlDataTableV3";
export {
  isColumnHidden,
  isColumnOptional,
  getOrderPriority,
  getEffectiveVisibility,
} from "./createPlDataTable/utils";

export type {
  ColumnsDisplayOptions,
  ColumnOrderRule,
  ColumnVisibilityRule,
  ColumnMatcher,
  ColumnsSelectorConfig,
  createPlDataTableOptionsV3,
} from "./createPlDataTable/createPlDataTableV3";
