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
  uniqueBy,
  getAxisId,
  canonicalizeJson,
  bigintReplacer,
} from '@platforma-sdk/model';
import { LRUCache } from 'lru-cache';
import {
  makeDataInfoFromPColumnValues,
  parseDataInfoResource,
  traverseParquetChunkResource,
} from './data';
import { hashJson, type MiLogger } from '@milaboratories/ts-helpers';
import { mapValues } from 'es-toolkit';
import {
  assertNever,
  emptyDir,
  ConcurrencyLimitingExecutor,
  RefCountPoolBase,
  type PoolEntry,
} from '@milaboratories/ts-helpers';
import { PFrameFactory, HttpHelpers } from '@milaboratories/pframes-rs-node';
import path from 'node:path';
import { getDebugFlags } from '../debug';
import { Readable } from 'node:stream';

type PColumnDataUniversal<TreeEntry> = TreeEntry | DataInfo<TreeEntry> | PColumnValues;

function makeBlobId(res: PlTreeEntry): PFrameInternal.PFrameBlobId {
  return String(res.rid);
}

interface LocalBlobProvider<TreeEntry> {
  acquire(params: TreeEntry): PoolEntry<PFrameInternal.PFrameBlobId>;
  makeDataSource(signal: AbortSignal): PFrameInternal.PFrameDataSourceV2;
}

type LocalBlob = ComputableStableDefined<LocalBlobHandleAndSize>;
class LocalBlobProviderImpl
  extends RefCountPoolBase<PlTreeEntry, PFrameInternal.PFrameBlobId, LocalBlob>
  implements LocalBlobProvider<PlTreeEntry> {
  constructor(private readonly blobDriver: DownloadDriver) {
    super();
  }

  protected calculateParamsKey(params: PlTreeEntry): PFrameInternal.PFrameBlobId {
    return makeBlobId(params);
  }

  protected createNewResource(params: PlTreeEntry, _key: PFrameInternal.PFrameBlobId): LocalBlob {
    return this.blobDriver.getDownloadedBlob(params);
  }

  public getByKey(blobId: PFrameInternal.PFrameBlobId): LocalBlob {
    const resource = super.tryGetByKey(blobId);
    if (!resource) throw new PFrameDriverError(`Local blob with id ${blobId} not found.`);
    return resource;
  }

  public makeDataSource(signal: AbortSignal): PFrameInternal.PFrameDataSourceV2 {
    return {
      preloadBlob: async (blobIds: string[]) => {
        try {
          await Promise.all(blobIds.map((blobId) => this.getByKey(blobId).awaitStableFullValue(signal)));
        } catch (err: unknown) {
          if (!isAbortError(err)) throw err;
        }
      },
      resolveBlobContent: async (blobId: string) => {
        const computable = this.getByKey(blobId);
        const blob = await computable.awaitStableValue(signal);
        return await this.blobDriver.getContent(blob.handle, { signal });
      },
    };
  }
}

interface RemoteBlobProvider<TreeEntry> extends AsyncDisposable {
  acquire(params: TreeEntry): PoolEntry<PFrameInternal.PFrameBlobId>;
  httpServerInfo(): PFrameInternal.HttpServerInfo;
}

type RemoteBlob = Computable<RemoteBlobHandleAndSize>;
class RemoteBlobPool
  extends RefCountPoolBase<PlTreeEntry, PFrameInternal.PFrameBlobId, RemoteBlob> {
  constructor(private readonly blobDriver: DownloadDriver) {
    super();
  }

  protected calculateParamsKey(params: PlTreeEntry): PFrameInternal.PFrameBlobId {
    return makeBlobId(params);
  }

  protected createNewResource(params: PlTreeEntry, _key: PFrameInternal.PFrameBlobId): RemoteBlob {
    return this.blobDriver.getOnDemandBlob(params);
  }

  public getByKey(blobId: PFrameInternal.PFrameBlobId): RemoteBlob {
    const resource = super.tryGetByKey(blobId);
    if (!resource) throw new PFrameDriverError(`Remote blob with id ${blobId} not found.`);
    return resource;
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
  remoteBlobProvider: RemoteBlobPool;
};

class BlobStore extends PFrameInternal.BaseObjectStore {
  private readonly remoteBlobProvider: RemoteBlobPool;

  constructor(options: BlobStoreOptions) {
    super(options);
    this.remoteBlobProvider = options.remoteBlobProvider;
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
        this.logger('warn',
          `PFrames blob store received unhandled rejection from HTTP handler: ${ensureError(error)}`,
        );
      }
    };

    try {
      const computable = this.remoteBlobProvider.tryGetByKey(blobId);
      if (!computable) return await respond({ type: 'NotFound' });

      let blob: RemoteBlobHandleAndSize;
      try {
        blob = await computable.getValue();
      } catch (error: unknown) {
        this.logger('error',
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

      this.logger('info',
        `PFrames blob store requesting content for ${blobId}, `
        + `range [${translatedRange.start}..=${translatedRange.end}]`,
      );
      return await this.remoteBlobProvider.withContent(blob.handle, {
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
        this.logger('warn',
          `PFrames blob store unhandled error: ${ensureError(error)}`,
        );
      }
      return await respond({ type: 'InternalError' });
    }
  }
}

class RemoteBlobProviderImpl implements RemoteBlobProvider<PlTreeEntry> {
  constructor(
    private readonly pool: RemoteBlobPool,
    private readonly server: PFrameInternal.HttpServer,
  ) {}

  public static async init(
    blobDriver: DownloadDriver,
    logger: PFrameInternal.Logger,
    serverOptions: Omit<PFrameInternal.HttpServerOptions, 'handler'>,
  ): Promise<RemoteBlobProviderImpl> {
    const remoteBlobProvider = new RemoteBlobPool(blobDriver);
    const store = new BlobStore({ remoteBlobProvider, logger });
    const handler = HttpHelpers.createRequestHandler({ store });
    const server = await HttpHelpers.createHttpServer({ ...serverOptions, handler });
    return new RemoteBlobProviderImpl(remoteBlobProvider, server);
  }

  public acquire(params: PlTreeEntry): PoolEntry {
    return this.pool.acquire(params);
  }

  public httpServerInfo(): PFrameInternal.HttpServerInfo {
    return this.server.info;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.server.stop();
  }
}

const valueTypes: ValueType[] = ['Int', 'Long', 'Float', 'Double', 'String', 'Bytes'] as const;

function migrateFilters(
  filters: PTableRecordFilter[],
  logger: PFrameInternal.Logger,
): PTableRecordFilter[] {
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
    logger('warn',
      `type overriten from 'bySingleColumn' to 'bySingleColumnV2' for filters: ${filtersV1Json}`,
    );
  }
  return filtersV2;
}

function migratePTableFilters<T>(
  def: Omit<PTableDef<T>, 'partitionFilters'> | PTableDef<T>,
  logger: PFrameInternal.Logger,
): PTableDef<T> {
  if (!('partitionFilters' in def)) {
    // For old blocks assume all axes filters to be partition filters
    return {
      ...def,
      partitionFilters: migrateFilters(def.filters.filter((f) => f.column.type === 'axis'), logger),
      filters: migrateFilters(def.filters.filter((f) => f.column.type === 'column'), logger),
    };
  }
  return {
    ...def,
    partitionFilters: migrateFilters(def.partitionFilters, logger),
    filters: migrateFilters(def.filters, logger),
  };
}

function hasArtificialColumns<T>(entry: JoinEntry<T>): boolean {
  switch (entry.type) {
    case 'column':
    case 'slicedColumn':
    case 'inlineColumn':
      return false;
    case 'artificialColumn':
      return true;
    case 'full':
    case 'inner':
      return entry.entries.some(hasArtificialColumns);
    case 'outer':
      return hasArtificialColumns(entry.primary) || entry.secondary.some(hasArtificialColumns);
    default:
      assertNever(entry);
  }
}

class PFramePool<TreeEntry>
  extends RefCountPoolBase<
    PFrameDef<PFrameInternal.DataInfo<TreeEntry>>,
    PFrameHandle,
    PFrameHolder<TreeEntry>> {
  constructor(
    private readonly localBlobProvider: LocalBlobProvider<TreeEntry>,
    private readonly remoteBlobProvider: RemoteBlobProvider<TreeEntry>,
    private readonly logger: PFrameInternal.Logger,
    private readonly spillPath: string,
    private readonly makeBlobId: (params: TreeEntry) => PFrameInternal.PFrameBlobId,
  ) {
    super();
  }

  protected calculateParamsKey(params: PFrameDef<PFrameInternal.DataInfo<TreeEntry>>): PFrameHandle {
    return stableKeyFromPFrameData(params, this.makeBlobId);
  }

  protected createNewResource(params: PFrameDef<PFrameInternal.DataInfo<TreeEntry>>, key: PFrameHandle): PFrameHolder<TreeEntry> {
    if (getDebugFlags().logPFrameRequests) {
      this.logger('info',
        `PFrame creation (pFrameHandle = ${key}): `
        + `${JSON.stringify(params, bigintReplacer)}`,
      );
    }
    return new PFrameHolder(
      this.localBlobProvider,
      this.remoteBlobProvider,
      this.logger,
      this.spillPath,
      params,
    );
  }

  public getByKey(key: PFrameHandle): PFrameHolder<TreeEntry> {
    const resource = super.tryGetByKey(key);
    if (!resource) throw new PFrameDriverError(`PFrame not found, handle = ${key}`);
    return resource;
  }
}

class PTableDefPool extends RefCountPoolBase<FullPTableDef, PTableHandle, PTableDefHolder> {
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
    if (!resource) throw new PFrameDriverError(`PTable definition not found, handle = ${key}`);
    return resource;
  }
}

class PTablePool<TreeEntry>
  extends RefCountPoolBase<FullPTableDef, PTableHandle, PTableHolder> {
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
    if (getDebugFlags().logPFrameRequests) {
      this.logger('info',
        `PTable creation (pTableHandle = ${key}): `
        + `${JSON.stringify(params, bigintReplacer)}`,
      );
    }

    const handle = params.pFrameHandle;
    const { pFramePromise, disposeSignal } = this.pFrames.getByKey(handle);

    const defDisposeSignal = this.pTableDefs.tryGetByKey(key)?.disposeSignal;
    const combinedSignal = AbortSignal.any([disposeSignal, defDisposeSignal].filter((s) => !!s));

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
      return new PTableHolder(handle, combinedSignal, sortedTable, predecessor);
    }

    // 2. Filter (except the case with artificial columns where cartesian creates too many rows)
    if (!hasArtificialColumns(params.def.src) && params.def.filters.length > 0) {
      const predecessor = this.acquire({
        ...params,
        def: {
          ...params.def,
          filters: [],
        },
      });
      const { resource: { pTablePromise } } = predecessor;
      const filteredTable = pTablePromise.then((pTable) => pTable.filter(params.def.filters));
      return new PTableHolder(handle, combinedSignal, filteredTable, predecessor);
    }

    // 1. Join
    const table = pFramePromise.then((pFrame) => pFrame.createTable({
      src: joinEntryToInternal(params.def.src),
      // `params.def.filters` would be non-empty only when join has artificial columns
      filters: [...params.def.partitionFilters, ...params.def.filters],
    }));
    return new PTableHolder(handle, combinedSignal, table);
  }

  public getByKey(key: PTableHandle): PTableHolder {
    const resource = super.tryGetByKey(key);
    if (!resource) throw new PFrameDriverError(`PTable not found, handle = ${key}`);
    return resource;
  }
}

class PTableCacheUi {
  private readonly perFrame = new Map<PFrameHandle, LRUCache<PTableHandle, PoolEntry<PTableHandle, PTableHolder>>>();
  private readonly global: LRUCache<PTableHandle, PoolEntry<PTableHandle, PTableHolder>>;
  private readonly disposeListeners = new Set<PTableHandle>();

  constructor(
    private readonly logger: PFrameInternal.Logger,
    private readonly ops: Pick<PFrameDriverOps, 'pFramesCacheMaxSize' | 'pFrameCacheMaxCount'>,
  ) {
    this.global = new LRUCache<PTableHandle, PoolEntry<PTableHandle, PTableHolder>>({
      maxSize: this.ops.pFramesCacheMaxSize,
      dispose: (resource, key, reason) => {
        if (reason === 'evict') {
          this.perFrame.get(resource.resource.pFrame)?.delete(key);
        }

        if (this.perFrame.get(resource.resource.pFrame)?.size === 0) {
          this.perFrame.delete(resource.resource.pFrame);
        }

        resource.unref();
        if (getDebugFlags().logPFrameRequests) {
          logger('info', `calculateTableData cache - removed PTable ${key} (reason: ${reason})`);
        }
      },
    });
  }

  public cache(resource: PoolEntry<PTableHandle, PTableHolder>, size: number): void {
    const key = resource.key;
    if (getDebugFlags().logPFrameRequests) {
      this.logger('info', `calculateTableData cache - added PTable ${key} with size ${size}`);
    }

    this.global.set(key, resource, { size: Math.max(size, 1) }); // 1 is minimum size to avoid cache evictions

    let perFrame = this.perFrame.get(resource.resource.pFrame);
    if (!perFrame) {
      perFrame = new LRUCache<PTableHandle, PoolEntry<PTableHandle, PTableHolder>>({
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

    if (!this.disposeListeners.has(key)) {
      const disposeListener = () => {
        this.perFrame.get(resource.resource.pFrame)?.delete(key);
        this.global.delete(key);

        this.disposeListeners.delete(key);
        resource.resource.disposeSignal.removeEventListener('abort', disposeListener);
      };
      this.disposeListeners.add(key);
      resource.resource.disposeSignal.addEventListener('abort', disposeListener);
    }
  }
}

class PTableCacheModel {
  private readonly global: LRUCache<PTableHandle, PoolEntry<PTableHandle, PTableHolder>>;
  private readonly disposeListeners = new Set<PTableHandle>();

  constructor(
    private readonly logger: PFrameInternal.Logger,
    ops: Pick<PFrameDriverOps, 'pTablesCacheMaxSize'>,
  ) {
    this.global = new LRUCache<PTableHandle, PoolEntry<PTableHandle, PTableHolder>>({
      maxSize: ops.pTablesCacheMaxSize,
      dispose: (resource, key, reason) => {
        resource.unref();
        if (getDebugFlags().logPFrameRequests) {
          logger('info', `createPTable cache - removed PTable ${key} (reason: ${reason})`);
        }
      },
    });
  }

  public cache(resource: PoolEntry<PTableHandle, PTableHolder>, size: number, defDisposeSignal: AbortSignal): void {
    const key = resource.key;
    if (getDebugFlags().logPFrameRequests) {
      this.logger('info', `createPTable cache - added PTable ${key} with size ${size}`);
    }

    const status: LRUCache.Status<PoolEntry<PTableHandle, PTableHolder>> = {};
    this.global.set(key, resource, { size: Math.max(size, 1), status }); // 1 is minimum size to avoid cache evictions

    if (status.maxEntrySizeExceeded) {
      resource.unref();
      if (getDebugFlags().logPFrameRequests) {
        this.logger('info', `createPTable cache - removed PTable ${key} (maxEntrySizeExceeded)`);
      }
    } else {
      if (!this.disposeListeners.has(key)) {
        const disposeListener = () => {
          this.global.delete(key);

          this.disposeListeners.delete(key);
          defDisposeSignal.removeEventListener('abort', disposeListener);
        };
        this.disposeListeners.add(key);
        defDisposeSignal.addEventListener('abort', disposeListener);
      }
    }
  }
}

class PFrameHolder<TreeEntry> implements AsyncDisposable {
  public readonly pFramePromise: Promise<PFrameInternal.PFrameV12>;
  private readonly abortController = new AbortController();
  private readonly localBlobs: PoolEntry<PFrameInternal.PFrameBlobId>[] = [];
  private readonly remoteBlobs: PoolEntry<PFrameInternal.PFrameBlobId>[] = [];

  constructor(
    private readonly localBlobProvider: LocalBlobProvider<TreeEntry>,
    private readonly remoteBlobProvider: RemoteBlobProvider<TreeEntry>,
    logger: PFrameInternal.Logger,
    private readonly spillPath: string,
    columns: PFrameDef<PFrameInternal.DataInfo<TreeEntry>>,
  ) {
    const makeLocalBlobId = (blob: TreeEntry): PFrameInternal.PFrameBlobId => {
      const localBlob = this.localBlobProvider.acquire(blob);
      this.localBlobs.push(localBlob);
      return localBlob.key;
    };

    const makeRemoteBlobId = (blob: TreeEntry): PFrameInternal.PFrameBlobId => {
      const remoteBlob = this.remoteBlobProvider.acquire(blob);
      this.remoteBlobs.push(remoteBlob);
      return `${remoteBlob.key}${PFrameInternal.ParquetExtension}`;
    };

    const mapColumnData = (
      data: PFrameInternal.DataInfo<TreeEntry>,
    ): PFrameInternal.DataInfo<PFrameInternal.PFrameBlobId> => {
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
      pFrame.setDataSource(this.localBlobProvider.makeDataSource(this.disposeSignal));

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
            `PFrame creation failed asynchronously, `
            + `columns: ${JSON.stringify(jsonifiedColumns)}, `
            + `error: ${ensureError(err)}`,
          );
        });
    } catch (err: unknown) {
      throw new PFrameDriverError(
        `PFrame creation failed synchronously, `
        + `columns: ${JSON.stringify(jsonifiedColumns)}, `
        + `error: ${ensureError(err)}`,
      );
    }
  }

  public get disposeSignal(): AbortSignal {
    return this.abortController.signal;
  }

  public get parquetServer(): PFrameInternal.HttpServerInfo {
    return this.remoteBlobProvider.httpServerInfo();
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

class PTableDefHolder implements Disposable {
  private readonly abortController = new AbortController();

  constructor(
    public readonly def: FullPTableDef,
    private readonly pTableHandle: PTableHandle,
    private readonly logger: PFrameInternal.Logger,
  ) {
    if (getDebugFlags().logPFrameRequests) {
      this.logger('info', `PTable definition saved (pTableHandle = ${this.pTableHandle})`);
    }
  }

  public get disposeSignal(): AbortSignal {
    return this.abortController.signal;
  }

  [Symbol.dispose](): void {
    this.abortController.abort();
    if (getDebugFlags().logPFrameRequests) {
      this.logger('info', `PTable definition disposed (pTableHandle = ${this.pTableHandle})`);
    }
  }
}

class PTableHolder implements AsyncDisposable {
  private readonly abortController = new AbortController();
  private readonly combinedDisposeSignal: AbortSignal;

  constructor(
    public readonly pFrame: PFrameHandle,
    pFrameDisposeSignal: AbortSignal,
    public readonly pTablePromise: Promise<PFrameInternal.PTableV7>,
    private readonly predecessor?: PoolEntry<PTableHandle, PTableHolder>,
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
  /** Port to run parquet HTTP server on. */
  parquetServerPort: number;
  /** Concurrency limits for `getUniqueValues` and `calculateTableData` requests */
  pFrameConcurrency: number;
  /** Concurrency limits for `getShape` and `getData` requests */
  pTableConcurrency: number;
  /** Maximum number of `calculateTableData` results cached for each PFrame */
  pFrameCacheMaxCount: number;
  /**
   * Maximum size of `calculateTableData` results cached for PFrames overall.
   * The limit is soft, as the same table could be materialized with other requests and will not be deleted in such case.
   * Also each table has predeccessors, overlapping predecessors will be counted twice, so the effective limit is smaller.
   */
  pFramesCacheMaxSize: number;
  /**
   * Maximum size of `createPTable` results cached on disk.
   * The limit is soft, as the same table could be materialized with other requests and will not be deleted in such case.
   * Also each table has predeccessors, overlapping predecessors will be counted twice, so the effective limit is smaller.
   */
  pTablesCacheMaxSize: number;
};

/**
 * Extends public and safe SDK's driver API with methods used internally in the middle
 * layer and in tests.
 */
export interface InternalPFrameDriver<TreeNodeAccessor = PlTreeNodeAccessor>
  extends SdkPFrameDriver, AsyncDisposable {
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
    def: PFrameDef<PColumnDataUniversal<TreeNodeAccessor>>,
    ctx: ComputableCtx,
  ): PFrameHandle;

  /** Create a new PTable */
  createPTable(
    def: PTableDef<PColumn<PColumnDataUniversal<TreeNodeAccessor>>>,
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

export class PFrameDriver<TreeNodeAccessor, TreeEntry> implements InternalPFrameDriver<TreeNodeAccessor> {
  private readonly pFrames: PFramePool<TreeEntry>;
  private readonly pTableDefs: PTableDefPool;
  private readonly pTables: PTablePool<TreeEntry>;

  private readonly pTableCacheUi: PTableCacheUi;
  private readonly pTableCacheModel: PTableCacheModel;

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
  ): Promise<PFrameDriver<PlTreeNodeAccessor, PlTreeEntry>> {
    const resolvedSpillPath = path.resolve(spillPath);
    await emptyDir(resolvedSpillPath);

    const logger: PFrameInternal.Logger = (level, message) => miLogger[level](message);
    const localBlobProvider = new LocalBlobProviderImpl(blobDriver);
    const remoteBlobProvider = await RemoteBlobProviderImpl.init(
      blobDriver,
      logger,
      { port: ops.parquetServerPort },
    );

    const unfold = (params: PFrameDef<PColumnDataUniversal<PlTreeNodeAccessor>>) => {
      const columns: PFrameDef<PFrameInternal.DataInfo<PlTreeEntry>> = params
        .filter((c) => valueTypes.find((t) => t === c.spec.valueType))
        .map((c) =>
          mapPObjectData(c, (d) =>
            isPlTreeNodeAccessor(d)
              ? parseDataInfoResource(d)
              : isDataInfo(d)
                ? d.type === 'ParquetPartitioned'
                  ? mapDataInfo(d, (a) => traverseParquetChunkResource(a))
                  : mapDataInfo(d, (a) => a.persist())
                : makeDataInfoFromPColumnValues(c.spec, d),
          ),
        );
      return columns;
    };

    return new PFrameDriver<PlTreeNodeAccessor, PlTreeEntry>(
      logger,
      localBlobProvider,
      remoteBlobProvider,
      resolvedSpillPath,
      ops,
      unfold,
      makeBlobId,
    );
  }

  private constructor(
    private readonly logger: PFrameInternal.Logger,
    localBlobProvider: LocalBlobProvider<TreeEntry>,
    private readonly remoteBlobProvider: RemoteBlobProvider<TreeEntry>,
    spillPath: string,
    ops: PFrameDriverOps,
    private readonly unfold: (
      params: PFrameDef<PColumnDataUniversal<TreeNodeAccessor>>,
    ) => PFrameDef<PFrameInternal.DataInfo<TreeEntry>>,
    makeBlobId: (params: TreeEntry) => PFrameInternal.PFrameBlobId,
  ) {
    const concurrencyLimiter = new ConcurrencyLimitingExecutor(ops.pFrameConcurrency);
    this.frameConcurrencyLimiter = concurrencyLimiter;
    this.tableConcurrencyLimiter = new ConcurrencyLimitingExecutor(ops.pTableConcurrency);

    this.pFrames = new PFramePool(localBlobProvider, remoteBlobProvider, logger, spillPath, makeBlobId);
    this.pTableDefs = new PTableDefPool(logger);
    this.pTables = new PTablePool(this.pFrames, this.pTableDefs, logger);

    this.pTableCacheUi = new PTableCacheUi(logger, ops);
    this.pTableCacheModel = new PTableCacheModel(logger, ops);
  }

  async dispose(): Promise<void> {
    return await this.remoteBlobProvider[Symbol.asyncDispose]();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    return await this.dispose();
  }

  //
  // Internal / Config API Methods
  //

  public createPFrame(
    def: PFrameDef<PColumnDataUniversal<TreeNodeAccessor>>,
    ctx: ComputableCtx,
  ): PFrameHandle {
    const columns = this.unfold(def);
    const distinctColumns = uniqueBy(columns, (column) => column.id);
    const res = this.pFrames.acquire(distinctColumns);
    ctx.addOnDestroy(res.unref);
    return res.key;
  }

  public createPTable(
    rawDef: PTableDef<PColumn<PColumnDataUniversal<TreeNodeAccessor>>>,
    ctx: ComputableCtx,
  ): PTableHandle {
    const def = migratePTableFilters(rawDef, this.logger);
    const pFrameHandle = this.createPFrame(extractAllColumns(def.src), ctx);
    const defIds = mapPTableDef(def, (c) => c.id);
    const sortedDef = sortPTableDef(defIds);

    const { key, unref } = this.pTableDefs.acquire({ def: sortedDef, pFrameHandle });
    if (getDebugFlags().logPFrameRequests) {
      this.logger('info', `Create PTable call (pFrameHandle = ${pFrameHandle}; pTableHandle = ${key})`);
    }
    ctx.addOnDestroy(unref); // in addition to pframe unref added in createPFrame above
    return key;
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
                  (item) => [canonicalizeJson(item), item] as const,
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
      def: sortPTableDef(migratePTableFilters(request, this.logger)),
    });
    const { pTablePromise, disposeSignal } = table.resource;
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
        this.pTableCacheUi.cache(table, overallSize);

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
        filters: migrateFilters(request.filters, this.logger),
      }, {
        signal: combinedSignal,
      });
    });
  }

  //
  // PTable istance methods
  //

  public async getSpec(handle: PTableHandle): Promise<PTableColumnSpec[]> {
    const { def } = this.pTableDefs.getByKey(handle);
    using table = this.pTables.acquire(def);

    const { pTablePromise } = table.resource;
    const pTable = await pTablePromise;

    return pTable.getSpec();
  }

  public async getShape(handle: PTableHandle, signal?: AbortSignal): Promise<PTableShape> {
    const { def, disposeSignal: defDisposeSignal } = this.pTableDefs.getByKey(handle);
    const table = this.pTables.acquire(def);

    const { pTablePromise, disposeSignal } = table.resource;
    const pTable = await pTablePromise;

    const combinedSignal = AbortSignal.any([signal, disposeSignal].filter((s) => !!s));
    const { shape, overallSize } = await this.tableConcurrencyLimiter.run(async () => {
      const shape = await pTable.getShape({
        signal: combinedSignal,
      });

      const overallSize = await pTable.getFootprint({
        withPredecessors: true,
        signal: combinedSignal,
      });

      return { shape, overallSize };
    });

    this.pTableCacheModel.cache(table, overallSize, defDisposeSignal);
    return shape;
  }

  public async getData(
    handle: PTableHandle,
    columnIndices: number[],
    range: TableRange | undefined,
    signal?: AbortSignal,
  ): Promise<PTableVector[]> {
    const { def, disposeSignal: defDisposeSignal } = this.pTableDefs.getByKey(handle);
    const table = this.pTables.acquire(def);

    const { pTablePromise, disposeSignal } = table.resource;
    const pTable = await pTablePromise;

    const combinedSignal = AbortSignal.any([signal, disposeSignal].filter((s) => !!s));
    const { data, overallSize } = await this.tableConcurrencyLimiter.run(async () => {
      const data = await pTable.getData(columnIndices, {
        range,
        signal: combinedSignal,
      });

      const overallSize = await pTable.getFootprint({
        withPredecessors: true,
        signal: combinedSignal,
      });

      return { data, overallSize };
    });

    this.pTableCacheModel.cache(table, overallSize, defDisposeSignal);
    return data;
  }
}

function joinEntryToInternal(entry: JoinEntry<PObjectId>): PFrameInternal.JoinEntryV4 {
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
    case 'artificialColumn':
      return {
        type: 'artificialColumn',
        columnId: entry.column,
        newId: entry.newId,
        axesIndices: entry.axesIndices,
      };
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
      throw new PFrameDriverError(`unsupported PFrame join entry type: ${type satisfies never}`);
  }
}

function sortPTableDef(def: PTableDef<PObjectId>): PTableDef<PObjectId> {
  function cmpJoinEntries(lhs: JoinEntry<PObjectId>, rhs: JoinEntry<PObjectId>): number {
    if (lhs.type !== rhs.type) {
      return lhs.type < rhs.type ? -1 : 1;
    }
    const type = lhs.type;
    switch (type) {
      case 'column':
        return lhs.column < (rhs as typeof lhs).column ? -1 : 1;
      case 'slicedColumn':
      case 'artificialColumn':
        return lhs.newId < (rhs as typeof lhs).newId ? -1 : 1;
      case 'inlineColumn': {
        return lhs.column.id < (rhs as typeof lhs).column.id ? -1 : 1;
      }
      case 'inner':
      case 'full': {
        const rhsInner = rhs as typeof lhs;
        if (lhs.entries.length !== rhsInner.entries.length) {
          return lhs.entries.length - rhsInner.entries.length;
        }
        for (let i = 0; i < lhs.entries.length; i++) {
          const cmp = cmpJoinEntries(lhs.entries[i], rhsInner.entries[i]);
          if (cmp !== 0) {
            return cmp;
          }
        }
        return 0;
      }
      case 'outer': {
        const rhsOuter = rhs as typeof lhs;
        const cmp = cmpJoinEntries(lhs.primary, rhsOuter.primary);
        if (cmp !== 0) {
          return cmp;
        }
        if (lhs.secondary.length !== rhsOuter.secondary.length) {
          return lhs.secondary.length - rhsOuter.secondary.length;
        }
        for (let i = 0; i < lhs.secondary.length; i++) {
          const cmp = cmpJoinEntries(lhs.secondary[i], rhsOuter.secondary[i]);
          if (cmp !== 0) {
            return cmp;
          }
        }
        return 0;
      }
      default:
        assertNever(type);
    }
  }
  function sortJoinEntry(entry: JoinEntry<PObjectId>): JoinEntry<PObjectId> {
    switch (entry.type) {
      case 'column':
      case 'slicedColumn':
      case 'inlineColumn':
        return entry;
      case 'artificialColumn': {
        const sortedAxesIndices = entry.axesIndices.toSorted((lhs, rhs) => lhs - rhs);
        return {
          ...entry,
          axesIndices: sortedAxesIndices,
        };
      }
      case 'inner':
      case 'full': {
        const sortedEntries = entry.entries.map(sortJoinEntry);
        sortedEntries.sort(cmpJoinEntries);
        return {
          ...entry,
          entries: sortedEntries,
        };
      }
      case 'outer': {
        const sortedSecondary = entry.secondary.map(sortJoinEntry);
        sortedSecondary.sort(cmpJoinEntries);
        return {
          ...entry,
          primary: sortJoinEntry(entry.primary),
          secondary: sortedSecondary,
        };
      }
      default:
        assertNever(entry);
    }
  }
  function sortFilters(filters: PTableRecordFilter[]): PTableRecordFilter[] {
    return filters.toSorted((lhs, rhs) => {
      if (lhs.column.type === 'axis' && rhs.column.type === 'axis') {
        const lhsId = canonicalizeJson(getAxisId(lhs.column.id));
        const rhsId = canonicalizeJson(getAxisId(rhs.column.id));
        return lhsId < rhsId ? -1 : 1;
      } else if (lhs.column.type === 'column' && rhs.column.type === 'column') {
        return lhs.column.id < rhs.column.id ? -1 : 1;
      } else {
        return lhs.column.type === 'axis' ? -1 : 1;
      }
    });
  }
  return {
    src: sortJoinEntry(def.src),
    partitionFilters: sortFilters(def.partitionFilters),
    filters: sortFilters(def.filters),
    sorting: def.sorting,
  };
}

function stableKeyFromFullPTableDef(data: FullPTableDef): PTableHandle {
  return hashJson(data) as string as PTableHandle;
}

function stableKeyFromPFrameData<TreeEntry>(
  data: PColumn<PFrameInternal.DataInfo<TreeEntry>>[],
  makeBlobId: (params: TreeEntry) => PFrameInternal.PFrameBlobId,
): PFrameHandle {
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
      result.payload.sort((lhs, rhs) => lhs.key < rhs.key ? -1 : 1);
      return result;
    }),
  );
  orderedData.sort((lhs, rhs) => lhs.id < rhs.id ? -1 : 1);
  return hashJson(orderedData) as string as PFrameHandle;
}
