import type { BlockOutputsBase, BlockState } from '@milaboratories/pl-model-common';
import type { AuthorMarker } from './author_marker';
import type { Optional } from 'utility-types';

export type BlockStateInternal<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`
> = Optional<Readonly<BlockState<Args, Outputs, UiState, Href>>, 'outputs'> & {
  /** Author marker for Args and UI State. Absence of author marker, means that
   * last modifier of the state provided no author marker. */
  readonly author?: AuthorMarker;
};
