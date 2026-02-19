import type { BlockOutputsBase, BlockState } from "@milaboratories/pl-model-common";

/** Patch for the structural object */
export type Patch<K, V> = {
  /** Field name to patch */
  readonly key: K;
  /** New value for the field */
  readonly value: V;
};

/** Creates union type of all possible shallow patches for the given structure */
export type Unionize<T extends Record<string, unknown>> = {
  [K in keyof T]: Patch<K, T[K]>;
}[keyof T];

/** Patch for the BlockState, pushed by onStateUpdates method in SDK. */
export type BlockStatePatch<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
> = Unionize<BlockState<Args, Outputs, UiState, Href>>;
