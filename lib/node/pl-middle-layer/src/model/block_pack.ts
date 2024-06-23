import { BlockConfig, BlockPackSpec } from '@milaboratory/sdk-ui';

/** Define structure of block-pack data section */
export interface BlockPackInfo {
  readonly source: BlockPackSpec,
  readonly config: BlockConfig,
}
