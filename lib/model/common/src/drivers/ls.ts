export type ImportFileHandleUpload = `upload://upload/${string}`
export type ImportFileHandleIndex = `index://index/${string}`

export type ImportFileHandle = ImportFileHandleUpload | ImportFileHandleIndex

/** Results in upload */
export type StorageHandleLocal = `local://${string}`;

/** Results in index */
export type StorageHandleRemote = `remote://${string}`;

export type StorageHandle = StorageHandleLocal | StorageHandleRemote;

export type StorageEntry = {
  name: string,
  handle: StorageHandle

  // TODO
  // pathStartsWithDisk
}

export type LsEntry = {
  type: 'dir',
  name: string,
  fullPath: string
} | {
  type: 'file',
  name: string,
  fullPath: string,

  /** This handle should be set to args... */
  handle: ImportFileHandle
}

export interface LsDriver {
  /** remote and local storages */
  getStorageList(): StorageEntry[];

  listFiles(storage: StorageHandle, path: string): LsEntry[];
}
