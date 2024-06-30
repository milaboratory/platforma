import { PlTreeEntry } from '@milaboratory/pl-tree';
import { Computable, ComputableStableDefined, ComputableValueOrErrors } from '@milaboratory/computable';
import { constructBlockContext, constructBlockContextArgsOnly } from './block_ctx';
import { blockArgsAuthorKey } from '../model/project_model';
import { ifNotUndef } from '../cfg_render/util';
import { computableFromCfg } from '../cfg_render/executor';
import { MiddleLayerEnvironment } from './middle_layer';
import { AuthorMarker, BlockArgsAndUiState } from '@milaboratory/sdk-ui';
import { getBlockCfg } from './util';

export function blockArgsAndUiState(
  projectEntry: PlTreeEntry, id: string, env: MiddleLayerEnvironment
): Computable<BlockArgsAndUiState> {
  return Computable.make(c => {
    const prj = c.accessor(projectEntry).node();
    const ctx = constructBlockContextArgsOnly(prj, id);
    return {
      author: prj.getKeyValueAsJson<AuthorMarker>(blockArgsAuthorKey(id)),
      args: ctx.$args,
      ui: ctx.$ui
    };
  });
}

export function blockOutputs(
  projectEntry: PlTreeEntry, id: string, env: MiddleLayerEnvironment
): ComputableStableDefined<Record<string, ComputableValueOrErrors<unknown>>> {
  return Computable.make(c => {
    const prj = c.accessor(projectEntry).node();
    const ctx = constructBlockContext(prj, id);

    const blockCfg = getBlockCfg(prj, id);

    return ifNotUndef(blockCfg, cfg => {
      const outputs: Record<string, Computable<any>> = {};
      for (const [cellId, cellCfg] of Object.entries(cfg.outputs))
        outputs[cellId] = Computable.wrapError(computableFromCfg(env.drivers, ctx, cellCfg));
      return outputs;
    });
  }).withStableType();
}
