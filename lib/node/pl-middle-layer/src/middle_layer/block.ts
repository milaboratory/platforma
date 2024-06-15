import { PlTreeEntry } from '@milaboratory/pl-tree';
import { computable, Computable } from '@milaboratory/computable';
import { constructBlockContext } from './block_ctx';
import { MiddleLayerEnvironment } from './middle_layer';
import { AuthorMarker, blockArgsAuthorKey, projectFieldName } from '../model/project_model';
import { Pl } from '@milaboratory/pl-client-v2';
import { ifNotUndef } from '../cfg_render/util';
import { computableFromCfg } from '../cfg_render/executor';
import { BlockState } from './models';
import { BlockPackInfo } from '../model/block_pack';

export function blockState(projectEntry: PlTreeEntry, id: string, env: MiddleLayerEnvironment): Computable<BlockState> {
  return computable(projectEntry, {}, prjA => {
    const prj = prjA.node();
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
        outputs[cellId] = computableFromCfg(ctx, cellCfg);
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
