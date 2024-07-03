import { AccessorHandle, GlobalCfgRenderCtx, MainAccessorName, StagingAccessorName } from './global_ctx';
import { getCfgRenderCtx, tryGetCfgRenderCtx } from '../platforma_instance';

/** Field key to attach ConfAction information to a config type. */
declare const __future_type__: unique symbol;

export type FutureRef<T = unknown> =
  { '__future_handle__': string }
  & { [__future_type__]: T }

export type ExtractFutureRefType<Ref extends FutureRef> = Ref[typeof __future_type__]

export class ResourceAccessor {
  constructor(private readonly accessorHandle: AccessorHandle) {
  }

  public resolveField(fieldName: string): ResourceAccessor | undefined {
    const accessorHandle = getCfgRenderCtx()
      .resolveField(this.accessorHandle, fieldName);
    return accessorHandle ? new ResourceAccessor(accessorHandle) : undefined;
  }

  public resourceValueAsJson<T>(): T {
    const content = getCfgRenderCtx()
      .getResourceValueAsString(this.accessorHandle);
    if (content == undefined)
      throw new Error('Resource has no content.');
    return JSON.parse(content);
  };
}

export class RenderCtx<Args, UiState> {
  private readonly ctx: GlobalCfgRenderCtx;

  public readonly args: Args;
  public readonly uiState: UiState | undefined;

  constructor() {
    const ctx = getCfgRenderCtx();
    this.ctx = ctx;
    this.args = JSON.parse(ctx.args);
    this.uiState = ctx.uiState !== undefined ? JSON.parse(ctx.uiState) : undefined;
  }

  private getAccessor(name: string): ResourceAccessor | undefined {
    const accessorId = this.ctx.getAccessorHandleByName(name);
    return accessorId ? new ResourceAccessor(accessorId) : undefined;
  }

  get stagingOutput(): ResourceAccessor | undefined {
    return this.getAccessor(StagingAccessorName);
  }

  get mainOutput(): ResourceAccessor | undefined {
    return this.getAccessor(MainAccessorName);
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
