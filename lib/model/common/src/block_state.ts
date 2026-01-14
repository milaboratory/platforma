import type { BlockOutputsBase } from './common_types';
import type { NavigationState } from './navigation';
import type { AuthorMarker } from './author_marker';

/**
 * @template Args    sets type of block arguments passed to the workflow
 * @template Outputs type of the outputs returned by the workflow and rendered
 *                   according to the output configuration specified for the block
 * @template UiState data that stores only UI related state, that is not passed
 *                   to the workflow
 * @template Href    typed href to represent navigation state
 */
export type BlockState<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
> = {
  /** Block arguments passed to the workflow */
  args: Args;

  /** UI State persisted in the block state but not passed to the backend
   * template */
  ui: UiState;

  /** Outputs rendered with block config */
  outputs: Outputs;

  /** Current navigation state */
  navigationState: NavigationState<Href>;

  readonly author: AuthorMarker | undefined;
};

export type BlockStateV3<
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  Data = unknown,
  Href extends `/${string}` = `/${string}`,
> = {
  /** Unified state persisted in the block state */
  data: Data;

  /** Outputs rendered with block config */
  outputs: Outputs;

  /** Current navigation state */
  navigationState: NavigationState<Href>;

  readonly author: AuthorMarker | undefined;
};
