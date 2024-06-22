import { AuthorMarker, BlockState } from '@milaboratory/sdk-model';
import { ValueOrErrors } from './common_types';

/** Callback to listen for new states. It is a good idea to make this asynchronous
 * method execution time resemble actual time spent in state to DOM propagation. */
export type OnNextStateCb<Args, Outputs extends Record<string, ValueOrErrors<unknown>>, UiState> =
  (state: BlockState<Args, Outputs, UiState>) => Promise<void>;

/** Returned by state subscription methods to be able to cancel the subscription. */
export type CancelSubscription = () => void;

/** Defines methods to read and write current block data. */
export interface BlockApi<Args, Outputs extends Record<string, ValueOrErrors<unknown>>, UiState = never> {
  /**
   * Subscribes to the stream of block states.
   *
   * This method internally have several ways to limit the rate at which new
   * states are pushed to the corresponding callback. Among other rate limiting
   * approaches it guarantees that new state will never be pushed to the
   * supplied async callback until the previous call returns. It is a good idea
   * to develop the callback in such a way that it will wait until the given
   * state propagates all the way to the DOM. See for example nextTick()
   * method from Vue framework to achieve this.
   *
   * @return function that cancels created subscription
   * */
  onNextState(cb: OnNextStateCb<Args, Outputs, UiState>): CancelSubscription;

  /**
   * Sets block args, optionally assign author marker.
   *
   * This method returns when corresponding arguments are safely saved so in
   * case the window is closed there will be no information losses. This
   * function under the hood may delay actual persistence of the supplied
   * arguments.
   * */
  setBlockArgs(args: Args, authorMarker?: AuthorMarker): Promise<void>;

  /** Set block args, optionally assign author marker.
   *
   * This method returns when corresponding arguments are safely saved so in
   * case the window is closed there will be no information losses. This
   * function under the hood may delay actual persistence of the supplied
   * arguments.
   * */
  setBlockUiState(state: UiState, authorMarker?: AuthorMarker): Promise<void>;

  /** Set block args, optionally assign author marker.
   *
   * This method returns when corresponding arguments are safely saved so in
   * case the window is closed there will be no information losses. This
   * function under the hood may delay actual persistence of the supplied
   * arguments.
   * */
  setBlockArgsAndUiState(args: Args, state: UiState, authorMarker?: AuthorMarker): Promise<void>;
}
