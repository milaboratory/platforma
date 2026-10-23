import type {
  AnnotationDataStatus,
  AxisId,
  AxisSpec,
  CanonicalizedJson,
  ColumnUniversalId,
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
export type PlDataTableFilterMeta = {
  id: number;
  source?: "table-filter" | "table-search";
  isExpanded?: boolean;
  isSuppressed?: boolean;
};
export type PlDataTableFilterSpecLeaf = FilterSpecLeaf<PTableColumnId>;
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
      sorting: null;
      filters: null;
      defaultFilters: null;
    }
  | {
      sourceId: string;
      hiddenColIds: null | PTableColumnId[];
      sorting: null | PTableSorting[];
      filters: null | PlDataTableFilters;
      defaultFilters: null | PlDataTableFilters;
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
  /**
   * Sidecar rendering metadata kept out of the column specs: baking
   * label/visibility/order/status into a spec via overrides changes the
   * recipe's `ColumnUniversalId`, so the same physical column reached two ways
   * (e.g. as a primary column and as a discovered axis label) would diverge
   * into two ids and render twice. The UI overlays this onto the
   * engine-emitted specs at render time.
   */
  columnsMeta?: PlDataTableColumnsMeta;
};

/** Display metadata for one column, applied by the UI over the emitted spec. */
export type PlDataTableColumnMeta = {
  /** Disambiguated label (overrides the spec's intrinsic `pl7.app/label`). */
  label?: string;
  /** Effective visibility from rules + intrinsic annotations. */
  visibility?: "default" | "optional" | "hidden";
  /** Effective order priority (higher = further left). */
  order?: number;
  /** Per-column data status (set for visible columns only). */
  status?: AnnotationDataStatus;
};

/** Display metadata for one axis, applied by the UI over the emitted spec. */
export type PlDataTableAxisMeta = {
  /** Whether the UI must hide this axis (axes introduced only by secondary columns). */
  hidden: boolean;
};

/** Sidecar display metadata for a table, keyed by emitted column/axis identity. */
export type PlDataTableColumnsMeta = {
  /** Per-column metadata keyed by the emitted `ColumnUniversalId`. */
  columns: Record<ColumnUniversalId, PlDataTableColumnMeta>;
  /** Per-axis metadata keyed by the canonicalized `AxisId`. */
  axes: Record<CanonicalizedJson<AxisId>, PlDataTableAxisMeta>;
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
