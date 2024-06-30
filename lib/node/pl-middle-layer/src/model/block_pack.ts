import { BlockConfigUniversal } from '@milaboratory/sdk-ui';
import { BlockPackSpec } from '@milaboratory/pl-middle-layer-model';

/** Define structure of block-pack data section */
export interface BlockPackInfo {
  readonly source: BlockPackSpec,
  readonly config: BlockConfigUniversal,
}
