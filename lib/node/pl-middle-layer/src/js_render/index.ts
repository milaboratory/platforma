import { MiddleLayerEnvironment } from '../middle_layer/middle_layer';
import { Code, FunctionHandle } from '@milaboratory/sdk-ui';
import { Computable, ComputableRenderingOps } from '@milaboratory/computable';
import { Scope } from 'quickjs-emscripten';
import { JsExecutionContext } from './context';
import { BlockContextAny } from '../middle_layer/block_ctx';

export function computableFromRF(env: MiddleLayerEnvironment, ctx: BlockContextAny,
                                 fh: FunctionHandle, code: Code, ops: Partial<ComputableRenderingOps> = {}): Computable<unknown> {
  return Computable.makeRaw((cCtx) => {
    const scope = new Scope();
    const runtime = scope.manage(env.quickJs.newRuntime());
    runtime.setMemoryLimit(1024 * 640);
    runtime.setMaxStackSize(1024 * 320);
    const vm = scope.manage(runtime.newContext());

    const rCtx = new JsExecutionContext(scope, vm, ctx, cCtx);

    rCtx.evaluateBundle(code.content);
    const result = rCtx.runCallback(fh);

    rCtx.resetComputableCtx();

    return {
      ir: [],
      recover: (error: unknown[]) => {
        // finally
        scope.dispose();
        throw error[0];
      },
      postprocessValue: async value => {
        // finally
        scope.dispose();
        return result;
      }
    };
  }, ops);
}
