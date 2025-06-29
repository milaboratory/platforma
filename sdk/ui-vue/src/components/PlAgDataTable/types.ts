import {
  canonicalizeJson,
  type JsonCompatible,
  type AxisId,
  type CanonicalizedJson,
  type ListOptionBase,
  type PlDataTableModel,
  type PlDataTableSheet,
  type PlDataTableSheetState,
  type PlTableFilter,
  type PlTableFilterType,
  type PTableColumnId,
  type PTableColumnSpec,
  type PTableKey,
  type PTableValue,
  parseJson,
} from '@platforma-sdk/model';
import type { PTableHidden } from './sources/common';
import type { ComputedRef, MaybeRefOrGetter } from 'vue';
import { computed, toValue } from 'vue';

/** Data table V2 settings */
export type PlDataTableSettingsV2 =
(
  | { sourceId: null }
  | {
    /** Unique source id for state caching */
    sourceId: string;
    /** Sheets that we want to show in our table */
    sheets: PlDataTableSheet[];
    /** Result of `createPlDataTableV2` */
    model: PlDataTableModel | undefined;
  }
) & {
  /** Callback configuring filters for the table */
  filtersConfig?: (info: {
    sourceId: string;
    column: PTableColumnSpec;
  }) => {
    options?: PlTableFilterType[];
    default?: PlTableFilter;
  };
};

export function usePlDataTableSettingsV2({
  /** Block output created by `createPlDataTableV2` */
  model,
  /**
   * Sheets for partitioned data sources.
   * Do not set if data source is never partitioned.
   */
  sheets,
  /**
   * Callback configuring filters for the table.
   * If not provided, filtering will be disabled.
   */
  filtersConfig,
}: {
  model: MaybeRefOrGetter<PlDataTableModel | undefined>;
  sheets?: MaybeRefOrGetter<PlDataTableSheet[] | undefined>;
  filtersConfig?: (info: {
    column: PTableColumnSpec;
  }) => {
    options?: PlTableFilterType[];
    default?: PlTableFilter;
  };
}): ComputedRef<PlDataTableSettingsV2>;
export function usePlDataTableSettingsV2<T>({
  /**
   * Block property (such as inputAnchor) used to produce the data source.
   * Mandatory for cases when the table can change without block run.
   * Skip when the table is changed only after block run.
   * Ask developers for help if you don't know what to set here.
   */
  sourceId,
  /** Block output created by `createPlDataTableV2` */
  model,
  /**
   * Sheets for partitioned data sources.
   * Do not set if data source is never partitioned.
   */
  sheets,
  /**
   * Callback configuring filters for the table.
   * If not provided, filtering will be disabled.
   */
  filtersConfig,
}: {
  sourceId?: MaybeRefOrGetter<JsonCompatible<T> | undefined>;
  model: MaybeRefOrGetter<PlDataTableModel | undefined>;
  sheets?: MaybeRefOrGetter<PlDataTableSheet[] | undefined>;
  filtersConfig?: (info: {
    sourceId: T;
    column: PTableColumnSpec;
  }) => {
    options?: PlTableFilterType[];
    default?: PlTableFilter;
  };
}): ComputedRef<PlDataTableSettingsV2>;
export function usePlDataTableSettingsV2<T = string>({
  sourceId,
  model,
  sheets,
  filtersConfig,
}: {
  sourceId?: MaybeRefOrGetter<JsonCompatible<T> | undefined>;
  model: MaybeRefOrGetter<PlDataTableModel | undefined>;
  sheets?: MaybeRefOrGetter<PlDataTableSheet[] | undefined>;
  filtersConfig?: (info: {
    sourceId: T;
    column: PTableColumnSpec;
  }) => {
    options?: PlTableFilterType[];
    default?: PlTableFilter;
  };
}): ComputedRef<PlDataTableSettingsV2> {
  const filtersConfigValue = filtersConfig
    ? ({
        sourceId,
        column,
      }: {
        sourceId: string;
        column: PTableColumnSpec;
      }) => {
        return filtersConfig({
          sourceId: parseJson<T>(sourceId as CanonicalizedJson<T>),
          column,
        });
      }
    : undefined;
  return computed(() => {
    const modelValue = toValue(model);
    if (sourceId) {
      const sourceIdValue = toValue(sourceId);
      if (sheets) {
        const sheetsValue = toValue(sheets);
        return sourceIdValue && sheetsValue
          ? {
              sourceId: canonicalizeJson<T>(sourceIdValue),
              sheets: sheetsValue,
              model: modelValue,
              filtersConfig: filtersConfigValue,
            }
          : {
              sourceId: null,
              filtersConfig: filtersConfigValue,
            };
      } else {
        return sourceIdValue
          ? {
              sourceId: canonicalizeJson<T>(sourceIdValue),
              sheets: [],
              model: modelValue,
              filtersConfig: filtersConfigValue,
            }
          : {
              sourceId: null,
              filtersConfig: filtersConfigValue,
            };
      }
    } else {
      if (sheets) {
        const sheetsValue = toValue(sheets);
        return sheetsValue
          ? {
              sourceId: canonicalizeJson<string>('static'),
              sheets: sheetsValue,
              model: modelValue,
              filtersConfig: filtersConfigValue,
            }
          : {
              sourceId: null,
              filtersConfig: filtersConfigValue,
            };
      } else {
        return modelValue
          ? {
              sourceId: canonicalizeJson<string>('static'),
              sheets: [],
              model: modelValue,
              filtersConfig: filtersConfigValue,
            }
          : {
              sourceId: null,
              filtersConfig: filtersConfigValue,
            };
      }
    }
  });
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
export type PlAgDataTableV2Controller = {
  /**
   * Scroll table to make row with provided key visible
   * Warning: works reliably only in client side mode.
   */
  focusRow: (rowKey: PTableKey) => Promise<void>;
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

export type PlDataTableSheetsSettings = {
  /** User-provided sheets for the sourceId */
  sheets: PlDataTableSheet[];
  /** Persisted selection for the sourceId */
  cachedState: PlDataTableSheetState[];
};

export type PlDataTableSheetNormalized = {
  /** id of the axis */
  axisId: AxisId;
  /** sheet prefix */
  prefix: string;
  /** options to show in the filter dropdown */
  options: ListOptionBase<string | number>[];
  /** default (selected) value */
  defaultValue: string | number;
};
