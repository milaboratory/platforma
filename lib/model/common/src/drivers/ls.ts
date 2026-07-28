import { assertNever } from "../util";
import type { Branded } from "../branding";
import type { TableRange } from "./pframe";
import type { FileLike } from "./interfaces";

const uploadPrefix = "upload://upload/";
const indexPrefix = "index://index/";

export type ImportFileHandleUpload = `upload://upload/${string}`;
export type ImportFileHandleIndex = `index://index/${string}`;

export type ImportFileHandle = ImportFileHandleUpload | ImportFileHandleIndex;

export type LocalImportFileHandle = Branded<ImportFileHandle, "Local">;

export function isImportFileHandleUpload(
  handle: ImportFileHandle,
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
  /** Stable machine identifier (e.g. "library", "root", "local"). Used for filtering. */
  id: string;
  /** Human-readable display name. */
  name: string;
  handle: StorageHandle;
  initialFullPath: string;
};

/** Default cap on entries returned by one recursive {@link LsDriver.listFiles}. */
export const DefaultListFilesLimit = 5000;

export type ListFilesOps = {
  /**
   * How many directory levels to descend. `1` lists the given directory alone,
   * which is both the default and the historical behaviour.
   *
   * Deeper listings exist for one-folder-per-sample layouts, where the files a
   * user wants to pick together sit in sibling folders. Directories are still
   * reported for the level being browsed, so navigation keeps working; the ones
   * below it are walked, not listed.
   */
  readonly depth?: number;
  /**
   * Stop after this many entries. Guards against a deep walk of a large shared
   * storage; when it bites, the result is flagged {@link ListFilesResult.truncated}.
   */
  readonly limit?: number;
};

export type ListFilesResult = {
  parent?: string;
  entries: LsEntry[];
  /**
   * The depth actually applied.
   *
   * This is the capability signal for {@link ListFilesOps}, and it is why the
   * field is always set rather than only when interesting. A block bundles its
   * own copy of the file dialog but calls the *host's* `lsDriver`, so a new
   * dialog routinely runs against a host that predates these options and drops
   * them on the floor. Such a host returns no `depth`, which lets the caller
   * hide a control it cannot honour instead of offering a silent no-op.
   */
  depth?: number;
  /**
   * Set when {@link ListFilesOps.limit} cut the walk short, so callers can say
   * so rather than presenting a partial listing as complete. Reaching the
   * requested `depth` is not truncation — that bound was asked for.
   */
  truncated?: boolean;
  /** Number of directories skipped because they could not be read. */
  unreadableDirs?: number;
};

export type LsEntry =
  | {
      type: "dir";
      name: string;
      fullPath: string;
    }
  | {
      type: "file";
      name: string;
      fullPath: string;

      /** This handle should be set to args... */
      handle: ImportFileHandle;
    };

/**
 * Flattens a directory tree into a single listing, breadth-first.
 *
 * The one definition of what `depth` means, shared by every {@link LsDriver}
 * implementation so they cannot drift:
 *
 * - files from every visited level are reported;
 * - directories are reported only for the level being browsed — deeper ones are
 *   the frontier of the walk, and a row for a folder whose contents are not on
 *   screen is not something a user can act on;
 * - breadth-first, so when `limit` bites the caller keeps the shallowest and
 *   most predictable slice of the tree rather than one arbitrary deep branch;
 * - a directory that cannot be read is counted and stepped over, never fatal.
 *
 * @param root directory to start from
 * @param listDir lists exactly one directory; the only I/O this performs
 */
export async function collectListFiles(
  root: string,
  listDir: (dirPath: string) => Promise<LsEntry[]>,
  ops?: ListFilesOps,
): Promise<ListFilesResult> {
  const depth = Math.max(1, Math.trunc(ops?.depth ?? 1));
  if (depth === 1) return { entries: await listDir(root), depth };

  const limit = Math.max(1, Math.trunc(ops?.limit ?? DefaultListFilesLimit));

  const entries: LsEntry[] = [];
  let frontier = [root];
  let truncated = false;
  let unreadableDirs = 0;

  for (let level = 0; level < depth && frontier.length > 0 && !truncated; level++) {
    const nextFrontier: string[] = [];

    for (const dir of frontier) {
      let listing: LsEntry[];
      try {
        listing = await listDir(dir);
      } catch {
        unreadableDirs++;
        continue;
      }

      for (const entry of listing) {
        if (entry.type === "dir") {
          nextFrontier.push(entry.fullPath);
          if (level > 0) continue;
        }
        if (entries.length >= limit) {
          truncated = true;
          break;
        }
        entries.push(entry);
      }

      if (truncated) break;
    }

    frontier = nextFrontier;
  }

  return {
    entries,
    depth,
    ...(truncated ? { truncated } : {}),
    ...(unreadableDirs > 0 ? { unreadableDirs } : {}),
  };
}

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

  listFiles(storage: StorageHandle, fullPath: string, ops?: ListFilesOps): Promise<ListFilesResult>;

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
  fileToImportHandle(file: FileLike): Promise<ImportFileHandle>;

  /** Saves currently opened block webview as a PDF. */
  exportToPdf?(): Promise<void>;
}

/** Gets a file path from an import handle. */
export function getFilePathFromHandle(handle: ImportFileHandle): string {
  if (isImportFileHandleIndex(handle)) {
    const trimmed = handle.slice(indexPrefix.length);
    const data = JSON.parse(decodeURIComponent(trimmed)) as { path: string };
    return data.path;
  } else if (isImportFileHandleUpload(handle)) {
    const trimmed = handle.slice(uploadPrefix.length);
    const data = JSON.parse(decodeURIComponent(trimmed)) as { localPath: string };
    return data.localPath;
  }

  assertNever(handle);
}

function extractFileName(filePath: string) {
  return filePath.replace(/^.*[\\/]/, "");
}

/** Gets a file name from an import handle. */
export function getFileNameFromHandle(handle: ImportFileHandle): string {
  return extractFileName(getFilePathFromHandle(handle));
}
