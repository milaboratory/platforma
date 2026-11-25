/**
 * Turns dropped files and folders into the flat list of files to import. No Vue and no
 * DOM globals here: entries are described by the minimal shapes below, which the
 * browser's FileSystemEntry types satisfy.
 *
 * Symlinks never reach this code: Chromium omits them from dropped folders.
 */

export interface EntryLike {
  readonly name: string;
  readonly isFile: boolean;
  readonly isDirectory: boolean;
}

export interface FileEntryLike extends EntryLike {
  file(success: (file: File) => void, error?: (err: DOMException) => void): void;
}

export interface DirectoryReaderLike {
  readEntries(success: (entries: EntryLike[]) => void, error?: (err: DOMException) => void): void;
}

export interface DirectoryEntryLike extends EntryLike {
  createReader(): DirectoryReaderLike;
}

function isFileEntry(entry: EntryLike): entry is FileEntryLike {
  return entry.isFile && "file" in entry;
}

function isDirectoryEntry(entry: EntryLike): entry is DirectoryEntryLike {
  return entry.isDirectory && "createReader" in entry;
}

/**
 * System entries no one means to import, compared ignoring case (Windows names ignore it):
 * macOS zip resource forks, the Windows recycle bin and restore points (deleted files keep
 * their extensions there), the Linux fsck folder (usually unreadable), and thumbnail caches
 * and folder settings Windows writes next to the data.
 */
const junkNames = new Set([
  "__macosx",
  "$recycle.bin",
  "system volume information",
  "lost+found",
  "thumbs.db",
  "desktop.ini",
]);

/**
 * Entries skipped below a folder: hidden ones (leading dot), the system entries above,
 * and Office lock files (`~$report.xlsx`).
 */
export function isJunkName(name: string): boolean {
  return name.startsWith(".") || name.startsWith("~$") || junkNames.has(name.toLowerCase());
}

/** `extensions` are normalized (leading dot); `undefined` accepts every file. */
export function matchesExtensions(name: string, extensions: string[] | undefined): boolean {
  return extensions ? extensions.some((ext) => name.endsWith(ext)) : true;
}

/**
 * `readEntries` returns at most 100 entries per call, and an empty batch at the end.
 * One call silently loses the rest of a bigger folder, so read until empty.
 */
async function readAllEntries(dir: DirectoryEntryLike): Promise<EntryLike[]> {
  const reader = dir.createReader();
  const readBatch = () =>
    new Promise<EntryLike[]>((resolve, reject) => reader.readEntries(resolve, reject));
  const all: EntryLike[] = [];
  let batch = await readBatch();
  while (batch.length > 0) {
    all.push(...batch);
    batch = await readBatch();
  }
  return all;
}

function readFile(entry: FileEntryLike): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

export type CollectOptions = {
  /** Normalized extensions (leading dot); `undefined` accepts every file. */
  extensions: string[] | undefined;
  /** When `false`, dropped folders are skipped and only top-level files are taken. */
  allowFolders: boolean;
};

export type CollectResult = {
  files: File[];
  /** Number of top-level folders skipped because folders are not allowed. */
  skippedFolders: number;
};

/**
 * Collects files from dropped entries. Top-level files are filtered by extension only,
 * so a file the user dropped explicitly is never dropped for its name. Inside folders,
 * hidden entries and `__MACOSX` are skipped as well.
 */
export async function collectDroppedFiles(
  entries: EntryLike[],
  { extensions, allowFolders }: CollectOptions,
): Promise<CollectResult> {
  const files: File[] = [];
  let skippedFolders = 0;

  const walk = async (dir: DirectoryEntryLike): Promise<void> => {
    for (const child of await readAllEntries(dir)) {
      if (isJunkName(child.name)) continue;
      if (isDirectoryEntry(child)) await walk(child);
      else if (isFileEntry(child) && matchesExtensions(child.name, extensions))
        files.push(await readFile(child));
    }
  };

  for (const entry of entries) {
    if (isDirectoryEntry(entry)) {
      if (allowFolders) await walk(entry);
      else skippedFolders++;
    } else if (isFileEntry(entry) && matchesExtensions(entry.name, extensions)) {
      files.push(await readFile(entry));
    }
  }

  return { files, skippedFolders };
}

/** Maps with at most `limit` calls in flight; keeps input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  // Every index below items.length gets written, so the array ends up dense.
  const results: R[] = [];
  let next = 0;
  // After a failure the result is a rejection, so workers stop taking new items.
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i]);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
