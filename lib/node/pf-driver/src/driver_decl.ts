import type {
  CalculateTableDataRequest,
  CalculateTableDataResponse,
  JsonSerializable,
  PColumn,
  PColumnSpec,
  PFrameDef,
  PFrameDriver,
  PFrameHandle,
  PObjectId,
  PTableDef,
  PTableHandle,
  PTableShape,
  PTableVector,
  TableRange,
  UniqueValuesRequest,
  UniqueValuesResponse,
} from '@platforma-sdk/model';
import type { PFrameInternal } from '@milaboratories/pl-model-middle-layer';
import type { PoolEntry } from '@milaboratories/ts-helpers';

export interface LocalBlobProvider<TreeEntry extends JsonSerializable> {
  acquire(params: TreeEntry): PoolEntry<PFrameInternal.PFrameBlobId>;
  makeDataSource(signal: AbortSignal): PFrameInternal.PFrameDataSourceV2;
}

export interface RemoteBlobProvider<TreeEntry extends JsonSerializable> extends AsyncDisposable {
  acquire(params: TreeEntry): PoolEntry<PFrameInternal.PFrameBlobId>;
  httpServerInfo(): PFrameInternal.HttpServerInfo;
}

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
export interface AbstractInternalPFrameDriver<PColumnData>
  extends PFrameDriver, AsyncDisposable {
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
    def: PFrameDef<PColumn<PColumnData>>,
  ): PoolEntry<PFrameHandle>;

  /** Create a new PTable */
  createPTable(
    def: PTableDef<PColumn<PColumnData>>,
  ): PoolEntry<PTableHandle>;

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

export type DataInfoResolver<PColumnData, TreeEntry extends JsonSerializable> = (
  spec: PColumnSpec,
  data: PColumnData,
) => PFrameInternal.DataInfo<TreeEntry>;
