import { Branded } from '../branding';

/** Handle of locally downloaded blob. This handle is issued only after the
 * blob's content is downloaded locally, and ready for quick access. */
export type LocalBlobHandle = Branded<string, 'LocalBlobHandle'>;

/** Handle of remote blob. This handle is issued as soon as the data becomes
 * available on the remote server. */
export type RemoteBlobHandle = Branded<string, 'RemoteBlobHandle'>;

/** Being configured inside the output structure provides information about
 * blob's content and means to retrieve it when needed. */
export interface BlobHandleAndSize<
  H extends LocalBlobHandle | RemoteBlobHandle =
    | LocalBlobHandle
    | RemoteBlobHandle
> {
  /** Handle to retrieve block content using {@link BlobDriver.getContent()} */
  readonly handle: H;

  /** Blob size in bytes. */
  readonly size: number;
}

/** Being configured inside the output structure provides information about
 * locally downloaded blob and means to retrieve it's content when needed. This
 * structure is created only after the blob's content is downloaded locally, and
 * ready for quick access. */
export type LocalBlobHandleAndSize = BlobHandleAndSize<LocalBlobHandle>;

/** Being configured inside the output structure provides information about
 * remote blob and means to retrieve it's content when needed. This structure
 * is created as soon as remote blob becomes available. */
export type RemoteBlobHandleAndSize = BlobHandleAndSize<RemoteBlobHandle>;

/** Defines API of blob driver as it is seen from the block UI code. */
export interface BlobDriver {
  /** Given the blob handle returns its content. Depending on the handle type,
   * content will be served from locally downloaded file, or directly from
   * remote platforma storage. */
  getContent(handle: LocalBlobHandle | RemoteBlobHandle): Promise<Uint8Array>;
}