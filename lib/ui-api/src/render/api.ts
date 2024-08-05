import {
  Option,
  PColumn,
  PFrameDef,
  PFrameHandle,
  PObject,
  PObjectSpec,
  PSpecPredicate,
  PTableDef,
  PTableHandle,
  ResultCollection,
  ValueOrError,
  mapPObjectData,
  mapPTableDef,
  mapValueInVOE
} from '@milaboratory/sdk-model';
import { Optional } from 'utility-types';
import { getCfgRenderCtx } from '../internal';
import { TreeNodeAccessor } from './accessor';
import { FutureRef } from './future';
import { GlobalCfgRenderCtx, MainAccessorName, StagingAccessorName } from './internal';

export class ResultPool {
  private readonly ctx: GlobalCfgRenderCtx = getCfgRenderCtx();

  public calculateOptions(predicate: PSpecPredicate): Option[] {
    return this.ctx.calculateOptions(predicate);
  }

  public getDataFromResultPool(): ResultCollection<PObject<TreeNodeAccessor>> {
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

  public getDataWithErrorsFromResultPool(): ResultCollection<
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

  public getSpecsFromResultPool(): ResultCollection<PObjectSpec> {
    return this.ctx.getSpecsFromResultPool();
  }
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

  public get precalc():  TreeNodeAccessor | undefined {
    return this.getNamedAccessor(StagingAccessorName);
  }

  /**
   * @deprecated use precalc
   */
  public get stagingOutput(): TreeNodeAccessor | undefined {
    return this.precalc
  }

  public get outputs():  TreeNodeAccessor | undefined {
    return this.getNamedAccessor(MainAccessorName);
  }
  
  /**
   * @deprecated use outputs
   */
  public get mainOutput(): TreeNodeAccessor | undefined {
    return this.outputs
  }  

  public readonly resultPool = new ResultPool();

  public createPFrame(def: PFrameDef<TreeNodeAccessor>): PFrameHandle {
    return this.ctx.createPFrame(def.map((c) => mapPObjectData(c, (d) => d.handle)));
  }

  public createPTable(def: PTableDef<PColumn<TreeNodeAccessor>>): PTableHandle {
    return this.ctx.createPTable(mapPTableDef(def, (po) => mapPObjectData(po, (d) => d.handle)));
  }
}

export type RenderFunction<Args = unknown, UiState = unknown, Ret = unknown> = (
  rCtx: RenderCtx<Args, UiState>
) => Ret;

export type InferRenderFunctionReturn<RF extends Function> = RF extends (...args: any) => infer R
  ? R extends FutureRef<infer T>
    ? T
    : R
  : never;
