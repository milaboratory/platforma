import { PlTreeNodeAccessor } from '@milaboratory/pl-tree';
import { projectFieldName } from '../model/project_model';
import { BlockPackInfo } from '../model/block_pack';
import { Pl } from '@milaboratory/pl-client-v2';

export function getBlockCfg(prj: PlTreeNodeAccessor, blockId: string) {
  return prj.traverse(
    { field: projectFieldName(blockId, 'blockPack'), assertFieldType: 'Dynamic', errorIfFieldNotAssigned: true },
    { field: Pl.HolderRefField, assertFieldType: 'Input', errorIfFieldNotFound: true }
  )?.getDataAsJson<BlockPackInfo>()?.config;
}
