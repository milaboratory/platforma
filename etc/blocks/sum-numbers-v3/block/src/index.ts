import type { InferDataType, InferHrefType, InferOutputsType } from "@platforma-sdk/model";
import type {
  BlockData,
  SumNumbersRef,
  SumOutcome,
} from "@milaboratories/milaboratories.test-sum-numbers-v3.model";
import { platforma } from "@milaboratories/milaboratories.test-sum-numbers-v3.model";

/**
 * Spec marker for the Sum Numbers v3 block. Phantom type — encodes the
 * outputs, data, and href shapes so consumers (tests, MCP, other blocks)
 * can reach them via the `OutputsOf` / `DataOf` / `HrefOf` generators.
 *
 * Spike probe — top-level alias JSDoc with rich content.
 */
export interface SumNumbersV3Spec {
  /** Nominal tag pinning this Spec to the sum-numbers-v3 block. */
  readonly __block: "sum-numbers-v3";
  /** Outputs reachable through the block's workflow run. */
  outputs: InferOutputsType<typeof platforma>;
  /** Persistent block state (data) — see {@link BlockData}. */
  data: InferDataType<typeof platforma>;
  /** Hrefs the block UI advertises. */
  href: InferHrefType<typeof platforma>;
}

/** Universal Spec twin — every facade exports `BlockSpec` as an alias of its block-named Spec. */
export type BlockSpec = SumNumbersV3Spec;

/** Extract the outputs shape from a block Spec. */
export type OutputsOf<S> = S extends { outputs: infer O } ? O : never;

/** Extract the data (block state) shape from a block Spec. */
export type DataOf<S> = S extends { data: infer D } ? D : never;

/** Extract the href shape from a block Spec. */
export type HrefOf<S> = S extends { href: infer H } ? H : never;

/**
 * Outputs of this block. Convenience alias equal to `OutputsOf<BlockSpec>`.
 * The shape is derived via `InferOutputsType<typeof platforma>` — JSDoc
 * placed on the individual `.output(...)` builders in the model package must
 * survive into the bundled facade `.d.ts`.
 */
export type BlockOutputs = InferOutputsType<typeof platforma>;

export type { BlockData, SumNumbersRef, SumOutcome };

const __facadeDir__ = new URL(".", import.meta.url).pathname;

/**
 * Dev-v2 block spec — folder-based, resolved relative to the facade directory.
 *
 * Phase C will replace the runtime side with a registry-aware dispatcher;
 * Phase B keeps the existing dev-v2 shape unchanged.
 */
export const blockSpec = {
  type: "dev-v2" as const,
  folder: __facadeDir__,
};
