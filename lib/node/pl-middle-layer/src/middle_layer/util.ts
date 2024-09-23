import { PlTreeNodeAccessor } from '@milaboratories/pl-tree';
import { projectFieldName } from '../model/project_model';
import { Pl } from '@milaboratories/pl-client';
import { ifNotUndef } from '../cfg_render/util';
import { BlockPackInfo } from '../model/block_pack';
import { normalizeBlockConfig } from '@platforma-sdk/model';

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
