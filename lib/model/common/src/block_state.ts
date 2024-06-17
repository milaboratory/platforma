import { AuthorMarker } from './author_marker';

/** *
 * @argument
 */
export interface BlockState<Args, Outputs extends Record<string, unknown>, UiState> {
  /** Author marker for Args and UI state. Absence of author marker, means that
   * last modifier of the state provided no author marker. */
  readonly author?: AuthorMarker;

  /** Block arguments */
  readonly args: Args;

  /** UI State, i.e. any block state that must be persisted but is not passed
   * to the backend template. */
  readonly ui: UiState;

  /** Outputs, rendered with block-specified config. */
  readonly outputs: Outputs;
}
