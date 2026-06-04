import {
  bigintReplacer,
  PFrameDriverError,
  type PFrameHandle,
  type PTableDef,
  type PTableHandle,
  type JsonSerializable,
  type PObjectId,
} from "@milaboratories/pl-model-common";
import type { PFrameInternal } from "@milaboratories/pl-model-middle-layer";
import { RefCountPoolBase, type PoolEntry } from "@milaboratories/helpers";
import { logPFrames } from "./logging";
import type { PFramePool } from "./pframe_pool";
import {
  buildFullPTableDefFromLegacy,
  stableKeyFromFullPTableDef,
  type FullPTableDef,
} from "./ptable_shared";
import type { PTableDefPool } from "./ptable_def_pool";

export class PTableHolder implements Disposable {
  private readonly abortController = new AbortController();
  private readonly combinedDisposeSignal: AbortSignal;
  private cacheSizePromise?: Promise<number>;

  constructor(
    public readonly pFrame: PFrameHandle,
    pFrameDisposeSignal: AbortSignal,
    public readonly pTablePromise: Promise<PFrameInternal.PTableV11>,
    private readonly predecessor?: PoolEntry<PTableHandle, PTableHolder>,
  ) {
    this.combinedDisposeSignal = AbortSignal.any([
      pFrameDisposeSignal,
      this.abortController.signal,
    ]);
  }

  public get disposeSignal(): AbortSignal {
    return this.combinedDisposeSignal;
  }

  public get cacheSize(): Promise<number> {
    if (this.cacheSizePromise === undefined) {
      this.cacheSizePromise = this.pTablePromise.then((pTable) =>
        pTable.getFootprint({
          withPredecessors: false,
          signal: this.abortController.signal,
        }),
      );
    }
    return this.cacheSizePromise;
  }

  [Symbol.dispose](): void {
    this.abortController.abort();
    this.predecessor?.unref();
    void this.pTablePromise
      .then((pTable) => pTable.dispose())
      .catch(() => {
        /* mute error */
      });
  }
}

export class PTablePool<TreeEntry extends JsonSerializable> extends RefCountPoolBase<
  FullPTableDef,
  PTableHandle,
  PTableHolder
> {
  constructor(
    private readonly pFrames: PFramePool<TreeEntry>,
    private readonly pTableDefs: PTableDefPool,
    private readonly logger: PFrameInternal.Logger,
  ) {
    super();
  }

  protected calculateParamsKey(params: FullPTableDef): PTableHandle {
    return stableKeyFromFullPTableDef(params);
  }

  protected createNewResource(params: FullPTableDef, key: PTableHandle): PTableHolder {
    if (logPFrames()) {
      this.logger(
        "info",
        `PTable creation (pTableHandle = ${key}): ` + `${JSON.stringify(params, bigintReplacer)}`,
      );
    }

    const { pFrameHandle } = params;
    const { pFrameDataPromise: pFramePromise, disposeSignal } = this.pFrames.getByKey(pFrameHandle);

    const defDisposeSignal = this.pTableDefs.tryGetByKey(key)?.disposeSignal;
    const combinedSignal = AbortSignal.any([disposeSignal, defDisposeSignal].filter((s) => !!s));

    const { dataQuery } = params;
    const table = pFramePromise.then((pFrame) => pFrame.createTable(key, dataQuery));
    return new PTableHolder(pFrameHandle, combinedSignal, table);
  }

  public getByKey(key: PTableHandle): PTableHolder {
    const resource = super.tryGetByKey(key);
    if (!resource) {
      const error = new PFrameDriverError(`Invalid PTable handle`);
      error.cause = new Error(`PTable with handle ${key} not found`);
      throw error;
    }
    return resource;
  }

  /**
   * Acquire a PTable from a legacy `PTableDef` + column specs map.
   * Lowers the input via WASM-spec and stores the resulting
   * `{ tableSpec, dataQuery }` shape. Returns the lowered def
   * alongside the pool entry.
   */
  public acquireFromLegacy(opts: {
    pFrameHandle: PFrameHandle;
    def: PTableDef<PObjectId>;
    pFrameSpec: PFrameInternal.PFrameWasmV3;
  }): { def: FullPTableDef; entry: PoolEntry<PTableHandle, PTableHolder> } {
    const def = buildFullPTableDefFromLegacy(opts);
    return { def, entry: this.acquire(def) };
  }
}
