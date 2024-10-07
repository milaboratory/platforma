import { assertNever } from '../util';

const uploadPrefix = 'upload://upload/';
const indexPrefix = 'index://index/';

export type ImportFileHandleUpload = `upload://upload/${string}`;
export type ImportFileHandleIndex = `index://index/${string}`;

export type ImportFileHandle = ImportFileHandleUpload | ImportFileHandleIndex;

export function isImportFileHandleUpload(
  handle: ImportFileHandle
): handle is ImportFileHandleUpload {
  return handle.startsWith(uploadPrefix);
}

export function isImportFileHandleIndex(handle: ImportFileHandle): handle is ImportFileHandleIndex {
  return handle.startsWith(indexPrefix);
}

/** Results in upload */
export type StorageHandleLocal = `local://${string}`;

/** Results in index */
export type StorageHandleRemote = `remote://${string}`;

export type StorageHandle = StorageHandleLocal | StorageHandleRemote;

export type StorageEntry = {
  name: string;
  handle: StorageHandle;
  initialFullPath: string;

  // TODO
  // pathStartsWithDisk
};

export type ListFilesResult = {
  parent?: string;
  entries: LsEntry[];
};

export type LsEntry =
  | {
      type: 'dir';
      name: string;
      fullPath: string;
    }
  | {
      type: 'file';
      name: string;
      fullPath: string;

      /** This handle should be set to args... */
      handle: ImportFileHandle;
    };

export interface LsDriver {
  /** remote and local storages */
  getStorageList(): Promise<StorageEntry[]>;

  listFiles(storage: StorageHandle, fullPath: string): Promise<ListFilesResult>;
}

/** Gets a file path from an import handle. */
export function getFilePathFromHandle(handle: ImportFileHandle): string {
  if (isImportFileHandleIndex(handle)) {
    const trimmed = handle.slice(indexPrefix.length);
    const data = JSON.parse(decodeURIComponent(trimmed));
    return data.path;
  } else if (isImportFileHandleUpload(handle)) {
    const trimmed = handle.slice(uploadPrefix.length);
    const data = JSON.parse(decodeURIComponent(trimmed));
    return data.localPath;
  }

  assertNever(handle);
}
