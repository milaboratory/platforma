import type {
  AnyFunction,
  AxisId,
  DataInfo,
  Option,
  PColumn,
  PColumnSelector,
  PColumnSpec,
  PColumnValues,
  PFrameDef,
  PFrameHandle,
  PObject,
  PObjectId,
  PObjectSpec,
  PSpecPredicate,
  PTableDef,
  PTableHandle,
  PTableRecordFilter,
  PTableSorting,
  PlRef,
  ResultCollection,
  SUniversalPColumnId,
  ValueOrError,
} from '@milaboratories/pl-model-common';
import {
  AnchoredIdDeriver,
  ensurePColumn,
  extractAllColumns,
  isDataInfo,
  isPColumn,
  isPColumnSpec,
  isPlRef,
  mapDataInfo,
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
import { PColumnCollection, type AxisLabelProvider, type ColumnProvider } from './util/column_collection';
import { deriveLabels } from './util/label';
import type { APColumnSelectorWithSplit } from './util/split_selectors';
import canonicalize from 'canonicalize';

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

type UniversalPColumnOpts = {
  labelOps?: LabelDerivationOps;
  dontWaitAllData?: boolean;
};

export class ResultPool implements ColumnProvider, AxisLabelProvider {
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

  public resolveAnchorCtx(anchorsOrCtx: AnchoredIdDeriver | Record<string, PColumnSpec | PlRef>): AnchoredIdDeriver | undefined {
    if (anchorsOrCtx instanceof AnchoredIdDeriver) return anchorsOrCtx;
    const resolvedAnchors: Record<string, PColumnSpec> = {};
    for (const [key, value] of Object.entries(anchorsOrCtx)) {
      if (isPlRef(value)) {
        const resolvedSpec = this.getPColumnSpecByRef(value);
        if (!resolvedSpec)
          return undefined;
        resolvedAnchors[key] = resolvedSpec;
      } else {
        resolvedAnchors[key] = value;
      }
    }
    return new AnchoredIdDeriver(resolvedAnchors);
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
  ): PColumn<DataInfo<TreeNodeAccessor> | TreeNodeAccessor>[] | undefined {
    const anchorCtx = this.resolveAnchorCtx(anchorsOrCtx);
    if (!anchorCtx) return undefined;
    return new PColumnCollection()
      .addColumnProvider(this)
      .addAxisLabelProvider(this)
      .getColumns(predicateOrSelectors, {
        ...opts,
        anchorCtx,
      });
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
    const anchorCtx = this.resolveAnchorCtx(anchorsOrCtx);
    if (!anchorCtx) return undefined;
    const entries = new PColumnCollection()
      .addColumnProvider(this)
      .addAxisLabelProvider(this)
      .getUniversalEntries(predicateOrSelectors, {
        ...opts,
        anchorCtx,
      });
    if (!entries) return undefined;
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
    Optional<PObject<ValueOrError<TreeNodeAccessor, Error>>, 'id'>
  > {
    return this.getDataWithErrors();
  }

  public getDataWithErrors(): ResultCollection<
    Optional<PObject<ValueOrError<TreeNodeAccessor, Error>>, 'id'>
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

  /**
   * Selects columns based on the provided selectors, returning PColumn objects
   * with lazily loaded data.
   *
   * @param selectors - A predicate function, a single selector, or an array of selectors.
   * @returns An array of PColumn objects matching the selectors. Data is loaded on first access.
   */
  public selectColumns(
    selectors: ((spec: PColumnSpec) => boolean) | PColumnSelector | PColumnSelector[],
  ): PColumn<TreeNodeAccessor | undefined>[] {
    const predicate = typeof selectors === 'function' ? selectors : selectorsToPredicate(selectors);

    const matchedSpecs = this.getSpecs().entries.filter(({ obj: spec }) => {
      if (!isPColumnSpec(spec)) return false;
      return predicate(spec);
    });

    // Map specs to PColumn objects with lazy data loading
    return matchedSpecs.map(({ ref, obj: spec }) => {
      // Type assertion needed because filter ensures it's PColumnSpec
      const pcolumnSpec = spec as PColumnSpec;
      let _cachedData: TreeNodeAccessor | undefined | null = null; // Use null to distinguish initial state from undefined result
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this; // Capture 'this' for use inside the getter

      return {
        id: canonicalize(ref) as PObjectId,
        spec: pcolumnSpec,
        get data(): TreeNodeAccessor | undefined {
          if (_cachedData !== null) {
            return _cachedData; // Return cached data (could be undefined if fetch failed)
          }

          _cachedData = self.getPColumnByRef(ref)?.data;
          return _cachedData;
        },
      } satisfies PColumn<TreeNodeAccessor | undefined>; // Cast needed because 'data' is a getter
    });
  }

  /**
   * Find labels data for a given axis id of a p-column.
   * @returns a map of axis value => label
   */
  public findLabelsForColumnAxis(column: PColumn<TreeNodeAccessor>, axisIdx: number): Record<string | number, string> | undefined {
    const labels = this.findLabels(column.spec.axesSpec[axisIdx]);
    if (!labels) return undefined;
    return Object.fromEntries(column.data.listInputFields().map((field) => {
      const r = JSON.parse(field) as [string];
      return [r[axisIdx], labels[r[axisIdx]] ?? 'Unlabelled'];
    }));
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

  // TODO remove all non-PColumn fields
  public createPFrame(def: PFrameDef<TreeNodeAccessor | PColumnValues | DataInfo<TreeNodeAccessor>>): PFrameHandle {
    this.verifyInlineAndExplicitColumnsSupport(def);
    return this.ctx.createPFrame(
      def.map((c) => transformPColumnData(c)),
    );
  }

  // TODO remove all non-PColumn fields
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
