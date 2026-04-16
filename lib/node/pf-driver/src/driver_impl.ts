import {
  mapPObjectData,
  mapPTableDef,
  extractAllColumns,
  uniqueBy,
  canonicalizeJson,
  bigintReplacer,
  ValueType,
  type CalculateTableDataRequest,
  type CalculateTableDataResponse,
  type DownloadPTableOptions,
  type DownloadPTableResult,
  type FindColumnsRequest,
  type FindColumnsResponse,
  type PColumnIdAndSpec,
  type PColumnSpec,
  type PFrameHandle,
  type PObjectId,
  type PTableColumnSpec,
  type PTableHandle,
  type PTableShape,
  type PTableVector,
  type TableRange,
  type UniqueValuesRequest,
  type UniqueValuesResponse,
  type PColumn,
  type PFrameDef,
  type PTableDef,
  type PTableRecordSingleValueFilterV2,
  type PTableRecordFilter,
  type JsonSerializable,
  type PTableDefV2,
  mapSpecQueryColumns,
  collectSpecQueryColumns,
  sortSpecQuery,
  sortPTableDef,
  resolveAnnotationParents,
} from "@milaboratories/pl-model-common";
import type { PFrameInternal } from "@milaboratories/pl-model-middle-layer";
import { ConcurrencyLimitingExecutor } from "@milaboratories/ts-helpers";
import { isNil, PoolEntryGuard, type PoolEntry } from "@milaboratories/helpers";
import { PFrameFactory } from "@milaboratories/pframes-rs-node";
import { tmpdir } from "node:os";
import * as fs from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { streamPTableRows } from "./csv_writer";
import type { AbstractInternalPFrameDriver } from "./driver_decl";
import { logPFrames } from "./logging";
import {
  PFramePool,
  type LocalBlobProvider as PoolLocalBlobProvider,
  type RemoteBlobProvider as PoolRemoteBlobProvider,
} from "./pframe_pool";
import { PTableDefPool } from "./ptable_def_pool";
import { PTablePool } from "./ptable_pool";
import {
  PTableCachePerFrame,
  PTableCachePerFrameOpsDefaults,
  type PTableCachePerFrameOps,
} from "./ptable_cache_per_frame";
import {
  PTableCachePlain,
  PTableCachePlainOpsDefaults,
  type PTableCachePlainOps,
} from "./ptable_cache_plain";
import { createPFrame as createSpecFrame } from "@milaboratories/pframes-rs-wasm";

export interface LocalBlobProvider<TreeEntry extends JsonSerializable>
  extends PoolLocalBlobProvider<TreeEntry>, AsyncDisposable {}

export interface RemoteBlobProvider<TreeEntry extends JsonSerializable>
  extends PoolRemoteBlobProvider<TreeEntry>, AsyncDisposable {}

export type AbstractPFrameDriverOps = PTableCachePerFrameOps &
  PTableCachePlainOps & {
    /** Concurrency limits for `getUniqueValues` and `calculateTableData` requests */
    pFrameConcurrency: number;
    /** Concurrency limits for `getShape` and `getData` requests */
    pTableConcurrency: number;
    /** Concurrency limits for `downloadPTable` requests (disk IO bound, serialize to avoid UI starvation) */
    pTableDownloadConcurrency: number;
  };

export const AbstractPFrameDriverOpsDefaults: AbstractPFrameDriverOps = {
  ...PTableCachePerFrameOpsDefaults,
  ...PTableCachePlainOpsDefaults,
  pFrameConcurrency: 1, // 1 join is executed in parallel and utilize all RAM and CPU cores
  pTableConcurrency: 1, // 1 joined table is read from disk at a time, which matches 1 table the user can view in the UI
  pTableDownloadConcurrency: 1, // serialize downloads — disk IO bound, prevents UI starvation
};

export type DataInfoResolver<PColumnData, TreeEntry extends JsonSerializable> = (
  spec: PColumnSpec,
  data: PColumnData,
) => PFrameInternal.DataInfo<TreeEntry>;

export class AbstractPFrameDriver<
  PColumnData,
  TreeEntry extends JsonSerializable,
> implements AbstractInternalPFrameDriver<PColumnData> {
  private readonly logger: PFrameInternal.Logger;

  private readonly localBlobProvider: LocalBlobProvider<TreeEntry>;
  private readonly remoteBlobProvider: RemoteBlobProvider<TreeEntry>;

  private readonly resolveDataInfo: DataInfoResolver<PColumnData, TreeEntry>;

  private readonly pFrames: PFramePool<TreeEntry>;
  private readonly pTableDefs: PTableDefPool;
  private readonly pTables: PTablePool<TreeEntry>;

  private readonly pTableCachePerFrame: PTableCachePerFrame;
  private readonly pTableCachePlain: PTableCachePlain;

  private readonly frameConcurrencyLimiter: ConcurrencyLimitingExecutor;
  private readonly tableConcurrencyLimiter: ConcurrencyLimitingExecutor;
  private readonly downloadConcurrencyLimiter: ConcurrencyLimitingExecutor;

  public async pprofDump(): Promise<Uint8Array> {
    return await PFrameFactory.pprofDump();
  }

  public constructor({
    logger = () => {},
    localBlobProvider,
    remoteBlobProvider,
    spillPath = tmpdir(),
    options = AbstractPFrameDriverOpsDefaults,
    resolveDataInfo,
  }: {
    logger?: PFrameInternal.Logger;
    localBlobProvider: LocalBlobProvider<TreeEntry>;
    remoteBlobProvider: RemoteBlobProvider<TreeEntry>;
    spillPath?: string;
    options?: AbstractPFrameDriverOps;
    resolveDataInfo: DataInfoResolver<PColumnData, TreeEntry>;
  }) {
    this.logger = logger;

    this.localBlobProvider = localBlobProvider;
    this.remoteBlobProvider = remoteBlobProvider;

    this.resolveDataInfo = resolveDataInfo;

    this.frameConcurrencyLimiter = new ConcurrencyLimitingExecutor(options.pFrameConcurrency);
    this.tableConcurrencyLimiter = new ConcurrencyLimitingExecutor(options.pTableConcurrency);
    this.downloadConcurrencyLimiter = new ConcurrencyLimitingExecutor(
      options.pTableDownloadConcurrency,
    );

    this.pFrames = new PFramePool(
      this.localBlobProvider,
      this.remoteBlobProvider,
      this.logger,
      spillPath,
    );
    this.pTableDefs = new PTableDefPool(this.logger);
    this.pTables = new PTablePool(this.pFrames, this.pTableDefs, this.logger);

    this.pTableCachePerFrame = new PTableCachePerFrame(this.logger, options);
    this.pTableCachePlain = new PTableCachePlain(this.logger, options);
  }

  async dispose(): Promise<void> {
    void (await Promise.allSettled([
      this.pTables[Symbol.asyncDispose](),
      this.pTableDefs[Symbol.asyncDispose](),
      this.pFrames[Symbol.asyncDispose](),
      this.localBlobProvider[Symbol.asyncDispose](),
      this.remoteBlobProvider[Symbol.asyncDispose](),
    ]));
  }

  async [Symbol.asyncDispose](): Promise<void> {
    return await this.dispose();
  }

  //
  // Internal / Config API Methods
  //

  public createPFrame(def: PFrameDef<PColumn<PColumnData>>): PoolEntry<PFrameHandle> {
    const ValueTypes = new Set(Object.values(ValueType));
    const supportedColumns = def
      .filter((column) => ValueTypes.has(column.spec.valueType))
      .map((c) => ({ ...c, spec: resolveAnnotationParents(c.spec) }));
    const uniqueColumns = uniqueBy(supportedColumns, (column) => column.id);
    const columns = uniqueColumns.map((c) =>
      mapPObjectData(c, (d) => this.resolveDataInfo(c.spec, d)),
    );

    return this.pFrames.acquire(columns);
  }

  public createPTable(rawDef: PTableDef<PColumn<PColumnData>>): PoolEntry<PTableHandle> {
    using pFrameGuard = new PoolEntryGuard(this.createPFrame(extractAllColumns(rawDef.src)));
    const sortedDef = sortPTableDef(
      migrateTableFilter(
        mapPTableDef(rawDef, (c) => c.id),
        this.logger,
      ),
    );
    const pTableEntry = this.pTableDefs.acquire({
      type: "v1",
      def: sortedDef,
      pFrameHandle: pFrameGuard.key,
    });
    if (logPFrames()) {
      this.logger(
        "info",
        `Create PTable call (pFrameHandle = ${pFrameGuard.key}; pTableHandle = ${pTableEntry.key})`,
      );
    }

    const pFrameEntry = pFrameGuard.keep();
    const unref = () => {
      pTableEntry.unref();
      pFrameEntry.unref();
    };
    return {
      key: pTableEntry.key,
      resource: pTableEntry.resource,
      unref,
      [Symbol.dispose]: unref,
    };
  }

  public createPTableV2(def: PTableDefV2<PColumn<PColumnData>>): PoolEntry<PTableHandle> {
    const columns = uniqueBy(collectSpecQueryColumns(def.query), (c) => c.id);
    const columnsMap = columns.reduce(
      (acc, col) => ((acc[col.id] = col.spec), acc),
      {} as Record<string, PColumnSpec>,
    );

    using pFrameGuard = new PoolEntryGuard(this.createPFrame(columns));
    const ValueTypes = new Set(Object.values(ValueType));
    const specColumnsMap = Object.fromEntries(
      Object.entries(columnsMap)
        .filter(([, spec]) => ValueTypes.has(spec.valueType))
        .map(([id, spec]) => [id, resolveAnnotationParents(spec)]),
    );
    const specFrame = createSpecFrame(specColumnsMap);
    const sortedQuery = sortSpecQuery(mapSpecQueryColumns(def.query, (c) => c.id));
    const { tableSpec, dataQuery } = specFrame.evaluateQuery(sortedQuery);

    const pTableEntry = this.pTableDefs.acquire({
      type: "v2",
      pFrameHandle: pFrameGuard.key,
      def: {
        tableSpec,
        dataQuery,
      },
    });
    if (logPFrames()) {
      this.logger(
        "info",
        `Create PTable call (pFrameHandle = ${pFrameGuard.key}; pTableHandle = ${pTableEntry.key})`,
      );
    }

    const pFrameEntry = pFrameGuard.keep();
    const unref = () => {
      pTableEntry.unref();
      pFrameEntry.unref();
    };
    return {
      key: pTableEntry.key,
      resource: pTableEntry.resource,
      unref,
      [Symbol.dispose]: unref,
    };
  }

  public async downloadPTable(
    handle: PTableHandle,
    options: DownloadPTableOptions,
  ): Promise<DownloadPTableResult> {
    this.logger(
      "info",
      `[downloadPTable] ENTER (handle = ${handle}, path = ${options.path}, format = ${options.format}, columns = ${options.columnIndices.length})`,
    );
    const startTime = performance.now();
    const { def, disposeSignal: defDisposeSignal } = this.pTableDefs.getByKey(handle);
    using tableGuard = new PoolEntryGuard(this.pTables.acquire(def));
    const { pTablePromise, disposeSignal } = tableGuard.resource;
    const pTable = await pTablePromise;

    const combinedSignal = AbortSignal.any(
      [options.signal, disposeSignal].filter((s): s is AbortSignal => !isNil(s)),
    );

    return await this.downloadConcurrencyLimiter.run(async () => {
      const shape = await pTable.getShape({ signal: combinedSignal });
      const effectiveRange = clipRange(options.range, shape);
      const specs = pTable.getSpec();
      const separator = options.format === "tsv" ? "\t" : ",";

      const partPath = options.path + ".part";
      const writeStream = fs.createWriteStream(partPath, { flags: "w" });
      const iterable = streamPTableRows(
        pTable,
        options.columnIndices,
        effectiveRange,
        options.chunkSize ?? 50_000,
        separator,
        combinedSignal,
        specs,
        options.includeHeader ?? true,
        options.bom ?? false,
      );

      try {
        await pipeline(Readable.from(iterable, { objectMode: false }), writeStream, {
          signal: combinedSignal,
        });
        await fs.promises.rename(partPath, options.path);
      } catch (error) {
        await fs.promises.unlink(partPath).catch(() => {});
        throw error;
      }

      const overallSize = await pTable.getFootprint({ signal: combinedSignal });
      this.pTableCachePlain.cache(tableGuard.keep(), overallSize, defDisposeSignal);

      // rowsWritten equals the clipped range length — the generator streams the
      // entire effective range without early termination, so this is accurate.
      const rowsWritten = effectiveRange.length;

      if (logPFrames()) {
        const durationMs = Math.round(performance.now() - startTime);
        this.logger(
          "info",
          `downloadPTable complete (handle = ${handle}, columns = ${options.columnIndices.length}, rows = ${rowsWritten}, bytes = ${writeStream.bytesWritten}, duration = ${durationMs}ms)`,
        );
      }

      return { path: options.path, rowsWritten, bytesWritten: writeStream.bytesWritten };
    });
  }

  //
  // PFrame instance methods
  //

  public async findColumns(
    handle: PFrameHandle,
    request: FindColumnsRequest,
  ): Promise<FindColumnsResponse> {
    const iRequest: PFrameInternal.FindColumnsRequest = {
      ...request,
      compatibleWith:
        request.compatibleWith.length !== 0
          ? [
              {
                axesSpec: [
                  ...new Map(
                    request.compatibleWith.map((item) => [canonicalizeJson(item), item] as const),
                  ).values(),
                ],
                qualifications: [],
              },
            ]
          : [],
    };

    const { pFramePromise } = this.pFrames.getByKey(handle);
    const pFrame = await pFramePromise;

    const response = await pFrame.findColumns(iRequest);
    return {
      hits: response.hits
        .filter(
          (h) =>
            // only exactly matching columns
            h.mappingVariants.length === 0 ||
            h.mappingVariants.some(
              (v) =>
                v.qualifications.forHit.length === 0 &&
                v.qualifications.forQueries.every((q) => q.length === 0),
            ),
        )
        .map((h) => h.hit),
    };
  }

  public async getColumnSpec(
    handle: PFrameHandle,
    columnId: PObjectId,
  ): Promise<PColumnSpec | null> {
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
    if (logPFrames()) {
      this.logger(
        "info",
        `Call calculateTableData, handle = ${handle}, request = ${JSON.stringify(request, bigintReplacer)}`,
      );
    }

    using tableGuard = new PoolEntryGuard(
      this.pTables.acquire({
        type: "v1",
        pFrameHandle: handle,
        def: sortPTableDef(migrateTableFilter(request, this.logger)),
      }),
    );
    const { pTablePromise, disposeSignal } = tableGuard.resource;
    const pTable = await pTablePromise;

    const combinedSignal = AbortSignal.any([signal, disposeSignal].filter((s) => !!s));
    return await this.frameConcurrencyLimiter.run(async () => {
      // TODO: throw error when more then 150k rows is requested
      // after pf-plots migration to stream API

      const spec = pTable.getSpec();
      const data = await pTable.getData([...spec.keys()], {
        range,
        signal: combinedSignal,
      });

      const overallSize = await pTable.getFootprint({
        signal: combinedSignal,
      });
      this.pTableCachePerFrame.cache(tableGuard.keep(), overallSize);

      return spec.map((spec, i) => ({
        spec: spec,
        data: data[i],
      }));
    });
  }

  public async getUniqueValues(
    handle: PFrameHandle,
    request: UniqueValuesRequest,
    signal?: AbortSignal,
  ): Promise<UniqueValuesResponse> {
    if (logPFrames()) {
      this.logger(
        "info",
        `Call getUniqueValues, handle = ${handle}, request = ${JSON.stringify(request, bigintReplacer)}`,
      );
    }

    const { pFramePromise, disposeSignal } = this.pFrames.getByKey(handle);
    const pFrame = await pFramePromise;

    const combinedSignal = AbortSignal.any([signal, disposeSignal].filter((s) => !!s));
    return await this.frameConcurrencyLimiter.run(async () => {
      return await pFrame.getUniqueValues(
        {
          ...request,
          filters: migrateFilters(request.filters, this.logger),
        },
        {
          signal: combinedSignal,
        },
      );
    });
  }

  //
  // PTable instance methods
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
    using tableGuard = new PoolEntryGuard(this.pTables.acquire(def));

    const { pTablePromise, disposeSignal } = tableGuard.resource;
    const pTable = await pTablePromise;

    const combinedSignal = AbortSignal.any([signal, disposeSignal].filter((s) => !!s));
    const { shape, overallSize } = await this.tableConcurrencyLimiter.run(async () => {
      const shape = await pTable.getShape({
        signal: combinedSignal,
      });

      const overallSize = await pTable.getFootprint({
        signal: combinedSignal,
      });

      return { shape, overallSize };
    });

    this.pTableCachePlain.cache(tableGuard.keep(), overallSize, defDisposeSignal);
    return shape;
  }

  public async getData(
    handle: PTableHandle,
    columnIndices: number[],
    range: TableRange | undefined,
    signal?: AbortSignal,
  ): Promise<PTableVector[]> {
    const { def, disposeSignal: defDisposeSignal } = this.pTableDefs.getByKey(handle);
    using tableGuard = new PoolEntryGuard(this.pTables.acquire(def));

    const { pTablePromise, disposeSignal } = tableGuard.resource;
    const pTable = await pTablePromise;

    const combinedSignal = AbortSignal.any([signal, disposeSignal].filter((s) => !!s));
    const { data, overallSize } = await this.tableConcurrencyLimiter.run(async () => {
      const data = await pTable.getData(columnIndices, {
        range,
        signal: combinedSignal,
      });

      const overallSize = await pTable.getFootprint({
        signal: combinedSignal,
      });

      return { data, overallSize };
    });

    this.pTableCachePlain.cache(tableGuard.keep(), overallSize, defDisposeSignal);
    return data;
  }
}

/** Clamp range to table shape. When range is undefined, returns full table range. */
function clipRange(range: undefined | TableRange, shape: PTableShape): TableRange {
  if (isNil(range)) {
    return { offset: 0, length: shape.rows };
  }
  const clampedOffset = Math.min(range.offset, shape.rows);
  const clampedLength = Math.min(range.length, shape.rows - clampedOffset);
  return { offset: clampedOffset, length: clampedLength };
}

function migrateFilters(
  filters: PTableRecordFilter[],
  logger: PFrameInternal.Logger,
): PTableRecordFilter[] {
  const filtersV1 = [];
  const filtersV2: PTableRecordSingleValueFilterV2[] = [];
  for (const filter of filters) {
    if ((filter.type as unknown) === "bySingleColumn") {
      filtersV1.push(filter);
      filtersV2.push({
        ...filter,
        type: "bySingleColumnV2",
      });
    } else {
      filtersV2.push(filter);
    }
  }
  if (filtersV1.length > 0) {
    const filtersV1Json = JSON.stringify(filtersV1);
    logger(
      "warn",
      `type overwritten from 'bySingleColumn' to 'bySingleColumnV2' for filters: ${filtersV1Json}`,
    );
  }
  return filtersV2;
}

function migrateTableFilter<T>(
  def: Omit<PTableDef<T>, "partitionFilters"> | PTableDef<T>,
  logger: PFrameInternal.Logger,
): PTableDef<T> {
  if (!("partitionFilters" in def)) {
    // For old blocks assume all axes filters to be partition filters
    return {
      ...def,
      partitionFilters: migrateFilters(
        def.filters.filter((f) => f.column.type === "axis"),
        logger,
      ),
      filters: migrateFilters(
        def.filters.filter((f) => f.column.type === "column"),
        logger,
      ),
    };
  }
  return {
    ...def,
    partitionFilters: migrateFilters(def.partitionFilters, logger),
    filters: migrateFilters(def.filters, logger),
  };
}
