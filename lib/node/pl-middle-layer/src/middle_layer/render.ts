import { Code, isFunctionHandle, TypedConfigOrFunctionHandle } from '@milaboratory/sdk-ui';
import { Computable, ComputableRenderingOps } from '@milaboratory/computable';
import { computableFromCfg } from '../cfg_render/executor';
import { MiddleLayerEnvironment } from './middle_layer';
import { computableFromRF } from '../js_render';
import { BlockContextFull, BlockContextArgsOnly, toCfgContext, BlockContextAny } from './block_ctx';

export function computableFromCfgOrRF(env: MiddleLayerEnvironment, ctx: BlockContextAny,
                                      cfgOrFh: TypedConfigOrFunctionHandle, code: Code | undefined,
                                      ops: Partial<ComputableRenderingOps> = {}): Computable<unknown> {
  if (isFunctionHandle(cfgOrFh)) {
    if (code === undefined)
      throw new Error('No code bundle.');
    return computableFromRF(env, ctx, cfgOrFh, code, ops);
  } else
    return computableFromCfg(env.drivers, toCfgContext(ctx), cfgOrFh, ops);
}

