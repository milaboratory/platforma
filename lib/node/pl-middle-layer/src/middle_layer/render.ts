import type { BlockCodeWithInfo, TypedConfigOrConfigLambda } from '@platforma-sdk/model';
import { isConfigLambda } from '@platforma-sdk/model';
import type { Computable, ComputableRenderingOps } from '@milaboratories/computable';
import { computableFromCfg } from '../cfg_render/executor';
import type { MiddleLayerEnvironment } from './middle_layer';
import { computableFromRF } from '../js_render';
import type { BlockContextAny } from './block_ctx';
import { hasActiveCfgComponents } from '../cfg_render/util';

export function isActive(cfg: TypedConfigOrConfigLambda): boolean {
  if (isConfigLambda(cfg)) return cfg.isActive === true;
  else return hasActiveCfgComponents(cfg);
}

export function computableFromCfgOrRF(
  env: MiddleLayerEnvironment,
  ctx: BlockContextAny,
  cfgOrFh: TypedConfigOrConfigLambda,
  codeWithInfo: BlockCodeWithInfo | undefined,
  configKey: string,
  ops: Partial<ComputableRenderingOps> = {},
): Computable<unknown> {
  if (isConfigLambda(cfgOrFh)) {
    if (codeWithInfo === undefined) throw new Error('No code bundle.');
    return computableFromRF(env, ctx, cfgOrFh, codeWithInfo, configKey, ops);
  } else return computableFromCfg(env.driverKit, ctx, cfgOrFh, ops);
}
