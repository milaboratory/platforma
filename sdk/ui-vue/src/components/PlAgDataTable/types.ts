import type {
  AxisId,
  CanonicalizedJson,
  ListOptionBase,
  PlDataTableModel,
  PlDataTableSheet,
  PlDataTableSheetState,
  PTableKey,
  PTableValue,
  OutputWithStatus,
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

/*
"Error: missing field `value`
    at Frame.evaluateQuery (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/@milaboratories/pframes-rs-wasm/src/generated/pframes_rs_wasm.js:4040:11)
    at PFrame.evaluateQuery (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/@milaboratories/pframes-rs-wasm/src/p-frame.ts:29:35)
    at AbstractPFrameDriver.createPTableV2 (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/@milaboratories/pf-driver/src/driver_impl.ts:246:48)
    at ComputableContextHelper.createPTableV2 (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/@milaboratories/pl-middle-layer/src/js_render/computable_context.ts:420:60)
    at <anonymous> (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/@milaboratories/pl-middle-layer/src/js_render/computable_context.ts:847:16)
    at WeakLifetime.withCachedError (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/@milaboratories/pl-middle-layer/src/js_render/computable_context.ts:506:21)
    at QuickJSContext.<anonymous> (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/quickjs-emscripten-core/src/context.ts:1374:44)
    at Generator.next (<anonymous>)
    at awaitEachYieldedPromise (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/quickjs-emscripten-core/src/asyncify-helpers.ts:92:29)
    at awaitYield.awaitYieldOf (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/quickjs-emscripten-core/src/asyncify-helpers.ts:8:21)"

    "PlQuickJSError: missing field `value`
QuickJS stacktrace:
Error/uuid:61e75481-1f57-4b1e-8849-8ae1087b2699: 
    at createPTableV2 (bundle.js:7527)
    at createPlDataTableV2 (bundle.js:8295)
    at <anonymous> (bundle.js:8672)
    at <anonymous> (bundle.js)
Host: Error/uuid:61e75481-1f57-4b1e-8849-8ae1087b2699: 
    at QuickJSContext.unwrapResult (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/quickjs-emscripten-core/src/context.ts:1285:27)
    at <anonymous> (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/@milaboratories/pl-middle-layer/src/js_render/context.ts:138:19)
    at _Scope.withScope (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/quickjs-emscripten-core/src/lifetime.ts:277:14)
    at JsExecutionContext.runCallback (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/@milaboratories/pl-middle-layer/src/js_render/context.ts:131:20)
    at Object.___kernel___ (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/@milaboratories/pl-middle-layer/src/js_render/index.ts:130:27)
    at renderSelfState (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/@milaboratories/computable/src/computable/computable_state.ts:405:28)
    at updateCellStateWithoutValue (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/@milaboratories/computable/src/computable/computable_state.ts:587:7)
    at calculateChildren (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/@milaboratories/computable/src/computable/computable_state.ts:441:16)
    at updateCellStateWithoutValue (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/@milaboratories/computable/src/computable/computable_state.ts:596:26)
    at calculateChildren (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/@milaboratories/computable/src/computable/computable_state.ts:441:16)
"

"Error/uuid:61e75481-1f57-4b1e-8849-8ae1087b2699: 
    at createPTableV2 (bundle.js:7527)
    at createPlDataTableV2 (bundle.js:8295)
    at <anonymous> (bundle.js:8672)
    at <anonymous> (bundle.js)
Host: Error/uuid:61e75481-1f57-4b1e-8849-8ae1087b2699: 
    at QuickJSContext.unwrapResult (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/quickjs-emscripten-core/src/context.ts:1285:27)
    at <anonymous> (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/@milaboratories/pl-middle-layer/src/js_render/context.ts:138:19)
    at _Scope.withScope (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/quickjs-emscripten-core/src/lifetime.ts:277:14)
    at JsExecutionContext.runCallback (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/@milaboratories/pl-middle-layer/src/js_render/context.ts:131:20)
    at Object.___kernel___ (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/@milaboratories/pl-middle-layer/src/js_render/index.ts:130:27)
    at renderSelfState (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/@milaboratories/computable/src/computable/computable_state.ts:405:28)
    at updateCellStateWithoutValue (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/@milaboratories/computable/src/computable/computable_state.ts:587:7)
    at calculateChildren (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/@milaboratories/computable/src/computable/computable_state.ts:441:16)
    at updateCellStateWithoutValue (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/@milaboratories/computable/src/computable/computable_state.ts:596:26)
    at calculateChildren (/Users/aleksandr/GIT/MILAB/platforma-desktop-app/node_modules/@milaboratories/computable/src/computable/computable_state.ts:441:16)"
*/
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
