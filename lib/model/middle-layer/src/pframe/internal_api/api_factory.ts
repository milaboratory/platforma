import { PColumnSpec, PObjectId } from '@milaboratories/pl-model-common';

/** Abstract identifier of a data blob that can be requested from the storage backend */
export type PFrameBlobId = string;

export type JsonDataValue = string | number | null;

export type JsonDataInfo = {
  type: 'Json';
  keyLength: number;
  data: Record<string, JsonDataValue>;
};

export type JsonPartitionedDataInfo<Blob = PFrameBlobId> = {
  type: 'JsonPartitioned';
  partitionKeyLength: number;
  parts: Record<string, Blob>;
};

export type BinaryChunkInfo<Blob = PFrameBlobId> = {
  index: Blob;
  values: Blob;
};

export type BinaryPartitionedDataInfo<Blob = PFrameBlobId> = {
  type: 'BinaryPartitioned';
  partitionKeyLength: number;
  parts: Record<string, BinaryChunkInfo<Blob>>;
};

export type DataInfo<Blob = PFrameBlobId> =
  | JsonDataInfo
  | JsonPartitionedDataInfo<Blob>
  | BinaryPartitionedDataInfo<Blob>;

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

  /** Allows to read actual data given the blob id from {@link DataInfo}. */
  resolveBlob(blobId: PFrameBlobId): Promise<FilePath>;
};

/** API exposed by PFrames library allowing to create and provide data for
 * PFrame objects */
export interface PFrameFactoryAPI {
  /** Associates data source with this PFrame */
  setDataSource(dataSource: PFrameDataSource): void;

  /** Adds PColumn without spec */
  addColumnSpec(columnId: PObjectId, columnSpec: PColumnSpec): void;

  /** Associates data info with cpecific column */
  setColumnData(columnId: PObjectId, dataInfo: DataInfo): void;

  /** Releases all the data previously added to PFrame using methods above,
   * any interactions with disposed PFrame will result in exception */
  dispose(): void;
}
