import type {
  LocalBlobHandleAndSize,
  PlDataTableSheet,
  PlTableFilter,
  PlTableFilterType,
  PTableColumnId,
  PTableHandle,
  RemoteBlobHandleAndSize,
} from '@platforma-sdk/model';

/** Data table settings */
export type PlDataTableSettings =
  | {
      /** The type of the source to feed the data into the table */
      sourceType: 'ptable';
      /** PTable handle output */
      pTable?: PTableHandle;
      /** Sheets that we want to show in our table */
      sheets?: PlDataTableSheet[];
    }
  | {
      /** The type of the source to feed the data into the table */
      sourceType: 'xsv';
      xsvFile?: LocalBlobHandleAndSize | RemoteBlobHandleAndSize;
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
