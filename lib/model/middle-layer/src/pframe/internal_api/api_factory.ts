import type {
  AxisValueType,
  BinaryPartitionedDataInfo,
  Branded,
  ColumnValueType,
  JsonDataInfo,
  JsonPartitionedDataInfo,
  ParquetChunk,
  ParquetPartitionedDataInfo,
  PObjectId,
} from "@milaboratories/pl-model-common";
import type { HttpServerInfo } from "./http_helpers";

/** PColumn spec file extension */
export const SpecExtension = ".spec" as const;

/** PColumn data info file extension */
export const DataInfoExtension = ".datainfo" as const;

/** Abstract identifier of a data blob that can be requested from the storage backend */
export type PFrameBlobId = Branded<string, "PFrameInternal.PFrameBlobId">;

/** Path of the file containing requested data (blob). This path is returned by
 * {@link BlobPathResolver} as soon as blob materialized in the file system. */
export type FilePath = string;

/** Data source allows PFrame to retrieve the data blobs for columns with assigned data info. */
export interface PFrameDataSourceV2 {
  /**
   * PFrame may notify storage backend about its plans to use particular blobs in the future.
   * Storage backend will do its best to preload specified blob so the subsequent
   * {@link resolveBlob} will quickly return preloaded file path.
   */
  preloadBlob(blobIds: PFrameBlobId[]): Promise<void>;

  /** Returns raw blob data given the blob id from {@link DataInfo}. */
  resolveBlobContent(blobId: PFrameBlobId): Promise<Uint8Array>;

  /**
   * Parquet HTTP(S) server connection settings, {@link HttpHelpers.createHttpServer}
   * When not provided, parquet BlobIds would be treated as local file paths.
   */
  parquetServer?: HttpServerInfo;
}

/**
 * Union type representing all possible data storage formats for PColumn data.
 * The specific format used depends on data size, access patterns, and performance requirements.
 *
 * @template Blob - Type parameter representing the storage reference type (could be ResourceInfo, PFrameBlobId, etc.)
 */
export type DataInfo<Blob> =
  | JsonDataInfo
  | JsonPartitionedDataInfo<Blob>
  | BinaryPartitionedDataInfo<Blob>
  | ParquetPartitionedDataInfo<ParquetChunk<Blob>>;

/**
 * Structural type information needed by the data side: axis value
 * types and column value types, in their canonical order. Mirrors
 * the bridge-side `TypeSpec`.
 */
export interface PColumnValueTypeSpec {
  readonly axes: AxisValueType[];
  readonly columns: ColumnValueType[];
}

/** Single column entry for {@link PFrameFactoryAPIV5.addColumns}. */
export interface AddColumnEntry {
  /** Unique column identifier within the PFrame. */
  readonly id: PObjectId;
  /** Structural type info (axes / column value types). */
  readonly typeSpec: PColumnValueTypeSpec;
  /** Data info for the column. */
  readonly data: DataInfo<PFrameBlobId>;
}

/** API for populating a PFrame with columns and a data source. */
export interface PFrameFactoryAPIV5 extends Disposable {
  /** Associates data source with this PFrame. */
  setDataSource(dataSource: PFrameDataSourceV2): void;

  /**
   * Registers all PColumns at once: specs are recorded and data info
   * is attached atomically. For parquet data info, schema resolution
   * via network is performed during this call.
   */
  addColumns(
    columns: AddColumnEntry[],
    options?: {
      signal?: AbortSignal;
    },
  ): Promise<void>;

  /** Releases all the data previously added to PFrame using methods above,
   * any interactions with disposed PFrame will result in exception */
  dispose(): void;
}
