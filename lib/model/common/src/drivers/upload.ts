export interface ImportProgress {
  done: boolean;
  /** Status of indexing/uploading got from platforma gRPC. */
  status?: ImportStatus;
  /** True if BlobUpload, false if BlobIndex. */
  readonly isUpload: boolean;
  /** True if signature matched. */
  isUploadSignMatch?: boolean;
  /** Exists when an upload failed and was restarted,
   * but the error was recoverable.
   * If the error was non-recoverable,
   * the driver's computable will throw an error instead. */
  lastError?: string;
}

/** Almost direct mapping from proto struct got from gRPC. */
export interface ImportStatus {
  /** A float from 0 to 1 and is equal to bytesProcessed / bytesTotal. */
  readonly progress: number;
  readonly bytesProcessed?: number;
  readonly bytesTotal?: number;
}
