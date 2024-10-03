import { AccessorProvider, TrackedAccessorProvider, UsageGuard } from './accessor_provider';
import {
  CellRenderingOps,
  ComputableCtx,
  IntermediateRenderingResult,
  UnwrapComputables
} from './kernel';
import { Computable } from './computable';
import { Watcher } from '../watcher';

let ephKeyCounter = 1;

function nextEphemeralKey(): string {
  return `__eph_key_${ephKeyCounter++}`;
}

const DefaultRenderingOps: CellRenderingOps = {
  mode: 'Live',
  resetValueOnError: true,
  postprocessTimeout: 5000
};

function noopPostprocessValue<IR>(): (
  value: UnwrapComputables<IR>,
  stable: boolean
) => Promise<UnwrapComputables<IR>> {
  return async (v) => v;
}

interface ComputableRenderingOps extends CellRenderingOps {
  key: string;
}

function toTrackedAccessProvider<A>(
  ap: TrackedAccessorProvider<A> | AccessorProvider<A>
): TrackedAccessorProvider<A> {
  if ('createInstance' in ap) return ap;
  else {
    return {
      createInstance(watcher: Watcher, guard: UsageGuard, ctx: ComputableCtx): A {
        return ap.createAccessor(ctx, guard);
      }
    };
  }
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
/** @deprecated use {@link Computable.make} */
export function computable<A, IR, T = UnwrapComputables<IR>>(
  _ap: TrackedAccessorProvider<A> | AccessorProvider<A>,
  ops: Partial<ComputableRenderingOps> = {},
  cb: (a: A, ctx: ComputableCtx) => IR,
  postprocessValue?: (value: UnwrapComputables<IR>, stable: boolean) => Promise<T>
): Computable<T> {
  const ap = toTrackedAccessProvider(_ap);
  const { mode, resetValueOnError } = ops;
  const renderingOps: CellRenderingOps = {
    ...DefaultRenderingOps,
    ...(mode !== undefined && { mode }),
    ...(resetValueOnError !== undefined && { resetValueOnError })
  };
  return new Computable<T>({
    ops: renderingOps,
    key: ops.key ?? nextEphemeralKey(),
    ___kernel___: (ctx) => {
      const ir = cb(
        ctx.accessor({
          createAccessor(ctx: ComputableCtx, guard: UsageGuard): A {
            return ap.createInstance(ctx.watcher, guard, ctx);
          }
        }),
        ctx
      );
      return {
        ir,
        postprocessValue: (postprocessValue ?? noopPostprocessValue<IR>()) as (
          value: unknown,
          stable: boolean
        ) => Promise<T> | T
      };
    }
  });
}

/** @deprecated use {@link Computable.make} */
export function computableInstancePostprocessor<A, IR, T>(
  _ap: TrackedAccessorProvider<A> | AccessorProvider<A>,
  ops: Partial<ComputableRenderingOps> = {},
  cb: (a: A, ctx: ComputableCtx) => IntermediateRenderingResult<IR, T>
): Computable<T> {
  const ap = toTrackedAccessProvider(_ap);
  const { mode, resetValueOnError } = ops;
  const renderingOps: CellRenderingOps = {
    ...DefaultRenderingOps,
    ...(mode !== undefined && { mode }),
    ...(resetValueOnError !== undefined && { resetValueOnError })
  };
  return new Computable<T>({
    ops: renderingOps,
    key: ops.key ?? nextEphemeralKey(),
    ___kernel___: (ctx) => {
      return cb(
        ctx.accessor({
          createAccessor(ctx: ComputableCtx, guard: UsageGuard): A {
            return ap.createInstance(ctx.watcher, guard, ctx);
          }
        }),
        ctx
      );
    }
  });
}

/** @deprecated use {@link Computable.make} */
export function rawComputable<IR>(
  cb: (watcher: Watcher, ctx: ComputableCtx) => IR,
  ops: Partial<ComputableRenderingOps> = {}
): Computable<UnwrapComputables<IR>> {
  const { mode, resetValueOnError } = ops;
  const renderingOps: CellRenderingOps = {
    ...DefaultRenderingOps,
    ...(mode !== undefined && { mode }),
    ...(resetValueOnError !== undefined && { resetValueOnError })
  };

  return new Computable<UnwrapComputables<IR>>({
    ops: renderingOps,
    key: ops.key ?? nextEphemeralKey(),
    ___kernel___: (ctx) => {
      const result = cb(ctx.watcher, ctx);
      return {
        ir: result,
        postprocessValue: noopPostprocessValue<IR>() as (
          value: unknown,
          stable: boolean
        ) => Promise<UnwrapComputables<IR>> | UnwrapComputables<IR>
      };
    }
  });
}

/** @deprecated use {@link Computable.make} */
export function rawComputableWithPostprocess<IR, T>(
  cb: (watcher: Watcher, ctx: ComputableCtx) => IR,
  ops: Partial<ComputableRenderingOps> = {},
  postprocessValue: (value: UnwrapComputables<IR>, stable: boolean) => Promise<T>
): Computable<T> {
  const { mode, resetValueOnError } = ops;
  const renderingOps: CellRenderingOps = {
    ...DefaultRenderingOps,
    ...(mode !== undefined && { mode }),
    ...(resetValueOnError !== undefined && { resetValueOnError })
  };

  return new Computable({
    ops: renderingOps,
    key: ops.key ?? nextEphemeralKey(),
    ___kernel___: (ctx) => {
      const result = cb(ctx.watcher, ctx);
      return {
        ir: result,
        postprocessValue: postprocessValue as (value: unknown, stable: boolean) => Promise<T> | T
      };
    }
  });
}
