import { BlockOutputsBase } from './common_types';

/**
 * @param Args    sets type of block arguments passed to the workflow
 * @param Outputs type of the outputs returned by the workflow and rendered
 *                according to the output configuration specified for the block
 * @param UiState data that stores only UI related state, that is not passed
 *                to the workflow
 */
export type BlockState<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown> = {
  /** Block arguments passed to the workflow */
  args: Args;

  /** UI State persisted in the block state but not passed to the backend
   * template */
  ui: UiState;

  /** Outputs rendered with block config */
  outputs: Outputs;
}
