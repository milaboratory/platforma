import type { BlockConfigContainer } from '@platforma-sdk/model';
import type { BlockPackSpec } from '@milaboratories/pl-model-middle-layer';

/** Define structure of block-pack data section */
export interface BlockPackInfo {
  readonly source: BlockPackSpec;
  readonly config: BlockConfigContainer;
}
