import { BlockOutputsBase, BlockState } from '@milaboratory/sdk-model';
import { BlockStatePatch } from './block_state_patch';

/** Returned by state subscription methods to be able to cancel the subscription. */
export type CancelSubscription = () => void;

/** Defines methods to read and write current block data. */
export interface BlockApi<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown> {

  /**
   * Use this method to retrieve block state during UI initialization. Then use
   * {@link onStateUpdates} method to subscribe for updates.
   * */
  loadBlockState(): Promise<BlockState<Args, Outputs, UiState>>;

  /**
   * Subscribe to updates of block state.
   *
   * This method internally have several ways to limit the rate at which new
   * states are pushed to the corresponding callback. Among other rate limiting
   * approaches it guarantees that new state will never be pushed to the
   * supplied async callback until the previous call returns.
   *
   * It is a good idea to develop the callback in such a way that it will wait
   * until the given state propagates all the way to the DOM. See for example
   * nextTick() method from Vue framework to achieve this.
   *
   * This method will only push args and uiState patches if changes were made
   * externally, i.e. by another user editing the same block.
   *
   * @return function that cancels created subscription
   * */
  onStateUpdates(cb: (updates: BlockStatePatch<Args, Outputs, UiState>[]) => Promise<void>): CancelSubscription;

  /**
   * Sets block args.
   *
   * This method returns when corresponding arguments are safely saved so in
   * case the window is closed there will be no information losses. This
   * function under the hood may delay actual persistence of the supplied
   * arguments.
   * */
  setBlockArgs(args: Args): Promise<void>;

  /**
   * Sets block ui state.
   *
   * This method returns when corresponding arguments are safely saved so in
   * case the window is closed there will be no information losses. This
   * function under the hood may delay actual persistence of the supplied
   * values.
   * */
  setBlockUiState(state: UiState): Promise<void>;

  /**
   * Sets block args and ui state.
   *
   * This method returns when corresponding arguments are safely saved so in
   * case the window is closed there will be no information losses. This
   * function under the hood may delay actual persistence of the supplied
   * values.
   * */
  setBlockArgsAndUiState(args: Args, state: UiState): Promise<void>;
}
