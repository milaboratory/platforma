import { PlTreeEntry } from '@milaboratory/pl-tree';
import { Computable } from '@milaboratory/computable';
import { constructBlockContext } from './block_ctx';
import { AuthorMarker, blockArgsAuthorKey, projectFieldName } from '../model/project_model';
import { Pl } from '@milaboratory/pl-client-v2';
import { ifNotUndef } from '../cfg_render/util';
import { computableFromCfg } from '../cfg_render/executor';
import { BlockState } from './models';
import { BlockPackInfo } from '../model/block_pack';
import { MiddleLayerEnvironment } from './middle_layer';

export function blockState(
  projectEntry: PlTreeEntry, id: string, env: MiddleLayerEnvironment
): Computable<BlockState> {
  return Computable.make(c => {
    const prj = c.accessor(projectEntry).node();
    const ctx = constructBlockContext(prj, id);

    // block-pack
    const bpInfo = prj.traverse(
      { field: projectFieldName(id, 'blockPack'), assertFieldType: 'Dynamic', errorIfFieldNotAssigned: true },
      { field: Pl.HolderRefField, assertFieldType: 'Input', errorIfFieldNotFound: true }
    )?.getDataAsJson<BlockPackInfo>();

    const blockCfg = bpInfo?.config;

    // sections
    const outputs = ifNotUndef(blockCfg, cfg => {
      const outputs: Record<string, Computable<any>> = {};
      for (const [cellId, cellCfg] of Object.entries(cfg.outputs))
        outputs[cellId] = Computable.wrapError(computableFromCfg(env.drivers, ctx, cellCfg));
      return outputs;
    });

    return {
      author: prj.getKeyValueAsJson<AuthorMarker>(blockArgsAuthorKey(id)),
      args: ctx.$args,
      ui: ctx.$ui,
      outputs,
      blockPackSource: bpInfo?.source
    };
  }).preCalculateValueTree();
}
