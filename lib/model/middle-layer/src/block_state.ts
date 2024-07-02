import { BlockOutputsBase, BlockState } from '@milaboratory/sdk-model';
import { AuthorMarker } from './author_marker';
import { Optional } from 'utility-types';

export type BlockStateInternal<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown> = Optional<Readonly<BlockState<Args, Outputs, UiState>>, 'outputs'> & {
  /** Author marker for Args and UI State. Absence of author marker, means that
   * last modifier of the state provided no author marker. */
  readonly author?: AuthorMarker;
}
