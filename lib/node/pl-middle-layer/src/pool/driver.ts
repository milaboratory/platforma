import type { DownloadDriver } from '@milaboratories/pl-drivers';
import type { PFrameInternal } from '@milaboratories/pl-model-middle-layer';
import type { PlTreeNodeAccessor, ResourceInfo } from '@milaboratories/pl-tree';
import { isPlTreeNodeAccessor } from '@milaboratories/pl-tree';
import type { ComputableCtx, ComputableStableDefined } from '@milaboratories/computable';
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
} from '@platforma-sdk/model';
import { LRUCache } from 'lru-cache';
import type { PollResource } from './ref_count_pool';
import { RefCountResourcePool } from './ref_count_pool';
import { allBlobs, makeDataInfoFromPColumnValues, mapBlobs, parseDataInfoResource } from './data';
import { createHash } from 'node:crypto';
import type { MiLogger } from '@milaboratories/ts-helpers';
import { assertNever, emptyDir, ConcurrencyLimitingExecutor } from '@milaboratories/ts-helpers';
import canonicalize from 'canonicalize';
import { PFrame } from '@milaboratories/pframes-rs-node';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { getDebugFlags } from '../debug';

type PColumnDataUniversal = PlTreeNodeAccessor | DataInfo<PlTreeNodeAccessor> | PColumnValues;

function blobKey(res: ResourceInfo): string {
  return String(res.id);
}

type InternalPFrameData = PFrameDef<DataInfo<ResourceInfo>>; // TODO: PFrameInternal.DataInfo<ResourceInfo>

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
    private readonly logger: MiLogger,
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
          this.logger.info(`calculateTableData cache - removed PTable ${key}`);
        }
      },
    });
  }

  public cache(resource: PollResource<PTableHolder>, size: number): void {
    const key = resource.key as PTableHandle;
    if (getDebugFlags().logPFrameRequests) {
      this.logger.info(`calculateTableData cache - added PTable ${key} with size ${size}`);
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

class PFrameHolder implements PFrameInternal.PFrameDataSource, AsyncDisposable {
  public readonly pFramePromise: Promise<PFrameInternal.PFrameV9>;
  private readonly abortController = new AbortController();
  private readonly blobIdToResource = new Map<string, ResourceInfo>();
  private readonly blobHandleComputables = new Map<
    string,
    ComputableStableDefined<LocalBlobHandleAndSize>
  >();

  constructor(
    private readonly blobDriver: DownloadDriver,
    private readonly logger: MiLogger,
    private readonly spillPath: string,
    columns: InternalPFrameData,
  ) {
    const logFunc: PFrameInternal.Logger = (level, message) => this.logger[level](message);

    for (const column of columns) {
      for (const blob of allBlobs(column.data)) {
        this.blobIdToResource.set(blobKey(blob), blob);
      }
    }
    const distinctСolumns = [
      ...new Map(columns.map((column) => ({
        ...column,
        data: mapBlobs(column.data, blobKey),
      })).map(
        (item) => [canonicalize(item)!, item] as const,
      )).values(),
    ];

    try {
      const pFrame = new PFrame(this.spillPath, logFunc);
      pFrame.setDataSource(this);
      const promises: Promise<void>[] = [];
      for (const column of distinctСolumns) {
        pFrame.addColumnSpec(column.id, column.spec);
        if (column.data.type === 'ParquetPartitioned') { // TODO: remove
          throw new PFrameDriverError(
            `ParquetPartitioned data is not supported yet, column: ${JSON.stringify(column)}, data: ${JSON.stringify(column.data)}`,
          );
        }
        promises.push(pFrame.setColumnData(column.id, column.data, { signal: this.disposeSignal }));
      }
      this.pFramePromise = Promise.all(promises)
        .then(() => pFrame)
        .catch((err) => {
          this.dispose();
          pFrame.dispose();
          throw new PFrameDriverError(
            `PFrame creation failed asynchronously, columns: ${JSON.stringify(distinctСolumns)}, error: ${ensureError(err)}`,
          );
        });
    } catch (err: unknown) {
      throw new PFrameDriverError(
        `PFrame creation failed synchronously, columns: ${JSON.stringify(distinctСolumns)}, error: ${ensureError(err)}`,
      );
    }
  }

  private getOrCreateComputableForBlob(blobId: string) {
    let computable = this.blobHandleComputables.get(blobId);
    if (computable !== undefined) return computable;

    const blobResource = this.blobIdToResource.get(blobId);
    if (blobResource === undefined) throw new PFrameDriverError(`Blob with id ${blobId} not found.`);

    // precalculation of value tree will trigger the download proecess right away
    computable = this.blobDriver.getDownloadedBlob(blobResource).withPreCalculatedValueTree();

    this.blobHandleComputables.set(blobId, computable);

    return computable;
  }

  public readonly preloadBlob = async (blobIds: string[]): Promise<void> => {
    const computables = blobIds.map((blobId) => this.getOrCreateComputableForBlob(blobId));
    for (const computable of computables) {
      try {
        await computable.awaitStableFullValue(this.disposeSignal);
      } catch (err: unknown) {
        if (isAbortError(err)) {
          break; // silence abort errors
        }
        throw err;
      }
    }
  };

  public readonly resolveBlobContent = async (blobId: string): Promise<Uint8Array> => {
    const computable = this.getOrCreateComputableForBlob(blobId);
    const path = this.blobDriver.getLocalPath((await computable.awaitStableValue(this.disposeSignal)).handle);
    return await fsp.readFile(path);
  };

  public get disposeSignal(): AbortSignal {
    return this.abortController.signal;
  }

  private dispose(): void {
    this.abortController.abort();
    for (const computable of this.blobHandleComputables.values()) computable.resetState();
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
    public readonly pTablePromise: Promise<PFrameInternal.PTableV6>,
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
export interface InternalPFrameDriver extends SdkPFrameDriver {
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
    return await PFrame.pprofDump();
  }

  public static async init(
    blobDriver: DownloadDriver,
    logger: MiLogger,
    spillPath: string,
    ops: PFrameDriverOps,
  ): Promise<PFrameDriver> {
    const resolvedSpillPath = path.resolve(spillPath);
    await emptyDir(resolvedSpillPath);
    return new PFrameDriver(blobDriver, logger, resolvedSpillPath, ops);
  }

  private constructor(
    private readonly blobDriver: DownloadDriver,
    private readonly logger: MiLogger,
    private readonly spillPath: string,
    ops: PFrameDriverOps,
  ) {
    const concurrencyLimiter = new ConcurrencyLimitingExecutor(ops.pFrameConcurrency);
    this.frameConcurrencyLimiter = concurrencyLimiter;
    this.tableConcurrencyLimiter = new ConcurrencyLimitingExecutor(ops.pTableConcurrency);

    this.pTableCache = new PTableCache(this.logger, ops);

    this.pFrames = new (class extends RefCountResourcePool<InternalPFrameData, PFrameHolder> {
      constructor(
        private readonly blobDriver: DownloadDriver,
        private readonly logger: MiLogger,
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
          logger.info(
            `PFrame creation (pFrameHandle = ${this.calculateParamsKey(params)}): ${JSON.stringify(params, bigintReplacer)}`,
          );
        return new PFrameHolder(this.blobDriver, this.logger, this.spillPath, params);
      }

      protected calculateParamsKey(params: InternalPFrameData): string {
        try {
          return stableKeyFromPFrameData(params);
        } catch (err: unknown) {
          if (isPFrameDriverError(err)) throw err;
          throw new PFrameDriverError(`PFrame handle calculation failed, request: ${JSON.stringify(params, bigintReplacer)}, error: ${ensureError(err)}`);
        }
      }
    })(this.blobDriver, this.logger, this.spillPath);

    this.pTables = new (class extends RefCountResourcePool<
      FullPTableDef,
      PTableHolder
    > {
      constructor(
        private readonly pFrames: RefCountResourcePool<InternalPFrameData, PFrameHolder>,
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
          logger.info(
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
    })(this.pFrames);
  }

  //
  // Internal / Config API Methods
  //

  public createPFrame(
    def: PFrameDef<PColumnDataUniversal>,
    ctx: ComputableCtx,
  ): PFrameHandle {
    const internalData = def
      .filter((c) => valueTypes.find((t) => t === c.spec.valueType))
      .map((c) =>
        mapPObjectData(c, (d) =>
          isPlTreeNodeAccessor(d)
            ? parseDataInfoResource(d)
            : isDataInfo(d)
              ? mapDataInfo(d, (a) => a.resourceInfo)
              : makeDataInfoFromPColumnValues(c.spec, d),
        ),
      );
    const res = this.pFrames.acquire(internalData);
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
      this.logger.info(
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
      this.logger.info(
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

        const size = await pTable.getFootprint({
          withPredecessors: true,
          signal: combinedSignal,
        });
        this.pTableCache.cache(table, size);

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
      this.logger.info(
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
  switch (entry.type) {
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
      assertNever(entry);
  }
}

function stableKeyFromFullPTableDef(data: FullPTableDef): string {
  const hash = createHash('sha256');
  hash.update(canonicalize(data)!);
  return hash.digest().toString('hex');
}

function stableKeyFromPFrameData(data: PColumn<DataInfo<ResourceInfo>>[]): string { // TODO: PFrameInternal.DataInfo<ResourceInfo>
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
              value: blobKey(info),
            })),
          };
          break;
        case 'BinaryPartitioned':
          result = {
            type: r.type,
            keyLength: r.partitionKeyLength,
            payload: Object.entries(r.parts).map(([part, info]) => ({
              key: part,
              value: [blobKey(info.index), blobKey(info.values)] as const,
            })),
          };
          break;
        case 'ParquetPartitioned':
          throw new PFrameDriverError(`unsupported resource type: ${JSON.stringify(type)}`); // TODO: remove
          // result = {
          //   type: r.type,
          //   keyLength: r.partitionKeyLength,
          //   payload: Object.entries(r.parts).map(([part, info]) => ({
          //     key: part,
          //     value: info.dataDigest || [
          //       blobKey(info.data),
          //       JSON.stringify({ axes: info.axes, column: info.column }),
          //     ] as const,
          //   })),
          // };
          // break;
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
