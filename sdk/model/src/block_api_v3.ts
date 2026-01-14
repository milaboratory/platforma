import type {
  BlockOutputsBase,
  NavigationState,
  ValueWithUTag,
  ValueWithUTagAndAuthor,
  AuthorMarker,
  ResultOrError,
  BlockStateV3,
} from '@milaboratories/pl-model-common';
import type { Operation } from 'fast-json-patch';

/** Defines methods to read and write current block data. */
export interface BlockApiV3<
  _Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  State = unknown,
  Href extends `/${string}` = `/${string}`,
> {
  /**
   * Use this method to retrieve block state during UI initialization. Then use
   * {@link onStateUpdates} method to subscribe for updates.
   * */
  loadBlockState(): Promise<ResultOrError<ValueWithUTag<BlockStateV3<Outputs, State, Href>>>>;

  /**
   * Get all json patches (rfc6902) that were applied to the block state.
   * */
  getPatches(uTag: string): Promise<ResultOrError<ValueWithUTagAndAuthor<Operation[]>>>;

  /**
   * Sets block's unified state.
   *
   * This method returns when the state is safely saved so in case the window is
   * closed there will be no information losses. This function under the hood
   * may delay actual persistence of the supplied values.
   * */
  setState(state: State, author?: AuthorMarker): Promise<ResultOrError<void>>;

  /**
   * Sets block navigation state.
   * */
  setNavigationState(state: NavigationState<Href>): Promise<ResultOrError<void>>;

  /**
   * Disposes the block API.
   * */
  dispose(): Promise<ResultOrError<void>>;
}
