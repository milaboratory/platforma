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
  AnchoredPColumnSelector } from '@milaboratories/pl-model-common';
import {
  AnchoredIdDeriver,
  getAxisId,
  resolveAnchors } from '@milaboratories/pl-model-common';
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
import type { GlobalCfgRenderCtx } from './internal';
import { MainAccessorName, StagingAccessorName } from './internal';
import type { LabelDerivationOps } from './util/label';
import { deriveLabels } from './util/label';
import type { APColumnSelectorWithSplit } from './split_selectors';
import { getUniquePartitionKeys } from './util/pcolumn_data';
import type { TraceEntry } from './util/label';
import { canonicalizeAxisId } from '@milaboratories/pl-model-common';
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

export type UniversalOption = { label: string; value: SUniversalPColumnId };

export class ResultPool {
  private readonly ctx: GlobalCfgRenderCtx = getCfgRenderCtx();

  /**
   * @deprecated use getOptions()
   */
  public calculateOptions(predicate: PSpecPredicate): Option[] {
    return this.ctx.calculateOptions(predicate);
  }

  private defaultLabelFn = (spec: PObjectSpec, ref: PlRef) =>
    spec.annotations?.['pl7.app/label'] ?? `Unlabelled`;

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
   * @param predicateOrSelector - Either:
   *                            - A predicate function that takes a PColumnSpec and returns a boolean.
   *                              Only specs that return true will be included.
   *                            - An APColumnSelector object for declarative filtering, which will be
   *                              resolved against the provided anchors and matched using matchPColumn.
   *                            - An array of APColumnSelector objects - columns matching ANY selector
   *                              in the array will be included (OR operation).
   * @param labelOps - Optional configuration for label generation:
   *                 - includeNativeLabel: Whether to include native column labels
   *                 - separator: String to use between label parts (defaults to " / ")
   *                 - addLabelAsSuffix: Whether to add labels as suffix instead of prefix
   * @returns An array of objects with `label` (display text) and `value` (anchored ID string) properties,
   *          or undefined if any PlRef resolution fails.
   */
  // Overload for AnchorCtx - guaranteed to never return undefined
  getCanonicalOptions(
    anchorsOrCtx: AnchoredIdDeriver,
    predicateOrSelectors: ((spec: PColumnSpec) => boolean) | APColumnSelectorWithSplit | AnchoredPColumnSelector[],
    labelOps?: LabelDerivationOps,
  ): { label: string; value: SUniversalPColumnId }[];

  // Overload for Record<string, PColumnSpec> - guaranteed to never return undefined
  getCanonicalOptions(
    anchorsOrCtx: Record<string, PColumnSpec>,
    predicateOrSelectors: ((spec: PColumnSpec) => boolean) | APColumnSelectorWithSplit | AnchoredPColumnSelector[],
    labelOps?: LabelDerivationOps,
  ): { label: string; value: SUniversalPColumnId }[];

  // Overload for Record<string, PColumnSpec | PlRef> - may return undefined if PlRef resolution fails
  getCanonicalOptions(
    anchorsOrCtx: Record<string, PColumnSpec | PlRef>,
    predicateOrSelectors: ((spec: PColumnSpec) => boolean) | APColumnSelectorWithSplit | AnchoredPColumnSelector[],
    labelOps?: LabelDerivationOps,
  ): { label: string; value: SUniversalPColumnId }[] | undefined;

  // Implementation
  getCanonicalOptions(
    anchorsOrCtx: AnchoredIdDeriver | Record<string, PColumnSpec | PlRef>,
    predicateOrSelectors: ((spec: PColumnSpec) => boolean) | APColumnSelectorWithSplit | AnchoredPColumnSelector[],
    labelOps?: LabelDerivationOps,
  ): { label: string; value: SUniversalPColumnId }[] | undefined {
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
          resolvedAnchors[key] = value as PColumnSpec;
        }
      }
    }

    const predicate = typeof predicateOrSelectors === 'function'
      ? predicateOrSelectors
      : selectorsToPredicate(Array.isArray(predicateOrSelectors)
        ? predicateOrSelectors.map((selector) => resolveAnchors(resolvedAnchors, selector))
        : resolveAnchors(resolvedAnchors, predicateOrSelectors),
      );

    const filtered = this.getSpecs().entries.filter(({ obj: spec }) => {
      if (!isPColumnSpec(spec)) return false;
      return predicate(spec);
    });

    if (filtered.length === 0)
      return [];

    const anchorIdDeriver = anchorsOrCtx instanceof AnchoredIdDeriver
      ? anchorsOrCtx
      : new AnchoredIdDeriver(resolvedAnchors);

    const splitAxisIdxs = typeof predicateOrSelectors === 'object'
      && !Array.isArray(predicateOrSelectors)
      && 'axes' in predicateOrSelectors
      && predicateOrSelectors.axes !== undefined
      && predicateOrSelectors.partialAxesMatch === undefined
      ? predicateOrSelectors.axes
        .map((axis, index) => ('split' in axis && axis.split === true) ? index : -1)
        .filter((index) => index !== -1)
      : [];
    splitAxisIdxs.sort((a, b) => a - b);

    if (splitAxisIdxs.length > 0) {
      const result: { obj: PColumnSpec; ref: PlRef; filteringTrace: TraceEntry[]; filters: AxisFilter[] }[] = [];

      const maxSplitIdx = splitAxisIdxs[splitAxisIdxs.length - 1]; // Last one is max since they're sorted

      for (const { ref, obj: spec } of filtered) {
        if (!isPColumnSpec(spec)) continue;

        const columnData = this.getDataByRef(ref);
        if (!columnData || !isPColumn(columnData)) continue;

        const uniqueKeys = getUniquePartitionKeys(columnData.data);
        if (!uniqueKeys) continue; // data not fully initialized yet

        if (maxSplitIdx >= uniqueKeys.length)
          throw new Error(`Not enough partition keys for the requested split axes in column ${spec.name}`);

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

        for (const keyCombo of keyCombinations) {
          const filteringTrace: TraceEntry[] = keyCombo.map((value, sAxisIdx) => {
            const axisIdx = splitAxisIdxs[sAxisIdx];
            const canonicalAxisId = canonicalizeAxisId(getAxisId(spec.axesSpec[axisIdx]));
            const axisLabels = axesLabels[sAxisIdx];
            const label = axisLabels?.[value] ?? String(value);
            return {
              type: `split:${canonicalAxisId}`,
              label,
              importance: 1_000_000,
            };
          });

          const filters: AxisFilter[] = splitAxisIdxs.map((idx, i) => [idx, keyCombo[i] as PValue]);
          result.push({
            obj: spec,
            ref,
            filteringTrace: filteringTrace,
            filters,
          });
        }
      }

      const labelResults = deriveLabels(
        result,
        (o) => ({
          spec: o.obj,
          suffixTrace: o.filteringTrace,
        }),
        labelOps ?? {},
      );

      return labelResults.map((item) => ({
        value: anchorIdDeriver.deriveS(item.value.obj as PColumnSpec, item.value.filters),
        label: item.label,
      }));
    }

    return deriveLabels(filtered, (o) => o.obj, labelOps ?? {}).map(({ value: { obj: spec }, label }) => ({
      value: anchorIdDeriver.deriveS(spec as PColumnSpec),
      label,
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
    return mapPObjectData(
      this.ctx.getDataFromResultPoolByRef(ref.blockId, ref.name),
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
    return spec as PColumnSpec;
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

  private verifyInlineColumnsSupport(columns: PColumn<TreeNodeAccessor | PColumnValues>[]) {
    const hasInlineColumns = columns.some((c) => !(c.data instanceof TreeNodeAccessor));
    const inlineColumnsSupport = this.ctx.featureFlags?.inlineColumnsSupport === true;
    if (hasInlineColumns && !inlineColumnsSupport) throw Error(`inline columns not supported`);
  }

  public createPFrame(def: PFrameDef<TreeNodeAccessor | PColumnValues>): PFrameHandle {
    this.verifyInlineColumnsSupport(def);
    return this.ctx.createPFrame(
      def.map((c) => mapPObjectData(c, (d) => (d instanceof TreeNodeAccessor ? d.handle : d))),
    );
  }

  public createPTable(def: PTableDef<PColumn<TreeNodeAccessor | PColumnValues>>): PTableHandle;
  public createPTable(def: {
    columns: PColumn<TreeNodeAccessor | PColumnValues>[];
    filters?: PTableRecordFilter[];
    /** Table sorting */
    sorting?: PTableSorting[];
  }): PTableHandle;
  public createPTable(
    def:
      | PTableDef<PColumn<TreeNodeAccessor | PColumnValues>>
      | {
        columns: PColumn<TreeNodeAccessor | PColumnValues>[];
        filters?: PTableRecordFilter[];
        /** Table sorting */
        sorting?: PTableSorting[];
      },
  ): PTableHandle {
    let rawDef: PTableDef<PColumn<TreeNodeAccessor | PColumnValues>>;
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
    this.verifyInlineColumnsSupport(extractAllColumns(rawDef.src));
    return this.ctx.createPTable(
      mapPTableDef(rawDef, (po) =>
        mapPObjectData(po, (d) => (d instanceof TreeNodeAccessor ? d.handle : d)),
      ),
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

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type, @typescript-eslint/no-explicit-any
export type InferRenderFunctionReturn<RF extends Function> = RF extends (...args: any) => infer R
  ? UnwrapFutureRef<R>
  : never;
