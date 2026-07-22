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
  PFrameDriverError,
  XLSX_MAX_ROWS_PER_SHEET,
} from "@milaboratories/pl-model-common";
import type { PFrameInternal } from "@milaboratories/pl-model-middle-layer";
import {
  ConcurrencyLimitingExecutor,
  createPathAtomically,
  type MiLogger,
} from "@milaboratories/ts-helpers";
import { isNil, PoolEntryGuard, type PoolEntry } from "@milaboratories/helpers";
import { PFrameFactory } from "@milaboratories/pframes-rs-node";
import { expandAxes, findTableColumn, rewriteLegacyFilters } from "@milaboratories/pframes-rs-wasm";
import { tmpdir } from "node:os";
import * as fs from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as zlib from "node:zlib";
import { getNativeColumnLabel, streamPTableRows } from "./csv_writer";
import type {
  AbstractInternalPFrameDriver,
  WritePTableToFsOptions,
  WritePTableToFsResult,
  ExportPTableOptions,
} from "./driver_decl";
import { logPFrames } from "./logging";
import {
  PFramePool,
  type LocalBlobProvider as PoolLocalBlobProvider,
  type RemoteBlobProvider as PoolRemoteBlobProvider,
} from "./pframe_pool";
import { PTableDefPool } from "./ptable_def_pool";
import { PTablePool } from "./ptable_pool";
import { embedInlineColumnTypeSpecs } from "./ptable_shared";
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

export interface LocalBlobProvider<TreeEntry extends JsonSerializable>
  extends PoolLocalBlobProvider<TreeEntry>, AsyncDisposable {}

export interface RemoteBlobProvider<TreeEntry extends JsonSerializable>
  extends PoolRemoteBlobProvider<TreeEntry>, AsyncDisposable {
  getCacheMetrics(): Promise<PFrameInternal.CacheMetrics | null>;
  resetCache(): Promise<void>;
}

export type AbstractPFrameDriverOps = PTableCachePerFrameOps &
  PTableCachePlainOps & {
    /** Concurrency limits for `getUniqueValues` and `calculateTableData` requests */
    pFrameConcurrency: number;
    /** Concurrency limits for `getShape` and `getData` requests */
    pTableConcurrency: number;
  };

export const AbstractPFrameDriverOpsDefaults: AbstractPFrameDriverOps = {
  ...PTableCachePerFrameOpsDefaults,
  ...PTableCachePlainOpsDefaults,
  pFrameConcurrency: 1, // 1 join is executed in parallel and utilize all RAM and CPU cores
  pTableConcurrency: 1, // 1 joined table is read from disk at a time, which matches 1 table the user can view in the UI
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

  public async pprofDump(): Promise<Uint8Array> {
    return await PFrameFactory.pprofDump();
  }

  public async getCacheMetrics(): Promise<PFrameInternal.CacheMetrics | null> {
    return await this.remoteBlobProvider.getCacheMetrics();
  }

  public async resetCache(): Promise<void> {
    await this.remoteBlobProvider.resetCache();
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
    const columns = uniqueBy(extractAllColumns(rawDef.src), (c) => c.id);
    using pFrameGuard = new PoolEntryGuard(this.createPFrame(columns));
    const sortedDef = sortPTableDef(
      migrateTableFilter(
        mapPTableDef(rawDef, (c) => c.id),
        this.logger,
      ),
    );
    const pFrameSpec = this.pFrames.getByKey(pFrameGuard.key).pFrameSpec;
    using pTableGuard = new PoolEntryGuard(
      this.pTableDefs.acquireFromLegacy({
        pFrameHandle: pFrameGuard.key,
        def: sortedDef,
        pFrameSpec,
      }).entry,
    );
    if (logPFrames()) {
      this.logger(
        "info",
        `Create PTable call (pFrameHandle = ${pFrameGuard.key}; pTableHandle = ${pTableGuard.key})`,
      );
    }

    const pFrameEntry = pFrameGuard.keep();
    const pTableEntry = pTableGuard.keep();
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
    using pFrameGuard = new PoolEntryGuard(this.createPFrame(columns));
    const pFrameSpec = this.pFrames.getByKey(pFrameGuard.key).pFrameSpec;
    const sortedQuery = sortSpecQuery(mapSpecQueryColumns(def.query, { column: (c) => c.id }));
    const { tableSpec, dataQuery } = pFrameSpec.evaluateQuery(
      embedInlineColumnTypeSpecs(sortedQuery),
    );

    using pTableGuard = new PoolEntryGuard(
      this.pTableDefs.acquire({
        pFrameHandle: pFrameGuard.key,
        tableSpec,
        dataQuery,
      }),
    );
    if (logPFrames()) {
      this.logger(
        "info",
        `Create PTable call (pFrameHandle = ${pFrameGuard.key}; pTableHandle = ${pTableGuard.key})`,
      );
    }

    const pFrameEntry = pFrameGuard.keep();
    const pTableEntry = pTableGuard.keep();
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

  public async writePTableToFs(
    handle: PTableHandle,
    options: WritePTableToFsOptions,
  ): Promise<WritePTableToFsResult> {
    this.logger(
      "info",
      `[WritePTableToFs] ENTER (handle = ${handle}, path = ${options.path}, format = ${options.format}, compression = ${options.compression ?? "auto"}, columns = ${options.columnIndices.length})`,
    );
    const startTime = performance.now();
    const { def, disposeSignal: defDisposeSignal } = this.pTableDefs.getByKey(handle);
    using tableGuard = new PoolEntryGuard(this.pTables.acquire(def));
    const { pTablePromise, disposeSignal } = tableGuard.resource;
    const pTable = await pTablePromise;

    // Caller-supplied header names win (they carry the disambiguated labels the
    // UI shows); a missing or empty name falls back to the spec-derived label.
    const { columnIndices } = options;
    const headerNames = columnIndices.map((index, i) => {
      const name = options.headerNames?.[i];
      return name !== undefined && name !== "" ? name : getNativeColumnLabel(def.tableSpec[index]);
    });

    const combinedSignal = AbortSignal.any(
      [options.signal, disposeSignal].filter((s): s is AbortSignal => !isNil(s)),
    );

    // `combinedSignal` is passed twice on purpose: into the native calls for cooperative
    // cancellation, and into `run` so the concurrency slot is released on abort even if a
    // native call fails to unwind. Dropping the `run` signal reintroduces the queue wedge.
    // keep()/cache live outside the limiter task: on abort `run` rejects and they are
    // skipped, so an abandoned (detached) operation never caches its result nor touches
    // `tableGuard` after the `using` block has already unref'd it.
    const { result, overallSize } = await this.tableConcurrencyLimiter.run(async () => {
      const shape = await pTable.getShape({ signal: combinedSignal });
      const clippedRange = clipRange(options.range, shape);
      const specs = def.tableSpec;
      const separator = options.format === "tsv" ? "\t" : ",";

      const iterable = streamPTableRows({
        pTable,
        specs,
        columnIndices,
        headerNames,
        range: clippedRange,
        chunkSize: options.chunkSize ?? 50_000,
        separator,
        includeHeader: options.includeHeader ?? true,
        bom: options.bom ?? true,
        signal: combinedSignal,
      });

      const miLogger: MiLogger = {
        info: (msg) => this.logger("info", String(msg)),
        warn: (msg) => this.logger("warn", String(msg)),
        error: (msg) => this.logger("error", String(msg)),
      };

      let bytesWritten = 0;
      await createPathAtomically(miLogger, options.path, async (tempPath) => {
        const writeStream = fs.createWriteStream(tempPath, { flags: "wx" });
        const source = Readable.from(iterable, { objectMode: false });
        if (options.compression?.type === "gzip") {
          const gzip = zlib.createGzip({ level: options.compression.level ?? 6 });
          await pipeline(source, gzip, writeStream, { signal: combinedSignal });
        } else {
          await pipeline(source, writeStream, { signal: combinedSignal });
        }
        bytesWritten = writeStream.bytesWritten;
      });

      const overallSize = await tableGuard.resource.cacheSize;

      // rowsWritten equals the clipped range length — the generator streams the
      // entire effective range without early termination, so this is accurate.
      const rowsWritten = clippedRange.length;

      if (logPFrames()) {
        const durationMs = Math.round(performance.now() - startTime);
        this.logger(
          "info",
          `[WritePTableToFs] complete (handle = ${handle}, columns = ${columnIndices.length}, rows = ${rowsWritten}, bytes = ${bytesWritten}, duration = ${durationMs}ms)`,
        );
      }

      return { result: { path: options.path, rowsWritten, bytesWritten }, overallSize };
    }, combinedSignal);

    this.pTableCachePlain.cache(tableGuard.keep(), overallSize, defDisposeSignal);
    return result;
  }

  public async exportPTable(
    handle: PTableHandle,
    options: ExportPTableOptions,
    signal?: AbortSignal,
  ): Promise<void> {
    const { path, columnIndices } = options;

    this.logger("info", `[ExportPTable] ENTER (handle = ${handle}, path = ${path})`);
    const startTime = performance.now();

    const { def, disposeSignal: defDisposeSignal } = this.pTableDefs.getByKey(handle);
    using tableGuard = new PoolEntryGuard(this.pTables.acquire(def));
    const { pTablePromise, disposeSignal } = tableGuard.resource;
    const pTable = await pTablePromise;

    const combinedSignal = AbortSignal.any(
      [signal, disposeSignal].filter((s): s is AbortSignal => !isNil(s)),
    );

    // Caller-supplied header names win (they carry the disambiguated labels the
    // UI shows); a missing or empty name falls back to the spec-derived label.
    const headers: [number, string][] = columnIndices.map((index, i): [number, string] => {
      const name = options.headerNames?.[i];
      return [
        index,
        name !== undefined && name !== "" ? name : getNativeColumnLabel(def.tableSpec[index]),
      ];
    });

    // keep()/cache live outside the limiter task: on abort `run` rejects and they are
    // skipped, so an abandoned (detached) operation never caches its result nor touches
    // `tableGuard` after the `using` block has already unref'd it.
    const overallSize = await this.tableConcurrencyLimiter.run(async () => {
      // Cap data rows per xlsx sheet below Excel's hard limit of 1,048,576.
      if (path.toLowerCase().endsWith(".xlsx")) {
        const shape = await pTable.getShape({ signal: combinedSignal });
        if (shape.rows > XLSX_MAX_ROWS_PER_SHEET) {
          const error = new PFrameDriverError(`exportPTable failed`);
          error.cause = new Error(
            `xlsx export rejected: ${shape.rows} rows exceed the per-sheet ` +
              `limit of ${XLSX_MAX_ROWS_PER_SHEET} rows`,
          );
          throw error;
        }
      }

      await pTable.export(path, { headers, signal: combinedSignal });

      const overallSize = await tableGuard.resource.cacheSize;

      if (logPFrames()) {
        const durationMs = Math.round(performance.now() - startTime);
        this.logger(
          "info",
          `[ExportPTable] complete (handle = ${handle}, path = ${path}), ` +
            `duration = ${durationMs}ms`,
        );
      }

      return overallSize;
    }, combinedSignal);

    this.pTableCachePlain.cache(tableGuard.keep(), overallSize, defDisposeSignal);
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

    const { pFrameSpec } = this.pFrames.getByKey(handle);
    const response = pFrameSpec.findColumns(iRequest);
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
    const { columnSpecs } = this.pFrames.getByKey(handle);
    return columnSpecs[columnId] ?? null;
  }

  public async listColumns(handle: PFrameHandle): Promise<PColumnIdAndSpec[]> {
    const { pFrameSpec } = this.pFrames.getByKey(handle);
    return pFrameSpec.listColumns().map(({ columnId, spec }) => ({ columnId, spec }));
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

    const { pFrameSpec } = this.pFrames.getByKey(handle);
    const sortedDef = sortPTableDef(migrateTableFilter(request, this.logger));
    const { def, entry } = this.pTables.acquireFromLegacy({
      pFrameHandle: handle,
      def: sortedDef,
      pFrameSpec,
    });
    using tableGuard = new PoolEntryGuard(entry);
    const tableSpec = def.tableSpec;
    const { pTablePromise, disposeSignal } = tableGuard.resource;
    const pTable = await pTablePromise;

    const combinedSignal = AbortSignal.any([signal, disposeSignal].filter((s) => !!s));
    // keep()/cache live outside the limiter task: on abort `run` rejects and they are
    // skipped, so an abandoned (detached) operation never caches its result nor touches
    // `tableGuard` after the `using` block has already unref'd it.
    const { data, overallSize } = await this.frameConcurrencyLimiter.run(async () => {
      // TODO: throw error when more then 200k rows is requested
      // after pf-plots migration to stream API

      const data = await pTable.getData([...tableSpec.keys()], {
        range,
        signal: combinedSignal,
      });

      const overallSize = await tableGuard.resource.cacheSize;
      return { data, overallSize };
    }, combinedSignal);

    this.pTableCachePerFrame.cache(tableGuard.keep(), overallSize);
    return tableSpec.map((spec, i) => ({
      spec: spec,
      data: data[i],
    }));
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

    const { pFrameDataPromise, columnSpecs, disposeSignal } = this.pFrames.getByKey(handle);
    const pFrameData = await pFrameDataPromise;

    const columnSpec = columnSpecs[request.columnId];
    if (!columnSpec) {
      const error = new PFrameDriverError(`getUniqueValues failed`);
      error.cause = new Error(`column ${request.columnId} is not registered in the PFrame`);
      throw error;
    }

    const axisIds = expandAxes(columnSpec.axesSpec);
    const tableSpec: PTableColumnSpec[] = [
      ...columnSpec.axesSpec.map(
        (axisSpec, i): PTableColumnSpec => ({
          type: "axis",
          id: axisIds[i],
          spec: axisSpec,
        }),
      ),
      { type: "column", id: request.columnId, spec: columnSpec },
    ];

    let axisIndex: number | undefined;
    if (request.axis !== undefined) {
      const index = findTableColumn(tableSpec, { type: "axis", id: request.axis });
      if (index < 0) {
        const error = new PFrameDriverError(`getUniqueValues failed`);
        error.cause = new Error(
          `axis ${JSON.stringify(request.axis)} not found among axes of column ${request.columnId}`,
        );
        throw error;
      }
      axisIndex = index;
    }

    const resolvedRequest: PFrameInternal.UniqueValuesRequestV2 = {
      columnId: request.columnId,
      axisIndex,
      filters: rewriteLegacyFilters({
        tableSpec,
        filters: migrateFilters(request.filters, this.logger),
      }),
      limit: request.limit,
    };

    const combinedSignal = AbortSignal.any([signal, disposeSignal].filter((s) => !!s));
    return await this.frameConcurrencyLimiter.run(async () => {
      return await pFrameData.getUniqueValues(resolvedRequest, { signal: combinedSignal });
    }, combinedSignal);
  }

  //
  // PTable instance methods
  //

  public async getSpec(handle: PTableHandle): Promise<PTableColumnSpec[]> {
    const { def } = this.pTableDefs.getByKey(handle);
    return def.tableSpec;
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

      const overallSize = await tableGuard.resource.cacheSize;

      return { shape, overallSize };
    }, combinedSignal);

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

      const overallSize = await tableGuard.resource.cacheSize;

      return { data, overallSize };
    }, combinedSignal);

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
