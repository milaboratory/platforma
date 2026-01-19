import type { BlockOutputsBase, BlockState, BlockStateV3 } from '@milaboratories/pl-model-common';
import type { Optional } from 'utility-types';

// @deprecated TODO v3: keep this name, or rename to BlockStateInternalLegacy?
export type BlockStateInternal<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
> = Optional<Readonly<BlockState<Args, Outputs, UiState, Href>>, 'outputs'>;

export type BlockStateInternalV3<
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  Data = unknown,
  Href extends `/${string}` = `/${string}`,
> = Optional<Readonly<BlockStateV3<Outputs, Data, Href>>, 'outputs'>;
