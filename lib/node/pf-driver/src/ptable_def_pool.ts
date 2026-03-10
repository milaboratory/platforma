import { PFrameDriverError, type PTableHandle } from "@platforma-sdk/model";
import type { PFrameInternal } from "@milaboratories/pl-model-middle-layer";
import { RefCountPoolBase } from "@milaboratories/ts-helpers";
import { logPFrames } from "./logging";
import type { FullPTableDef } from "./ptable_shared";
import { stableKeyFromFullPTableDef } from "./ptable_shared";

export class PTableDefHolder implements Disposable {
  private readonly abortController = new AbortController();

  constructor(
    public readonly def: FullPTableDef,
    private readonly pTableHandle: PTableHandle,
    private readonly logger: PFrameInternal.Logger,
  ) {
    if (logPFrames()) {
      this.logger("info", `PTable definition saved (pTableHandle = ${this.pTableHandle})`);
    }
  }

  public get disposeSignal(): AbortSignal {
    return this.abortController.signal;
  }

  [Symbol.dispose](): void {
    this.abortController.abort();
    if (logPFrames()) {
      this.logger("info", `PTable definition disposed (pTableHandle = ${this.pTableHandle})`);
    }
  }
}

export class PTableDefPool extends RefCountPoolBase<FullPTableDef, PTableHandle, PTableDefHolder> {
  constructor(private readonly logger: PFrameInternal.Logger) {
    super();
  }

  protected calculateParamsKey(params: FullPTableDef): PTableHandle {
    return stableKeyFromFullPTableDef(params);
  }

  protected createNewResource(params: FullPTableDef, key: PTableHandle): PTableDefHolder {
    return new PTableDefHolder(params, key, this.logger);
  }

  public getByKey(key: PTableHandle): PTableDefHolder {
    const resource = super.tryGetByKey(key);
    if (!resource) {
      const error = new PFrameDriverError(`Invalid PTable handle`);
      error.cause = new Error(`PTable definition for handle ${key} not found`);
      throw error;
    }
    return resource;
  }
}
