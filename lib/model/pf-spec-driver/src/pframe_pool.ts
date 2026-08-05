import {
  PFrameDriverError,
  PColumnSpec,
  SpecFrameHandle,
  stringifyJson,
  canonicalizeJson,
} from "@milaboratories/pl-model-common";
import { MiLogger, RefCountPoolBase } from "@milaboratories/helpers";
import { logPFrames } from "./logging";
import { createPFrame, type PFrame } from "@milaboratories/pf-spec";
import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export class PFramePool extends RefCountPoolBase<
  Record<string, PColumnSpec>,
  SpecFrameHandle,
  PFrame
> {
  constructor(private readonly logger: MiLogger) {
    super();
  }

  protected calculateParamsKey(params: Record<string, PColumnSpec>): SpecFrameHandle {
    return bytesToHex(
      blake3(new TextEncoder().encode(canonicalizeJson(params))),
    ) as SpecFrameHandle;
  }

  protected createNewResource(params: Record<string, PColumnSpec>, key: SpecFrameHandle): PFrame {
    if (logPFrames()) {
      this.logger.info(`Creating SpecFrame for handle = ${key}, columns: ` + stringifyJson(params));
    }
    return createPFrame(params);
  }

  public getByKey(key: SpecFrameHandle): PFrame {
    const resource = super.tryGetByKey(key);
    if (!resource) {
      const error = new PFrameDriverError(`Invalid SpecFrame handle`);
      error.cause = new Error(`SpecFrame with handle ${key} not found`);
      throw error;
    }
    return resource;
  }
}
