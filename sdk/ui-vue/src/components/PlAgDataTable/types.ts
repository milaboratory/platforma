import type {
  CanonicalizedJson,
  LocalBlobHandleAndSize,
  PlDataTableModel,
  PlDataTableSheet,
  PlTableFilter,
  PlTableFilterType,
  PTableColumnId,
  PTableHandle,
  PTableKey,
  PTableRowKey,
  PTableValue,
  RemoteBlobHandleAndSize,
} from '@platforma-sdk/model';
import type { PTableHidden } from './sources/common';

export type PlDataTableSettingsPTable = {
  /** The type of the source to feed the data into the table */
  sourceType: 'ptable';
  /** PTable handle output */
  pTable?: PTableHandle;
  /** Sheets that we want to show in our table */
  sheets?: PlDataTableSheet[];
};

export type PlDataTableSettingsXsv = {
  /** The type of the source to feed the data into the table */
  sourceType: 'xsv';
  xsvFile?: LocalBlobHandleAndSize | RemoteBlobHandleAndSize;
};

/** Data table settings */
export type PlDataTableSettings =
  | undefined
  | PlDataTableSettingsPTable
  | PlDataTableSettingsXsv;

export type PlAgDataTableSettingsPTable = {
  /** The type of the source to feed the data into the table */
  sourceType: 'ptable';
  /** PTable handle output */
  model: PlDataTableModel | undefined;
  /** Sheets that we want to show in our table */
  sheets?: PlDataTableSheet[];
};

/** Data table settings */
export type PlAgDataTableSettings =
  | undefined
  | PlAgDataTableSettingsPTable;

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
  /**
   * Scroll table to make row with provided key visible
   * Warning: works reliably only in client side mode.
   */
  focusRow: (rowKey: PTableRowKey) => Promise<void>;
};

/** PlAgDataTable controller contains all exported methods */
export type PlAgDataTableV2Controller = {
  /**
   * Scroll table to make row with provided key visible
   * Warning: works reliably only in client side mode.
   */
  focusRow: (rowKey: PTableKey) => Promise<void>;
};

/**
 * Canonicalized PTableValue array JSON string
 * @deprecated Migrate to PlAgDataTableV2
 */
export type PTableRowKeyJson = CanonicalizedJson<PTableRowKey>;

/** PlAgDataTable row */
export type PlAgDataTableRow = {
  /** Axis key is not present for heterogeneous axes */
  key?: PTableRowKey;
  /** Unique row identifier, created as canonicalize(key)! when key is present */
  id: PTableRowKeyJson | `${number}`;
  /** Row values by column; sheet axes and labeled axes are excluded */
  [field: `${number}` | `hC${number}`]: PTableValue;
};

export type PTableKeyJson = CanonicalizedJson<PTableKey>;

/** PlAgDataTableV2 row */
export type PlAgDataTableV2Row = {
  /** Axis key is not present for heterogeneous axes */
  key?: PTableKey;
  /** Unique row identifier, created as canonicalize(key)! when key is present */
  id: PTableKeyJson;
  /** Row values by column; sheet axes and labeled axes are excluded */
  [field: `${number}`]: PTableValue | PTableHidden;
};

export type PlAgOverlayLoadingParams = {
  /**
   * Required flag, that shows catInBag icon with message if `true`, shows PlSplash component if `false`.
   */
  notReady?: boolean;
  /**
   * Prop to override default "Loading" text
   */
  loadingText?: string;
  /**
   * Prop to override default "No datasource" text (So why props name is notReady? Good question)
   */
  notReadyText?: string;
  /**
   * Use "transparent" to make table headers visible below the loading layer
   */
  overlayType?: 'transparent';
};

export type PlAgOverlayNoRowsParams = {
  /**
   * Prop to override default "Empty" text
   */
  text?: string;
};
