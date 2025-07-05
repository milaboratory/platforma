import type { MiddleLayerEnvironment } from '../middle_layer/middle_layer';
import type { BlockCodeWithInfo, ConfigRenderLambda } from '@platforma-sdk/model';
import type { ComputableRenderingOps } from '@milaboratories/computable';
import { Computable } from '@milaboratories/computable';
import type { QuickJSWASMModule } from 'quickjs-emscripten';
import { Scope } from 'quickjs-emscripten';
import type { DeadlineSettings } from './context';
import { JsExecutionContext } from './context';
import type { BlockContextAny } from '../middle_layer/block_ctx';
import { getDebugFlags } from '../debug';

function logOutputStatus(handle: string, renderedResult: unknown, stable: boolean, recalculationCounter: number, unstableMarker?: string) {
  if (getDebugFlags().logOutputStatus && (getDebugFlags().logOutputStatus === 'any' || !stable)) {
    if (stable)
      console.log(`Stable output ${handle} calculated ${renderedResult !== undefined ? 'defined' : 'undefined'}; (#${recalculationCounter})`);
    else
      console.log(`Unstable output ${handle}; marker = ${unstableMarker}; ${renderedResult !== undefined ? 'defined' : 'undefined'} (#${recalculationCounter})`);
  }
}

/**
 * Creates a Computable that executes a render function (`fh`) from a block's code in a QuickJS virtual machine.
 * This function handles both synchronous and asynchronous execution patterns of the sandboxed JS code.
 *
 * The overall data flow is as follows:
 * 1. A QuickJS VM is initialized.
 * 2. A `JsExecutionContext` is created to bridge the host (TypeScript) and guest (QuickJS) environments. It injects a
 *    context object (`cfgRenderCtx`) into the VM, providing helper methods for the sandboxed code to interact with the
 *    platform (e.g., to request data).
 * 3. The block's Javascript bundle is evaluated in the VM.
 * 4. The specified render function (`fh.handle`) is executed.
 *
 * Two execution paths are possible depending on the behavior of the render function:
 *
 * ### Synchronous Path
 * If the render function computes its result without requesting any external data requiring asynchronous calculations,
 * it executes synchronously.
 * - The `computablesToResolve` map in `JsExecutionContext` remains empty.
 * - The function returns an object with an `ir` field holding the result (`{ ir: importedResult }`).
 *   Since `postprocessValue` is not specified, `ir` is treated as the final resolved value of the Computable.
 * - The QuickJS VM is disposed of immediately as it's no longer needed.
 *
 * ### Asynchronous Path (with `postprocessValue`)
 * If the render function needs external data requiring asynchronous calculations (e.g., fetching a file), it calls
 * one of the injected helper methods. These methods don't return data directly. Instead, they:
 *  a. Create a new `Computable` for the data request (e.g., to fetch a blob).
 *  b. Register this new `Computable` in the `computablesToResolve` map.
 *  c. Return a handle (string) to the sandboxed code.
 *
 * In this case:
 * - The initial execution of the render function returns a scaffold of the final result, which depends on the pending
 *   computables.
 * - The `computablesToResolve` map is passed as the `ir` (initial result) to `Computable.makeRaw`.
 * - The `postprocessValue` function is provided to handle the results once the computables are resolved.
 * - The QuickJS VM is kept alive (`keepVmAlive = true`) because its state is needed in `postprocessValue`.
 * - Once the `computable` framework resolves all dependencies, it calls `postprocessValue` with the resolved data.
 * - `postprocessValue` feeds the resolved data back into the VM, allowing the sandboxed code to compute the final
 *   result.
 * - The VM is eventually disposed of when the host Computable is destroyed.
 *
 * @param env The middle layer environment.
 * @param ctx The block context.
 * @param fh The config render lambda to execute.
 * @param codeWithInfo The block's code and feature flags.
 * @param configKey A key for the configuration, used for cache busting.
 * @param ops Options for the computable.
 * @returns A `Computable` that will resolve to the result of the lambda execution.
 */
export function computableFromRF(
  env: MiddleLayerEnvironment,
  ctx: BlockContextAny,
  fh: ConfigRenderLambda,
  codeWithInfo: BlockCodeWithInfo,
  configKey: string,
  ops: Partial<ComputableRenderingOps> = {},
): Computable<unknown> {
  const { code, featureFlags } = codeWithInfo;
  // adding configKey to reload all outputs on block-pack update
  const key = `${ctx.blockId}#lambda#${configKey}#${fh.handle}`;
  ops = { ...ops, key };
  if (ops.mode === undefined && fh.retentive === true) ops.mode = 'StableOnlyRetentive';
  return Computable.makeRaw((cCtx) => {
    if (getDebugFlags().logOutputRecalculations)
      console.log(`Block lambda recalculation : ${key} (${cCtx.changeSourceMarker}; ${cCtx.bodyInvocations} invocations)`);

    const scope = new Scope();
    let keepVmAlive = false;
    cCtx.addOnDestroy(() => {
      // If keepVmAlive is false, the scope will be disposed by the finally block,
      // no need to dispose it here.
      if (keepVmAlive) scope.dispose();
    });

    try {
      const runtime = scope.manage(env.quickJs.newRuntime());
      runtime.setMemoryLimit(1024 * 1024 * 8);
      runtime.setMaxStackSize(1024 * 320);

      let deadlineSettings: DeadlineSettings | undefined;
      runtime.setInterruptHandler(() => {
        if (deadlineSettings === undefined) return false;
        if (Date.now() > deadlineSettings.deadline) return true;
        return false;
      });
      const vm = scope.manage(runtime.newContext());
      const rCtx = new JsExecutionContext(scope, vm,
        (s) => { deadlineSettings = s; },
        featureFlags,
        { computableCtx: cCtx, blockCtx: ctx, mlEnv: env });

      rCtx.evaluateBundle(code.content);
      const result = rCtx.runCallback(fh.handle);

      rCtx.resetComputableCtx();

      const toBeResolved = rCtx.computableHelper!.computablesToResolve;

      if (Object.keys(toBeResolved).length === 0) {
        const importedResult = rCtx.importObjectUniversal(result);
        logOutputStatus(fh.handle, importedResult, cCtx.unstableMarker === undefined, -1, cCtx.unstableMarker);
        return { ir: importedResult };
      }

      let recalculationCounter = 0;
      if (getDebugFlags().logOutputStatus)
        console.log(`Output ${fh.handle} scaffold calculated (not all computables resolved yet).`);
      keepVmAlive = true;

      return {
        ir: toBeResolved,
        postprocessValue: (resolved: Record<string, unknown>, { unstableMarker, stable }) => {
        // resolving futures
          for (const [handle, value] of Object.entries(resolved)) rCtx.runCallback(handle, value);

          // rendering result
          const renderedResult = rCtx.importObjectUniversal(result);

          // logging
          recalculationCounter++;
          logOutputStatus(fh.handle, renderedResult, stable, recalculationCounter, unstableMarker);

          return renderedResult;
        },
      };
    } catch (e) {
      keepVmAlive = false;
      throw e;
    } finally {
      if (!keepVmAlive) scope.dispose();
    }
  }, ops);
}

export function executeSingleLambda(
  quickJs: QuickJSWASMModule,
  fh: ConfigRenderLambda,
  codeWithInfo: BlockCodeWithInfo,
  ...args: unknown[]
): unknown {
  const { code, featureFlags } = codeWithInfo;
  const scope = new Scope();
  try {
    const runtime = scope.manage(quickJs.newRuntime());
    runtime.setMemoryLimit(1024 * 1024 * 8);
    runtime.setMaxStackSize(1024 * 320);

    let deadlineSettings: DeadlineSettings | undefined;
    runtime.setInterruptHandler(() => {
      if (deadlineSettings === undefined) return false;
      if (Date.now() > deadlineSettings.deadline) return true;
      return false;
    });
    const vm = scope.manage(runtime.newContext());
    const rCtx = new JsExecutionContext(scope, vm,
      (s) => { deadlineSettings = s; },
      featureFlags,
    );

    // Initializing the model
    rCtx.evaluateBundle(code.content);

    // Running the lambda
    return rCtx.importObjectUniversal(rCtx.runCallback(fh.handle, ...args));
  } finally {
    scope.dispose();
  }
}
