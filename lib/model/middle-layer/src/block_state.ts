import type {
  AuthorMarker,
  BlockColumnLinks,
  BlockOutputsBase,
  BlockState,
  NavigationState,
  StringifiedJson,
} from "@milaboratories/pl-model-common";
import type { StorageDebugView } from "./storage_debug_view";
import type { Optional } from "utility-types";

// @deprecated TODO v3: keep this name, or rename to BlockStateInternalLegacy?
export type BlockStateInternal<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
> = Optional<Readonly<BlockState<Args, Outputs, UiState, Href>>, "outputs">;

// TODO: we should move this abstract convert for middle layer to the model
export type BlockStateInternalV3<
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  Href extends `/${string}` = `/${string}`,
> = {
  /** Raw block storage - UI derives data using sdk/model */
  readonly blockStorage: unknown;

  /** @deprecated No longer filled by the middle layer. Read `blockStorage` instead. */
  readonly storageDebugView?: StringifiedJson<StorageDebugView>;

  /** Outputs rendered with block config */
  outputs?: Outputs;

  /** Current navigation state */
  readonly navigationState: NavigationState<Href>;

  readonly author: AuthorMarker | undefined;

  /**
   * Column links of the block: outputs of other blocks its args reference, and blocks whose args
   * reference its outputs. `undefined` while they are not computed for it.
   */
  readonly columnLinks: BlockColumnLinks | undefined;
};
