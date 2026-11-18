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
  /** At most this many `listFiles` calls in flight. */
  concurrency?: number;
};

export type ExpandResult = {
  /** Files of each selected folder in path order, folders in the order given. */
  handles: ImportFileHandle[];
  /** Selected folders that yielded no file to import. */
  emptyFolders: string[];
};

function limiter(limit: number) {
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
  { extensions, signal, onProgress, concurrency = 8 }: ExpandOptions,
): Promise<ExpandResult> {
  const limited = limiter(concurrency);
  const progress: ExpandProgress = { foldersListed: 0, filesFound: 0 };

  const walk = async (dir: string, found: { path: string; handle: ImportFileHandle }[]) => {
    signal?.throwIfAborted();
    const { entries } = await limited(() => listFiles(storage, dir));
    signal?.throwIfAborted();

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
