import { AccessorLeakException, TrackedAccessorProvider } from './accessor_provider';
import { CellRenderingOps, ComputableCtx, KernelLambdaField, UnwrapComputables } from './kernel';
import { Computable } from './computable';

let ephKeyCounter = 1;

function nextEphemeralKey(): string {
  return `__eph_key_${ephKeyCounter++}`;
}

export const DefaultRenderingOps: CellRenderingOps = {
  mode: 'Live', resetValueOnError: true
};

export function noopPostprocessValue<IR>(): (value: UnwrapComputables<IR>, stable: boolean) => Promise<UnwrapComputables<IR>> {
  return async v => v;
}

export interface ComputableRenderingOps extends CellRenderingOps {
  key: string;
}

// export function computable<A, IR, T>(
//   ap: TrackedAccessorProvider<A>,
//   ops: Partial<ComputableRenderingOps>,
//   cb: (a: A, ctx: ComputableCtx) => IR,
//   postprocessValue: (value: UnwrapComputables<IR>, stable: boolean) => Promise<T>): Computable<T>
// export function computable<A, IR>(
//   ap: TrackedAccessorProvider<A>,
//   ops: Partial<ComputableRenderingOps>,
//   cb: (a: A, ctx: ComputableCtx) => IR): Computable<UnwrapComputables<IR>>
export function computable<A, IR, T = UnwrapComputables<IR>>(
  ap: TrackedAccessorProvider<A>,
  ops: Partial<ComputableRenderingOps> = {},
  cb: (a: A, ctx: ComputableCtx) => IR,
  postprocessValue?: (value: UnwrapComputables<IR>, stable: boolean) => Promise<T>): Computable<T> {
  const { mode, resetValueOnError } = ops;
  const renderingOps: CellRenderingOps = {
    ...DefaultRenderingOps,
    ...(mode !== undefined && { mode }),
    ...(resetValueOnError !== undefined && { resetValueOnError })
  };
  return new Computable<T>({
    ops: renderingOps, key: ops.key ?? nextEphemeralKey(),
    [KernelLambdaField]: (watcher, ctx) => {
      let inCallback = true;
      const ir = cb(ap.createInstance(watcher, () => {
        if (!inCallback)
          throw new AccessorLeakException();
      }, ctx), ctx);
      inCallback = false;
      return {
        ir,
        postprocessValue: postprocessValue ?? (noopPostprocessValue<IR>() as (value: UnwrapComputables<IR>, stable: boolean) => Promise<T>)
      };
    }
  });
}
