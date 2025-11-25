import type { BlockOutputsBase, BlockState } from '@milaboratories/pl-model-common';
import type { Optional } from 'utility-types';

export type BlockStateInternal<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
> = Optional<Readonly<BlockState<Args, Outputs, UiState, Href>>, 'outputs'>;
