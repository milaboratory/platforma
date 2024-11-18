import { MiddleLayerEnvironment } from '../middle_layer/middle_layer';
import { Code, ConfigRenderLambda } from '@platforma-sdk/model';
import { Computable, ComputableRenderingOps } from '@milaboratories/computable';
import { Scope } from 'quickjs-emscripten';
import { JsExecutionContext } from './context';
import { BlockContextAny } from '../middle_layer/block_ctx';
import { LogOutputStatus } from '../middle_layer/util';

export function computableFromRF(
  env: MiddleLayerEnvironment,
  ctx: BlockContextAny,
  fh: ConfigRenderLambda,
  code: Code,
  ops: Partial<ComputableRenderingOps> = {}
): Computable<unknown> {
  ops = { ...ops };
  if (ops.mode === undefined && fh.retentive === true) ops.mode = 'StableOnlyRetentive';
  return Computable.makeRaw((cCtx) => {
    const scope = new Scope();
    cCtx.addOnDestroy(() => scope.dispose());

    const runtime = scope.manage(env.quickJs.newRuntime());
    runtime.setMemoryLimit(1024 * 640);
    runtime.setMaxStackSize(1024 * 320);
    const vm = scope.manage(runtime.newContext());
    const rCtx = new JsExecutionContext(scope, vm, ctx, env, cCtx);

    rCtx.evaluateBundle(code.content);
    const result = rCtx.runCallback(fh.handle);

    rCtx.resetComputableCtx();

    return {
      ir: rCtx.computablesToResolve,
      postprocessValue: async (resolved: Record<string, unknown>, { unstableMarker, stable }) => {
        if (LogOutputStatus && (LogOutputStatus !== 'unstable-only' || !stable)) {
          if (stable) console.log(`Stable output ${fh.handle} calculated.`);
          else console.log(`Unstable output ${fh.handle}; marker = ${unstableMarker}`);
        }

        // resolving futures
        for (const [handle, value] of Object.entries(resolved)) rCtx.runCallback(handle, value);

        // rendering result
        return rCtx.importObjectUniversal(result);
      }
    };
  }, ops);
}
