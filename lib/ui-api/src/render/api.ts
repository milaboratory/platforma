import { GlobalCfgRenderCtx, MainAccessorName, StagingAccessorName } from './internal';
import { getCfgRenderCtx } from '../internal';
import { TreeNodeAccessor } from './accessor';
import { FutureRef } from './future';
import {
  Option,
  PObject,
  PObjectSpec,
  PSpecPredicate,
  ResultCollection,
  ValueOrError,
  mapValueInVOE
} from '@milaboratory/sdk-model';
import { Optional } from 'utility-types';

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

  public get stagingOutput(): TreeNodeAccessor | undefined {
    return this.getNamedAccessor(StagingAccessorName);
  }

  public get mainOutput(): TreeNodeAccessor | undefined {
    return this.getNamedAccessor(MainAccessorName);
  }

  public readonly resultPool = new ResultPool();
}

export type RenderFunction<Args = unknown, UiState = unknown> = (
  rCtx: RenderCtx<Args, UiState>
) => unknown;

export type InferRenderFunctionReturn<RF extends Function> = RF extends () => infer R
  ? R extends FutureRef<infer T>
    ? T
    : R
  : never;
