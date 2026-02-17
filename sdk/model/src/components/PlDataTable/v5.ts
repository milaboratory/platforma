import type {
  AxisId,
  AxisSpec,
  CanonicalizedJson,
  ListOptionBase,
  PObjectId,
  PTableColumnSpec,
  PTableFilters,
  PTableRecordFilter,
  PTableSorting,
  PColumnIdAndSpec,
  PTableHandle,
} from "@milaboratories/pl-model-common";
import type { FilterSpec, FilterSpecLeaf } from "../../filters";

export type PlTableColumnId = {
  /** Original column spec */
  source: PTableColumnSpec;
  /** Column spec with labeled axes replaced by label columns */
  labeled: PTableColumnSpec;
};

export type PlTableColumnIdJson = CanonicalizedJson<PlTableColumnId>;

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
  /** Includes column visibility */
  columnVisibility?: {
    /** All colIds which were hidden */
    hiddenColIds: PlTableColumnIdJson[];
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
export type PlDataTableAdvancedFilter = FilterSpec<
  FilterSpecLeaf<string>,
  { id: number; isExpanded?: boolean }
>;

export type PlDataTableStateV2CacheEntry = {
  /** DataSource identifier for state management */
  sourceId: string;
  /** Internal ag-grid state */
  gridState: PlDataTableGridStateCore;
  /** Sheets state */
  sheetsState: PlDataTableSheetState[];
  /** Filters state (tree-based, compatible with PlAdvancedFilter) */
  filtersState: PlDataTableAdvancedFilter | null;
};

export type PTableParamsV2 =
  | {
      sourceId: null;
      hiddenColIds: null;
      filters: null;
      sorting: [];
    }
  | {
      sourceId: string;
      hiddenColIds: PObjectId[] | null;
      filters: PTableFilters;
      sorting: PTableSorting[];
    };

export type PlDataTableStateV2Normalized = {
  /** Version for upgrades */
  version: 5;
  /** Internal states, LRU cache for 5 sourceId-s */
  stateCache: PlDataTableStateV2CacheEntry[];
  /** PTable params derived from the cache state for the current sourceId */
  pTableParams: PTableParamsV2;
};

/** PlAgDataTable model */
export type PlDataTableModel = {
  /** DataSource identifier for state management */
  sourceId: string | null;
  /** p-table including all columns, used to show the full specification of the table */
  fullTableHandle: PTableHandle;
  /** p-table including only visible columns, used to get the data */
  visibleTableHandle: PTableHandle;
};

export type CreatePlDataTableOps = {
  /** Filters for columns and non-partitioned axes */
  filters?: PTableRecordFilter[];

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
