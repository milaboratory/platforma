import type { PColumnSpec } from "@milaboratories/pl-model-common";
import type { DiscoverColumnsRequest, DiscoverColumnsResponse } from "./discover_columns";
import type { FindColumnsRequest, FindColumnsResponse } from "./find_columns";
import type { Branded } from "@milaboratories/helpers";

/** Handle to a spec-only PFrame (no data, synchronous operations). */
export type SpecFrameHandle = Branded<string, "SpecFrameHandle">;

/**
 * Synchronous driver for spec-level PFrame operations.
 *
 * Unlike the async PFrameDriver (which works with data), this driver
 * operates on column specifications only. All methods are synchronous
 * because the underlying WASM PFrame computes results immediately.
 */
export interface PSpecDriver {
  /** Create a spec-only PFrame from column specs. Returns a handle. */
  createSpecFrame(specs: Record<string, PColumnSpec>): SpecFrameHandle;

  /** Discover columns compatible with given axes integration. */
  specFrameDiscoverColumns(
    handle: SpecFrameHandle,
    request: DiscoverColumnsRequest,
  ): DiscoverColumnsResponse;

  /** Find columns matching filter criteria. */
  specFrameFindColumns(handle: SpecFrameHandle, request: FindColumnsRequest): FindColumnsResponse;

  /** Dispose a spec frame, freeing WASM resources. */
  disposeSpecFrame(handle: SpecFrameHandle): void;
}
