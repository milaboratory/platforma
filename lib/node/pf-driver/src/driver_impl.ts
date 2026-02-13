import {
  mapPObjectData,
  mapPTableDef,
  mapJoinEntry,
  extractAllColumns,
  uniqueBy,
  getAxisId,
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
  type JoinEntry,
  type PTableDef,
  type PTableRecordSingleValueFilterV2,
  type PTableRecordFilter,
  type JsonSerializable,
  type PTableDefV2,
  type FilterSpec,
  type FilterSpecLeaf,
  type PTableColumnId,
  type SingleAxisSelector,
  type QuerySpec,
  type QueryExpressionSpec,
  type QueryBooleanExpressionSpec,
} from "@platforma-sdk/model";
import type { PFrameInternal } from "@milaboratories/pl-model-middle-layer";
import {
  assertNever,
  ConcurrencyLimitingExecutor,
  type PoolEntry,
} from "@milaboratories/ts-helpers";
import { PFrameFactory } from "@milaboratories/pframes-rs-node";
import { tmpdir } from "node:os";
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

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface LocalBlobProvider<
  TreeEntry extends JsonSerializable,
> extends PoolLocalBlobProvider<TreeEntry> {}

export interface RemoteBlobProvider<TreeEntry extends JsonSerializable>
  extends PoolRemoteBlobProvider<TreeEntry>, AsyncDisposable {}

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
    return await this.remoteBlobProvider[Symbol.asyncDispose]();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    return await this.dispose();
  }

  //
  // Internal / Config API Methods
  //

  public createPFrame(def: PFrameDef<PColumn<PColumnData>>): PoolEntry<PFrameHandle> {
    const ValueTypes = new Set(Object.values(ValueType));

    const supportedColumns = def.filter((column) => ValueTypes.has(column.spec.valueType));
    const uniqueColumns = uniqueBy(supportedColumns, (column) => column.id);
    const columns = uniqueColumns.map((c) =>
      mapPObjectData(c, (d) => this.resolveDataInfo(c.spec, d)),
    );

    return this.pFrames.acquire(columns);
  }

  public createPTable(rawDef: PTableDef<PColumn<PColumnData>>): PoolEntry<PTableHandle> {
    const pFrameEntry = this.createPFrame(extractAllColumns(rawDef.src));
    const sortedDef = sortPTableDef(
      migratePTableFilters(
        mapPTableDef(rawDef, (c) => c.id),
        this.logger,
      ),
    );
    const pTableEntry = this.pTableDefs.acquire({
      type: "v1",
      def: sortedDef,
      pFrameHandle: pFrameEntry.key,
    });
    if (logPFrames()) {
      this.logger(
        "info",
        `Create PTable call (pFrameHandle = ${pFrameEntry.key}; pTableHandle = ${pTableEntry.key})`,
      );
    }

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

  public createPTableV2(rawDef: PTableDefV2<PColumn<PColumnData>>): PoolEntry<PTableHandle> {
    const columns = extractAllColumns(rawDef.src);
    const pFrameEntry = this.createPFrame(columns);

    const columnsMap = columns.reduce(
      (acc, col) => ((acc[col.id] = col.spec), acc),
      {} as Record<string, PColumnSpec>,
    );

    // Map column objects to IDs, sort join tree for stable hashing
    const mappedSrc = sortJoinEntry(mapJoinEntry(rawDef.src, (c) => c.id));

    // Use rewriteLegacyQuery for join tree + sorting only (no filters)
    const specFrame = createSpecFrame(columnsMap);
    let specQuery: QuerySpec = specFrame.rewriteLegacyQuery({
      src: mappedSrc,
      sorting: rawDef.sorting,
    });

    // Apply tree-based filters as QueryFilterSpec wrapper
    if (rawDef.filters !== null) {
      specQuery = {
        type: "filter",
        input: specQuery,
        predicate: filterSpecToExpr(rawDef.filters),
      };
    }

    const { tableSpec, dataQuery } = specFrame.evaluateQuery(specQuery);

    const pTableEntry = this.pTableDefs.acquire({
      type: "v2",
      pFrameHandle: pFrameEntry.key,
      def: {
        tableSpec,
        dataQuery,
      },
    });
    if (logPFrames()) {
      this.logger(
        "info",
        `Create PTable call (pFrameHandle = ${pFrameEntry.key}; pTableHandle = ${pTableEntry.key})`,
      );
    }

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

    const table = this.pTables.acquire({
      type: "v1",
      pFrameHandle: handle,
      def: sortPTableDef(migratePTableFilters(request, this.logger)),
    });
    const { pTablePromise, disposeSignal } = table.resource;
    const pTable = await pTablePromise;

    const combinedSignal = AbortSignal.any([signal, disposeSignal].filter((s) => !!s));
    return await this.frameConcurrencyLimiter.run(async () => {
      try {
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
        this.pTableCachePerFrame.cache(table, overallSize);

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
    const table = this.pTables.acquire(def);

    const { pTablePromise, disposeSignal } = table.resource;
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

    this.pTableCachePlain.cache(table, overallSize, defDisposeSignal);
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
        signal: combinedSignal,
      });

      return { data, overallSize };
    });

    this.pTableCachePlain.cache(table, overallSize, defDisposeSignal);
    return data;
  }
}

function cmpJoinEntries(lhs: JoinEntry<PObjectId>, rhs: JoinEntry<PObjectId>): number {
  if (lhs.type !== rhs.type) {
    return lhs.type < rhs.type ? -1 : 1;
  }
  const type = lhs.type;
  switch (type) {
    case "column":
      return lhs.column < (rhs as typeof lhs).column ? -1 : 1;
    case "slicedColumn":
    case "artificialColumn":
      return lhs.newId < (rhs as typeof lhs).newId ? -1 : 1;
    case "inlineColumn": {
      return lhs.column.id < (rhs as typeof lhs).column.id ? -1 : 1;
    }
    case "inner":
    case "full": {
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
    case "outer": {
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
    case "column":
    case "slicedColumn":
    case "inlineColumn":
      return entry;
    case "artificialColumn": {
      const sortedAxesIndices = entry.axesIndices.toSorted((lhs, rhs) => lhs - rhs);
      return {
        ...entry,
        axesIndices: sortedAxesIndices,
      };
    }
    case "inner":
    case "full": {
      const sortedEntries = entry.entries.map(sortJoinEntry);
      sortedEntries.sort(cmpJoinEntries);
      return {
        ...entry,
        entries: sortedEntries,
      };
    }
    case "outer": {
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

function sortPTableDef(def: PTableDef<PObjectId>): PTableDef<PObjectId> {
  function sortFilters(filters: PTableRecordFilter[]): PTableRecordFilter[] {
    return filters.toSorted((lhs, rhs) => {
      if (lhs.column.type === "axis" && rhs.column.type === "axis") {
        const lhsId = canonicalizeJson(getAxisId(lhs.column.id));
        const rhsId = canonicalizeJson(getAxisId(rhs.column.id));
        return lhsId < rhsId ? -1 : 1;
      } else if (lhs.column.type === "column" && rhs.column.type === "column") {
        return lhs.column.id < rhs.column.id ? -1 : 1;
      } else {
        return lhs.column.type === "axis" ? -1 : 1;
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

function migratePTableFilters<T>(
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

/** Parses a CanonicalizedJson<PTableColumnId> string into a QueryExpressionSpec reference. */
function resolveColumnRef(columnStr: string): QueryExpressionSpec {
  const parsed = JSON.parse(columnStr) as PTableColumnId;
  if (parsed.type === "axis") {
    return { type: "axisRef", value: parsed.id as SingleAxisSelector };
  }
  return { type: "columnRef", value: parsed.id };
}

/** Converts a FilterSpec tree into a QueryBooleanExpressionSpec for use in QueryFilterSpec. */
function filterSpecToExpr(filter: FilterSpec<FilterSpecLeaf<string>>): QueryBooleanExpressionSpec {
  switch (filter.type) {
    case "and":
    case "or": {
      const inputs = filter.filters.filter((f) => f.type !== undefined).map(filterSpecToExpr);
      if (inputs.length === 0) {
        throw new Error(`${filter.type.toUpperCase()} filter requires at least one operand`);
      }
      return { type: filter.type, input: inputs };
    }
    case "not":
      return { type: "not", input: filterSpecToExpr(filter.filter) };

    case "patternEquals":
      return {
        type: "stringEquals",
        input: resolveColumnRef(filter.column),
        value: filter.value,
        caseInsensitive: false,
      };
    case "patternNotEquals":
      return {
        type: "not",
        input: {
          type: "stringEquals",
          input: resolveColumnRef(filter.column),
          value: filter.value,
          caseInsensitive: false,
        },
      };
    case "patternContainSubsequence":
      return {
        type: "stringContains",
        input: resolveColumnRef(filter.column),
        value: filter.value,
        caseInsensitive: false,
      };
    case "patternNotContainSubsequence":
      return {
        type: "not",
        input: {
          type: "stringContains",
          input: resolveColumnRef(filter.column),
          value: filter.value,
          caseInsensitive: false,
        },
      };
    case "patternMatchesRegularExpression":
      return {
        type: "stringRegex",
        input: resolveColumnRef(filter.column),
        value: filter.value,
      };
    case "patternFuzzyContainSubsequence":
      return {
        type: "stringContainsFuzzy",
        input: resolveColumnRef(filter.column),
        value: filter.value,
        maxEdits: filter.maxEdits ?? 1,
        caseInsensitive: false,
        substitutionsOnly: filter.substitutionsOnly ?? false,
        wildcard: filter.wildcard ?? null,
      };

    case "equal":
      return {
        type: "numericComparison",
        operand: "eq",
        left: resolveColumnRef(filter.column),
        right: { type: "constant", value: filter.x },
      };
    case "notEqual":
      return {
        type: "numericComparison",
        operand: "ne",
        left: resolveColumnRef(filter.column),
        right: { type: "constant", value: filter.x },
      };
    case "lessThan":
      return {
        type: "numericComparison",
        operand: "lt",
        left: resolveColumnRef(filter.column),
        right: { type: "constant", value: filter.x },
      };
    case "greaterThan":
      return {
        type: "numericComparison",
        operand: "gt",
        left: resolveColumnRef(filter.column),
        right: { type: "constant", value: filter.x },
      };
    case "lessThanOrEqual":
      return {
        type: "numericComparison",
        operand: "le",
        left: resolveColumnRef(filter.column),
        right: { type: "constant", value: filter.x },
      };
    case "greaterThanOrEqual":
      return {
        type: "numericComparison",
        operand: "ge",
        left: resolveColumnRef(filter.column),
        right: { type: "constant", value: filter.x },
      };

    case "equalToColumn":
      return {
        type: "numericComparison",
        operand: "eq",
        left: resolveColumnRef(filter.column),
        right: resolveColumnRef(filter.rhs),
      };
    case "lessThanColumn": {
      const left = resolveColumnRef(filter.column);
      const right = resolveColumnRef(filter.rhs);
      if (filter.minDiff !== undefined && filter.minDiff !== 0) {
        return {
          type: "numericComparison",
          operand: "lt",
          left: {
            type: "numericBinary",
            operand: "add",
            left,
            right: { type: "constant", value: filter.minDiff },
          },
          right,
        };
      }
      return { type: "numericComparison", operand: "lt", left, right };
    }
    case "greaterThanColumn": {
      const left = resolveColumnRef(filter.column);
      const right = resolveColumnRef(filter.rhs);
      if (filter.minDiff !== undefined && filter.minDiff !== 0) {
        return {
          type: "numericComparison",
          operand: "gt",
          left: {
            type: "numericBinary",
            operand: "add",
            left,
            right: { type: "constant", value: filter.minDiff },
          },
          right,
        };
      }
      return { type: "numericComparison", operand: "gt", left, right };
    }
    case "lessThanColumnOrEqual": {
      const left = resolveColumnRef(filter.column);
      const right = resolveColumnRef(filter.rhs);
      if (filter.minDiff !== undefined && filter.minDiff !== 0) {
        return {
          type: "numericComparison",
          operand: "le",
          left: {
            type: "numericBinary",
            operand: "add",
            left,
            right: { type: "constant", value: filter.minDiff },
          },
          right,
        };
      }
      return { type: "numericComparison", operand: "le", left, right };
    }
    case "greaterThanColumnOrEqual": {
      const left = resolveColumnRef(filter.column);
      const right = resolveColumnRef(filter.rhs);
      if (filter.minDiff !== undefined && filter.minDiff !== 0) {
        return {
          type: "numericComparison",
          operand: "ge",
          left: {
            type: "numericBinary",
            operand: "add",
            left,
            right: { type: "constant", value: filter.minDiff },
          },
          right,
        };
      }
      return { type: "numericComparison", operand: "ge", left, right };
    }

    case "inSet":
      return {
        type: "isIn",
        input: resolveColumnRef(filter.column),
        set: filter.value,
      };
    case "notInSet":
      return {
        type: "not",
        input: {
          type: "isIn",
          input: resolveColumnRef(filter.column),
          set: filter.value,
        },
      };

    case "isNA":
    case "isNotNA":
    case "topN":
    case "bottomN":
      throw new Error(`Filter type "${filter.type}" is not supported in query expressions`);

    case undefined:
      throw new Error("Filter type is undefined");

    default:
      assertNever(filter);
  }
}
