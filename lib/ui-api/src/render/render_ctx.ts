/** Field key to attach ConfAction information to a config type. */
declare const __future_type__: unique symbol;

export type FutureRef<T = unknown> =
  { '__future_handle__': string }
  & { [__future_type__]: T }

export type ExtractFutureRefType<Ref extends FutureRef> = Ref[typeof __future_type__]

export interface RenderResourceAccessor {
  resolvePath(...fieldNames: string[]): RenderResourceAccessor | undefined;

  resourceValueAsJson<T>(): FutureRef<T>;
}

export interface RenderCtx {
  readonly stagingOutputs: RenderResourceAccessor | undefined;
  readonly mainOutputs: RenderResourceAccessor | undefined;
}

export type RenderFunction<R = unknown> = (rCtx: RenderCtx) => R
export type InferRenderFunctionReturn<RF extends RenderFunction> =
  RF extends RenderFunction<infer R>
    ? R extends FutureRef<infer T>
      ? T
      : R
    : never;
