import {
  PFrameDriverError,
  type PFrameHandle,
  type PObjectId,
  type PTableDef,
  type PTableHandle,
} from "@milaboratories/pl-model-common";
import type { PFrameInternal } from "@milaboratories/pl-model-middle-layer";
import { RefCountPoolBase, type PoolEntry } from "@milaboratories/helpers";
import { logPFrames } from "./logging";
import type { FullPTableDef } from "./ptable_shared";
import { buildFullPTableDefFromLegacy, stableKeyFromFullPTableDef } from "./ptable_shared";

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

  /**
   * Acquire a def from a legacy `PTableDef` + column specs map.
   * Lowers the input via WASM-spec and stores the resulting
   * `{ tableSpec, dataQuery }` shape. Returns the lowered def
   * alongside the pool entry — callers that need `tableSpec`
   * (e.g. `calculateTableData`) read it from `def.tableSpec`
   * without re-deriving.
   */
  public acquireFromLegacy(opts: {
    pFrameHandle: PFrameHandle;
    def: PTableDef<PObjectId>;
    pFrameSpec: PFrameInternal.PFrameWasmV3;
  }): { def: FullPTableDef; entry: PoolEntry<PTableHandle> } {
    const def = buildFullPTableDefFromLegacy(opts);
    return { def, entry: this.acquire(def) };
  }
}
