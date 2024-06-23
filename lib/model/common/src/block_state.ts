import { AuthorMarker } from './author_marker';

/**
 * @param Args    sets type of block arguments passed to the workflow
 * @param UiState data that stores only UI related state, that is not passed
 *                to the workflow
 */
export interface BlockArgsAndUiState<Args = unknown, UiState = unknown> {
  /** Author marker for Args and UI State. Absence of author marker, means that
   * last modifier of the state provided no author marker. */
  readonly author?: AuthorMarker;

  /** Block arguments passed to the workflow */
  readonly args: Args;

  /** UI State persisted in the block state but not passed to the backend
   * template */
  readonly ui: UiState;
}

/**
 * @param Args    sets type of block arguments passed to the workflow
 * @param Outputs type of the outputs returned by the workflow and rendered
 *                according to the output configuration specified for the block
 * @param UiState data that stores only UI related state, that is not passed
 *                to the workflow
 */
export interface BlockState<
  Args = unknown,
  Outputs extends Record<string, unknown> = Record<string, unknown>,
  UiState = unknown>
  extends BlockArgsAndUiState<Args, UiState> {
  /** Outputs rendered with block config */
  readonly outputs: Outputs | undefined;
}
