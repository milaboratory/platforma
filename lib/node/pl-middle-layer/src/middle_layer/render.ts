import { Code, isConfigLambda, TypedConfigOrConfigLambda } from '@platforma-sdk/model';
import { Computable, ComputableRenderingOps } from '@milaboratories/computable';
import { computableFromCfg } from '../cfg_render/executor';
import { MiddleLayerEnvironment } from './middle_layer';
import { computableFromRF } from '../js_render';
import { BlockContextAny } from './block_ctx';

export function computableFromCfgOrRF(
  env: MiddleLayerEnvironment,
  ctx: BlockContextAny,
  cfgOrFh: TypedConfigOrConfigLambda,
  code: Code | undefined,
  ops: Partial<ComputableRenderingOps> = {}
): Computable<unknown> {
  if (isConfigLambda(cfgOrFh)) {
    if (code === undefined) throw new Error('No code bundle.');
    return computableFromRF(env, ctx, cfgOrFh, code, ops);
  } else return computableFromCfg(env.driverKit, ctx, cfgOrFh, ops);
}
