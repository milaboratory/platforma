import {
  getAxisId,
  isPColumn,
  JoinEntry,
  matchAxisId,
  PColumn,
  PColumnIdAndSpec,
  PTableHandle,
  PTableRecordFilter,
  PTableSorting
} from '@milaboratories/pl-model-common';
import { RenderCtx, TreeNodeAccessor } from '../render';


/** Data table state */
export type PlDataTableGridState = {
  /** Includes column ordering */
  columnOrder?: {
    /** All colIds in order */
    orderedColIds: string[];
  };
  /** Includes current sort columns and direction */
  sort?: {
    /** Sorted columns and directions in order */
    sortModel: {
      /** Column Id to apply the sort to. */
      colId: string;
      /** Sort direction */
      sort: 'asc' | 'desc';
    }[];
  };

  columnVisibility?: {
    hiddenColIds: string[];
  }

  columnState?:{
    /** ID of the column */
    colId: string;
    /** True if the column is hidden */
    hide?: boolean | null;
    /** Width of the column in pixels */
    width?: number;
    /** Column's flex if flex is set */
    flex?: number | null;
    /** Sort applied to the column */
    sort?: 'asc' | 'desc' | null;
    /** The order of the sort, if sorting by many columns */
    sortIndex?: number | null;
    /** The aggregation function applied */
    aggFunc?: string | /*IAggFunc |*/ null;
    /** True if pivot active */
    pivot?: boolean | null;
    /** The order of the pivot, if pivoting by many columns */
    pivotIndex?: number | null;
    /** Set if column is pinned */
    pinned?: 'left' | 'right' | boolean | null | undefined;
    /** True if row group active */
    rowGroup?: boolean | null;
    /** The order of the row group, if grouping by many columns */
    rowGroupIndex?: number | null;
  }[]

  /** current sheet selections */
  sheets?: Record<string, string | number>;
};

/**
 * Params used to get p-table handle from the driver
 */
export type PTableParams = {
  /** For sourceType: 'pframe' the join is original one, enriched with label columns */
  join?: JoinEntry<PColumnIdAndSpec>;
  sorting?: PTableSorting[];
  filters?: PTableRecordFilter[];
};

/**
 * PlDataTable persisted state
 */
export type PlDataTableState = {
  // internal ag-grid state
  gridState: PlDataTableGridState;

  // mapping of gridState onto the p-table data structures
  pTableParams?: PTableParams;
};

/**
 * Create p-table handle given ui table state
 *
 * @param ctx context
 * @param columns column list
 * @param tableState table ui state
 * @returns
 */
export function createPlDataTable<A, U>(
  ctx: RenderCtx<A, U>,
  columns: PColumn<TreeNodeAccessor>[],
  tableState?: PlDataTableState
): PTableHandle {
  const allLabelCols = ctx.resultPool
    .getData()
    .entries.map((d) => d.obj)
    .filter(isPColumn)
    .filter((p) => p.spec.name === 'pl7.app/label' && p.spec.axesSpec.length === 1);

  const moreColumns = [];
  for (const col of columns) {
    for (const axis of col.spec.axesSpec) {
      const axisId = getAxisId(axis);
      for (const match of allLabelCols) {
        if (matchAxisId(axisId, getAxisId(match.spec.axesSpec[0]))) {
          moreColumns.push(match);
        }
      }
    }
  }
  return ctx.createPTable({
    columns: [...columns, ...moreColumns],
    filters: tableState?.pTableParams?.filters,
    sorting: tableState?.pTableParams?.sorting
  });
}
