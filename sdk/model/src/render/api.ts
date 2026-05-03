import type {
  AnchoredPColumnSelector,
  AnyFunction,
  AxisId,
  DataInfo,
  ModelServices,
  Option,
  PColumn,
  PColumnDataStatus,
  PColumnLazy,
  PColumnSelector,
  PColumnSpec,
  PColumnValues,
  PFrameDef,
  PFrameHandle,
  PObject,
  PObjectId,
  PObjectSpec,
  PTableDef,
  PTableDefV2,
  PTableHandle,
  PTableRecordFilter,
  PTableSorting,
  PlRef,
  ResolveAnchorsOptions,
  ResultCollection,
  SUniversalPColumnId,
  ValueOrError,
} from "@milaboratories/pl-model-common";
import {
  AnchoredIdDeriver,
  parseJson,
  isDataInfo,
  isPColumn,
  isPColumnSpec,
  isPlRef,
  mapDataInfo,
  mapPObjectData,
  mapPTableDef,
  mapPTableDefV2,
  mapValueInVOE,
  PColumnName,
  readAnnotation,
  withEnrichments,
  legacyColumnSelectorsToPredicate,
  extractAllColumns,
  visitDataInfo,
} from "@milaboratories/pl-model-common";
import canonicalize from "canonicalize";
import type { Optional } from "utility-types";
import { getCfgRenderCtx } from "../internal";
import { getPluginData } from "../block_storage";
import type {
  PluginHandle,
  PluginFactoryLike,
  InferFactoryData,
  InferFactoryParams,
} from "../plugin_handle";
import { TreeNodeAccessor, ifDef } from "./accessor";
import type { FutureRef } from "./future";
import type { AccessorHandle, GlobalCfgRenderCtx } from "./internal";
import { MainAccessorName, StagingAccessorName } from "./internal";
import {
  PColumnCollection,
  type AxisLabelProvider,
  type LegacyColumnProvider,
} from "./util/column_collection";
import type { LabelDerivationOps } from "./util/label";
import { deriveLabels } from "./util/label";
import type { APColumnSelectorWithSplit } from "./util/split_selectors";
import { patchInSetFilters } from "./util/pframe_upgraders";
import type { PColumnDataUniversal } from "./internal";
import { getService } from "../services";
import { allPColumnsReady } from "./util";

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
function transformPColumnData(
  data: PColumn<undefined | PColumnDataUniversal> | PColumnLazy<undefined | PColumnDataUniversal>,
): PColumn<PColumnValues | AccessorHandle | DataInfo<AccessorHandle>> {
  return mapPObjectData(data, (d) => {
    if (d instanceof TreeNodeAccessor) {
      return d.getIsReadyOrError() ? d.handle : [];
    } else if (isDataInfo(d)) {
      let allReady = true;
      visitDataInfo(d, (a) => (allReady &&= a.getIsReadyOrError()));
      if (!allReady) return [];
      return mapDataInfo(d, (accessor) => accessor.handle);
    } else {
      return d ?? [];
    }
  });
}

type UniversalPColumnOpts = {
  labelOps?: LabelDerivationOps;
  dontWaitAllData?: boolean;
  exclude?: AnchoredPColumnSelector | AnchoredPColumnSelector[];
} & ResolveAnchorsOptions;

type GetOptionsOpts = {
  /**
   * If true, references returned by the method will contain `requireEnrichments` flag set to true.
   * If this reference is added to the block's args, it will communicate to the platform that the block
   * expects enrichments of the referenced block to be available in the context of the current block.
   */
  refsWithEnrichments?: boolean;
  /**
   * Label derivation options.
   * If provided, it will be used to derive labels for the options.
   * If not provided, labels will be derived using the default logic.
   */
  label?: ((spec: PObjectSpec, ref: PlRef) => string) | LabelDerivationOps;
};

export class ResultPool implements LegacyColumnProvider, AxisLabelProvider {
  private readonly ctx: GlobalCfgRenderCtx = getCfgRenderCtx();

  public getOptions(
    predicateOrSelector: ((spec: PObjectSpec) => boolean) | PColumnSelector | PColumnSelector[],
    opts?: GetOptionsOpts,
  ): Option[];
  /** @deprecated wrap label ops with { label: <...> } */
  public getOptions(
    predicateOrSelector: ((spec: PObjectSpec) => boolean) | PColumnSelector | PColumnSelector[],
    label?: ((spec: PObjectSpec, ref: PlRef) => string) | LabelDerivationOps,
  ): Option[];
  public getOptions(
    predicateOrSelector: ((spec: PObjectSpec) => boolean) | PColumnSelector | PColumnSelector[],
    opts?: GetOptionsOpts | ((spec: PObjectSpec, ref: PlRef) => string) | LabelDerivationOps,
  ): Option[] {
    const predicate =
      typeof predicateOrSelector === "function"
        ? predicateOrSelector
        : legacyColumnSelectorsToPredicate(predicateOrSelector);
    const filtered = this.getSpecs().entries.filter((s) => predicate(s.obj));

    let labelOps: LabelDerivationOps | ((spec: PObjectSpec, ref: PlRef) => string) = {};
    let refsWithEnrichments: boolean = false;
    if (typeof opts !== "undefined") {
      if (typeof opts === "function") {
        labelOps = opts;
      } else if (typeof opts === "object") {
        if ("includeNativeLabel" in opts || "separator" in opts || "addLabelAsSuffix" in opts) {
          labelOps = opts;
        } else {
          opts = opts as GetOptionsOpts;
          labelOps = opts.label ?? {};
          refsWithEnrichments = opts.refsWithEnrichments ?? false;
        }
      }
    }

    if (typeof labelOps === "object")
      return deriveLabels(filtered, (o) => o.obj, labelOps ?? {}).map(
        ({ value: { ref }, label }) => ({
          ref: withEnrichments(ref, refsWithEnrichments),
          label,
        }),
      );
    else
      return filtered.map(({ ref, obj }) => ({
        ref: withEnrichments(ref, refsWithEnrichments),
        label: labelOps(obj, ref),
      }));
  }

  public resolveAnchorCtx(
    anchorsOrCtx: AnchoredIdDeriver | Record<string, PColumnSpec | PlRef>,
  ): AnchoredIdDeriver | undefined {
    if (anchorsOrCtx instanceof AnchoredIdDeriver) return anchorsOrCtx;
    const resolvedAnchors: Record<string, PColumnSpec> = {};
    for (const [key, value] of Object.entries(anchorsOrCtx)) {
      if (isPlRef(value)) {
        const resolvedSpec = this.getPColumnSpecByRef(value);
        if (!resolvedSpec) return undefined;
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
    predicateOrSelectors:
      | ((spec: PColumnSpec) => boolean)
      | APColumnSelectorWithSplit
      | APColumnSelectorWithSplit[],
    opts?: UniversalPColumnOpts,
  ): PColumn<PColumnDataUniversal>[] | undefined {
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
    predicateOrSelectors:
      | ((spec: PColumnSpec) => boolean)
      | APColumnSelectorWithSplit
      | APColumnSelectorWithSplit[],
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

  public getData(): ResultCollection<PObject<TreeNodeAccessor>> {
    const result = this.ctx.getPObjectCollection();
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

  public getDataWithErrors(): ResultCollection<
    Optional<PObject<ValueOrError<TreeNodeAccessor, Error>>, "id">
  > {
    const result = this.ctx.getPObjectCollectionWithErrors();
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

  public getSpecs(): ResultCollection<PObjectSpec> {
    return this.ctx.getPObjectSpecCollection();
  }

  public getDataByRef(ref: PlRef): TreeNodeAccessor | undefined {
    const data = this.ctx.getPObjectDataByRef(ref.blockId, ref.name);
    return data === undefined ? undefined : new TreeNodeAccessor(data, [ref.blockId, ref.name]);
  }

  public getStatusByRef(ref: PlRef): "ready" | "computing" | "error" | "absent" {
    return this.ctx.getPObjectStatusByRef(ref.blockId, ref.name);
  }

  /**
   * Returns data associated with the ref ensuring that it is a p-column.
   * @param ref a Ref
   * @returns p-column associated with the ref
   */
  public getPColumnByRef(ref: PlRef): PColumn<TreeNodeAccessor | undefined> | undefined {
    const spec = this.getSpecByRef(ref);
    if (!spec) return undefined;
    if (!isPColumnSpec(spec)) throw new Error(`not a PColumn spec (kind = ${spec.kind})`);

    // oxlint-disable-next-line typescript/no-this-alias
    const self = this;
    let _resolved = false;
    let _data: TreeNodeAccessor | undefined;
    let _status: PColumnDataStatus;
    // Resolve once to keep data and status in sync.
    const resolve = () => {
      if (_resolved) return;
      _data = self.getDataByRef(ref);
      _status = self.getStatusByRef(ref);
      _resolved = true;
    };

    return {
      id: canonicalize(ref) as PObjectId,
      spec,
      get data(): TreeNodeAccessor | undefined {
        resolve();
        return _data;
      },
      get dataStatus(): PColumnDataStatus {
        resolve();
        return _status;
      },
    } satisfies PColumn<TreeNodeAccessor | undefined>;
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
    return this.ctx.getPObjectSpecByRef(ref.blockId, ref.name);
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

      if (!matchDomain(spec.contextDomain, oth.contextDomain)) {
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
        if (!matchDomain(qAx.contextDomain, tAx.contextDomain)) {
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
        spec.name === PColumnName.Label &&
        spec.axesSpec.length === 1 &&
        spec.axesSpec[0].name === axis.name &&
        spec.axesSpec[0].type === axis.type &&
        matchDomain(axis.domain, spec.axesSpec[0].domain) &&
        matchDomain(axis.contextDomain, spec.axesSpec[0].contextDomain)
      ) {
        if (column.obj.data.resourceType.name !== "PColumnData/Json") {
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
    const predicate =
      typeof selectors === "function" ? selectors : legacyColumnSelectorsToPredicate(selectors);

    return this.getSpecs()
      .entries.filter(({ obj: spec }) => isPColumnSpec(spec) && predicate(spec))
      .map(({ ref }) => this.getPColumnByRef(ref))
      .filter((col): col is PColumn<TreeNodeAccessor | undefined> => col !== undefined);
  }

  /**
   * Find labels data for a given axis id of a p-column.
   * @returns a map of axis value => label
   */
  public findLabelsForColumnAxis(
    column: PColumnSpec,
    axisIdx: number,
  ): Record<string | number, string> | undefined {
    const labels = this.findLabels(column.axesSpec[axisIdx]);
    if (!labels) return undefined;
    const axisKeys = readAnnotation(column, `pl7.app/axisKeys/${axisIdx}`);
    if (axisKeys !== undefined) {
      const keys = JSON.parse(axisKeys) as string[];
      return Object.fromEntries(
        keys.map((key) => {
          return [key, labels[key] ?? "Unlabelled"];
        }),
      );
    } else {
      return labels;
    }
  }
}

/** Main entry point to the API available within model lambdas (like outputs, sections, etc..) */
export abstract class RenderCtxBase<Args = unknown, Data = unknown> {
  protected readonly ctx: GlobalCfgRenderCtx;

  constructor() {
    this.ctx = getCfgRenderCtx();
  }

  private dataCache?: { v: Data };

  public get data(): Data {
    if (this.dataCache === undefined) {
      const raw = this.ctx.data;
      const value = typeof raw === "function" ? raw() : raw;
      this.dataCache = { v: value ? JSON.parse(value) : ({} as Data) };
    }
    return this.dataCache.v;
  }

  // lazy rendering because this feature is rarely used
  private activeArgsCache?: { v?: Args };

  /**
   * Returns args snapshot the block was executed for (i.e. when "Run" button was pressed).
   * Returns undefined, if block was never executed or stopped mid-way execution, so that the result was cleared.
   * */
  public get activeArgs(): Args | undefined {
    if (this.activeArgsCache === undefined) {
      const raw = this.ctx.activeArgs;
      const value = typeof raw === "function" ? raw() : raw;
      this.activeArgsCache = {
        v: value ? JSON.parse(value) : undefined,
      };
    }
    return this.activeArgsCache.v;
  }

  public getService<T extends keyof ModelServices>(name: T): ModelServices[T] {
    return getService(name);
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

  private verifyInlineAndExplicitColumnsSupport(
    columns: (PColumn<PColumnDataUniversal> | PColumnLazy<undefined | PColumnDataUniversal>)[],
  ) {
    const hasInlineColumns = columns.some(
      (c) => !(c.data instanceof TreeNodeAccessor) || isDataInfo(c.data),
    ); // Updated check for DataInfo
    const inlineColumnsSupport = this.ctx.featureFlags?.inlineColumnsSupport === true;
    if (hasInlineColumns && !inlineColumnsSupport)
      throw Error(`Inline or explicit columns not supported`); // Combined check

    // Removed redundant explicitColumns check
  }

  private patchPTableDef(
    def: PTableDef<PColumn<PColumnDataUniversal>>,
  ): PTableDef<PColumn<PColumnDataUniversal>> {
    if (!this.ctx.featureFlags?.pTablePartitionFiltersSupport) {
      // For old desktop move all partition filters to filters field as it doesn't read partitionFilters field
      def = {
        ...def,
        partitionFilters: [],
        filters: [...def.partitionFilters, ...def.filters],
      };
    }
    if (!this.ctx.featureFlags?.pFrameInSetFilterSupport) {
      def = {
        ...def,
        partitionFilters: patchInSetFilters(def.partitionFilters),
        filters: patchInSetFilters(def.filters),
      };
    }
    return def;
  }

  // TODO remove all non-PColumn fields
  public createPFrame(
    def: PFrameDef<
      PColumn<undefined | PColumnDataUniversal> | PColumnLazy<undefined | PColumnDataUniversal>
    >,
  ): PFrameHandle | undefined {
    return this.ctx.createPFrame(def.map(transformPColumnData));
  }

  // TODO remove all non-PColumn fields
  public createPTable(def: PTableDef<PColumn<PColumnDataUniversal>>): PTableHandle | undefined;
  public createPTable(def: {
    columns: PColumn<PColumnDataUniversal>[];
    filters?: PTableRecordFilter[];
    /** Table sorting */
    sorting?: PTableSorting[];
  }): PTableHandle | undefined;
  public createPTable(
    def:
      | PTableDef<PColumn<PColumnDataUniversal>>
      | {
          columns: PColumn<PColumnDataUniversal>[];
          filters?: PTableRecordFilter[];
          /** Table sorting */
          sorting?: PTableSorting[];
        },
  ): PTableHandle | undefined {
    let rawDef: PTableDef<PColumn<PColumnDataUniversal>>;
    if ("columns" in def) {
      rawDef = this.patchPTableDef({
        src: {
          type: "full",
          entries: def.columns.map((c) => ({ type: "column", column: c })),
        },
        partitionFilters: def.filters ?? [],
        filters: [],
        sorting: def.sorting ?? [],
      });
    } else {
      rawDef = this.patchPTableDef(def);
    }
    const columns = extractAllColumns(rawDef.src);
    this.verifyInlineAndExplicitColumnsSupport(columns);
    if (!allPColumnsReady(columns)) return undefined;
    return this.ctx.createPTable(mapPTableDef(rawDef, transformPColumnData));
  }

  public createPTableV2(
    def: PTableDefV2<PColumn<undefined | PColumnDataUniversal>>,
  ): PTableHandle | undefined {
    return this.ctx.createPTableV2(mapPTableDefV2(def, transformPColumnData));
  }

  public getCurrentUnstableMarker(): string | undefined {
    return this.ctx.getCurrentUnstableMarker();
  }

  public logInfo(msg: string): void {
    this.ctx.logInfo(msg);
  }

  public logWarn(msg: string): void {
    this.ctx.logWarn(msg);
  }

  public logError(msg: string): void {
    this.ctx.logError(msg);
  }
}

/** Main entry point to the API available within model lambdas (like outputs, sections, etc..) for v3+ blocks */
export class BlockRenderCtx<Args = unknown, Data = unknown> extends RenderCtxBase<Args, Data> {
  private argsCache?: { v: Args | undefined };
  public get args(): Args | undefined {
    if (this.argsCache === undefined) {
      const raw = this.ctx.args;
      const value = typeof raw === "function" ? raw() : raw;
      this.argsCache = { v: value === undefined ? undefined : JSON.parse(value) };
    }
    return this.argsCache.v;
  }
}

/** Render context for legacy v1/v2 blocks - provides backward compatibility */
export class RenderCtxLegacy<Args = unknown, UiState = unknown> extends RenderCtxBase<
  Args,
  UiState
> {
  private argsCache?: { v: Args };

  public get args(): Args {
    if (this.argsCache === undefined) {
      const raw = this.ctx.args;
      const value = typeof raw === "function" ? raw() : raw;
      this.argsCache = { v: JSON.parse(value) };
    }
    return this.argsCache.v;
  }

  private uiStateCache?: { v: UiState };

  public get uiState(): UiState {
    if (this.uiStateCache === undefined) {
      const raw = this.ctx.uiState!;
      const value = typeof raw === "function" ? raw() : raw;
      this.uiStateCache = { v: value ? JSON.parse(value) : ({} as UiState) };
    }
    return this.uiStateCache.v;
  }
}

/**
 * Render context for plugin output functions.
 * Reads plugin data from blockStorage and derives params from pre-wrapped input callbacks.
 *
 * Parameterized on the factory-like phantom F so that getPluginData returns
 * InferFactoryData<F> directly — no casts needed for the data getter.
 *
 * @typeParam F - PluginFactoryLike phantom carrying data/params/outputs types
 */
export class PluginRenderCtx<F extends PluginFactoryLike = PluginFactoryLike> extends RenderCtxBase<
  unknown,
  InferFactoryData<F>
> {
  private readonly handle: PluginHandle<F>;
  private readonly wrappedInputs: Record<string, () => unknown>;

  constructor(handle: PluginHandle<F>, wrappedInputs: Record<string, () => unknown>) {
    super();
    this.handle = handle;
    this.wrappedInputs = wrappedInputs;
  }

  private pluginDataCache?: { v: InferFactoryData<F> };

  /** Plugin's persistent data from blockStorage.__plugins.{pluginId}.__data */
  public override get data(): InferFactoryData<F> {
    if (this.pluginDataCache === undefined) {
      const raw = this.ctx.blockStorage();
      this.pluginDataCache = { v: getPluginData(parseJson(raw), this.handle) };
    }
    return this.pluginDataCache.v;
  }

  private paramsCache?: { v: InferFactoryParams<F> };

  /** Params derived from block context via pre-wrapped input callbacks */
  public get params(): InferFactoryParams<F> {
    if (this.paramsCache === undefined) {
      const result: Record<string, unknown> = {};
      for (const [key, fn] of Object.entries(this.wrappedInputs)) {
        result[key] = fn();
      }
      this.paramsCache = { v: result as InferFactoryParams<F> };
    }
    return this.paramsCache.v;
  }
}

/** @deprecated Use BlockRenderCtx instead */
export type RenderCtx<Args = unknown, Data = unknown> = BlockRenderCtx<Args, Data>;

export type RenderFunction<Args = unknown, State = unknown, Ret = unknown> = (
  rCtx: BlockRenderCtx<Args, State>,
) => Ret;

export type RenderFunctionLegacy<Args = unknown, State = unknown, Ret = unknown> = (
  rCtx: RenderCtxLegacy<Args, State>,
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
