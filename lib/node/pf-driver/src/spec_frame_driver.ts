import { createPFrame } from "@milaboratories/pframes-rs-wasm";
import type { PFrameInternal } from "@milaboratories/pl-model-middle-layer";
import type { PColumnSpec } from "@milaboratories/pl-model-common";
import { randomUUID } from "node:crypto";

/**
 * Manages spec-only PFrame instances (WASM) with handle-based lifecycle.
 *
 * All operations are synchronous — WASM computes results immediately.
 * Implements PSpecDriver from pl-model-middle-layer.
 */
export class SpecFrameDriver implements PFrameInternal.PSpecDriver {
  private readonly frames = new Map<string, PFrameInternal.PFrameWasm>();

  createSpecFrame(specs: Record<string, PColumnSpec>): PFrameInternal.SpecFrameHandle {
    const frame = createPFrame(specs);
    const handle = randomUUID() as PFrameInternal.SpecFrameHandle;
    this.frames.set(handle, frame);
    return handle;
  }

  specFrameDiscoverColumns(
    handle: PFrameInternal.SpecFrameHandle,
    request: PFrameInternal.DiscoverColumnsRequest,
  ): PFrameInternal.DiscoverColumnsResponse {
    return this.getFrame(handle).discoverColumns(request);
  }

  specFrameFindColumns(
    handle: PFrameInternal.SpecFrameHandle,
    request: PFrameInternal.FindColumnsRequest,
  ): PFrameInternal.FindColumnsResponse {
    return this.getFrame(handle).findColumns(request);
  }

  disposeSpecFrame(handle: PFrameInternal.SpecFrameHandle): void {
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

  private getFrame(handle: string): PFrameInternal.PFrameWasm {
    const frame = this.frames.get(handle);
    if (frame === undefined) throw new Error(`No such spec frame: ${handle}`);
    return frame;
  }
}
