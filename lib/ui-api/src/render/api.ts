import { GlobalCfgRenderCtx, MainAccessorName, StagingAccessorName } from './internal';
import { getCfgRenderCtx } from '../internal';
import { TreeNodeAccessor } from './accessor';
import { FutureRef } from './future';

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

  get stagingOutput(): TreeNodeAccessor | undefined {
    return this.getNamedAccessor(StagingAccessorName);
  }

  get mainOutput(): TreeNodeAccessor | undefined {
    return this.getNamedAccessor(MainAccessorName);
  }
}

export type RenderFunction<Args = unknown, UiState = unknown> =
  (rCtx: RenderCtx<Args, UiState>) => unknown

export type InferRenderFunctionReturn<RF extends Function> =
  RF extends () => infer R
    ? R extends FutureRef<infer T>
      ? T
      : R
    : never;
