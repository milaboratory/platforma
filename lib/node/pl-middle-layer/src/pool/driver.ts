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
} from '@platforma-sdk/model';
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

function blobKey(res: ResourceInfo): string {
  return String(res.id);
}

type InternalPFrameData = PFrameDef<DataInfo<ResourceInfo>>;

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

const bigintReplacer = (_: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);

class PFrameHolder implements PFrameInternal.PFrameDataSource, Disposable {
  public readonly pFrame: PFrameInternal.PFrameV6;
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
      for (const column of distinctСolumns) {
        pFrame.addColumnSpec(column.id, column.spec);
        pFrame.setColumnData(column.id, column.data);
      }
      this.pFrame = pFrame;
    } catch (err: unknown) {
      throw new Error(
        `Rust PFrame creation failed, columns: ${JSON.stringify(distinctСolumns)}, error: ${err as Error}`,
      );
    }
  }

  private getOrCreateComputableForBlob(blobId: string) {
    let computable = this.blobHandleComputables.get(blobId);
    if (computable !== undefined) return computable;

    const blobResource = this.blobIdToResource.get(blobId);
    if (blobResource === undefined) throw new Error(`Blob with id ${blobId} not found.`);

    // precalculation of value tree will trigger the download proecess right away
    computable = this.blobDriver.getDownloadedBlob(blobResource).withPreCalculatedValueTree();

    this.blobHandleComputables.set(blobId, computable);

    return computable;
  }

  public readonly preloadBlob = async (blobIds: string[]): Promise<void> => {
    const computables = blobIds.map((blobId) => this.getOrCreateComputableForBlob(blobId));
    for (const computable of computables) await computable.awaitStableFullValue();
  };

  public readonly resolveBlob = async (blobId: string): Promise<string> => {
    const computable = this.getOrCreateComputableForBlob(blobId);
    return this.blobDriver.getLocalPath((await computable.awaitStableValue()).handle);
  };

  public readonly resolveBlobContent = async (blobId: string): Promise<Uint8Array> => {
    try {
      const computable = this.getOrCreateComputableForBlob(blobId);
      const path = this.blobDriver.getLocalPath((await computable.awaitStableValue()).handle);
      return await fsp.readFile(path);
    } catch (err: unknown) {
      const error = JSON.stringify(err);
      console.log(`resolveBlobContent catched error: ${error}`);
      throw err;
    }
  };

  public get disposeSignal(): AbortSignal {
    return this.abortController.signal;
  }

  [Symbol.dispose](): void {
    this.abortController.abort();
    for (const computable of this.blobHandleComputables.values()) computable.resetState();
    this.pFrame.dispose();
  }
}

class PTableHolder implements Disposable {
  constructor(
    public readonly table: Promise<PFrameInternal.PTableV4>,
    private readonly abortController: AbortController,
  ) {}

  public get disposeSignal(): AbortSignal {
    return this.abortController.signal;
  }

  [Symbol.dispose](): void {
    this.abortController.abort();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.table.then((table) => table.dispose());
  }
}

type FullPTableDef = {
  pFrameHandle: PFrameHandle;
  def: PTableDef<PObjectId>;
  signal?: AbortSignal;
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
    def: PFrameDef<PlTreeNodeAccessor | PColumnValues | DataInfo<PlTreeNodeAccessor>>,
    ctx: ComputableCtx,
  ): PFrameHandle;

  /** Create a new PTable */
  createPTable(
    def: PTableDef<PColumn<PlTreeNodeAccessor | PColumnValues | DataInfo<PlTreeNodeAccessor>>>,
    ctx: ComputableCtx,
    signal?: AbortSignal,
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
  private readonly concurrencyLimiter: ConcurrencyLimitingExecutor;
  private readonly getDataLimiter: ConcurrencyLimitingExecutor;

  public async pprofDump(): Promise<Uint8Array> {
    return await PFrame.pprofDump();
  }

  public static async init(
    blobDriver: DownloadDriver,
    logger: MiLogger,
    spillPath: string,
  ): Promise<PFrameDriver> {
    const resolvedSpillPath = path.resolve(spillPath);
    await emptyDir(resolvedSpillPath);
    return new PFrameDriver(blobDriver, logger, resolvedSpillPath);
  }

  private constructor(
    private readonly blobDriver: DownloadDriver,
    private readonly logger: MiLogger,
    private readonly spillPath: string,
  ) {
    const concurrencyLimiter = new ConcurrencyLimitingExecutor(4);
    this.concurrencyLimiter = concurrencyLimiter;
    this.getDataLimiter = new ConcurrencyLimitingExecutor(4);

    this.pFrames = new (class extends RefCountResourcePool<InternalPFrameData, PFrameHolder> {
      constructor(
        private readonly blobDriver: DownloadDriver,
        private readonly logger: MiLogger,
        private readonly spillPath: string,
      ) {
        super();
      }

      protected createNewResource(params: InternalPFrameData): PFrameHolder {
        if (getDebugFlags().logPFrameRequests)
          logger.info(
            `PFrame creation (pFrameHandle = ${this.calculateParamsKey(params)}): ${JSON.stringify(params, bigintReplacer)}`,
          );
        return new PFrameHolder(this.blobDriver, this.logger, this.spillPath, params);
      }

      protected calculateParamsKey(params: InternalPFrameData): string {
        return stableKeyFromPFrameData(params);
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

      protected createNewResource(params: FullPTableDef): PTableHolder {
        const handle: PFrameHandle = params.pFrameHandle;
        if (getDebugFlags().logPFrameRequests) {
          logger.info(
            `PTable creation (pTableHandle = ${this.calculateParamsKey(params)}): ${JSON.stringify(params, bigintReplacer)}`,
          );
        }

        const pFrameHolder = this.pFrames.getByKey(handle);
        const abortController = new AbortController();
        const combinedSignal = AbortSignal.any(
          [params.signal, abortController.signal, pFrameHolder.disposeSignal].filter((s) => !!s),
        );

        const tablePromise = concurrencyLimiter.run(async () => {
          const table = await pFrameHolder.pFrame.createTable({
            src: joinEntryToInternal(params.def.src),
            filters: migrateFilters(params.def.filters),
          }, combinedSignal);

          let sortedTable = table;
          if (params.def.sorting.length > 0) {
            try {
              sortedTable = await table.sort(params.def.sorting, combinedSignal);
            } finally {
              table.dispose();
            }
          }

          return sortedTable;
        });
        return new PTableHolder(tablePromise, abortController);
      }

      protected calculateParamsKey(params: FullPTableDef): string {
        return stableKeyFromFullPTableDef(params);
      }
    })(this.pFrames);
  }

  //
  // Internal / Config API Methods
  //

  public createPFrame(
    def: PFrameDef<PlTreeNodeAccessor | PColumnValues | DataInfo<PlTreeNodeAccessor>>,
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
    def: PTableDef<PColumn<PlTreeNodeAccessor | PColumnValues | DataInfo<PlTreeNodeAccessor>>>,
    ctx: ComputableCtx,
    signal?: AbortSignal,
  ): PTableHandle {
    const pFrameHandle = this.createPFrame(extractAllColumns(def.src), ctx);
    const defIds = mapPTableDef(def, (c) => c.id);
    const res = this.pTables.acquire({ def: defIds, pFrameHandle, signal });
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
    const responce = await this.pFrames.getByKey(handle).pFrame.findColumns(iRequest);
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
    return await this.pFrames.getByKey(handle).pFrame.getColumnSpec(columnId);
  }

  public async listColumns(handle: PFrameHandle): Promise<PColumnIdAndSpec[]> {
    return await this.pFrames.getByKey(handle).pFrame.listColumns();
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
    return await this.concurrencyLimiter.run(async () => {
      const pFrameHolder = this.pFrames.getByKey(handle);
      const combinedSignal = AbortSignal.any([signal, pFrameHolder.disposeSignal].filter((s) => !!s));
      const table = await pFrameHolder.pFrame.createTable({
        src: joinEntryToInternal(request.src),
        filters: migrateFilters(request.filters),
      }, combinedSignal);

      let sortedTable = table;
      if (request.sorting.length > 0) {
        try {
          sortedTable = await table.sort(request.sorting, combinedSignal);
        } finally {
          table.dispose();
        }
      }

      try {
        const spec = sortedTable.getSpec();
        const data = await sortedTable.getData([...spec.keys()], range, combinedSignal);
        return spec.map((spec, i) => ({
          spec: spec,
          data: data[i],
        }));
      } finally {
        sortedTable.dispose();
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
    return await this.concurrencyLimiter.run(async () => {
      const pFrameHolder = this.pFrames.getByKey(handle);
      const combinedSignal = AbortSignal.any([signal, pFrameHolder.disposeSignal].filter((s) => !!s));
      return await pFrameHolder.pFrame.getUniqueValues({
        ...request,
        filters: migrateFilters(request.filters),
      }, combinedSignal);
    });
  }

  //
  // PTable istance methods
  //

  public async getShape(handle: PTableHandle): Promise<PTableShape> {
    const pTable = await this.pTables.getByKey(handle).table;
    return pTable.getShape();
  }

  public async getSpec(handle: PTableHandle): Promise<PTableColumnSpec[]> {
    const pTable = await this.pTables.getByKey(handle).table;
    return pTable.getSpec();
  }

  public async getData(
    handle: PTableHandle,
    columnIndices: number[],
    range: TableRange | undefined,
    signal?: AbortSignal,
  ): Promise<PTableVector[]> {
    return await this.getDataLimiter.run(async () => {
      const pTableHolder = this.pTables.getByKey(handle);
      const pTable = await pTableHolder.table;
      const combinedSignal = AbortSignal.any([signal, pTableHolder.disposeSignal].filter((s) => !!s));
      return await pTable.getData(columnIndices, range, combinedSignal);
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

function stableKeyFromPFrameData(data: PColumn<DataInfo<ResourceInfo>>[]): string {
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
        default:
          throw Error(`unsupported resource type: ${JSON.stringify(type satisfies never)}`);
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
