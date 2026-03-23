import { createPFrame } from "@milaboratories/pframes-rs-wasm";
import type { PFrameInternal } from "@milaboratories/pl-model-middle-layer";
import type {
  PColumnSpec,
  PFrameSpecDriver,
  SpecFrameHandle,
  DiscoverColumnsRequest,
  DiscoverColumnsResponse,
} from "@milaboratories/pl-model-common";
import { randomUUID } from "node:crypto";

/**
 * Manages spec-only PFrame instances (WASM) with handle-based lifecycle.
 *
 * All operations are synchronous — WASM computes results immediately.
 */
export class SpecDriver implements PFrameSpecDriver {
  private readonly frames = new Map<SpecFrameHandle, PFrameInternal.PFrameWasmV2>();

  createSpecFrame(specs: Record<string, PColumnSpec>): SpecFrameHandle {
    // Explicit annotation ensures a WASM version mismatch surfaces at compile time
    // (skipLibCheck won't validate .d.ts in node_modules, but this assignment will)
    const frame: PFrameInternal.PFrameWasmV2 = createPFrame(specs);
    const handle = randomUUID() as SpecFrameHandle;
    this.frames.set(handle, frame);
    return handle;
  }

  specFrameDiscoverColumns(
    handle: SpecFrameHandle,
    request: DiscoverColumnsRequest,
  ): DiscoverColumnsResponse {
    return this.getFrame(handle).discoverColumns({
      includeColumns: request.includeColumns,
      excludeColumns: request.excludeColumns,
      axes: request.axes,
      maxHops: request.maxHops,
      constraints: request.constraints,
    });
  }

  specFrameDispose(handle: SpecFrameHandle): void {
    const frame = this.frames.get(handle);
    if (frame) {
      frame[Symbol.dispose]();
      this.frames.delete(handle);
    }
  }

  /** Dispose all managed spec frames. */
  disposeAll(): void {
    for (const frame of this.frames.values()) {
      frame[Symbol.dispose]();
    }
    this.frames.clear();
  }

  private getFrame(handle: SpecFrameHandle): PFrameInternal.PFrameWasmV2 {
    const frame = this.frames.get(handle);
    if (frame === undefined) throw new Error(`No such spec frame: ${handle}`);
    return frame;
  }
}
