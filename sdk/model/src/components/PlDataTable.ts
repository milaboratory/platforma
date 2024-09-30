import { PTableRecordFilter, PTableSorting } from '@milaboratories/pl-model-common';

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

  /** current sheet selections */
  sheets?: Record<string, string | number>;
};

/**
 * Params used to get p-table handle from the driver
 */
export type PTableParams = {
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
