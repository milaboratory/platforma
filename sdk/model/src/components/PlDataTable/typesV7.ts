import type {
  AxisId,
  AxisSpec,
  CanonicalizedJson,
  ListOptionBase,
  PTableSorting,
  PColumnIdAndSpec,
  PTableHandle,
  RootFilterSpec,
  PTableColumnId,
  PFrameHandle,
} from "@milaboratories/pl-model-common";
import type { FilterSpecLeaf } from "../../filters";
import { Nil } from "@milaboratories/helpers";

export type PlTableColumnIdJson = CanonicalizedJson<PTableColumnId>;

export type PlDataTableGridStateCore = {
  /** Includes column ordering */
  columnOrder?: {
    /** All colIds in order */
    orderedColIds: PlTableColumnIdJson[];
  };
  /** Includes current sort columns and direction */
  sort?: {
    /** Sorted columns and directions in order */
    sortModel: {
      /** Column Id to apply the sort to. */
      colId: PlTableColumnIdJson;
      /** Sort direction */
      sort: "asc" | "desc";
    }[];
  };
  /** User overrides to column visibility, relative to the block-defined default
   * (the `pl7.app/table/visibility` annotation) rather than the absolute hidden
   * set. Keeps saved state stable when the block changes a column's default
   * between runs (e.g. a filter/ranking column flips default<->optional):
   * unmentioned columns follow their current default. */
  columnVisibility?: {
    /** Columns the user explicitly hid that the block default would have shown. */
    hiddenColIds: PlTableColumnIdJson[];
    /** Columns the user explicitly showed that the block default would have hidden. */
    shownColIds?: PlTableColumnIdJson[];
  };
};

export type PlDataTableSheet = {
  /** spec of the axis to use */
  axis: AxisSpec;
  /** options to show in the filter dropdown */
  options: ListOptionBase<string | number>[];
  /** default (selected) value */
  defaultValue?: string | number;
};

export type PlDataTableSheetState = {
  /** id of the axis */
  axisId: AxisId;
  /** selected value */
  value: string | number;
};

/** Tree-based filter state compatible with PlAdvancedFilter's RootFilter */
export type PlDataTableFilterMeta = {
  id: number;
  source?: "table-filter" | "table-search";
  isExpanded?: boolean;
  isSuppressed?: boolean;
};
export type PlDataTableFilterSpecLeaf = FilterSpecLeaf<CanonicalizedJson<PTableColumnId>>;
export type PlDataTableFilters = RootFilterSpec<PlDataTableFilterSpecLeaf>;
export type PlDataTableFiltersWithMeta = RootFilterSpec<
  PlDataTableFilterSpecLeaf,
  PlDataTableFilterMeta
>;

export type PlDataTableStateV2CacheEntry = {
  /** DataSource identifier for state management */
  sourceId: string;
  /** Internal ag-grid state */
  gridState: PlDataTableGridStateCore;
  /** Sheets state */
  sheetsState: PlDataTableSheetState[];
  /** User filters state (tree-based, compatible with PlAdvancedFilter) */
  filtersState: null | PlDataTableFiltersWithMeta;
  /** Default filters state from model (snapshot of defaults) */
  defaultFiltersState: null | PlDataTableFiltersWithMeta;
  /** Fast search string */
  searchString?: string;
};

export type PTableParamsV2 =
  | {
      sourceId: null;
      hiddenColIds: null;
      shownColIds?: null;
      sorting: [];
      filters: null;
      defaultFilters: null;
    }
  | {
      sourceId: string;
      /** User's explicit hide overrides (vs block default visibility). */
      hiddenColIds: null | PTableColumnId[];
      /** User's explicit show overrides (vs block default visibility). */
      shownColIds?: null | PTableColumnId[];
      sorting: PTableSorting[];
      filters: null | PlDataTableFilters;
      defaultFilters: null | PlDataTableFilters;
    };

/** Historical v7 normalized state (pre-deviation column visibility).
 *
 * Shape is identical to the current normalized state, but `columnVisibility`
 * stored the ABSOLUTE hidden set rather than the user's deviations from the
 * block-defined default visibility. The v7->v8 migration resets it (see
 * state-migration.ts) so the deviation model starts clean. */
export type PlDataTableStateV2V7 = {
  version: 7;
  stateCache: PlDataTableStateV2CacheEntry[];
  pTableParams: PTableParamsV2;
};

export type PlDataTableStateV2Normalized = {
  /** Version for upgrades */
  version: 8;
  /** Internal states, LRU cache for 5 sourceId-s */
  stateCache: PlDataTableStateV2CacheEntry[];
  /** PTable params derived from the cache state for the current sourceId */
  pTableParams: PTableParamsV2;
};

/** PlAgDataTable model */
export type PlDataTableModel = {
  /** DataSource identifier for state management */
  sourceId: null | string;
  /** p-table including all columns, used to show the full specification of the table */
  fullTableHandle?: PTableHandle;
  /** p-frame handle */
  fullPframeHandle?: PFrameHandle;
  /** p-table including only visible columns, used to get the data */
  visibleTableHandle?: PTableHandle;
  /** Default filters from model options, surfaced for UI display */
  defaultFilters?: Nil | PlDataTableFilters;
};

export type CreatePlDataTableOps = {
  /** Filters for columns and non-partitioned axes */
  filters?: PlDataTableFilters;

  /** Sorting to columns hidden from user */
  sorting?: PTableSorting[];

  /**
   * Selects columns for which will be inner-joined to the table.
   *
   * Default behaviour: all columns are considered to be core
   */
  coreColumnPredicate?: (spec: PColumnIdAndSpec) => boolean;

  /**
   * Determines how core columns should be joined together:
   *   inner - so user will only see records present in all core columns
   *   full - so user will only see records present in any of the core columns
   *
   * All non-core columns will be left joined to the table produced by the core
   * columns, in other words records form the pool of non-core columns will only
   * make their way into the final table if core table contains corresponding key.
   *
   * Default: 'full'
   */
  coreJoinType?: "inner" | "full";
};
