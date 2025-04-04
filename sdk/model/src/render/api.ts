import type {
  AxisId,
  Option,
  PColumn,
  PColumnSelector,
  PColumnSpec,
  PColumnValues,
  PFrameDef,
  PFrameHandle,
  PObject,
  PObjectSpec,
  PSpecPredicate,
  PTableDef,
  PTableHandle,
  PTableRecordFilter,
  PTableSorting,
  PlRef,
  ResultCollection,
  ValueOrError,
  AxisFilter,
  PValue,
  SUniversalPColumnId,
  AnyFunction,
  DataInfo,
  BinaryPartitionedDataInfoEntries,
  JsonPartitionedDataInfoEntries,
  PObjectId } from '@milaboratories/pl-model-common';
import {
  AnchoredIdDeriver,
  getAxisId,
  isDataInfo,
  mapDataInfo,
  resolveAnchors,
  canonicalizeAxisId,
  entriesToDataInfo,
} from '@milaboratories/pl-model-common';
import {
  ensurePColumn,
  extractAllColumns,
  isPColumn,
  isPColumnSpec,
  isPlRef,
  mapPObjectData,
  mapPTableDef,
  mapValueInVOE,
  selectorsToPredicate,
} from '@milaboratories/pl-model-common';
import type { Optional } from 'utility-types';
import { getCfgRenderCtx } from '../internal';
import { TreeNodeAccessor, ifDef } from './accessor';
import type { FutureRef } from './future';
import type { AccessorHandle, GlobalCfgRenderCtx } from './internal';
import { MainAccessorName, StagingAccessorName } from './internal';
import type { LabelDerivationOps } from './util/label';
import { deriveLabels } from './util/label';
import type { APColumnSelectorWithSplit } from './split_selectors';
import { getUniquePartitionKeys, parsePColumnData } from './util/pcolumn_data';
import type { TraceEntry } from './util/label';
import { filterDataInfoEntries } from './util/axis_filtering';

/**
 * Helper function to match domain objects
 * @param query Optional domain to match against
 * @param target Optional domain to match
 * @returns true if domains match, false otherwise
 */
function matchDomain(query?: Record<string, string>, target?: Record<string, string>) {
  if (query === undefined) return target === undefined;
  if (target === undefined) return true;
  for (const k in target) {
    if (query[k] !== target[k]) return false;
  }
  return true;
}

export type UniversalColumnOption = { label: string; value: SUniversalPColumnId };

/**
 * Transforms PColumn data into the internal representation expected by the platform
 * @param data Data from a PColumn to transform
 * @returns Transformed data compatible with platform API
 */
function transformPColumnData(data: PColumn<TreeNodeAccessor | PColumnValues | DataInfo<TreeNodeAccessor>>):
PColumn<PColumnValues | AccessorHandle | DataInfo<AccessorHandle>> {
  return mapPObjectData(data, (d) => {
    if (d instanceof TreeNodeAccessor) {
      return d.handle;
    } else if (isDataInfo(d)) {
      return mapDataInfo(d, (accessor) => accessor.handle);
    } else {
      return d;
    }
  });
}

/**
 * Describes a single filter applied due to a split axis.
 */
export type AxisFilterInfo = {
  axisIdx: number;
  axisId: AxisId;
  value: PValue;
  label: string;
};

/**
 * Represents a column specification with potential split axis filtering information
 * used in canonical options generation.
 */
export type UniversalPColumnEntry = {
  id: SUniversalPColumnId;
  obj: PColumnSpec;
  ref: PlRef;
  axisFilters?: AxisFilterInfo[];
  label: string;
};

/**
 * Converts an array of SplitAxisFilter objects into an array of TraceEntry objects
 * suitable for label generation.
 */
function splitFiltersToTrace(splitFilters?: AxisFilterInfo[]): TraceEntry[] | undefined {
  if (!splitFilters) return undefined;
  return splitFilters.map((filter) => ({
    type: `split:${canonicalizeAxisId(filter.axisId)}`,
    label: filter.label,
    importance: 1_000_000, // High importance for split filters in labels
  }));
}

/**
 * Converts an array of SplitAxisFilter objects into an array of AxisFilter tuples
 * suitable for deriving anchored IDs.
 */
function splitFiltersToAxisFilter(splitFilters?: AxisFilterInfo[]): AxisFilter[] | undefined {
  if (!splitFilters) return undefined;
  return splitFilters.map((filter) => [filter.axisIdx, filter.value]);
}

type UniversalPColumnOpts = {
  labelOps?: LabelDerivationOps;
  dontWaitAllData?: boolean;
};

export class ResultPool {
  private readonly ctx: GlobalCfgRenderCtx = getCfgRenderCtx();

  /**
   * @deprecated use getOptions()
   */
  public calculateOptions(predicate: PSpecPredicate): Option[] {
    return this.ctx.calculateOptions(predicate);
  }

  public getOptions(
    predicateOrSelector: ((spec: PObjectSpec) => boolean) | PColumnSelector | PColumnSelector[],
    label?: ((spec: PObjectSpec, ref: PlRef) => string) | LabelDerivationOps,
  ): Option[] {
    const predicate = typeof predicateOrSelector === 'function'
      ? predicateOrSelector
      : selectorsToPredicate(predicateOrSelector);
    const filtered = this.getSpecs().entries.filter((s) => predicate(s.obj));
    if (typeof label === 'object' || typeof label === 'undefined') {
      return deriveLabels(filtered, (o) => o.obj, label ?? {}).map(({ value: { ref }, label }) => ({
        ref,
        label,
      }));
    } else
      return filtered.map((s) => ({
        ref: s.ref,
        label: label(s.obj, s.ref),
      }));
  }

  /**
   * Internal implementation that generates UniversalPColumnEntry objects from the provided
   * anchors and selectors.
   */
  public getUniversalPColumnEntries(
    anchorsOrCtx: AnchoredIdDeriver | Record<string, PColumnSpec | PlRef>,
    predicateOrSelectors: ((spec: PColumnSpec) => boolean) | APColumnSelectorWithSplit | APColumnSelectorWithSplit[],
    opts?: UniversalPColumnOpts,
  ): UniversalPColumnEntry[] | undefined {
    // Handle PlRef objects by resolving them to PColumnSpec
    const resolvedAnchors: Record<string, PColumnSpec> = {};

    if (!(anchorsOrCtx instanceof AnchoredIdDeriver)) {
      for (const [key, value] of Object.entries(anchorsOrCtx)) {
        if (isPlRef(value)) {
          const resolvedSpec = this.getPColumnSpecByRef(value);
          if (!resolvedSpec)
            return undefined;
          resolvedAnchors[key] = resolvedSpec;
        } else {
          // It's already a PColumnSpec
          resolvedAnchors[key] = value;
        }
      }
    }

    const selectorsArray = typeof predicateOrSelectors === 'function'
      ? [predicateOrSelectors]
      : Array.isArray(predicateOrSelectors)
        ? predicateOrSelectors
        : [predicateOrSelectors];

    const anchorIdDeriver = anchorsOrCtx instanceof AnchoredIdDeriver
      ? anchorsOrCtx
      : new AnchoredIdDeriver(resolvedAnchors);

    const result: Omit<UniversalPColumnEntry, 'id' | 'label'>[] = [];

    // Process each selector individually
    for (const selector of selectorsArray) {
      // Create predicate for this specific selector
      const predicate = typeof selector === 'function'
        ? selector
        : selectorsToPredicate(resolveAnchors(resolvedAnchors, selector));

      // Filter specs based on this specific predicate
      const filtered = this.getSpecs().entries.filter(({ obj: spec }) => {
        if (!isPColumnSpec(spec)) return false;
        return predicate(spec);
      });

      if (filtered.length === 0)
        continue;

      // Check if this selector has any split axes
      const splitAxisIdxs = typeof selector === 'object'
        && 'axes' in selector
        && selector.axes !== undefined
        && selector.partialAxesMatch === undefined
        ? selector.axes
          .map((axis, index) => ('split' in axis && axis.split === true) ? index : -1)
          .filter((index) => index !== -1)
        : [];
      splitAxisIdxs.sort((a, b) => a - b);

      if (splitAxisIdxs.length > 0) { // Handle split axes
        const maxSplitIdx = splitAxisIdxs[splitAxisIdxs.length - 1]; // Last one is max since they're sorted

        for (const { ref, obj: spec } of filtered) {
          if (!isPColumnSpec(spec)) throw new Error(`Assertion failed: expected PColumnSpec, got ${spec.kind}`);

          const columnData = this.getDataByRef(ref);
          if (!columnData) {
            if (opts?.dontWaitAllData) continue;
            return undefined;
          }
          if (!isPColumn(columnData)) throw new Error(`Assertion failed: expected PColumn, got ${columnData.spec.kind}`);

          const uniqueKeys = getUniquePartitionKeys(columnData.data);
          if (!uniqueKeys) {
            if (opts?.dontWaitAllData) continue;
            return undefined;
          }

          if (maxSplitIdx >= uniqueKeys.length)
            throw new Error(`Not enough partition keys for the requested split axes in column ${spec.name}`);

          // Pre-fetch labels for all involved split axes
          const axesLabels: (Record<string | number, string> | undefined)[] = splitAxisIdxs
            .map((idx) => this.findLabels(getAxisId(spec.axesSpec[idx])));

          const keyCombinations: (string | number)[][] = [];
          const generateCombinations = (currentCombo: (string | number)[], sAxisIdx: number) => {
            if (sAxisIdx >= splitAxisIdxs.length) {
              keyCombinations.push([...currentCombo]);
              return;
            }
            const axisIdx = splitAxisIdxs[sAxisIdx];
            const axisValues = uniqueKeys[axisIdx];
            for (const val of axisValues) {
              currentCombo.push(val);
              generateCombinations(currentCombo, sAxisIdx + 1);
              currentCombo.pop();
            }
          };
          generateCombinations([], 0);

          // Generate entries for each key combination
          for (const keyCombo of keyCombinations) {
            const splitFilters: AxisFilterInfo[] = keyCombo.map((value, sAxisIdx) => {
              const axisIdx = splitAxisIdxs[sAxisIdx];
              const axisId = getAxisId(spec.axesSpec[axisIdx]);
              const axisLabelMap = axesLabels[sAxisIdx];
              const label = axisLabelMap?.[value] ?? String(value);
              return { axisIdx, axisId, value: value as PValue, label };
            });

            result.push({
              obj: spec,
              ref,
              axisFilters: splitFilters,
            });
          }
        }
      } else {
        // No split axes, simply add each filtered item without filters
        for (const { ref, obj: spec } of filtered) {
          if (!isPColumnSpec(spec)) continue;
          result.push({
            obj: spec,
            ref,
            // No splitFilters needed here
          });
        }
      }
    }

    if (result.length === 0)
      return [];

    const labelResults = deriveLabels(
      result,
      (o) => ({
        spec: o.obj,
        suffixTrace: splitFiltersToTrace(o.axisFilters), // Use helper function
      }),
      opts?.labelOps ?? {},
    );

    return labelResults.map((item) => ({
      id: anchorIdDeriver.deriveS(
        item.value.obj,
        splitFiltersToAxisFilter(item.value.axisFilters), // Use helper function
      ),
      obj: item.value.obj,
      ref: item.value.ref,
      axisFilters: item.value.axisFilters,
      label: item.label,
    }));
  }

  /**
   * Returns columns that match the provided anchors and selectors. It applies axis filters and label derivation.
   *
   * @param anchorsOrCtx - Anchor context for column selection (same as in getCanonicalOptions)
   * @param predicateOrSelectors - Predicate or selectors for filtering columns (same as in getCanonicalOptions)
   * @param opts - Optional configuration for label generation and data waiting
   * @returns A PFrameHandle for the created PFrame, or undefined if any required data is missing
   */
  public getAnchoredPColumns(
    anchorsOrCtx: AnchoredIdDeriver | Record<string, PColumnSpec | PlRef>,
    predicateOrSelectors: ((spec: PColumnSpec) => boolean) | APColumnSelectorWithSplit | APColumnSelectorWithSplit[],
    opts?: UniversalPColumnOpts,
  ): PColumn<DataInfo<TreeNodeAccessor>>[] | undefined {
    // Ensure includeNativeLabel is true in the labelOps
    const enhancedOpts: UniversalPColumnOpts = {
      ...opts,
      labelOps: {
        includeNativeLabel: true,
        ...(opts?.labelOps || {}),
      },
    };

    const entries = this.getUniversalPColumnEntries(
      anchorsOrCtx,
      predicateOrSelectors,
      enhancedOpts,
    );

    if (!entries || entries.length === 0) return undefined;

    const result: PColumn<DataInfo<TreeNodeAccessor>>[] = [];

    for (const entry of entries) {
      const columnData = this.getPColumnByRef(entry.ref);
      if (!columnData) return undefined;

      const parsedData = parsePColumnData(columnData.data);
      if (!parsedData) return undefined;

      let filteredEntries: JsonPartitionedDataInfoEntries<TreeNodeAccessor> | BinaryPartitionedDataInfoEntries<TreeNodeAccessor> = parsedData;
      let spec = { ...columnData.spec };

      if (entry.axisFilters && entry.axisFilters.length > 0) {
        const axisFiltersByIdx = entry.axisFilters.map((filter) => [
          filter.axisIdx,
          filter.value,
        ] as [number, PValue]);

        filteredEntries = filterDataInfoEntries(parsedData, axisFiltersByIdx);

        const axisIndicesToRemove = [...entry.axisFilters]
          .map((filter) => filter.axisIdx)
          .sort((a, b) => b - a);

        const newAxesSpec = [...spec.axesSpec];
        for (const idx of axisIndicesToRemove) {
          newAxesSpec.splice(idx, 1);
        }

        spec = { ...spec, axesSpec: newAxesSpec };
      }

      const dataInfo = entriesToDataInfo(filteredEntries);

      if (spec.annotations) {
        spec = {
          ...spec,
          annotations: {
            ...spec.annotations,
            'pl7.app/label': entry.label,
          },
        };
      } else {
        spec = {
          ...spec,
          annotations: {
            'pl7.app/label': entry.label,
          },
        };
      }

      result.push({
        id: entry.id as unknown as PObjectId,
        spec,
        data: dataInfo,
      });
    }

    return result;
  }

  /**
   * Calculates anchored identifier options for columns matching a given predicate and returns their
   * canonicalized representations.
   *
   * This function filters column specifications from the result pool that match the provided predicate,
   * creates a standardized AnchorCtx from the provided anchors, and generates a list of label-value
   * pairs for UI components (like dropdowns).
   *
   * @param anchorsOrCtx - Either:
   *                     - An existing AnchorCtx instance
   *                     - A record mapping anchor IDs to PColumnSpec objects
   *                     - A record mapping anchor IDs to PlRef objects (which will be resolved to PColumnSpec)
   * @param predicateOrSelectors - Either:
   *                            - A predicate function that takes a PColumnSpec and returns a boolean.
   *                              Only specs that return true will be included.
   *                            - An APColumnSelector object for declarative filtering, which will be
   *                              resolved against the provided anchors and matched using matchPColumn.
   *                            - An array of APColumnSelector objects - columns matching ANY selector
   *                              in the array will be included (OR operation).
   * @param opts - Optional configuration for label generation:
   *                 - labelOps: Optional configuration for label generation:
   *                   - includeNativeLabel: Whether to include native column labels
   *                   - separator: String to use between label parts (defaults to " / ")
   *                   - addLabelAsSuffix: Whether to add labels as suffix instead of prefix
   *                 - dontWaitAllData: Whether to skip columns that don't have all data (if not set, will return undefined,
   *                                    if at least one column that requires splitting is missing data)
   * @returns An array of objects with `label` (display text) and `value` (anchored ID string) properties,
   *          or undefined if any PlRef resolution fails.
   */
  getCanonicalOptions(
    anchorsOrCtx: AnchoredIdDeriver | Record<string, PColumnSpec | PlRef>,
    predicateOrSelectors: ((spec: PColumnSpec) => boolean) | APColumnSelectorWithSplit | APColumnSelectorWithSplit[],
    opts?: UniversalPColumnOpts,
  ): { label: string; value: SUniversalPColumnId }[] | undefined {
    const entries = this.getUniversalPColumnEntries(anchorsOrCtx, predicateOrSelectors, opts);
    if (!entries) return undefined;
    // Generate final options using the entries from the helper method
    return entries.map((item) => ({
      value: item.id,
      label: item.label,
    }));
  }

  /**
   * @deprecated use getData()
   */
  public getDataFromResultPool(): ResultCollection<PObject<TreeNodeAccessor>> {
    return this.getData();
  }

  public getData(): ResultCollection<PObject<TreeNodeAccessor>> {
    const result = this.ctx.getDataFromResultPool();
    return {
      isComplete: result.isComplete,
      entries: result.entries.map((e) => ({
        ref: e.ref,
        obj: {
          ...e.obj,
          data: new TreeNodeAccessor(e.obj.data, [e.ref.blockId, e.ref.name]),
        },
      })),
    };
  }

  /**
   * @deprecated use getDataWithErrors()
   */
  public getDataWithErrorsFromResultPool(): ResultCollection<
    Optional<PObject<ValueOrError<TreeNodeAccessor, string>>, 'id'>
  > {
    return this.getDataWithErrors();
  }

  public getDataWithErrors(): ResultCollection<
    Optional<PObject<ValueOrError<TreeNodeAccessor, string>>, 'id'>
  > {
    const result = this.ctx.getDataWithErrorsFromResultPool();
    return {
      isComplete: result.isComplete,
      entries: result.entries.map((e) => ({
        ref: e.ref,
        obj: {
          ...e.obj,
          data: mapValueInVOE(
            e.obj.data,
            (handle) => new TreeNodeAccessor(handle, [e.ref.blockId, e.ref.name]),
          ),
        },
      })),
    };
  }

  /**
   * @deprecated use getSpecs()
   */
  public getSpecsFromResultPool(): ResultCollection<PObjectSpec> {
    return this.getSpecs();
  }

  public getSpecs(): ResultCollection<PObjectSpec> {
    return this.ctx.getSpecsFromResultPool();
  }

  /**
   * @param ref a Ref
   * @returns data associated with the ref
   */
  public getDataByRef(ref: PlRef): PObject<TreeNodeAccessor> | undefined {
    // @TODO remove after 1 Jan 2025; forward compatibility
    if (typeof this.ctx.getDataFromResultPoolByRef === 'undefined')
      return this.getData().entries.find(
        (f) => f.ref.blockId === ref.blockId && f.ref.name === ref.name,
      )?.obj;
    const data = this.ctx.getDataFromResultPoolByRef(ref.blockId, ref.name); // Keep original call
    // Need to handle undefined case before mapping
    if (!data) return undefined;
    return mapPObjectData(
      data,
      (handle) => new TreeNodeAccessor(handle, [ref.blockId, ref.name]),
    );
  }

  /**
   * Returns data associated with the ref ensuring that it is a p-column.
   * @param ref a Ref
   * @returns p-column associated with the ref
   */
  public getPColumnByRef(ref: PlRef): PColumn<TreeNodeAccessor> | undefined {
    const data = this.getDataByRef(ref);
    if (!data) return undefined;
    return ensurePColumn(data);
  }

  /**
   * Returns spec associated with the ref ensuring that it is a p-column spec.
   * @param ref a Ref
   * @returns p-column spec associated with the ref
   */
  public getPColumnSpecByRef(ref: PlRef): PColumnSpec | undefined {
    const spec = this.getSpecByRef(ref);
    if (!spec) return undefined;
    if (!isPColumnSpec(spec)) throw new Error(`not a PColumn spec (kind = ${spec.kind})`);
    return spec;
  }

  /**
   * @param ref a Ref
   * @returns object spec associated with the ref
   */
  public getSpecByRef(ref: PlRef): PObjectSpec | undefined {
    return this.ctx.getSpecFromResultPoolByRef(ref.blockId, ref.name);
  }

  /**
   * @param spec object specification
   * @returns array of data objects with compatible specs
   * @deprecated delete this method after Jan 1, 2025
   */
  public findDataWithCompatibleSpec(spec: PColumnSpec): PObject<TreeNodeAccessor>[] {
    const result: PObject<TreeNodeAccessor>[] = [];

    out: for (const data of this.getData().entries) {
      if (!isPColumnSpec(data.obj.spec)) {
        continue;
      }

      const oth = data.obj.spec;

      if (spec.name !== oth.name) {
        continue;
      }

      if (spec.valueType !== oth.valueType) {
        continue;
      }

      if (spec.axesSpec.length !== oth.axesSpec.length) {
        continue;
      }

      if (!matchDomain(spec.domain, oth.domain)) {
        continue;
      }

      for (let i = 0; i < spec.axesSpec.length; ++i) {
        const qAx = spec.axesSpec[i];
        const tAx = oth.axesSpec[i];
        if (qAx.name !== tAx.name) {
          continue out;
        }
        if (qAx.type !== tAx.type) {
          continue out;
        }
        if (!matchDomain(qAx.domain, tAx.domain)) {
          continue out;
        }
      }

      result.push(data.obj);
    }
    return result;
  }

  /**
   * Find labels data for a given axis id. It will search for a label column and return its data as a map.
   * @returns a map of axis value => label
   */
  public findLabels(axis: AxisId): Record<string | number, string> | undefined {
    const dataPool = this.getData();
    for (const column of dataPool.entries) {
      if (!isPColumn(column.obj)) continue;

      const spec = column.obj.spec;
      if (
        spec.name === 'pl7.app/label'
        && spec.axesSpec.length === 1
        && spec.axesSpec[0].name === axis.name
        && spec.axesSpec[0].type === axis.type
        && matchDomain(axis.domain, spec.axesSpec[0].domain)
      ) {
        if (column.obj.data.resourceType.name !== 'PColumnData/Json') {
          throw Error(`Expected JSON column for labels, got: ${column.obj.data.resourceType.name}`);
        }
        const labels: Record<string | number, string> = Object.fromEntries(
          Object.entries(
            column.obj.data.getDataAsJson<{
              data: Record<string | number, string>;
            }>().data,
          ).map((e) => [JSON.parse(e[0])[0], e[1]]),
        );

        return labels;
      }
    }
    return undefined;
  }
}

/** Main entry point to the API available within model lambdas (like outputs, sections, etc..) */
export class RenderCtx<Args, UiState> {
  private readonly ctx: GlobalCfgRenderCtx;

  public readonly args: Args;
  public readonly uiState: UiState;

  constructor() {
    this.ctx = getCfgRenderCtx();
    this.args = JSON.parse(this.ctx.args);
    this.uiState = this.ctx.uiState !== undefined ? JSON.parse(this.ctx.uiState) : {};
  }

  // lazy rendering because this feature is rarely used
  private _activeArgsCache?: { v?: Args };

  /**
   * Returns args snapshot the block was executed for (i.e. when "Run" button was pressed).
   * Returns undefined, if block was never executed or stopped mid-way execution, so that the result was cleared.
   * */
  public get activeArgs(): Args | undefined {
    if (this._activeArgsCache === undefined)
      this._activeArgsCache = {
        v: this.ctx.activeArgs ? JSON.parse(this.ctx.activeArgs) : undefined,
      };
    return this._activeArgsCache.v;
  }

  // /** Can be used to determine features provided by the desktop instance. */
  // public get featureFlags() {
  //   return this.ctx.featureFlags;
  // }

  private getNamedAccessor(name: string): TreeNodeAccessor | undefined {
    return ifDef(
      this.ctx.getAccessorHandleByName(name),
      (accessor) => new TreeNodeAccessor(accessor, [name]),
    );
  }

  public get prerun(): TreeNodeAccessor | undefined {
    return this.getNamedAccessor(StagingAccessorName);
  }

  public get outputs(): TreeNodeAccessor | undefined {
    return this.getNamedAccessor(MainAccessorName);
  }

  public readonly resultPool = new ResultPool();

  /**
   * Find labels data for a given axis id. It will search for a label column and return its data as a map.
   * @returns a map of axis value => label
   * @deprecated Use resultPool.findLabels instead
   */
  public findLabels(axis: AxisId): Record<string | number, string> | undefined {
    return this.resultPool.findLabels(axis);
  }

  private verifyInlineAndExplicitColumnsSupport(columns: PColumn<TreeNodeAccessor | PColumnValues | DataInfo<TreeNodeAccessor>>[]) {
    const hasInlineColumns = columns.some((c) => !(c.data instanceof TreeNodeAccessor) || isDataInfo(c.data)); // Updated check for DataInfo
    const inlineColumnsSupport = this.ctx.featureFlags?.inlineColumnsSupport === true;
    if (hasInlineColumns && !inlineColumnsSupport) throw Error(`Inline or explicit columns not supported`); // Combined check

    // Removed redundant explicitColumns check
  }

  public createPFrame(def: PFrameDef<TreeNodeAccessor | PColumnValues | DataInfo<TreeNodeAccessor>>): PFrameHandle {
    this.verifyInlineAndExplicitColumnsSupport(def);
    return this.ctx.createPFrame(
      def.map((c) => transformPColumnData(c)),
    );
  }

  public createPTable(def: PTableDef<PColumn<TreeNodeAccessor | PColumnValues | DataInfo<TreeNodeAccessor>>>): PTableHandle;
  public createPTable(def: {
    columns: PColumn<TreeNodeAccessor | PColumnValues | DataInfo<TreeNodeAccessor>>[];
    filters?: PTableRecordFilter[];
    /** Table sorting */
    sorting?: PTableSorting[];
  }): PTableHandle;
  public createPTable(
    def:
      | PTableDef<PColumn<TreeNodeAccessor | PColumnValues | DataInfo<TreeNodeAccessor>>>
      | {
        columns: PColumn<TreeNodeAccessor | PColumnValues | DataInfo<TreeNodeAccessor>>[];
        filters?: PTableRecordFilter[];
        /** Table sorting */
        sorting?: PTableSorting[];
      },
  ): PTableHandle {
    let rawDef: PTableDef<PColumn<TreeNodeAccessor | PColumnValues | DataInfo<TreeNodeAccessor>>>;
    if ('columns' in def) {
      rawDef = {
        src: {
          type: 'full',
          entries: def.columns.map((c) => ({ type: 'column', column: c })),
        },
        filters: def.filters ?? [],
        sorting: def.sorting ?? [],
      };
    } else {
      rawDef = def;
    }
    this.verifyInlineAndExplicitColumnsSupport(extractAllColumns(rawDef.src));
    return this.ctx.createPTable(
      mapPTableDef(rawDef, (po) => transformPColumnData(po)),
    );
  }

  /** @deprecated scheduled for removal from SDK */
  public getBlockLabel(blockId: string): string {
    return this.ctx.getBlockLabel(blockId);
  }

  public getCurrentUnstableMarker(): string | undefined {
    // @TODO remove after 1 Jan 2025; forward compatibility
    if (typeof this.ctx.getCurrentUnstableMarker === 'undefined') return undefined;
    return this.ctx.getCurrentUnstableMarker();
  }
}

export type RenderFunction<Args = unknown, UiState = unknown, Ret = unknown> = (
  rCtx: RenderCtx<Args, UiState>
) => Ret;

export type UnwrapFutureRef<K> =
  K extends FutureRef<infer T>
    ? T
    : K extends bigint | boolean | null | number | string | symbol | undefined
      ? K
      : { [key in keyof K]: UnwrapFutureRef<K[key]> };

export type InferRenderFunctionReturn<RF extends AnyFunction> = RF extends (...args: any) => infer R
  ? UnwrapFutureRef<R>
  : never;
