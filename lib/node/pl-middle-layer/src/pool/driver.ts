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
  PColumnValues } from '@platforma-sdk/model';
import {
  mapPObjectData,
  mapPTableDef,
  extractAllColumns,
} from '@platforma-sdk/model';
import { RefCountResourcePool } from './ref_count_pool';
import { allBlobs, makeDataInfoResource, mapBlobs, parseDataInfoResource } from './data';
import { createHash } from 'node:crypto';
import type { MiLogger } from '@milaboratories/ts-helpers';
import { assertNever } from '@milaboratories/ts-helpers';
import canonicalize from 'canonicalize';
import { PFrame } from '@milaboratories/pframes-node';
import * as fsp from 'node:fs/promises';
import { LRUCache } from 'lru-cache';
import { ConcurrencyLimitingExecutor } from '@milaboratories/ts-helpers';
import { getDebugFlags } from '../debug';

function blobKey(res: ResourceInfo): string {
  return String(res.id);
}

type InternalPFrameData = PFrameDef<PFrameInternal.DataInfo<ResourceInfo>>;

const valueTypes: ValueType[] = ['Int', 'Long', 'Float', 'Double', 'String', 'Bytes'] as const;

function migrateFilters(filters: PTableRecordFilter[]): PTableRecordSingleValueFilterV2[] {
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
  return filters;
}

const bigintReplacer = (_: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);

class PFrameHolder implements PFrameInternal.PFrameDataSource, Disposable {
  public readonly pFrame;
  private readonly blobIdToResource = new Map<string, ResourceInfo>();
  private readonly blobHandleComputables = new Map<
    string,
    ComputableStableDefined<LocalBlobHandleAndSize>
  >();

  constructor(
    private readonly blobDriver: DownloadDriver,
    private readonly logger: MiLogger,
    private readonly blobContentCache: LRUCache<string, Uint8Array>,
    private readonly columns: InternalPFrameData,
  ) {
    // pframe initialization
    this.pFrame = new PFrame(
      (level: 'info' | 'warn' | 'error', message: string) => {
        switch (level) {
          default:
          case 'info':
            return this.logger.info(message);
          case 'warn':
            return this.logger.warn(message);
          case 'error':
            return this.logger.error(message);
        }
      },
    );
    this.pFrame.setDataSource(this);
    for (const column of columns) {
      for (const blob of allBlobs(column.data)) this.blobIdToResource.set(blobKey(blob), blob);
      const dataInfo = mapBlobs(column.data, blobKey);
      try {
        this.pFrame.addColumnSpec(column.id, column.spec);
        this.pFrame.setColumnData(column.id, dataInfo);
      } catch (err: unknown) {
        throw new Error(
          `Adding column ${column.id} to PFrame failed: ${err as Error}; Spec: ${JSON.stringify(column.spec)}, DataInfo: ${JSON.stringify(dataInfo)}.`,
        );
      }
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
      return await this.blobContentCache.forceFetch(path);
    } catch (err: unknown) {
      const error = JSON.stringify(err);
      console.log(`resolveBlobContent catched error: ${error}`);
      throw err;
    }
  };

  [Symbol.dispose](): void {
    for (const computable of this.blobHandleComputables.values()) computable.resetState();
    this.pFrame.dispose();
  }
}

type FullPTableDef = {
  pFrameHandle: PFrameHandle;
  def: PTableDef<PObjectId>;
};

export class PFrameDriver implements SdkPFrameDriver {
  private readonly pFrames: RefCountResourcePool<InternalPFrameData, PFrameHolder>;
  private readonly pTables: RefCountResourcePool<FullPTableDef, Promise<PFrameInternal.PTableV2>>;
  private readonly blobContentCache: LRUCache<string, Uint8Array>;
  /** Limits concurrent requests to PFrame API to prevent deadlock with Node's IO threads */
  private readonly concurrencyLimiter: ConcurrencyLimitingExecutor;

  constructor(
    private readonly blobDriver: DownloadDriver,
    private readonly logger: MiLogger,
  ) {
    const blobContentCache = new LRUCache<string, Uint8Array>({
      maxSize: 1_000_000_000, // 1Gb
      fetchMethod: async (key) => await fsp.readFile(key),
      sizeCalculation: (v) => v.length,
    });
    const concurrencyLimiter = new ConcurrencyLimitingExecutor(1);
    this.blobContentCache = blobContentCache;
    this.concurrencyLimiter = concurrencyLimiter;

    this.pFrames = new (class extends RefCountResourcePool<InternalPFrameData, PFrameHolder> {
      constructor(
        private readonly blobDriver: DownloadDriver,
        private readonly logger: MiLogger,
      ) {
        super();
      }

      protected createNewResource(params: InternalPFrameData): PFrameHolder {
        if (getDebugFlags().logPFrameRequests)
          logger.info(
            `PFrame creation (pFrameHandle = ${this.calculateParamsKey(params)}): ${JSON.stringify(params, bigintReplacer)}`,
          );
        return new PFrameHolder(this.blobDriver, this.logger, blobContentCache, params);
      }

      protected calculateParamsKey(params: InternalPFrameData): string {
        return stableKeyFromPFrameData(params);
      }
    })(this.blobDriver, this.logger);

    this.pTables = new (class extends RefCountResourcePool<
      FullPTableDef,
      Promise<PFrameInternal.PTableV2>
    > {
      constructor(
        private readonly pFrames: RefCountResourcePool<InternalPFrameData, PFrameHolder>,
      ) {
        super();
      }

      protected async createNewResource(params: FullPTableDef): Promise<PFrameInternal.PTableV2> {
        const pFrame = this.pFrames.getByKey(params.pFrameHandle);
        const rawPTable = await concurrencyLimiter.run(async () => {
          if (getDebugFlags().logPFrameRequests)
            logger.info(
              `PTable creation (pTableHandle = ${this.calculateParamsKey(params)}): ${JSON.stringify(params, bigintReplacer)}`,
            );
          return await pFrame.pFrame.createTable({
            src: joinEntryToInternal(params.def.src),
            filters: migrateFilters(params.def.filters),
          });
        });
        return params.def.sorting.length !== 0 ? rawPTable.sort(params.def.sorting) : rawPTable;
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
    def: PFrameDef<PlTreeNodeAccessor | PColumnValues>,
    ctx: ComputableCtx,
  ): PFrameHandle {
    const internalData = def
      .filter((c) => valueTypes.find((t) => t === c.spec.valueType))
      .map((c) =>
        mapPObjectData(c, (d) =>
          isPlTreeNodeAccessor(d) ? parseDataInfoResource(d) : makeDataInfoResource(c.spec, d),
        ),
      );
    const res = this.pFrames.acquire(internalData);
    ctx.addOnDestroy(res.unref);
    return res.key as PFrameHandle;
  }

  public createPTable(
    def: PTableDef<PColumn<PlTreeNodeAccessor | PColumnValues>>,
    ctx: ComputableCtx,
  ): PTableHandle {
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
          ? [{ axesSpec: request.compatibleWith, qualifications: [] }]
          : [],
    };
    const responce = await this.concurrencyLimiter.run(
      async () => await this.pFrames.getByKey(handle).pFrame.findColumns(iRequest),
    );
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
    return await this.concurrencyLimiter.run(
      async () => await this.pFrames.getByKey(handle).pFrame.getColumnSpec(columnId),
    );
  }

  public async listColumns(handle: PFrameHandle): Promise<PColumnIdAndSpec[]> {
    return await this.concurrencyLimiter.run(
      async () => await this.pFrames.getByKey(handle).pFrame.listColumns(),
    );
  }

  public async calculateTableData(
    handle: PFrameHandle,
    request: CalculateTableDataRequest<PObjectId>,
  ): Promise<CalculateTableDataResponse> {
    let table = await this.concurrencyLimiter.run(async () => {
      if (getDebugFlags().logPFrameRequests)
        this.logger.info(
          `Call calculateTableData, handle = ${handle}, request = ${JSON.stringify(request, bigintReplacer)}`,
        );
      return await this.pFrames.getByKey(handle).pFrame.createTable({
        src: joinEntryToInternal(request.src),
        filters: migrateFilters(request.filters),
      });
    });

    if (request.sorting.length > 0) {
      const sortedTable = await this.concurrencyLimiter.run(
        async () => await table.sort(request.sorting),
      );
      table.dispose();
      table = sortedTable;
    }

    const spec = table.getSpec();
    const data = await this.concurrencyLimiter.run(
      async () => await table.getData([...spec.keys()]),
    );
    table.dispose();

    return spec.map((spec, i) => ({
      spec: spec,
      data: data[i],
    }));
  }

  public async getUniqueValues(
    handle: PFrameHandle,
    request: UniqueValuesRequest,
  ): Promise<UniqueValuesResponse> {
    return await this.concurrencyLimiter.run(async () => {
      if (getDebugFlags().logPFrameRequests)
        this.logger.info(
          `Call getUniqueValues, handle = ${handle}, request = ${JSON.stringify(request, bigintReplacer)}`,
        );
      return await this.pFrames.getByKey(handle).pFrame.getUniqueValues({
        ...request,
        filters: migrateFilters(request.filters),
      });
    });
  }

  //
  // PTable istance methods
  //

  public async getShape(handle: PTableHandle): Promise<PTableShape> {
    const pTable = await this.pTables.getByKey(handle); // internally concurrency limited
    return pTable.getShape();
  }

  public async getSpec(handle: PTableHandle): Promise<PTableColumnSpec[]> {
    const pTable = await this.pTables.getByKey(handle); // internally concurrency limited
    return pTable.getSpec(); // sync operation
  }

  public async getData(
    handle: PTableHandle,
    columnIndices: number[],
    range?: TableRange,
  ): Promise<PTableVector[]> {
    const pTable = await this.pTables.getByKey(handle); // internally concurrency limited
    return await this.concurrencyLimiter.run(
      async () => await pTable.getData(columnIndices, range),
    );
  }
}

function joinEntryToInternal(entry: JoinEntry<PObjectId>): PFrameInternal.JoinEntry {
  switch (entry.type) {
    case 'column':
      return {
        type: 'column',
        columnId: entry.column,
        qualifications: [],
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

function stableKeyFromPFrameData(data: PColumn<PFrameInternal.DataInfo<ResourceInfo>>[]): string {
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
              value: info.id.toString(),
            })),
          };
          break;
        case 'BinaryPartitioned':
          result = {
            type: r.type,
            keyLength: r.partitionKeyLength,
            payload: Object.entries(r.parts).map(([part, info]) => ({
              key: part,
              value: [info.index.id.toString(), info.values.id.toString()] as const,
            })),
          };
          break;
        default:
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          throw Error(`unsupported resource type: ${type satisfies never}`);
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
