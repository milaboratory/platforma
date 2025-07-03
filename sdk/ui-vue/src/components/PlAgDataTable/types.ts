import {
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
} from '@platforma-sdk/model';
import type { PTableHidden } from './sources/common';
import type { ComputedRef, MaybeRefOrGetter } from 'vue';
import { computed, toValue } from 'vue';
import canonicalize from 'canonicalize';

export type PlDataTableFilterConfig = {
  options?: PlTableFilterType[];
  default?: PlTableFilter;
};

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
  filtersConfig: (info: {
    sourceId: string;
    column: PTableColumnSpec;
  }) => PlDataTableFilterConfig;
};

type OptionsAdvanced<T> = {
  /**
   * Block property (such as inputAnchor) used to produce the data source.
   * Mandatory for cases when the table can change without block run.
   * Skip when the table is changed only after block run.
   * Ask developers for help if you don't know what to set here.
   */
  sourceId: MaybeRefOrGetter<T | undefined>;
  /** Block output created by `createPlDataTableV2` */
  model: MaybeRefOrGetter<PlDataTableModel | undefined>;
  /**
   * Sheets for partitioned data sources.
   * Do not set if data source is never partitioned.
   */
  sheets?: MaybeRefOrGetter<PlDataTableSheet[] | undefined>;
  /**
   * Callback configuring filters for the table.
   * If not provided, filtering will be disabled.
   * Parameter `sourceId` should be compared using `isJsonEqual` from `@milaboratories/helpers`.
   */
  filtersConfig?: (info: {
    sourceId: JsonCompatible<T>;
    column: PTableColumnSpec;
  }) => PlDataTableFilterConfig;
};

type OptionsSimple = {
  /** Block output created by `createPlDataTableV2` */
  model: MaybeRefOrGetter<PlDataTableModel | undefined>;
  /**
   * Sheets for partitioned data sources.
   * Do not set if data source is never partitioned.
   */
  sheets?: MaybeRefOrGetter<PlDataTableSheet[] | undefined>;
  /**
   * Callback configuring filters for the table.
   * If not provided, filtering will be disabled.
   */
  filtersConfig?: (info: {
    column: PTableColumnSpec;
  }) => PlDataTableFilterConfig;
};

export function usePlDataTableSettingsV2<T>(options: OptionsAdvanced<T>): ComputedRef<PlDataTableSettingsV2>;
export function usePlDataTableSettingsV2(options: OptionsSimple): ComputedRef<PlDataTableSettingsV2>;
export function usePlDataTableSettingsV2<T>(options: OptionsAdvanced<T> | OptionsSimple): ComputedRef<PlDataTableSettingsV2> {
  const fc = options.filtersConfig;
  const filtersConfigValue = typeof fc === 'function'
    ? ({
        sourceId,
        column,
      }: {
        sourceId: string;
        column: PTableColumnSpec;
      }) => {
        return fc({
          sourceId: JSON.parse(sourceId) as JsonCompatible<T>,
          column,
        });
      }
    : () => ({});
  return computed(() => {
    const modelValue = toValue(options.model);
    if ('sourceId' in options) {
      const sourceIdValue = toValue(options.sourceId);
      if (options.sheets) {
        const sheetsValue = toValue(options.sheets);
        return sourceIdValue && sheetsValue
          ? {
              sourceId: canonicalize(sourceIdValue)!,
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
              sourceId: canonicalize(sourceIdValue)!,
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
      if (options.sheets) {
        const sheetsValue = toValue(options.sheets);
        return sheetsValue
          ? {
              sourceId: canonicalize('static')!,
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
              sourceId: canonicalize('static')!,
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
