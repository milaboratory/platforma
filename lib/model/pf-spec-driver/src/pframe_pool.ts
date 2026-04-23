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

  protected calculateParamsKey(params: Record<string, PColumnSpec>): SpecFrameHandle {
    return bytesToHex(
      blake3(new TextEncoder().encode(canonicalizeJson(params))),
    ) as SpecFrameHandle;
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
