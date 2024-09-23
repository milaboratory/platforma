import { PlTreeNodeAccessor } from '@milaboratory/pl-tree';
import { projectFieldName } from '../model/project_model';
import { Pl } from '@milaboratory/pl-client-v2';
import { ifNotUndef } from '../cfg_render/util';
import { BlockPackInfo } from '../model/block_pack';
import { normalizeBlockConfig } from '@milaboratory/sdk-ui';

export function getBlockCfg(prj: PlTreeNodeAccessor, blockId: string) {
  return ifNotUndef(
    prj
      .traverse(
        {
          field: projectFieldName(blockId, 'blockPack'),
          assertFieldType: 'Dynamic',
          errorIfFieldNotSet: true
        },
        { field: Pl.HolderRefField, assertFieldType: 'Input', errorIfFieldNotFound: true }
      )
      ?.getDataAsJson<BlockPackInfo>()?.config,
    (cfg) => normalizeBlockConfig(cfg)
  );
}
