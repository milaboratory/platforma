import { AuthorMarker, BlockOutputsBase, BlockState, ValueOrErrors } from '@milaboratory/sdk-model';

/**
 * Callback to listen for new states. It is a good idea to make this asynchronous
 * method execution time resemble actual time spent in state to DOM propagation.
 * */
export type OnNextStateCb<Args, Outputs extends Record<string, ValueOrErrors<unknown>>, UiState> =
  (state: BlockState<Args, Outputs, UiState>) => Promise<void>;

//
// TODO To be discussed
//
// /**
//  * Callback to listen for Args and UI State pushed by another users of the block.
//  * Such events should be considered rare, and fine-grained collaborative editing
//  * of the same block is not an intended usage pattern. Though platforma implements
//  * conflict resolution mechanism, and can explicitly notify block UI about changes
//  * originating from another block editor.
//  *
//  * Basic implementation should overwrite corresponding state of the UI with provided
//  * values.
//  *
//  * It is a good idea to make this asynchronous method execution time resemble
//  * actual time spent in state to DOM propagation.
//  * */
// export type OnIncomingArgsAndUiState<Args, UiState> =
//   (inputs: BlockArgsAndUiState<Args, UiState>) => Promise<void>;
//
// /**
//  * Callback to listen for Block Output changes, during computation execution,
//  * to gradually present partial results as soon as they are available. Outputs
//  * are rendered according to the configuration provided in the config module of
//  * the block.
//  *
//  * It is a good idea to make this asynchronous method execution time resemble
//  * actual time spent in state to DOM propagation.
//  * */
// export type OnOutputsChange<Outputs extends BlockOutputsBase> =
//   (outputs: Outputs) => Promise<void>;
//

/** Returned by state subscription methods to be able to cancel the subscription. */
export type CancelSubscription = () => void;

/** Defines methods to read and write current block data. */
export interface BlockApi<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown> {
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

  //
  // TODO To be discussed
  //
  // /**
  //  * Subscribes to changes of Args and UI State pushed by another users of the block.
  //  * Such events should be considered rare, and fine-grained collaborative editing
  //  * of the same block is not an intended usage pattern. Though platforma implements
  //  * conflict resolution mechanism, and can explicitly notify block UI about changes
  //  * originating from another block editor.
  //  *
  //  * Basic implementation of the handler callback should overwrite corresponding
  //  * state of the UI with provided values.
  //  *
  //  * @return function that cancels created subscription
  //  * */
  // onIncomingArgsAndUiState(cb: OnIncomingArgsAndUiState<Args, UiState>): CancelSubscription;
  //
  // /**
  //  * Subscribes to the stream of Block Output changes, during computation execution,
  //  * to gradually present partial results as soon as they are available. Outputs
  //  * are rendered according to the configuration provided in the config module of
  //  * the block.
  //  *
  //  * @return function that cancels created subscription
  //  * */
  // onOutputsChange(cb: OnOutputsChange<Outputs>): CancelSubscription;
  //
  // /** Returns currently persisted block Args and UI State. Use this method to
  //  * retrieve the state during UI initialization. */
  // getBlockArgsAndUiState(): Promise<BlockArgsAndUiState<Args, UiState>>;
  //

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
