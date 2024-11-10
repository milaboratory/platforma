import { assertNever } from '../util';
import { Branded } from '../branding';
import { TableRange } from './pframe';
import { FileLike } from './interfaces';

const uploadPrefix = 'upload://upload/';
const indexPrefix = 'index://index/';

export type ImportFileHandleUpload = `upload://upload/${string}`;
export type ImportFileHandleIndex = `index://index/${string}`;

export type ImportFileHandle = ImportFileHandleUpload | ImportFileHandleIndex;

export type LocalImportFileHandle = Branded<ImportFileHandle, 'Local'>;

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

export type OpenDialogFilter = {
  /** Human-readable file type name */
  readonly name: string;
  /** File extensions */
  readonly extensions: string[];
};

export type OpenDialogOps = {
  /** Open dialog window title */
  readonly title?: string;
  /** Custom label for the confirmation button, when left empty the default label will be used. */
  readonly buttonLabel?: string;
  /** Limits of file types user can select */
  readonly filters?: OpenDialogFilter[];
};

export type OpenSingleFileResponse = {
  /** Contains local file handle, allowing file importing or content reading. If user canceled
   * the dialog, field will be undefined. */
  readonly file?: LocalImportFileHandle;
};

export type OpenMultipleFilesResponse = {
  /** Contains local file handles, allowing file importing or content reading. If user canceled
   * the dialog, field will be undefined. */
  readonly files?: LocalImportFileHandle[];
};

/** Can be used to limit request for local file content to a certain bytes range */
export type FileRange = {
  /** From byte index (inclusive) */
  readonly from: number;
  /** To byte index (exclusive) */
  readonly to: number;
};

export interface LsDriver {
  /** remote and local storages */
  getStorageList(): Promise<StorageEntry[]>;

  listFiles(storage: StorageHandle, fullPath: string): Promise<ListFilesResult>;

  /** Opens system file open dialog allowing to select single file and awaits user action */
  showOpenSingleFileDialog(ops: OpenDialogOps): Promise<OpenSingleFileResponse>;

  /** Opens system file open dialog allowing to multiple files and awaits user action */
  showOpenMultipleFilesDialog(ops: OpenDialogOps): Promise<OpenMultipleFilesResponse>;

  /** Given a handle to a local file, allows to get file size */
  getLocalFileSize(file: LocalImportFileHandle): Promise<number>;

  /** Given a handle to a local file, allows to get its content */
  getLocalFileContent(file: LocalImportFileHandle, range?: TableRange): Promise<Uint8Array>;

  /**
   * Resolves browser's File object into platforma's import file handle.
   * 
   * This method is useful among other things for implementation of UI 
   * components, that handle file Drag&Drop.
   * */
  webFileToImportHandle(file: FileLike): Promise<ImportFileHandle>;
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
