import {
  Base64Encoded,
  BinaryPartitionedDataInfo,
  JsonDataInfo,
  JsonPartitionedDataInfo,
  ParquetChunk,
  ParquetPartitionedDataInfo,
  PColumnSpec,
  PObjectId,
} from '@milaboratories/pl-model-common';
import {
  HttpHelpers,
  HttpAuthorizationToken,
  ObjectStoreUrl,
  PemCertificate,
} from './http_helpers';

/** Abstract identifier of a data blob that can be requested from the storage backend */
export type PFrameBlobId = string;


/** Path of the file containing requested data (blob). This path is returned by
 * {@link BlobPathResolver} as soon as blob materialized in the file system. */
export type FilePath = string;

/** Data source allows PFrame to retrieve the data blobs for columns with assigned data info. */
export type PFrameDataSource = {
  /**
   * PFrame may notify storage backend about its plans to use particular blobs in the future.
   * Storage backend will do its best to preload specified blob so the subsequent
   * {@link resolveBlob} will quickly return preloaded file path.
   */
  preloadBlob(blobIds: PFrameBlobId[]): Promise<void>;

  /** Returns raw blob data given the blob id from {@link DataInfo}. */
  resolveBlobContent(blobId: PFrameBlobId): Promise<Uint8Array>;
};

/** Parquet HTTP(S) server connection settings, {@link HttpHelpers.createHttpServer} */
export type ParquetServerConfig = {
  /** URL of the parquet HTTP(S) server */
  url: ObjectStoreUrl;

  /** Authorization token for Bearer scheme */
  authToken?: HttpAuthorizationToken;

  /** CA certificate of HTTPS server */
  caCert?: Base64Encoded<PemCertificate>;
};

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
  parquetServer?: ParquetServerConfig;
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

/** API exposed by PFrames library allowing to create and provide data for
 * PFrame objects */
export interface PFrameFactoryAPIV3 extends Disposable {
  /** Associates data source with this PFrame */
  setDataSource(dataSource: PFrameDataSource): void;

  /** Adds PColumn without data info */
  addColumnSpec(columnId: PObjectId, columnSpec: PColumnSpec): void;

  /**
   * Assign data info to the specified PColumn.
   * For parquet data info, schema resolution via network is performed during this call.
   */
  setColumnData(
    columnId: PObjectId,
    dataInfo: DataInfo<PFrameBlobId>,
    options?: {
      signal?: AbortSignal,
    }
  ): Promise<void>;

  /** Releases all the data previously added to PFrame using methods above,
   * any interactions with disposed PFrame will result in exception */
  dispose(): void;
}

/** API exposed by PFrames library allowing to create and provide data for
 * PFrame objects */
export interface PFrameFactoryAPIV4 extends Disposable {
  /** Associates data source with this PFrame */
  setDataSource(dataSource: PFrameDataSourceV2): void;

  /** Adds PColumn without data info */
  addColumnSpec(columnId: PObjectId, columnSpec: PColumnSpec): void;

  /**
   * Assign data info to the specified PColumn.
   * For parquet data info, schema resolution via network is performed during this call.
   */
  setColumnData(
    columnId: PObjectId,
    dataInfo: DataInfo<PFrameBlobId>,
    options?: {
      signal?: AbortSignal,
    }
  ): Promise<void>;

  /** Releases all the data previously added to PFrame using methods above,
   * any interactions with disposed PFrame will result in exception */
  dispose(): void;
}
