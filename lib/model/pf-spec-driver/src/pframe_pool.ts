import {
  PFrameDriverError,
  PColumnSpec,
  SpecFrameHandle,
  stringifyJson,
  canonicalizeJson,
} from "@milaboratories/pl-model-common";
import { PFrameInternal } from "@milaboratories/pl-model-middle-layer";
import { MiLogger, RefCountPoolBase } from "@milaboratories/helpers";
import { logPFrames } from "./logging";
import { createPFrame } from "@milaboratories/pframes-rs-wasm";
import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export class PFramePool extends RefCountPoolBase<
  Record<string, PColumnSpec>,
  SpecFrameHandle,
  PFrameInternal.PFrameWasmV3
> {
  constructor(private readonly logger: MiLogger) {
    super();
  }

  /**
   * Canonical-JSON → handle memo.
   *
   * `blake3` here runs over the canonical form of the *whole* spec map, which on a real project is
   * ~1.2 MB across ~650 columns, and the pure-JS implementation manages only ~70 MB/s — ~17 ms
   * per call, versus 3 ms to canonicalize. Callers hash the same map repeatedly:
   * `buildDatasetOptions` hoists one `ColumnsProvider` and then calls `findFilterColumns` once per
   * dataset option, so a single render was measured hashing one identical 1.2 MB map 9 times
   * (19 calls, only ~4 distinct maps, 935 ms of blake3).
   *
   * Keyed on the exact canonical string, so a hit is an exact-content match — no collision risk.
   * Bounded because entries retain that string; 4 covers every distinct map seen in a render while
   * capping retention at a few MB.
   */
  private readonly keyMemo = new Map<string, SpecFrameHandle>();
  private static readonly keyMemoMaxEntries = 4;

  protected calculateParamsKey(params: Record<string, PColumnSpec>): SpecFrameHandle {
    const canonical = canonicalizeJson(params);
    const memoized = this.keyMemo.get(canonical);
    if (memoized !== undefined) return memoized;

    const key = bytesToHex(blake3(new TextEncoder().encode(canonical))) as SpecFrameHandle;

    if (this.keyMemo.size >= PFramePool.keyMemoMaxEntries) {
      // Map preserves insertion order, so the first key is the oldest.
      const oldest = this.keyMemo.keys().next();
      if (!oldest.done) this.keyMemo.delete(oldest.value);
    }
    this.keyMemo.set(canonical, key);
    return key;
  }

  protected createNewResource(
    params: Record<string, PColumnSpec>,
    key: SpecFrameHandle,
  ): PFrameInternal.PFrameWasmV3 {
    if (logPFrames()) {
      this.logger.info(`Creating SpecFrame for handle = ${key}, columns: ` + stringifyJson(params));
    }
    return createPFrame(params);
  }

  public getByKey(key: SpecFrameHandle): PFrameInternal.PFrameWasmV3 {
    const resource = super.tryGetByKey(key);
    if (!resource) {
      const error = new PFrameDriverError(`Invalid SpecFrame handle`);
      error.cause = new Error(`SpecFrame with handle ${key} not found`);
      throw error;
    }
    return resource;
  }
}
