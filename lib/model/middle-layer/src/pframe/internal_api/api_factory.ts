import { DataInfo, PColumnSpec, PObjectId } from '@milaboratories/pl-model-common';

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

/** API exposed by PFrames library allowing to create and provide data for
 * PFrame objects */
export interface PFrameFactoryAPI {
  /** Associates data source with this PFrame */
  setDataSource(dataSource: PFrameDataSource): void;

  /** Adds PColumn without spec */
  addColumnSpec(columnId: PObjectId, columnSpec: PColumnSpec): void;

  /** Associates data info with cpecific column */
  setColumnData(columnId: PObjectId, dataInfo: DataInfo<PFrameBlobId>): void;

  /** Releases all the data previously added to PFrame using methods above,
   * any interactions with disposed PFrame will result in exception */
  dispose(): void;
}

/** API exposed by PFrames library allowing to create and provide data for
 * PFrame objects */
export interface PFrameFactoryAPIV2 {
  /** Associates data source with this PFrame */
  setDataSource(dataSource: PFrameDataSource): void;

  /** Adds PColumn without spec */
  addColumnSpec(columnId: PObjectId, columnSpec: PColumnSpec): void;

  /** Associates data info with cpecific column */
  setColumnData(columnId: PObjectId, dataInfo: DataInfo<PFrameBlobId>): Promise<void>;

  /** Releases all the data previously added to PFrame using methods above,
   * any interactions with disposed PFrame will result in exception */
  dispose(): void;
}
