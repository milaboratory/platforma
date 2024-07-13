import { BlobDriver, LogsDriver, LsDriver } from './drivers';

/** Set of all drivers exposed in UI SDK via the platforma object. */
export interface DriverKit {
  /** Driver allowing to retrieve blob data */
  blobDriver: BlobDriver;

  /** Driver allowing to retrieve blob data */
  logDriver: LogsDriver;

  /**
   * Driver allowing to list local and remote files that current user has
   * access to.
   *
   * Along with file listing this driver provides import handles for listed
   * files, that can be communicated to the workflow via block arguments,
   * converted into blobs using standard workflow library functions.
   * */
  lsDriver: LsDriver;
}
