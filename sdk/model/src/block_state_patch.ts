import type { Unionize } from './unionize';
import type { BlockOutputsBase, BlockState } from '@milaboratories/pl-model-common';

/** Patch for the BlockState, pushed by onStateUpdates method in SDK. */
export type BlockStatePatch<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
> = Unionize<BlockState<Args, Outputs, UiState, Href>>;
