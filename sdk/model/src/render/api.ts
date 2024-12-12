import {
  AxisId,
  Option,
  PColumn,
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
  ensurePColumn,
  extractAllColumns,
  isPColumn,
  isPColumnSpec,
  mapPObjectData,
  mapPTableDef,
  mapValueInVOE
} from '@milaboratories/pl-model-common';
import { Optional } from 'utility-types';
import { getCfgRenderCtx } from '../internal';
import { TreeNodeAccessor } from './accessor';
import { FutureRef } from './future';
import { GlobalCfgRenderCtx, MainAccessorName, StagingAccessorName } from './internal';
import { LabelDerivationOps, deriveLabels } from './util/label';

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
    predicate: (spec: PObjectSpec) => boolean,
    label?: ((spec: PObjectSpec, ref: PlRef) => string) | LabelDerivationOps
  ): Option[] {
    const filtered = this.getSpecs().entries.filter((s) => predicate(s.obj));
    if (typeof label === 'object' || typeof label === 'undefined') {
      return deriveLabels(filtered, (o) => o.obj, label ?? {}).map(({ value: { ref }, label }) => ({
        ref,
        label
      }));
    } else
      return filtered.map((s) => ({
        ref: s.ref,
        label: label(s.obj, s.ref)
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
          data: new TreeNodeAccessor(e.obj.data)
        }
      }))
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
          data: mapValueInVOE(e.obj.data, (handle) => new TreeNodeAccessor(handle))
        }
      }))
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
        (f) => f.ref.blockId === ref.blockId && f.ref.name === ref.name
      )?.obj;
    return mapPObjectData(
      this.ctx.getDataFromResultPoolByRef(ref.blockId, ref.name),
      (handle) => new TreeNodeAccessor(handle)
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
    // @TODO remove after 1 Jan 2025; forward compatibility
    if (typeof this.ctx.getSpecFromResultPoolByRef === 'undefined')
      return this.getSpecs().entries.find(
        (f) => f.ref.blockId === ref.blockId && f.ref.name === ref.name
      )?.obj;
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
}

function matchDomain(query?: Record<string, string>, target?: Record<string, string>) {
  if (query === undefined) return target === undefined;
  if (target === undefined) return true;
  for (const k in target) {
    if (query[k] !== target[k]) return false;
  }
  return true;
}

export class RenderCtx<Args, UiState> {
  private readonly ctx: GlobalCfgRenderCtx;

  public readonly args: Args;
  public readonly uiState: UiState | undefined;

  constructor() {
    this.ctx = getCfgRenderCtx();
    this.args = JSON.parse(this.ctx.args);
    this.uiState = this.ctx.uiState !== undefined ? JSON.parse(this.ctx.uiState) : undefined;
  }

  private getNamedAccessor(name: string): TreeNodeAccessor | undefined {
    const accessorId = this.ctx.getAccessorHandleByName(name);
    return accessorId ? new TreeNodeAccessor(accessorId) : undefined;
  }

  public get prerun(): TreeNodeAccessor | undefined {
    return this.getNamedAccessor(StagingAccessorName);
  }

  /**
   * @deprecated use prerun
   */
  public get precalc(): TreeNodeAccessor | undefined {
    return this.prerun;
  }

  /**
   * @deprecated use prerun
   */
  public get stagingOutput(): TreeNodeAccessor | undefined {
    return this.precalc;
  }

  public get outputs(): TreeNodeAccessor | undefined {
    return this.getNamedAccessor(MainAccessorName);
  }

  /**
   * @deprecated use outputs
   */
  public get mainOutput(): TreeNodeAccessor | undefined {
    return this.outputs;
  }

  public readonly resultPool = new ResultPool();

  /**
   * Find labels data for a given axis id. It will search for a label column and return its data as a map.
   * @returns a map of axis value => label
   */
  public findLabels(axis: AxisId): Record<string | number, string> | undefined {
    const dataPool = this.resultPool.getData();
    for (const column of dataPool.entries) {
      if (!isPColumn(column.obj)) continue;

      const spec = column.obj.spec;
      if (
        spec.name === 'pl7.app/label' &&
        spec.axesSpec.length === 1 &&
        spec.axesSpec[0].name === axis.name &&
        spec.axesSpec[0].type === axis.type &&
        matchDomain(axis.domain, spec.axesSpec[0].domain)
      ) {
        if (column.obj.data.resourceType.name !== 'PColumnData/Json') {
          throw Error(`Expected JSON column for labels, got: ${column.obj.data.resourceType.name}`);
        }
        const labels: Record<string | number, string> = Object.fromEntries(
          Object.entries(
            column.obj.data.getDataAsJson<{
              data: Record<string | number, string>;
            }>().data
          ).map((e) => [JSON.parse(e[0])[0], e[1]])
        );

        return labels;
      }
    }
    return undefined;
  }

  private verifyInlineColumnsSupport(columns: PColumn<TreeNodeAccessor | PColumnValues>[]) {
    const hasInlineColumns = columns.some((c) => !(c.data instanceof TreeNodeAccessor))
    const inlineColumnsSupport = this.ctx.featureFlags?.inlineColumnsSupport === true;
    if (hasInlineColumns && !inlineColumnsSupport) throw Error(`inline columns not supported`);
  }

  public createPFrame(def: PFrameDef<TreeNodeAccessor | PColumnValues>): PFrameHandle {
    this.verifyInlineColumnsSupport(def);
    return this.ctx.createPFrame(def.map((c) => mapPObjectData(c, (d) => 
      d instanceof TreeNodeAccessor ? d.handle : d
    )));
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
        }
  ): PTableHandle {
    var rawDef: PTableDef<PColumn<TreeNodeAccessor | PColumnValues>>;
    if ('columns' in def) {
      rawDef = {
        src: {
          type: 'full',
          entries: def.columns.map((c) => ({ type: 'column', column: c }))
        },
        filters: def.filters ?? [],
        sorting: def.sorting ?? []
      };
    } else {
      rawDef = def;
    }
    this.verifyInlineColumnsSupport(extractAllColumns(rawDef.src));
    return this.ctx.createPTable(mapPTableDef(rawDef, (po) => mapPObjectData(po, (d) => 
      d instanceof TreeNodeAccessor ? d.handle : d
    )));
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

export type InferRenderFunctionReturn<RF extends Function> = RF extends (...args: any) => infer R
  ? UnwrapFutureRef<R>
  : never;
