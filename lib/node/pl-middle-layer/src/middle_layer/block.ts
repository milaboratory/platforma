import { PlTreeEntry } from '@milaboratory/pl-tree';
import { computable, Computable, lazyFactory } from '@milaboratory/computable';
import { constructBlockContext } from './block_outputs';
import { MiddleLayerEnvironment } from './middle_layer';
import { AuthorMarker, blockArgsAuthorKey, projectFieldName } from '../model/project_model';
import { Pl } from '@milaboratory/pl-client-v2';
import { ifNotUndef } from '../cfg_render/util';
import { BlockConfig } from '@milaboratory/sdk-block-config';
import { computableFromCfg } from '../cfg_render/executor';

export interface FullBlockState {
  author?: AuthorMarker;
  args: any;
  ui: any;
  outputs: any;
}

export function blockState(projectEntry: PlTreeEntry, id: string, env: MiddleLayerEnvironment): Computable<FullBlockState> {
  return computable(projectEntry, {}, prjA => {
    const prj = prjA.node();
    const ctx = constructBlockContext(prj, id);

    // block-pack
    const blockCfg = prj.traverse(
      { field: projectFieldName(id, 'blockPack'), assertFieldType: 'Dynamic', errorIfFieldNotAssigned: true },
      { field: Pl.HolderRefField, assertFieldType: 'Input', errorIfFieldNotFound: true }
    )?.getDataAsJson<BlockConfig>();

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
      outputs
    };
  });
}
