import type {
  AxisId,
  JoinEntry,
  LocalBlobHandleAndSize,
  PColumnIdAndSpec,
  PFrameHandle,
  PlDataTableSheet,
  PlTableFilter,
  PlTableFilterType,
  PTableColumnId,
  PTableHandle,
  RemoteBlobHandleAndSize,
  ValueOrErrors,
} from '@platforma-sdk/model';

/** Data table settings */
export type PlDataTableSettings =
  | {
      /** The type of the source to feed the data into the table */
      sourceType: 'pframe';
      /** PFrame handle output */
      pFrame: PFrameHandle | undefined;
      /** Join used to construct pTable, will be enriched with label-columns */
      join: JoinEntry<PColumnIdAndSpec> | undefined;
      /** Partitioning axes to make sheets */
      sheetAxes: AxisId[];
      /** PTable handle output */
      pTable: PTableHandle | undefined;
    }
  | {
      /** The type of the source to feed the data into the table */
      sourceType: 'ptable';
      /** PTable handle output */
      pTable: PTableHandle | undefined;
      /** Sheets that we want to show in our table */
      sheets?: PlDataTableSheet[];
    }
  | {
      /** The type of the source to feed the data into the table */
      sourceType: 'xsv';
      xsvFile: ValueOrErrors<RemoteBlobHandleAndSize | undefined> | ValueOrErrors<LocalBlobHandleAndSize | undefined> | undefined;
    };

/** PlTableFilters restriction entry */
export type PlTableFiltersRestriction = {
  /** Spec of the column for which filter types should be restricted */
  column: PTableColumnId;
  /** List of filter types applicable to the column */
  allowedFilterTypes: PlTableFilterType[];
};

/** PlTableFilters default settings entry */
export type PlTableFiltersDefault = {
  /** Spec of the column the default should be applied */
  column: PTableColumnId;
  /** Filter entry */
  default: PlTableFilter;
};

/** PlAgDataTable controller contains all exported methods */
export type PlAgDataTableController = {
  /** Export table data as Csv file */
  exportCsv: () => void;
};

/** PlAgDataTable row */
export type PlAgDataTableRow = {
  id: string;
  key: unknown[];
  [field: `${number}`]: undefined | null | number | string;
};
