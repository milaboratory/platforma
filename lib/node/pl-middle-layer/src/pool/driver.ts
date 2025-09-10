import type { DownloadDriver } from '@milaboratories/pl-drivers';
import { PFrameInternal } from '@milaboratories/pl-model-middle-layer';
import type { PlTreeEntry, PlTreeNodeAccessor } from '@milaboratories/pl-tree';
import { isPlTreeNodeAccessor } from '@milaboratories/pl-tree';
import type {
  Computable,
  ComputableCtx,
  ComputableStableDefined,
} from '@milaboratories/computable';
import type {
  CalculateTableDataRequest,
  CalculateTableDataResponse,
  FindColumnsRequest,
  FindColumnsResponse,
  LocalBlobHandleAndSize,
  PColumnIdAndSpec,
  PColumnSpec,
  PFrameHandle,
  PObjectId,
  PTableColumnSpec,
  PTableHandle,
  PTableShape,
  PTableVector,
  TableRange,
  UniqueValuesRequest,
  UniqueValuesResponse,
  PFrameDriver as SdkPFrameDriver,
  PColumn,
  PFrameDef,
  JoinEntry,
  PTableDef,
  ValueType,
  PTableRecordSingleValueFilterV2,
  PTableRecordFilter,
  PColumnValues,
  DataInfo,
  PColumnValue,
  RemoteBlobHandleAndSize,
  RemoteBlobHandle,
  ContentHandler,
} from '@platforma-sdk/model';
import {
  mapPObjectData,
  mapPTableDef,
  extractAllColumns,
  mapDataInfo,
  isDataInfo,
  ensureError,
  PFrameDriverError,
  isAbortError,
  isPFrameDriverError,
  uniqueBy,
} from '@platforma-sdk/model';
import { LRUCache } from 'lru-cache';
import {
  makeDataInfoFromPColumnValues,
  parseDataInfoResource,
  traverseParquetPartitionedResource,
} from './data';
import { createHash } from 'node:crypto';
import { type MiLogger } from '@milaboratories/ts-helpers';
import { mapValues } from 'es-toolkit';
import {
  assertNever,
  emptyDir,
  ConcurrencyLimitingExecutor,
  RefCountResourcePool,
  type PollResource,
} from '@milaboratories/ts-helpers';
import canonicalize from 'canonicalize';
import { PFrameFactory, HttpHelpers } from '@milaboratories/pframes-rs-node';
import path from 'node:path';
import { getDebugFlags } from '../debug';
import { Readable } from 'node:stream';

type PColumnDataUniversal = PlTreeNodeAccessor | DataInfo<PlTreeNodeAccessor> | PColumnValues;

function makeBlobId(res: PlTreeEntry): string {
  return String(res.rid);
}

type LocalBlobPoolEntry = PollResource<ComputableStableDefined<LocalBlobHandleAndSize>>;

class LocalBlobPool
  extends RefCountResourcePool<PlTreeEntry, ComputableStableDefined<LocalBlobHandleAndSize>>
  implements PFrameInternal.PFrameDataSourceV2 {
  constructor(private readonly blobDriver: DownloadDriver) {
    super();
  }

  protected calculateParamsKey(params: PlTreeEntry): string {
    return makeBlobId(params);
  }

  protected createNewResource(params: PlTreeEntry): ComputableStableDefined<LocalBlobHandleAndSize> {
    // precalculation of value tree will trigger the download process right away
    return this.blobDriver.getDownloadedBlob(params).withPreCalculatedValueTree();
  }

  public getByKey(blobId: string): ComputableStableDefined<LocalBlobHandleAndSize> {
    const resource = super.tryGetByKey(blobId);
    if (!resource) throw new PFrameDriverError(`Blob with id ${blobId} not found.`);
    return resource;
  }

  public async preloadBlob(blobIds: string[], signal?: AbortSignal): Promise<void> {
    try {
      await Promise.all(blobIds.map((blobId) => this.getByKey(blobId).awaitStableFullValue(signal)));
    } catch (err: unknown) {
      if (!isAbortError(err)) throw err;
    }
  };

  public async resolveBlobContent(blobId: string, signal?: AbortSignal): Promise<Uint8Array> {
    const computable = this.getByKey(blobId);
    const blob = await computable.awaitStableValue(signal);
    return await this.blobDriver.getContent(blob.handle, { signal });
  };
}

type RemoteBlobPoolEntry = PollResource<Computable<RemoteBlobHandleAndSize>>;

class RemoteBlobPool
  extends RefCountResourcePool<PlTreeEntry, Computable<RemoteBlobHandleAndSize>> {
  constructor(private readonly blobDriver: DownloadDriver) {
    super();
  }

  protected calculateParamsKey(params: PlTreeEntry): string {
    return String(params.rid);
  }

  protected createNewResource(params: PlTreeEntry): Computable<RemoteBlobHandleAndSize> {
    return this.blobDriver.getOnDemandBlob(params);
  }

  public async withContent<T>(
    handle: RemoteBlobHandle,
    options: {
      range: PFrameInternal.FileRange;
      signal: AbortSignal;
      handler: ContentHandler<T>;
    },
  ): Promise<T> {
    return await this.blobDriver.withContent(handle, {
      range: {
        from: options.range.start,
        to: options.range.end + 1,
      },
      signal: options.signal,
      handler: options.handler,
    });
  }
}

interface BlobStoreOptions extends PFrameInternal.ObjectStoreOptions {
  remoteBlobPool: RemoteBlobPool;
};

class BlobStore extends PFrameInternal.BaseObjectStore {
  private readonly remoteBlobPool: RemoteBlobPool;

  constructor(options: BlobStoreOptions) {
    super(options);
    this.remoteBlobPool = options.remoteBlobPool;
  }

  public override async request(
    filename: PFrameInternal.ParquetFileName,
    params: {
      method: PFrameInternal.HttpMethod;
      range?: PFrameInternal.HttpRange;
      signal: AbortSignal;
      callback: (response: PFrameInternal.ObjectStoreResponse) => Promise<void>;
    },
  ): Promise<void> {
    const blobId = filename.slice(0, -PFrameInternal.ParquetExtension.length);
    const respond = async (response: PFrameInternal.ObjectStoreResponse): Promise<void> => {
      try {
        await params.callback(response);
      } catch (error: unknown) {
        this.logger(
          'warn',
          `PFrames blob store received unhandled rejection from HTTP handler: ${ensureError(error)}`,
        );
      }
    };

    try {
      const computable = this.remoteBlobPool.tryGetByKey(blobId);
      if (!computable) return await respond({ type: 'NotFound' });

      let blob: RemoteBlobHandleAndSize;
      try {
        blob = await computable.getValue();
      } catch (error: unknown) {
        this.logger(
          'error',
          `PFrames blob store failed to get blob from computable: ${ensureError(error)}`,
        );
        return await respond({ type: 'InternalError' });
      }
      params.signal.throwIfAborted();

      const translatedRange = this.translate(blob.size, params.range);
      if (!translatedRange) {
        return await respond({
          type: 'RangeNotSatisfiable',
          size: blob.size,
        });
      }

      if (params.method === 'HEAD') {
        return await respond({
          type: 'Ok',
          size: blob.size,
          range: translatedRange,
        });
      }

      this.logger(
        'info',
        `PFrames blob store requesting content for ${blobId}, range [${translatedRange.start}..=${translatedRange.end}]`,
      );
      return await this.remoteBlobPool.withContent(blob.handle, {
        range: translatedRange,
        signal: params.signal,
        handler: async (data) => {
          return await respond({
            type: 'Ok',
            size: blob.size,
            range: translatedRange,
            // eslint-disable-next-line n/no-unsupported-features/node-builtins
            data: Readable.fromWeb(data),
          });
        },
      });
    } catch (error: unknown) {
      if (!isAbortError(error)) {
        this.logger(
          'warn',
          `PFrames blob store unhandled error: ${ensureError(error)}`,
        );
      }
      return await respond({ type: 'InternalError' });
    }
  }
}

type InternalPFrameData = PFrameDef<PFrameInternal.DataInfo<PlTreeEntry>>;

const valueTypes: ValueType[] = ['Int', 'Long', 'Float', 'Double', 'String', 'Bytes'] as const;

function migrateFilters(filters: PTableRecordFilter[]): PTableRecordFilter[] {
  const filtersV1 = [];
  const filtersV2: PTableRecordSingleValueFilterV2[] = [];
  for (const filter of filters) {
    if ((filter.type as unknown) === 'bySingleColumn') {
      filtersV1.push(filter);
      filtersV2.push({
        ...filter,
        type: 'bySingleColumnV2',
      });
    } else {
      filtersV2.push(filter);
    }
  }
  if (filtersV1.length > 0) {
    const filtersV1Json = JSON.stringify(filtersV1);
    console.warn(
      `type overriten from 'bySingleColumn' to 'bySingleColumnV2' for filters: ${filtersV1Json}`,
    );
  }
  return filtersV2;
}

function migratePTableFilters<T>(
  def: Omit<PTableDef<T>, 'partitionFilters'> | PTableDef<T>,
): PTableDef<T> {
  if (!('partitionFilters' in def)) {
    // For old blocks assume all axes filters to be partition filters
    return {
      ...def,
      partitionFilters: migrateFilters(def.filters.filter((f) => f.column.type === 'axis')),
      filters: migrateFilters(def.filters.filter((f) => f.column.type === 'column')),
    };
  }
  return {
    ...def,
    partitionFilters: migrateFilters(def.partitionFilters),
    filters: migrateFilters(def.filters),
  };
}

const bigintReplacer = (_: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);

class PTableCache {
  private readonly perFrame = new Map<PFrameHandle, LRUCache<PTableHandle, PollResource<PTableHolder>>>();
  private readonly global: LRUCache<PTableHandle, PollResource<PTableHolder>>;
  private readonly disposeListeners = new Map<PTableHandle, () => void>();

  constructor(
    private readonly logger: PFrameInternal.Logger,
    private readonly ops: PFrameDriverOps,
  ) {
    this.global = new LRUCache<PTableHandle, PollResource<PTableHolder>>({
      maxSize: this.ops.pFramesCacheMaxSize,
      dispose: (resource, key, reason) => {
        if (reason === 'evict') {
          this.perFrame.get(resource.resource.pFrame)?.delete(key);
        }

        if (this.perFrame.get(resource.resource.pFrame)?.size === 0) {
          this.perFrame.delete(resource.resource.pFrame);
        }

        const disposeListener = this.disposeListeners.get(key)!;
        this.disposeListeners.delete(key);
        resource.resource.disposeSignal.removeEventListener('abort', disposeListener);

        resource.unref();
        if (getDebugFlags().logPFrameRequests) {
          this.logger('info', `calculateTableData cache - removed PTable ${key}`);
        }
      },
    });
  }

  public cache(resource: PollResource<PTableHolder>, size: number): void {
    const key = resource.key as PTableHandle;
    if (getDebugFlags().logPFrameRequests) {
      this.logger('info', `calculateTableData cache - added PTable ${key} with size ${size}`);
    }

    this.global.set(key, resource, { size });

    let perFrame = this.perFrame.get(resource.resource.pFrame);
    if (!perFrame) {
      perFrame = new LRUCache<PTableHandle, PollResource<PTableHolder>>({
        max: this.ops.pFrameCacheMaxCount,
        dispose: (_resource, key, reason) => {
          if (reason === 'evict') {
            this.global.delete(key);
          }
        },
      });
      this.perFrame.set(resource.resource.pFrame, perFrame);
    }
    perFrame.set(key, resource);

    const disposeListener = () => {
      this.perFrame.get(resource.resource.pFrame)?.delete(key);
      this.global.delete(key);
    };
    this.disposeListeners.set(key, disposeListener);
    resource.resource.disposeSignal.addEventListener('abort', disposeListener);
  }
}

class PFrameHolder implements PFrameInternal.PFrameDataSourceV2, AsyncDisposable {
  public readonly pFramePromise: Promise<PFrameInternal.PFrameV11>;
  private readonly abortController = new AbortController();
  private readonly localBlobs: LocalBlobPoolEntry[] = [];
  private readonly remoteBlobs: RemoteBlobPoolEntry[] = [];

  constructor(
    public readonly parquetServer: PFrameInternal.HttpServerInfo,
    private readonly localBlobPool: LocalBlobPool,
    private readonly remoteBlobPool: RemoteBlobPool,
    logger: PFrameInternal.Logger,
    private readonly spillPath: string,
    columns: InternalPFrameData,
  ) {
    const makeLocalBlobId = (blob: PlTreeEntry): string => {
      const localBlob = this.localBlobPool.acquire(blob);
      this.localBlobs.push(localBlob);
      return localBlob.key;
    };

    const makeRemoteBlobId = (blob: PlTreeEntry): string => {
      const remoteBlob = this.remoteBlobPool.acquire(blob);
      this.remoteBlobs.push(remoteBlob);
      return remoteBlob.key + PFrameInternal.ParquetExtension;
    };

    const mapColumnData = (data: PFrameInternal.DataInfo<PlTreeEntry>): PFrameInternal.DataInfo<string> => {
      switch (data.type) {
        case 'Json':
          return { ...data };
        case 'JsonPartitioned':
          return {
            ...data,
            parts: mapValues(data.parts, makeLocalBlobId),
          };
        case 'BinaryPartitioned':
          return {
            ...data,
            parts: mapValues(data.parts, (v) => ({
              index: makeLocalBlobId(v.index),
              values: makeLocalBlobId(v.values),
            })),
          };
        case 'ParquetPartitioned':
          return {
            ...data,
            parts: mapValues(data.parts, (v) => ({
              ...v,
              data: makeRemoteBlobId(v.data),
            })),
          };
        default:
          assertNever(data);
      }
    };

    const jsonifiedColumns = columns.map((column) => ({
      ...column,
      data: mapColumnData(column.data),
    }));

    try {
      const pFrame = PFrameFactory.createPFrame({ spillPath: this.spillPath, logger });
      pFrame.setDataSource(this);

      const promises: Promise<void>[] = [];
      for (const column of jsonifiedColumns) {
        pFrame.addColumnSpec(column.id, column.spec);
        promises.push(pFrame.setColumnData(column.id, column.data, { signal: this.disposeSignal }));
      }

      this.pFramePromise = Promise.all(promises)
        .then(() => pFrame)
        .catch((err) => {
          this.dispose();
          pFrame.dispose();
          throw new PFrameDriverError(
            `PFrame creation failed asynchronously, columns: ${JSON.stringify(jsonifiedColumns)}, error: ${ensureError(err)}`,
          );
        });
    } catch (err: unknown) {
      throw new PFrameDriverError(
        `PFrame creation failed synchronously, columns: ${JSON.stringify(jsonifiedColumns)}, error: ${ensureError(err)}`,
      );
    }
  }

  public readonly preloadBlob = async (blobIds: string[]): Promise<void> => {
    return await this.localBlobPool.preloadBlob(blobIds, this.disposeSignal);
  };

  public readonly resolveBlobContent = async (blobId: string): Promise<Uint8Array> => {
    return await this.localBlobPool.resolveBlobContent(blobId, this.disposeSignal);
  };

  public get disposeSignal(): AbortSignal {
    return this.abortController.signal;
  }

  private dispose(): void {
    this.abortController.abort();
    this.localBlobs.forEach((entry) => entry.unref());
    this.remoteBlobs.forEach((entry) => entry.unref());
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.dispose();
    await this.pFramePromise
      .then((pFrame) => pFrame.dispose())
      .catch(() => { /* mute error */ });
  }
}

class PTableHolder implements AsyncDisposable {
  private readonly abortController = new AbortController();
  private readonly combinedDisposeSignal: AbortSignal;

  constructor(
    public readonly pFrame: PFrameHandle,
    pFrameDisposeSignal: AbortSignal,
    public readonly pTablePromise: Promise<PFrameInternal.PTableV7>,
    public readonly predecessor?: PollResource<PTableHolder>,
  ) {
    this.combinedDisposeSignal = AbortSignal.any([pFrameDisposeSignal, this.abortController.signal]);
  }

  public get disposeSignal(): AbortSignal {
    return this.combinedDisposeSignal;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.abortController.abort();
    await this.pTablePromise
      .then((pTable) => pTable.dispose())
      .catch(() => { /* mute error */ });
    this.predecessor?.unref();
  }
}

type FullPTableDef = {
  pFrameHandle: PFrameHandle;
  def: PTableDef<PObjectId>;
};

export type PFrameDriverOps = {
  // Port to run parquet HTTP server on.
  parquetServerPort: number;
  // Concurrency limits for `getUniqueValues` and `calculateTableData` requests
  pFrameConcurrency: number;
  // Concurrency limits for `getShape` and `getData` requests
  pTableConcurrency: number;
  // Maximum number of `calculateTableData` results cached for each PFrame
  pFrameCacheMaxCount: number;
  // Maximum size of `calculateTableData` results cached for PFrames overall.
  // The limit is soft, as the same table could be materialized with other requests and will not be deleted in such case.
  // Also each table has predeccessors, overlapping predecessors will be counted twice, so the effective limit is smaller.
  pFramesCacheMaxSize: number;
};

/**
 * Extends public and safe SDK's driver API with methods used internally in the middle
 * layer and in tests.
 */
export interface InternalPFrameDriver extends SdkPFrameDriver, AsyncDisposable {
  /** Dispose the driver and all its resources. */
  dispose(): Promise<void>;

  /**
   * Dump active PFrames allocations in pprof format.
   * The result of this function should be saved as `profile.pb.gz`.
   * Use {@link https://pprof.me/} or {@link https://www.speedscope.app/}
   * to view the allocation flamechart.
   * @warning This method will always reject on Windows!
   */
  pprofDump(): Promise<Uint8Array>;

  /** Create a new PFrame */
  createPFrame(
    def: PFrameDef<PColumnDataUniversal>,
    ctx: ComputableCtx,
  ): PFrameHandle;

  /** Create a new PTable */
  createPTable(
    def: PTableDef<PColumn<PColumnDataUniversal>>,
    ctx: ComputableCtx,
  ): PTableHandle;

  /** Calculates data for the table and returns complete data representation of it */
  calculateTableData(
    handle: PFrameHandle,
    request: CalculateTableDataRequest<PObjectId>,
    range: TableRange | undefined,
    signal?: AbortSignal
  ): Promise<CalculateTableDataResponse>;

  /** Calculate set of unique values for a specific axis for the filtered set of records */
  getUniqueValues(
    handle: PFrameHandle,
    request: UniqueValuesRequest,
    signal?: AbortSignal
  ): Promise<UniqueValuesResponse>;

  /** Unified table shape */
  getShape(
    handle: PTableHandle,
    signal?: AbortSignal,
  ): Promise<PTableShape>;

  /**
   * Retrieve the data from the table. To retrieve only data required, it can be
   * sliced both horizontally ({@link columnIndices}) and vertically
   * ({@link range}).
   *
   * @param columnIndices unified indices of columns to be retrieved
   * @param range optionally limit the range of records to retrieve
   * */
  getData(
    handle: PTableHandle,
    columnIndices: number[],
    range: TableRange | undefined,
    signal?: AbortSignal,
  ): Promise<PTableVector[]>;
}

export class PFrameDriver implements InternalPFrameDriver {
  private readonly pFrames: RefCountResourcePool<InternalPFrameData, PFrameHolder>;
  private readonly pTables: RefCountResourcePool<FullPTableDef, PTableHolder>;
  private readonly pTableCache: PTableCache;
  private readonly frameConcurrencyLimiter: ConcurrencyLimitingExecutor;
  private readonly tableConcurrencyLimiter: ConcurrencyLimitingExecutor;

  public async pprofDump(): Promise<Uint8Array> {
    return await PFrameFactory.pprofDump();
  }

  public static async init(
    blobDriver: DownloadDriver,
    miLogger: MiLogger,
    spillPath: string,
    ops: PFrameDriverOps,
  ): Promise<PFrameDriver> {
    const resolvedSpillPath = path.resolve(spillPath);
    await emptyDir(resolvedSpillPath);

    const logger: PFrameInternal.Logger = (level, message) => miLogger[level](message);
    const localBlobPool = new LocalBlobPool(blobDriver);
    const remoteBlobPool = new RemoteBlobPool(blobDriver);

    const store = new BlobStore({ remoteBlobPool, logger });
    const handler = HttpHelpers.createRequestHandler({ store: store });
    const server = await HttpHelpers.createHttpServer({ handler, port: ops.parquetServerPort });

    return new PFrameDriver(logger, server, localBlobPool, remoteBlobPool, resolvedSpillPath, ops);
  }

  private constructor(
    private readonly logger: PFrameInternal.Logger,
    private readonly server: PFrameInternal.HttpServer,
    localBlobPool: LocalBlobPool,
    remoteBlobPool: RemoteBlobPool,
    spillPath: string,
    ops: PFrameDriverOps,
  ) {
    const concurrencyLimiter = new ConcurrencyLimitingExecutor(ops.pFrameConcurrency);
    this.frameConcurrencyLimiter = concurrencyLimiter;
    this.tableConcurrencyLimiter = new ConcurrencyLimitingExecutor(ops.pTableConcurrency);

    this.pTableCache = new PTableCache(logger, ops);

    this.pFrames = new (class extends RefCountResourcePool<InternalPFrameData, PFrameHolder> {
      constructor(
        private readonly parquetServer: PFrameInternal.HttpServerInfo,
        private readonly localBlobPool: LocalBlobPool,
        private readonly remoteBlobPool: RemoteBlobPool,
        private readonly logger: PFrameInternal.Logger,
        private readonly spillPath: string,
      ) {
        super();
      }

      public acquire(params: InternalPFrameData): PollResource<PFrameHolder> {
        return super.acquire(params);
      }

      public getByKey(key: PFrameHandle): PFrameHolder {
        const resource = super.tryGetByKey(key);
        if (!resource) throw new PFrameDriverError(`PFrame not found, handle = ${key}`);
        return resource;
      }

      protected createNewResource(params: InternalPFrameData): PFrameHolder {
        if (getDebugFlags().logPFrameRequests)
          this.logger('info',
            `PFrame creation (pFrameHandle = ${this.calculateParamsKey(params)}): ${JSON.stringify(params, bigintReplacer)}`,
          );
        return new PFrameHolder(this.parquetServer, this.localBlobPool, this.remoteBlobPool, this.logger, this.spillPath, params);
      }

      protected calculateParamsKey(params: InternalPFrameData): string {
        try {
          return stableKeyFromPFrameData(params);
        } catch (err: unknown) {
          if (isPFrameDriverError(err)) throw err;
          throw new PFrameDriverError(`PFrame handle calculation failed, request: ${JSON.stringify(params, bigintReplacer)}, error: ${ensureError(err)}`);
        }
      }
    })(server.info, localBlobPool, remoteBlobPool, logger, spillPath);

    this.pTables = new (class extends RefCountResourcePool<
      FullPTableDef,
      PTableHolder
    > {
      constructor(
        private readonly pFrames: RefCountResourcePool<InternalPFrameData, PFrameHolder>,
        private readonly logger: PFrameInternal.Logger,
      ) {
        super();
      }

      public getByKey(key: PTableHandle): PTableHolder {
        const resource = super.tryGetByKey(key);
        if (!resource) throw new PFrameDriverError(`PTable not found, handle = ${key}`);
        return resource;
      }

      protected createNewResource(params: FullPTableDef): PTableHolder {
        if (getDebugFlags().logPFrameRequests) {
          this.logger('info',
            `PTable creation (pTableHandle = ${this.calculateParamsKey(params)}): ${JSON.stringify(params, bigintReplacer)}`,
          );
        }

        const handle = params.pFrameHandle;
        const { pFramePromise, disposeSignal } = this.pFrames.getByKey(handle);

        // 3. Sort
        if (params.def.sorting.length > 0) {
          const predecessor = this.acquire({
            ...params,
            def: {
              ...params.def,
              sorting: [],
            },
          });
          const { resource: { pTablePromise } } = predecessor;
          const sortedTable = pTablePromise.then((pTable) => pTable.sort(params.def.sorting));
          return new PTableHolder(handle, disposeSignal, sortedTable, predecessor);
        }

        // 2. Filter
        if (params.def.filters.length > 0) {
          const predecessor = this.acquire({
            ...params,
            def: {
              ...params.def,
              filters: [],
            },
          });
          const { resource: { pTablePromise } } = predecessor;
          const filteredTable = pTablePromise.then((pTable) => pTable.filter(params.def.filters));
          return new PTableHolder(handle, disposeSignal, filteredTable, predecessor);
        }

        // 1. Join
        const table = pFramePromise.then((pFrame) => pFrame.createTable({
          src: joinEntryToInternal(params.def.src),
          filters: params.def.partitionFilters,
        }));
        return new PTableHolder(handle, disposeSignal, table);
      }

      protected calculateParamsKey(params: FullPTableDef): string {
        try {
          return stableKeyFromFullPTableDef(params);
        } catch (err: unknown) {
          throw new PFrameDriverError(`PTable handle calculation failed, request: ${JSON.stringify(params)}, error: ${ensureError(err)}`);
        }
      }
    })(this.pFrames, logger);
  }

  async dispose(): Promise<void> {
    return await this.server.stop();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    return await this.dispose();
  }

  //
  // Internal / Config API Methods
  //

  public createPFrame(
    def: PFrameDef<PColumnDataUniversal>,
    ctx: ComputableCtx,
  ): PFrameHandle {
    const columns: InternalPFrameData = def
      .filter((c) => valueTypes.find((t) => t === c.spec.valueType))
      .map((c) =>
        mapPObjectData(c, (d) =>
          isPlTreeNodeAccessor(d)
            ? parseDataInfoResource(d)
            : isDataInfo(d)
              ? d.type === 'ParquetPartitioned'
                ? mapDataInfo(d, (a) => traverseParquetPartitionedResource(a))
                : mapDataInfo(d, (a) => a.persist())
              : makeDataInfoFromPColumnValues(c.spec, d),
        ),
      );
    const distinctColumns = uniqueBy(columns, (column) => column.id);

    const res = this.pFrames.acquire(distinctColumns);
    ctx.addOnDestroy(res.unref);
    return res.key as PFrameHandle;
  }

  public createPTable(
    rawDef: PTableDef<PColumn<PColumnDataUniversal>>,
    ctx: ComputableCtx,
  ): PTableHandle {
    const def = migratePTableFilters(rawDef);
    const pFrameHandle = this.createPFrame(extractAllColumns(def.src), ctx);
    const defIds = mapPTableDef(def, (c) => c.id);

    const res = this.pTables.acquire({ def: defIds, pFrameHandle });
    if (getDebugFlags().logPFrameRequests)
      this.logger('info',
        `Create PTable call (pFrameHandle = ${pFrameHandle}; pTableHandle = ${JSON.stringify(res)}): ${JSON.stringify(
          mapPTableDef(def, (c) => c.spec),
          bigintReplacer,
        )}`,
      );
    ctx.addOnDestroy(res.unref); // in addition to pframe unref added in createPFrame above
    return res.key as PTableHandle;
  }

  //
  // PFrame istance methods
  //

  public async findColumns(
    handle: PFrameHandle,
    request: FindColumnsRequest,
  ): Promise<FindColumnsResponse> {
    const iRequest: PFrameInternal.FindColumnsRequest = {
      ...request,
      compatibleWith:
        request.compatibleWith.length !== 0
          ? [{
              axesSpec: [
                ...new Map(request.compatibleWith.map(
                  (item) => [canonicalize(item)!, item] as const,
                )).values(),
              ],
              qualifications: [],
            }]
          : [],
    };

    const { pFramePromise } = this.pFrames.getByKey(handle);
    const pFrame = await pFramePromise;

    const responce = await pFrame.findColumns(iRequest);
    return {
      hits: responce.hits
        .filter((h) => // only exactly matching columns
          h.mappingVariants.length === 0
          || h.mappingVariants.some((v) =>
            v.qualifications.forHit.length === 0
            && v.qualifications.forQueries.every((q) => q.length === 0)))
        .map((h) => h.hit),
    };
  }

  public async getColumnSpec(handle: PFrameHandle, columnId: PObjectId): Promise<PColumnSpec> {
    const { pFramePromise } = this.pFrames.getByKey(handle);
    const pFrame = await pFramePromise;
    return await pFrame.getColumnSpec(columnId);
  }

  public async listColumns(handle: PFrameHandle): Promise<PColumnIdAndSpec[]> {
    const { pFramePromise } = this.pFrames.getByKey(handle);
    const pFrame = await pFramePromise;
    return await pFrame.listColumns();
  }

  public async calculateTableData(
    handle: PFrameHandle,
    request: CalculateTableDataRequest<PObjectId>,
    range: TableRange | undefined,
    signal?: AbortSignal,
  ): Promise<CalculateTableDataResponse> {
    if (getDebugFlags().logPFrameRequests) {
      this.logger('info',
        `Call calculateTableData, handle = ${handle}, request = ${JSON.stringify(request, bigintReplacer)}`,
      );
    }

    const table = this.pTables.acquire({
      pFrameHandle: handle,
      def: migratePTableFilters(request),
    });
    const { resource: { pTablePromise, disposeSignal } } = table;
    const pTable = await pTablePromise;
    const combinedSignal = AbortSignal.any([signal, disposeSignal].filter((s) => !!s));

    return await this.frameConcurrencyLimiter.run(async () => {
      try {
        const spec = pTable.getSpec();
        const data = await pTable.getData([...spec.keys()], {
          range,
          signal: combinedSignal,
        });

        const resultSize = await pTable.getFootprint({
          withPredecessors: false,
          signal: combinedSignal,
        });
        if (resultSize >= 2 * 1024 * 1024 * 1024) {
          throw new PFrameDriverError(`Join results exceed 2GB, please add filters to shrink the result size`);
        }

        const overallSize = await pTable.getFootprint({
          withPredecessors: true,
          signal: combinedSignal,
        });
        this.pTableCache.cache(table, overallSize);

        return spec.map((spec, i) => ({
          spec: spec,
          data: data[i],
        }));
      } catch (err: unknown) {
        table.unref();
        throw err;
      }
    });
  }

  public async getUniqueValues(
    handle: PFrameHandle,
    request: UniqueValuesRequest,
    signal?: AbortSignal,
  ): Promise<UniqueValuesResponse> {
    if (getDebugFlags().logPFrameRequests) {
      this.logger('info',
        `Call getUniqueValues, handle = ${handle}, request = ${JSON.stringify(request, bigintReplacer)}`,
      );
    }

    const { pFramePromise, disposeSignal } = this.pFrames.getByKey(handle);
    const pFrame = await pFramePromise;
    const combinedSignal = AbortSignal.any([signal, disposeSignal].filter((s) => !!s));

    return await this.frameConcurrencyLimiter.run(async () => {
      return await pFrame.getUniqueValues({
        ...request,
        filters: migrateFilters(request.filters),
      }, {
        signal: combinedSignal,
      });
    });
  }

  //
  // PTable istance methods
  //

  public async getSpec(handle: PTableHandle): Promise<PTableColumnSpec[]> {
    const { pTablePromise } = this.pTables.getByKey(handle);
    const pTable = await pTablePromise;
    return pTable.getSpec();
  }

  public async getShape(handle: PTableHandle, signal?: AbortSignal): Promise<PTableShape> {
    const { pTablePromise, disposeSignal } = this.pTables.getByKey(handle);
    const pTable = await pTablePromise;
    const combinedSignal = AbortSignal.any([signal, disposeSignal].filter((s) => !!s));

    return await this.tableConcurrencyLimiter.run(async () => {
      return await pTable.getShape({
        signal: combinedSignal,
      });
    });
  }

  public async getData(
    handle: PTableHandle,
    columnIndices: number[],
    range: TableRange | undefined,
    signal?: AbortSignal,
  ): Promise<PTableVector[]> {
    const { pTablePromise, disposeSignal } = this.pTables.getByKey(handle);
    const pTable = await pTablePromise;
    const combinedSignal = AbortSignal.any([signal, disposeSignal].filter((s) => !!s));

    return await this.tableConcurrencyLimiter.run(async () => {
      return await pTable.getData(columnIndices, {
        range,
        signal: combinedSignal,
      });
    });
  }
}

function joinEntryToInternal(entry: JoinEntry<PObjectId>): PFrameInternal.JoinEntryV3 {
  const type = entry.type;
  switch (type) {
    case 'column':
      return {
        type: 'column',
        columnId: entry.column,
      };
    case 'slicedColumn':
      return {
        type: 'slicedColumn',
        columnId: entry.column,
        newId: entry.newId,
        axisFilters: entry.axisFilters,
      };
    // case 'artificialColumn':
    //   return {
    //     type: 'artificialColumn',
    //     columnId: entry.column,
    //     newId: entry.newId,
    //     axesIndices: entry.axesIndices,
    //   };
    case 'inlineColumn':
      return {
        type: 'inlineColumn',
        newId: entry.column.id,
        spec: entry.column.spec,
        dataInfo: {
          type: 'Json',
          keyLength: entry.column.spec.axesSpec.length,
          data: entry.column.data.reduce((acc, row) => {
            acc[JSON.stringify(row.key)] = row.val;
            return acc;
          }, {} as Record<string, PColumnValue>),
        },
      };
    case 'inner':
    case 'full':
      return {
        type: entry.type,
        entries: entry.entries.map((col) => joinEntryToInternal(col)),
      };
    case 'outer':
      return {
        type: 'outer',
        primary: joinEntryToInternal(entry.primary),
        secondary: entry.secondary.map((col) => joinEntryToInternal(col)),
      };
    default:
      throw new PFrameDriverError(`unsupported PFrame join entry type: ${type}`);
  }
}

function stableKeyFromFullPTableDef(data: FullPTableDef): string {
  const hash = createHash('sha256');
  hash.update(canonicalize(data)!);
  return hash.digest().toString('hex');
}

function stableKeyFromPFrameData(data: PColumn<PFrameInternal.DataInfo<PlTreeEntry>>[]): string {
  const orderedData = [...data].map((column) =>
    mapPObjectData(column, (r) => {
      let result: {
        type: string;
        keyLength: number;
        payload: {
          key: string;
          value: null | number | string | [string, string];
        }[];
      };
      const type = r.type;
      switch (type) {
        case 'Json':
          result = {
            type: r.type,
            keyLength: r.keyLength,
            payload: Object.entries(r.data).map(([part, value]) => ({
              key: part,
              value,
            })),
          };
          break;
        case 'JsonPartitioned':
          result = {
            type: r.type,
            keyLength: r.partitionKeyLength,
            payload: Object.entries(r.parts).map(([part, info]) => ({
              key: part,
              value: makeBlobId(info),
            })),
          };
          break;
        case 'BinaryPartitioned':
          result = {
            type: r.type,
            keyLength: r.partitionKeyLength,
            payload: Object.entries(r.parts).map(([part, info]) => ({
              key: part,
              value: [makeBlobId(info.index), makeBlobId(info.values)] as const,
            })),
          };
          break;
        case 'ParquetPartitioned':
          result = {
            type: r.type,
            keyLength: r.partitionKeyLength,
            payload: Object.entries(r.parts).map(([part, info]) => ({
              key: part,
              value: info.dataDigest || [
                makeBlobId(info.data),
                JSON.stringify({ axes: info.axes, column: info.column }),
              ] as const,
            })),
          };
          break;
        default:
          throw new PFrameDriverError(`unsupported resource type: ${JSON.stringify(type satisfies never)}`);
      }
      result.payload.sort((lhs, rhs) => lhs.key.localeCompare(rhs.key));
      return result;
    }),
  );
  orderedData.sort((lhs, rhs) => lhs.id.localeCompare(rhs.id));

  const hash = createHash('sha256');
  hash.update(canonicalize(orderedData)!);
  return hash.digest().toString('hex');
}
