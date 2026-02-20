import {
  assertNever,
  bigintReplacer,
  PFrameDriverError,
  type PFrameHandle,
  type PTableHandle,
  type JoinEntry,
  type JsonSerializable,
  type PColumnValue,
  type PObjectId,
} from "@platforma-sdk/model";
import type { PFrameInternal } from "@milaboratories/pl-model-middle-layer";
import { RefCountPoolBase, type PoolEntry } from "@milaboratories/ts-helpers";
import { logPFrames } from "./logging";
import type { PFramePool } from "./pframe_pool";
import {
  FullPTableDefV1,
  FullPTableDefV2,
  stableKeyFromFullPTableDef,
  type FullPTableDef,
} from "./ptable_shared";
import type { PTableDefPool } from "./ptable_def_pool";

export class PTableHolder implements Disposable {
  private readonly abortController = new AbortController();
  private readonly combinedDisposeSignal: AbortSignal;

  constructor(
    public readonly pFrame: PFrameHandle,
    pFrameDisposeSignal: AbortSignal,
    public readonly pTablePromise: Promise<PFrameInternal.PTableV8>,
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

    switch (params.type) {
      case "v1":
        return this.createNewResourceV1(params, key);
      case "v2":
        return this.createNewResourceV2(params, key);
      default:
        // @ts-expect-error `params.type` is a string, but we want to make sure all cases are handled
        throw new PFrameDriverError(`Unsupported FullPTableDef type: ${params.type}`);
    }
  }

  protected createNewResourceV1(params: FullPTableDefV1, key: PTableHandle): PTableHolder {
    const { def, pFrameHandle } = params;
    const { pFramePromise, disposeSignal } = this.pFrames.getByKey(pFrameHandle);

    const defDisposeSignal = this.pTableDefs.tryGetByKey(key)?.disposeSignal;
    const combinedSignal = AbortSignal.any([disposeSignal, defDisposeSignal].filter((s) => !!s));

    // 3. Sort
    if (def.sorting.length > 0) {
      const predecessor = this.acquire({
        ...params,
        def: {
          ...def,
          sorting: [],
        },
      });
      const {
        resource: { pTablePromise },
      } = predecessor;
      const sortedTable = pTablePromise.then((pTable) => pTable.sort(key, def.sorting));
      return new PTableHolder(pFrameHandle, combinedSignal, sortedTable, predecessor);
    }

    // 2. Filter (except the case with artificial columns where cartesian creates too many rows)
    if (!hasArtificialColumns(def.src) && def.filters.length > 0) {
      const predecessor = this.acquire({
        ...params,
        def: {
          ...def,
          filters: [],
        },
      });
      const {
        resource: { pTablePromise },
      } = predecessor;
      const filteredTable = pTablePromise.then((pTable) => pTable.filter(key, def.filters));
      return new PTableHolder(pFrameHandle, combinedSignal, filteredTable, predecessor);
    }

    // 1. Join
    const table = pFramePromise.then((pFrame) =>
      pFrame.createTable(key, {
        src: joinEntryToInternal(def.src),
        // `def.filters` would be non-empty only when join has artificial columns
        filters: [...def.partitionFilters, ...def.filters],
      }),
    );
    return new PTableHolder(pFrameHandle, combinedSignal, table);
  }

  protected createNewResourceV2(params: FullPTableDefV2, key: PTableHandle): PTableHolder {
    if (logPFrames()) {
      this.logger(
        "info",
        `PTable creation (pTableHandle = ${key}): ` + `${JSON.stringify(params, bigintReplacer)}`,
      );
    }

    const { pFrameHandle } = params;
    const { pFramePromise, disposeSignal } = this.pFrames.getByKey(pFrameHandle);

    const defDisposeSignal = this.pTableDefs.tryGetByKey(key)?.disposeSignal;
    const combinedSignal = AbortSignal.any([disposeSignal, defDisposeSignal].filter((s) => !!s));

    const table = pFramePromise.then((pFrame) => pFrame.createTableV2(key, params.def));
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
}

function hasArtificialColumns<T>(entry: JoinEntry<T>): boolean {
  switch (entry.type) {
    case "column":
    case "slicedColumn":
    case "inlineColumn":
      return false;
    case "artificialColumn":
      return true;
    case "full":
    case "inner":
      return entry.entries.some(hasArtificialColumns);
    case "outer":
      return hasArtificialColumns(entry.primary) || entry.secondary.some(hasArtificialColumns);
    default:
      assertNever(entry);
  }
}

function joinEntryToInternal(entry: JoinEntry<PObjectId>): PFrameInternal.JoinEntryV4 {
  const type = entry.type;
  switch (type) {
    case "column":
      return {
        type: "column",
        columnId: entry.column,
      };
    case "slicedColumn":
      return {
        type: "slicedColumn",
        columnId: entry.column,
        newId: entry.newId,
        axisFilters: entry.axisFilters,
      };
    case "artificialColumn":
      return {
        type: "artificialColumn",
        columnId: entry.column,
        newId: entry.newId,
        axesIndices: entry.axesIndices,
      };
    case "inlineColumn":
      return {
        type: "inlineColumn",
        newId: entry.column.id,
        spec: entry.column.spec,
        dataInfo: {
          type: "Json",
          keyLength: entry.column.spec.axesSpec.length,
          data: entry.column.data.reduce(
            (acc, row) => {
              acc[JSON.stringify(row.key)] = row.val;
              return acc;
            },
            {} as Record<string, PColumnValue>,
          ),
        },
      };
    case "inner":
    case "full":
      return {
        type: entry.type,
        entries: entry.entries.map((col) => joinEntryToInternal(col)),
      };
    case "outer":
      return {
        type: "outer",
        primary: joinEntryToInternal(entry.primary),
        secondary: entry.secondary.map((col) => joinEntryToInternal(col)),
      };
    default:
      throw new PFrameDriverError(`unsupported PFrame join entry type: ${type satisfies never}`);
  }
}
