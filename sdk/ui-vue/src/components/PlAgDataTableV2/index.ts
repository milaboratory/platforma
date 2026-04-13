import { activateAgGrid } from "../../lib";

activateAgGrid();

export { default as PlDataTableV2 } from "./PlAgDataTableV2.vue";

// Re-export shared types and utilities from V1 that remain unchanged
export type {
  PlDataTableSettingsV2,
  PlDataTableSettingsV2Base,
  PlAgDataTableV2Controller,
  PlAgDataTableV2Row,
  PlTableRowId,
  PlTableRowIdJson,
  PlAgOverlayLoadingParams,
  PlAgOverlayNoRowsParams,
  PlDataTableSheetsSettings,
  PlDataTableSheetNormalized,
} from "../PlAgDataTable/types";
export { usePlDataTableSettingsV2 } from "../PlAgDataTable/types";

// Re-export utilities unchanged from V1
export { DeferredCircular, ensureNodeVisible } from "../PlAgDataTable/sources/focus-row";
export { defaultMainMenuItems } from "../PlAgDataTable/sources/menu-items";
export { ROW_NUMBER_COL_ID as PlAgDataTableRowNumberColId } from "./constants";
