import {
  type AxisId,
  type CanonicalizedJson,
  type ListOptionBase,
  type PlDataTableModel,
  type PlDataTableSheet,
  type PlDataTableSheetState,
  type PTableKey,
  type PTableValue,
  type OutputWithStatus,
} from "@platforma-sdk/model";
import type { PTableHidden } from "./sources/common";
import type { ComputedRef, MaybeRefOrGetter } from "vue";
import { computed, toValue } from "vue";
import canonicalize from "canonicalize";
import { deepClone } from "@milaboratories/helpers";

export type PlDataTableSettingsV2Base =
  | { sourceId: null; pending: boolean }
  | {
      /** Unique source id for state caching */
      sourceId: string;
      /** Sheets that we want to show in our table */
      sheets: PlDataTableSheet[];
      /** Result of `createPlDataTableV2` */
      model: PlDataTableModel | undefined;
    };

/** Data table V2 settings */
export type PlDataTableSettingsV2 = PlDataTableSettingsV2Base;

type OptionsBasic = {
  /** Block output created by `createPlDataTableV2` */
  model: MaybeRefOrGetter<OutputWithStatus<PlDataTableModel | undefined>>;
  /**
   * Sheets for partitioned data sources.
   * Do not set if data source is never partitioned.
   */
  sheets?: MaybeRefOrGetter<PlDataTableSheet[] | undefined>;
};

type OptionsSimple = OptionsBasic;

type OptionsAdvanced<T> = OptionsBasic & {
  /**
   * Block property (such as inputAnchor) used to produce the data source.
   * Mandatory for cases when the table can change without block run.
   * Skip when the table is changed only after block run.
   * Ask developers for help if you don't know what to set here.
   */
  sourceId: MaybeRefOrGetter<T | undefined>;
};

export function usePlDataTableSettingsV2<T>(
  options: OptionsAdvanced<T>,
): ComputedRef<PlDataTableSettingsV2>;
export function usePlDataTableSettingsV2(
  options: OptionsSimple,
): ComputedRef<PlDataTableSettingsV2>;
export function usePlDataTableSettingsV2<T>(
  options: OptionsAdvanced<T> | OptionsSimple,
): ComputedRef<PlDataTableSettingsV2> {
  return computed(() => {
    const model = deepClone(toValue(options.model));
    let settingsBase: PlDataTableSettingsV2Base;

    if (!model.ok) {
      model.errors.forEach((e) => console.error("Error in PlDataTableModel:", e));
      settingsBase = { sourceId: null, pending: false };
    } else if ("sourceId" in options) {
      const sourceIdValue = deepClone(toValue(options.sourceId));
      if (options.sheets) {
        const sheetsValue = deepClone(toValue(options.sheets));
        settingsBase =
          sourceIdValue && sheetsValue
            ? {
                sourceId: canonicalize(sourceIdValue)!,
                sheets: sheetsValue,
                model: model.value,
              }
            : { sourceId: null, pending: !model.stable };
      } else {
        settingsBase = sourceIdValue
          ? {
              sourceId: canonicalize(sourceIdValue)!,
              sheets: [],
              model: model.value,
            }
          : { sourceId: null, pending: !model.stable };
      }
    } else {
      if (options.sheets) {
        const sheetsValue = deepClone(toValue(options.sheets));
        settingsBase = sheetsValue
          ? {
              sourceId: canonicalize("static")!,
              sheets: sheetsValue,
              model: model.value,
            }
          : { sourceId: null, pending: !model.stable };
      } else {
        settingsBase = model.value
          ? {
              sourceId: canonicalize("static")!,
              sheets: [],
              model: model.value,
            }
          : { sourceId: null, pending: !model.stable };
      }
    }
    return settingsBase;
  });
}

/** PlAgDataTable controller contains all exported methods */
export type PlAgDataTableV2Controller = {
  /**
   * Scroll table to make row with provided key visible
   * Warning: works reliably only in client side mode.
   * @returns `true` if row was found and focused, `false` otherwise
   */
  focusRow: (rowKey: PTableKey) => Promise<boolean>;
  /**
   * Update selection in the table.
   * @param axesIds - axes ids identifying axes key values in `selectedKeys`
   * @param selectedKeys - axes keys of the rows to select
   * Warning: update will be ignored if axes ids cannot be correctly resolved
   * @returns `true` if selection was updated, `false` otherwise
   */
  updateSelection: ({
    axesSpec,
    selectedKeys,
  }: {
    axesSpec: AxisId[];
    selectedKeys: PTableKey[];
  }) => Promise<boolean>;
};

export type PlTableRowId = PTableKey;

export type PlTableRowIdJson = CanonicalizedJson<PTableKey>;

/** PlAgDataTableV2 row */
export type PlAgDataTableV2Row = {
  /** Axes key */
  axesKey: PTableKey;
  /** Unique row identifier */
  id: PlTableRowIdJson;
  /** Row values by column; sheet axes and labeled axes are excluded */
  [field: `${number}`]: PTableValue | PTableHidden;
};

export type PlAgOverlayLoadingParams = {
  /**
   * Required flag, that shows catInBag icon with message if `true`, shows PlSplash component if `false`.
   */
  variant: "not-ready" | "running" | "loading";
  /**
   * Prop to override default "Loading data..." text and the subtitles
   */
  loadingText?:
    | string
    | {
        title: string;
        subtitle: string | string[];
      };
  /**
   * Prop to override default "Running analysis..." text and the subtitles
   */
  runningText?:
    | string
    | {
        title: string;
        subtitle: string | string[];
      };
  /**
   * Prop to override default "Data is not computed" text (So why props name is notReady? Good question)
   */
  notReadyText?: string;
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
