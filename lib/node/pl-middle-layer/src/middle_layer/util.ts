import type { PlTreeNodeAccessor } from '@milaboratories/pl-tree';
import { projectFieldName } from '../model/project_model';
import type { ResourceId } from '@milaboratories/pl-client';
import { Pl } from '@milaboratories/pl-client';
import { ifNotUndef } from '../cfg_render/util';
import type { BlockPackInfo } from '../model/block_pack';
import type { BlockConfig } from '@platforma-sdk/model';
import { extractConfig } from '@platforma-sdk/model';

export type BlockPackInfoAndId = {
  readonly bpResourceId: ResourceId;
  /** To be added to computable keys, to force reload on config change */
  readonly bpId: string;
  /** Full block-pack info */
  readonly info: BlockPackInfo;
  /** Config extracted from the info */
  readonly cfg: BlockConfig;
};

/** Returns block pack info along with string representation of block-pack resource id */
export function getBlockPackInfo(
  prj: PlTreeNodeAccessor,
  blockId: string,
): BlockPackInfoAndId | undefined {
  return ifNotUndef(
    prj.traverse(
      {
        field: projectFieldName(blockId, 'blockPack'),
        assertFieldType: 'Dynamic',
        errorIfFieldNotSet: true,
      },
      { field: Pl.HolderRefField, assertFieldType: 'Input', errorIfFieldNotFound: true },
    ),
    (bpAcc) => {
      const info = bpAcc.getDataAsJson<BlockPackInfo>()!;
      const cfg = extractConfig(info.config);
      return { bpResourceId: bpAcc.resourceInfo.id, bpId: bpAcc.resourceInfo.id.toString(), info, cfg };
    },
  );
}

export const LogOutputStatus = process.env.MI_LOG_OUTPUT_STATUS;
