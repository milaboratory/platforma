import type { Branded } from '../branding';

/** Handle of locally downloaded blob. This handle is issued only after the
 * blob's content is downloaded locally, and ready for quick access. */
export type LocalBlobHandle = Branded<string, 'LocalBlobHandle'>;

/** Handle of remote blob. This handle is issued as soon as the data becomes
 * available on the remote server. */
export type RemoteBlobHandle = Branded<string, 'RemoteBlobHandle'>;

/** Being configured inside the output structure provides information about
 * blob's content and means to retrieve it when needed. */
export interface BlobHandleAndSize<
  H extends LocalBlobHandle | RemoteBlobHandle = | LocalBlobHandle
  | RemoteBlobHandle,
> {
  /** Handle to retrieve block content using {@link BlobDriver.getContent()} */
  readonly handle: H;

  /** Blob size in bytes. */
  readonly size: number;
}

/** Range in bytes, from should be less or equal than to. */
export type RangeBytes = {
  /** Included left border. */
  from: number;

  /** Excluded right border. */
  to: number;
};

export function newRangeBytesOpt(from?: number, to?: number): RangeBytes | undefined {
  if (from == undefined || to == undefined) {
    return undefined;
  }

  return { from, to };
}

export function validateRangeBytes(range: RangeBytes, errMsg: string) {
  if (range.from < 0 || range.to < 0 || range.from >= range.to) {
    throw new Error(`${errMsg}: invalid bytes range: ${range}`);
  }
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

/**
 * Describes a single entry for folder download operation.
 * Each entry specifies a file to be downloaded and its destination path
 * relative to the root of the downloaded folder.
 */
export type DownloadFolderEntry = {
  /** The path where the file will be saved, relative to the chosen download
   * directory for the entire folder. For example, if the user chooses to
   * download the folder to `/path/to/downloads/MyFolder`, and `relativePath`
   * is `subfolder/file.txt`, the file will be saved to
   * `/path/to/downloads/MyFolder/subfolder/file.txt`. */
  relativePath: string;
  /** The handle of the blob to be downloaded. This can be either a
   * `LocalBlobHandle` if the blob is already cached locally, or a
   * `RemoteBlobHandle` if it needs to be fetched from remote storage. */
  handle: LocalBlobHandle | RemoteBlobHandle;
};

/** Defines API of blob driver as it is seen from the block UI code. */
export interface BlobDriver {
  /** Given the blob handle returns its content. Depending on the handle type,
   * content will be served from locally downloaded file, or directly from
   * remote platforma storage. */
  getContent(handle: LocalBlobHandle | RemoteBlobHandle, range?: RangeBytes): Promise<Uint8Array>;

  /**
   * Triggers a system "Save As" dialog, allowing the user to specify a
   * location and name for the file. Once confirmed, the file download
   * begins in the background, managed by the download manager.
   *
   * @param handle The handle of the blob to download, which can be either
   *   a `LocalBlobHandle` or a `RemoteBlobHandle`.
   * @returns A promise that resolves to `true` if the user confirmed the
   *   dialog and the download process was initiated, or `false` if the user
   *   canceled the dialog.
   */
  downloadFile(handle: LocalBlobHandle | RemoteBlobHandle): Promise<boolean>;

  /**
   * Initiates the download of multiple files as a folder structure.
   * Triggers a system dialog where the user can choose a destination directory
   * for the folder. Once a directory is selected, all files specified in the
   * `handle` array are downloaded into that directory, preserving the relative
   * paths defined in each `DownloadFolderEntry`.
   *
   * The download process for each file occurs in the background, managed by
   * the download manager.
   *
   * @param handle An array of `DownloadFolderEntry` objects, each describing
   *   a file to be downloaded and its relative path within the folder.
   * @returns A promise that resolves to `true` if the user selected a
   *   destination directory and the download process for the folder was
   *   initiated. Resolves to `false` if the user canceled the dialog.
   */
  downloadFolder(handle: DownloadFolderEntry[]): Promise<boolean>;
}
