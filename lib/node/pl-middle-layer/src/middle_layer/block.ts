import { PlTreeEntry } from '@milaboratory/pl-tree';
import {
  Computable,
  ComputableStableDefined,
  ComputableValueOrErrors
} from '@milaboratory/computable';
import { constructBlockContext, constructBlockContextArgsOnly } from './block_ctx';
import { blockArgsAuthorKey } from '../model/project_model';
import { ifNotUndef } from '../cfg_render/util';
import { MiddleLayerEnvironment } from './middle_layer';
import { getBlockCfg } from './util';
import { AuthorMarker, BlockStateInternal } from '@milaboratory/pl-middle-layer-model';
import { computableFromCfgOrRF } from './render';

export function blockArgsAndUiState(
  projectEntry: PlTreeEntry,
  id: string,
  env: MiddleLayerEnvironment
): Computable<Omit<BlockStateInternal, 'outputs'>> {
  return Computable.make((c) => {
    const prj = c.accessor(projectEntry).node();
    const ctx = constructBlockContextArgsOnly(prj, id);
    return {
      author: prj.getKeyValueAsJson<AuthorMarker>(blockArgsAuthorKey(id)),
      args: JSON.parse(ctx.args),
      ui: ctx.uiState !== undefined ? JSON.parse(ctx.uiState) : undefined
    };
  });
}

export function blockOutputs(
  projectEntry: PlTreeEntry,
  id: string,
  env: MiddleLayerEnvironment
): ComputableStableDefined<Record<string, ComputableValueOrErrors<unknown>>> {
  return Computable.make((c) => {
    const prj = c.accessor(projectEntry).node();
    const ctx = constructBlockContext(prj, id);

    const blockCfg = getBlockCfg(prj, id);

    return ifNotUndef(blockCfg, (cfg) => {
      const outputs: Record<string, Computable<any>> = {};
      for (const [cellId, cellCfg] of Object.entries(cfg.outputs))
        outputs[cellId] = Computable.wrapError(computableFromCfgOrRF(env, ctx, cellCfg, cfg.code));
      return outputs;
    });
  }).withStableType();
}
