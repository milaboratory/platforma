import type { Code, TypedConfigOrFunctionHandle } from '@platforma-sdk/model';
import { isFunctionHandle } from '@platforma-sdk/model';
import type { Computable, ComputableRenderingOps } from '@milaboratories/computable';
import { computableFromCfg } from '../cfg_render/executor';
import type { MiddleLayerEnvironment } from './middle_layer';
import { computableFromRF } from '../js_render';
import type { BlockContextAny } from './block_ctx';

export function computableFromCfgOrRF(
  env: MiddleLayerEnvironment,
  ctx: BlockContextAny,
  cfgOrFh: TypedConfigOrFunctionHandle,
  code: Code | undefined,
  ops: Partial<ComputableRenderingOps> = {}
): Computable<unknown> {
  if (isFunctionHandle(cfgOrFh)) {
    if (code === undefined) throw new Error('No code bundle.');
    return computableFromRF(env, ctx, cfgOrFh, code, ops);
  } else return computableFromCfg(env.driverKit, ctx, cfgOrFh, ops);
}
