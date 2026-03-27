import {
  createPFrame,
  expandAxes,
  collapseAxes,
  findAxis,
  findTableColumn,
} from "@milaboratories/pframes-rs-wasm";
import type { PFrameInternal } from "@milaboratories/pl-model-middle-layer";
import type {
  AxesId,
  AxesSpec,
  PColumnSpec,
  PFrameSpecDriver,
  PTableColumnId,
  PTableColumnSpec,
  SingleAxisSelector,
  SpecFrameHandle,
  DiscoverColumnsRequest,
  DiscoverColumnsResponse,
} from "@milaboratories/pl-model-common";
import { PFrameSpecDriverError, ValueType } from "@milaboratories/pl-model-common";

/**
 * Manages spec-only PFrame instances (WASM) with handle-based lifecycle.
 *
 * All operations are synchronous — WASM computes results immediately.
 */
export class SpecDriver implements PFrameSpecDriver, Disposable {
  private readonly frames = new Map<SpecFrameHandle, PFrameInternal.PFrameWasmV2>();

  createSpecFrame(specs: Record<string, PColumnSpec>): SpecFrameHandle {
    const supportedValueTypes = new Set<string>(Object.values(ValueType));
    const filtered = Object.fromEntries(
      Object.entries(specs).filter(([id, spec]) => {
        if (supportedValueTypes.has(spec.valueType)) return true;
        console.warn(
          `SpecDriver.createSpecFrame: dropping column "${id}" with unsupported valueType "${spec.valueType}"`,
        );
        return false;
      }),
    );

    const frame: PFrameInternal.PFrameWasmV2 = createPFrame(filtered);
    const handle = crypto.randomUUID() as SpecFrameHandle;
    this.frames.set(handle, frame);
    return handle;
  }

  specFrameDiscoverColumns(
    handle: SpecFrameHandle,
    request: DiscoverColumnsRequest,
  ): DiscoverColumnsResponse {
    return this.getFrame(handle).discoverColumns(request);
  }

  disposeSpecFrame(handle: SpecFrameHandle): void {
    const frame = this.frames.get(handle);
    if (frame) {
      frame[Symbol.dispose]();
      this.frames.delete(handle);
    }
  }

  expandAxes(spec: AxesSpec): AxesId {
    return expandAxes(spec);
  }

  collapseAxes(ids: AxesId): AxesSpec {
    return collapseAxes(ids);
  }

  findAxis(spec: AxesSpec, selector: SingleAxisSelector): number {
    return findAxis(spec, selector);
  }

  findTableColumn(tableSpec: PTableColumnSpec[], selector: PTableColumnId): number {
    return findTableColumn(tableSpec, selector);
  }

  /** Dispose all managed spec frames. */
  dispose(): void {
    try {
      for (const frame of this.frames.values()) {
        frame[Symbol.dispose]();
      }
    } finally {
      this.frames.clear();
    }
  }

  [Symbol.dispose](): void {
    this.dispose();
  }

  private getFrame(handle: SpecFrameHandle): PFrameInternal.PFrameWasmV2 {
    const frame = this.frames.get(handle);
    if (frame === undefined) throw new PFrameSpecDriverError(`No such spec frame: ${handle}`);
    return frame;
  }
}
