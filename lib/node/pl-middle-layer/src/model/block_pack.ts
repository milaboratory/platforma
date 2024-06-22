import { BlockConfig } from '@milaboratory/sdk-ui';
import { BlockPackSource } from './block_pack_spec';

/** Define structure of block-pack data section */
export interface BlockPackInfo {
  readonly source: BlockPackSource,
  readonly config: BlockConfig,
}
