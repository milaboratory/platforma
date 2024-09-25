import type { BlobDriver, LogsDriver, LsDriver, PFrameDriver } from './drivers';

/** Set of all drivers exposed in UI SDK via the platforma object. */
export interface DriverKit {
  /** Driver allowing to retrieve blob data */
  readonly blobDriver: BlobDriver;

  /** Driver allowing to dynamically work with logs */
  readonly logDriver: LogsDriver;

  /**
   * Driver allowing to list local and remote files that current user has
   * access to.
   *
   * Along with file listing this driver provides import handles for listed
   * files, that can be communicated to the workflow via block arguments,
   * converted into blobs using standard workflow library functions.
   * */
  readonly lsDriver: LsDriver;

  /** Driver allowing to interact with PFrames and PTables */
  readonly pFrameDriver: PFrameDriver;
}
