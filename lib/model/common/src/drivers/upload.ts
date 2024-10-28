export interface ImportState {
  readonly importType: 'Index' | 'Upload';
  readonly done: boolean;

  /** Status of indexing/uploading that was got from platforma gRPC.
   * A float from 0 to 1 and is equal to bytesProcessed / bytesTotal.
   * It could be undefined when Platforma Backend
   * has not sent the status yet or
   * when the process was deduplicated and is already done. */
  readonly progress?: ImportStateProgress;

  /** True if importType is "Upload",
   * and the file was got from this computer
   * (i.e. a signature of the resource matched with
   * the client's signature). */
  readonly isLocalFileUploadStarted: boolean;

  /** Exists when an upload failed and was restarted,
   * but the error was recoverable.
   * If the error was non-recoverable,
   * the driver's computable will throw an error instead. */
  readonly lastUploadMessage?: string;
}

export interface ImportStateProgress {
  /** A float from 0 to 1 and is equal to bytesProcessed / bytesTotal. */
  readonly progress: number;
  readonly bytesProcessed: number;
  readonly bytesTotal: number;
}

/** @deprecated, use ImportState instead. */
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

/** @deprecated, use ImportState instead.
 * Almost direct mapping from proto struct got from gRPC. */
export interface ImportStatus {
  /** A float from 0 to 1 and is equal to bytesProcessed / bytesTotal. */
  readonly progress: number;
  readonly bytesProcessed?: number;
  readonly bytesTotal?: number;
}


