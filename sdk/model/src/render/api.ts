import {
  Option,
  PColumn,
  PColumnSpec,
  PFrameDef,
  PFrameHandle,
  PObject,
  PObjectSpec,
  PSpecPredicate,
  PTableDef,
  PTableHandle,
  PTableRecordFilter,
  PTableSorting,
  Ref,
  ResultCollection,
  ValueOrError,
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

export class ResultPool {
  private readonly ctx: GlobalCfgRenderCtx = getCfgRenderCtx();

  /**
   * @deprecated use getOptions()
   */
  public calculateOptions(predicate: PSpecPredicate): Option[] {
    return this.ctx.calculateOptions(predicate);
  }

  private defaultLabelFn = (spec: PObjectSpec, ref: Ref) =>
    spec.annotations?.['pl7.app/label'] ?? `Unlabelled`;

  public getOptions(
    predicate: (spec: PObjectSpec) => boolean,
    labelFn: (spec: PObjectSpec, ref: Ref) => string = this.defaultLabelFn
  ): Option[] {
    return this.getSpecs()
      .entries.filter((s) => predicate(s.obj))
      .map((s) => ({
        ref: s.ref,
        label: labelFn(s.obj, s.ref)
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
  public getDataByRef(ref: Ref): PObject<TreeNodeAccessor> | undefined {
    // https://github.com/milaboratory/platforma/issues/100
    // @TODO use native pool method when available
    return this.getData().entries.find(
      (f) => f.ref.blockId === ref.blockId && f.ref.name === ref.name
    )?.obj;
  }

  /**
   * @param ref a Ref
   * @returns object spec associated with the ref
   */
  public getSpecByRef(ref: Ref): PObjectSpec | undefined {
    // https://github.com/milaboratory/platforma/issues/100
    // @TODO use native pool method when available
    return this.getSpecs().entries.find(
      (f) => f.ref.blockId === ref.blockId && f.ref.name === ref.name
    )?.obj;
  }

  /**
   * @param spec object specification
   * @returns array of data objects with compatible specs
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

  public createPFrame(def: PFrameDef<TreeNodeAccessor>): PFrameHandle {
    return this.ctx.createPFrame(def.map((c) => mapPObjectData(c, (d) => d.handle)));
  }

  public createPTable(def: PTableDef<PColumn<TreeNodeAccessor>>): PTableHandle;
  public createPTable(def: {
    columns: PColumn<TreeNodeAccessor>[];
    filters?: PTableRecordFilter[];
    /** Table sorting */
    sorting?: PTableSorting[];
  }): PTableHandle;
  public createPTable(
    def:
      | PTableDef<PColumn<TreeNodeAccessor>>
      | {
          columns: PColumn<TreeNodeAccessor>[];
          filters?: PTableRecordFilter[];
          /** Table sorting */
          sorting?: PTableSorting[];
        }
  ): PTableHandle {
    var rawDef: PTableDef<PColumn<TreeNodeAccessor>>;
    if ('columns' in def) {
      rawDef = {
        src: {
          type: 'inner',
          entries: def.columns.map((c) => ({ type: 'column', column: c }))
        },
        filters: def.filters ?? [],
        sorting: def.sorting ?? []
      };
    } else {
      rawDef = def;
    }
    return this.ctx.createPTable(mapPTableDef(rawDef, (po) => mapPObjectData(po, (d) => d.handle)));
  }

  public getBlockLabel(blockId: string): string {
    return this.ctx.getBlockLabel(blockId);
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
