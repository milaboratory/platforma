/**
 * Expands folders selected on the remote tab into the files to import. No Vue here.
 *
 * Every folder level is one `listFiles` call over the network, so the walk runs a few
 * calls at a time, reports progress, and stops on an abort signal.
 */
import type { ImportFileHandle, ListFilesResult, StorageHandle } from "@platforma-sdk/model";
import { isJunkName, matchesExtensions } from "./folder-walk";

export type ListFiles = (storage: StorageHandle, fullPath: string) => Promise<ListFilesResult>;

export type ExpandProgress = { foldersListed: number; filesFound: number };

export type ExpandOptions = {
  /** Normalized extensions (leading dot); `undefined` accepts every file. */
  extensions: string[] | undefined;
  signal?: AbortSignal;
  onProgress?: (progress: ExpandProgress) => void;
  /** At most this many `listFiles` calls in flight; ignored when `limit` is given. */
  concurrency?: number;
  /** A limiter shared with other walks, so several walks together stay within one cap. */
  limit?: Limiter;
};

export type ExpandResult = {
  /** Files of each selected folder in path order, folders in the order given. */
  handles: ImportFileHandle[];
  /** Selected folders that yielded no file to import. */
  emptyFolders: string[];
};

/** A folder below (or at) a selected folder could not be listed. */
export class FolderListError extends Error {
  constructor(
    readonly path: string,
    cause: unknown,
  ) {
    super(`Could not list ${path}: ${String(cause)}`, { cause });
    this.name = "FolderListError";
  }
}

/** Runs the given calls at most `limit` at a time. */
export type Limiter = <T>(fn: () => Promise<T>) => Promise<T>;

export function createLimiter(limit: number): Limiter {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    while (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

/**
 * Hidden entries and `__MACOSX` below a selected folder are skipped, and files outside
 * `extensions`. The selected folder itself is taken whatever its name: the user picked it.
 */
export async function expandRemoteFolders(
  listFiles: ListFiles,
  storage: StorageHandle,
  folders: string[],
  { extensions, signal, onProgress, concurrency = 8, limit }: ExpandOptions,
): Promise<ExpandResult> {
  const limited = limit ?? createLimiter(concurrency);
  const progress: ExpandProgress = { foldersListed: 0, filesFound: 0 };
  // The first failed listing fails the whole walk, so it also stops the other branches.
  const failure = new AbortController();
  const stop = signal ? AbortSignal.any([signal, failure.signal]) : failure.signal;

  const walk = async (dir: string, found: { path: string; handle: ImportFileHandle }[]) => {
    stop.throwIfAborted();
    let listing: ListFilesResult;
    try {
      // A call queued behind other walks may start after this walk was stopped.
      listing = await limited(() => {
        stop.throwIfAborted();
        return listFiles(storage, dir);
      });
    } catch (err) {
      stop.throwIfAborted();
      const error = new FolderListError(dir, err);
      failure.abort(error);
      throw error;
    }
    stop.throwIfAborted();
    const { entries } = listing;

    const subfolders: string[] = [];
    for (const entry of entries) {
      if (isJunkName(entry.name)) continue;
      if (entry.type === "dir") subfolders.push(entry.fullPath);
      else if (matchesExtensions(entry.name, extensions)) {
        found.push({ path: entry.fullPath, handle: entry.handle });
        progress.filesFound++;
      }
    }
    progress.foldersListed++;
    onProgress?.({ ...progress });

    await Promise.all(subfolders.map((sub) => walk(sub, found)));
  };

  const perFolder = await Promise.all(
    folders.map(async (folder) => {
      const found: { path: string; handle: ImportFileHandle }[] = [];
      await walk(folder, found);
      found.sort((a, b) => a.path.localeCompare(b.path));
      return { folder, found };
    }),
  );

  return {
    handles: perFolder.flatMap(({ found }) => found.map((f) => f.handle)),
    emptyFolders: perFolder.filter(({ found }) => found.length === 0).map(({ folder }) => folder),
  };
}
