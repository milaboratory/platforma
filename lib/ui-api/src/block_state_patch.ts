import { Unionize } from './unionize';
import { BlockOutputsBase, BlockState } from '@milaboratory/sdk-model';

/** Patch for the BlockState, pushed by onStateUpdates method in SDK. */
export type BlockStatePatch<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`
> = Unionize<BlockState<Args, Outputs, UiState, Href>>;
