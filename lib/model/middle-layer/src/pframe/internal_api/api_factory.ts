import { PColumnId, PColumnSpec } from '@milaboratory/sdk-model';

/** Abstract identifier of a data blob that can be requested from the storage backend */
export type PFrameBlobId = string;

export interface JsonDataInfo {
  type: 'JsonPartitioned';
  partitionKeyLength: number;
  parts: Map<string, PFrameBlobId>;
}

export interface BinaryChunkInfo {
  index: PFrameBlobId;
  values: PFrameBlobId;
}

export interface BinaryDataInfo {
  type: 'BinaryPartitioned';
  partitionKeyLength: number;
  parts: Map<string, BinaryChunkInfo>;
}

export type DataInfo = JsonDataInfo | BinaryDataInfo;

/** Path of the file containing requested data (blob). This path is returned by
 * {@link BlobPathResolver} as soon as blob materialized in the file system. */
export type FilePath = string;

/** Implementation of the storage backend passed to the PFrame to be able to
 * read actual data. */
export type BlobPathResolver = (blobId: PFrameBlobId) => Promise<FilePath>;

/** API exposed by PFrames library allowing to create and provide data for
 * PFrame objects */
export interface PFrameFactoryAPI {
  /** Adds PColumn without spec */
  addColumnSpec(columnId: PColumnId, columnSpec: PColumnSpec): void;

  /** Provides data for already added PColumn entry */
  setColumnData(
    columnId: PColumnId, dataInfo: DataInfo,
    blobResolver: BlobPathResolver
  ): Promise<void>;

  /** Releases all the data previously added to PFrame using methods above,
   * any interactions with disposed PFrame will result in exception */
  dispose(): void;
}
