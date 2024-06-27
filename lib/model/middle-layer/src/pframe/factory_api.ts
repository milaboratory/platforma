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
 * {@link FilePathResolver} as soon as blob materialized in the file system. */
export type FilePath = string;

/** Implementation of the storage backend passed to the PFrame to be able to
 * read actual data. */
export type FilePathResolver = (filename: PFrameBlobId) => Promise<FilePath>;
