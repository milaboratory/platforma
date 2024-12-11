import type {
  LocalBlobHandleAndSize,
  PlDataTableSheet,
  PlTableFilter,
  PlTableFilterType,
  PTableColumnId,
  PTableHandle,
  PTableValue,
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

/** Key is a set of all axes values, which means it is unique across rows */
export type PTableRowKey = PTableValue[];

/** PlAgDataTable controller contains all exported methods */
export type PlAgDataTableController = {
  /** Scroll table to make row with provided key visible */
  focusRow: (rowKey: PTableRowKey) => void;
};

/** PlAgDataTable row */
export type PlAgDataTableRow = {
  key: PTableRowKey;
  /** Unique row identifier, created as canonicalize(key)! */
  id: string;
  /** Row values by column; sheet axes and labeled axes are excluded */
  [field: `${number}`]: PTableValue;
};
