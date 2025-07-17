import type {
  BlockOutputsBase,
  BlockState,
  NavigationState,
  ValueWithUTag,
  ValueWithUTagAndAuthor,
  AuthorMarker,
  ResultOrError,
} from '@milaboratories/pl-model-common';
import type { Operation } from 'fast-json-patch';

/** Defines methods to read and write current block data. */
export interface BlockApiV2<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
> {
  /**
   * Use this method to retrieve block state during UI initialization. Then use
   * {@link onStateUpdates} method to subscribe for updates.
   * */
  loadBlockState(): Promise<ResultOrError<ValueWithUTag<BlockState<Args, Outputs, UiState, Href>>>>;

  /**
   * Get all json patches (rfc6902) that were applied to the block state.
   * */
  getPatches(uTag: string): Promise<ResultOrError<ValueWithUTagAndAuthor<Operation[]>>>;

  /**
   * Sets block args.
   *
   * This method returns when corresponding arguments are safely saved so in
   * case the window is closed there will be no information losses. This
   * function under the hood may delay actual persistence of the supplied
   * arguments.
   * */
  setBlockArgs(args: Args, author?: AuthorMarker): Promise<ResultOrError<void>>;

  /**
   * Sets block ui state.
   *
   * This method returns when corresponding arguments are safely saved so in
   * case the window is closed there will be no information losses. This
   * function under the hood may delay actual persistence of the supplied
   * values.
   * */
  setBlockUiState(state: UiState, author?: AuthorMarker): Promise<ResultOrError<void>>;

  /**
   * Sets block args and ui state.
   *
   * This method returns when corresponding arguments are safely saved so in
   * case the window is closed there will be no information losses. This
   * function under the hood may delay actual persistence of the supplied
   * values.
   * */
  setBlockArgsAndUiState(args: Args, state: UiState, author?: AuthorMarker): Promise<ResultOrError<void>>;

  /**
   * Sets block navigation state.
   * */
  setNavigationState(state: NavigationState<Href>): Promise<ResultOrError<void>>;

  /**
   * Disposes the block API.
   * */
  dispose(): Promise<ResultOrError<void>>;
}
