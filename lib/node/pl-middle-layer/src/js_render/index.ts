import type { MiddleLayerEnvironment } from '../middle_layer/middle_layer';
import type { Code, ConfigRenderLambda } from '@platforma-sdk/model';
import type { ComputableRenderingOps } from '@milaboratories/computable';
import { Computable } from '@milaboratories/computable';
import { Scope } from 'quickjs-emscripten';
import { JsExecutionContext } from './context';
import type { BlockContextAny } from '../middle_layer/block_ctx';
import { LogOutputStatus } from '../middle_layer/util';

export function computableFromRF(
  env: MiddleLayerEnvironment,
  ctx: BlockContextAny,
  fh: ConfigRenderLambda,
  code: Code,
  configKey: string,
  ops: Partial<ComputableRenderingOps> = {},
): Computable<unknown> {
  // adding configKey to reload all outputs on block-pack update
  const key = `${ctx.blockId}#lambda#${configKey}#${fh.handle}`;
  ops = { ...ops, key };
  if (ops.mode === undefined && fh.retentive === true) ops.mode = 'StableOnlyRetentive';
  return Computable.makeRaw((cCtx) => {
    const scope = new Scope();
    cCtx.addOnDestroy(() => scope.dispose());

    const runtime = scope.manage(env.quickJs.newRuntime());
    runtime.setMemoryLimit(1024 * 1024 * 8);
    runtime.setMaxStackSize(1024 * 320);
    const vm = scope.manage(runtime.newContext());
    const rCtx = new JsExecutionContext(scope, vm, ctx, env, cCtx);

    rCtx.evaluateBundle(code.content);
    const result = rCtx.runCallback(fh.handle);

    rCtx.resetComputableCtx();

    let recalculationCounter = 0;

    if (LogOutputStatus && LogOutputStatus !== 'unstable-only')
      console.log(`Output ${fh.handle} scaffold calculated.`);

    return {
      ir: rCtx.computablesToResolve,
      postprocessValue: (resolved: Record<string, unknown>, { unstableMarker, stable }) => {
        // resolving futures
        for (const [handle, value] of Object.entries(resolved)) rCtx.runCallback(handle, value);

        // rendering result
        const renderedResult = rCtx.importObjectUniversal(result);

        // logging
        recalculationCounter++;
        if (LogOutputStatus && (LogOutputStatus !== 'unstable-only' || !stable)) {
          if (stable)
            console.log(
              `Stable output ${fh.handle} calculated ${renderedResult !== undefined ? 'defined' : 'undefined'}; (#${recalculationCounter})`,
            );
          else
            console.log(
              `Unstable output ${fh.handle}; marker = ${unstableMarker}; ${renderedResult !== undefined ? 'defined' : 'undefined'} (#${recalculationCounter})`,
            );
        }

        return renderedResult;
      },
    };
  }, ops);
}
