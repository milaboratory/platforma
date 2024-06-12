import { CallersCounter, mapEntries, mapGet } from "@milaboratory/ts-helpers";

type PathLike = string;

export interface CachedFile {
  sizeBytes: number;
  path: PathLike;
  counter: CallersCounter;
}

/** Holds counters of how many callers need the file.
 * If some counters become zero and a cache size exceeds a soft limit,
 * remove not needed blobs one by one.
 * If all the files are needed, do nothing. */
export class FilesCache<T extends CachedFile> {
  private cache: Map<PathLike, T> = new Map();
  private totalSizeBytes: number = 0;

  constructor(private readonly softSizeBytes: number) {}

  existsFile(path: PathLike): boolean {
    return this.cache.get(path) != undefined;
  }

  getFile(path: PathLike, callerId: string): T | undefined {
    const file = this.cache.get(path);
    if (file != undefined) {
      file.counter.inc(callerId);
    }

    return file;
  }

  /** Decrements a counter in a cache and if we exceeds
   * a soft limit, removes files with zero counters. */
  removeFile(path: PathLike, callerId: string): T[] {
    mapGet(this.cache, path).counter.dec(callerId);
    return this.toDelete();
  }

  /** Returns what results should be deleted to comply with the soft limit. */
  toDelete(): T[] {
    if (this.totalSizeBytes <= this.softSizeBytes) return [];

    const result: T[] = [];
    let freedBytes = 0;

    mapEntries(this.cache)
      .filter(([_, file]: [string, T]) => file.counter.isZero())
      .forEach(([path, _]) => {
        if (this.totalSizeBytes - freedBytes <= this.softSizeBytes)
          return;
        const file = mapGet(this.cache, path);
        freedBytes += file.sizeBytes;
        result.push(file);
      });

    return result;
  }

  addCache(file: T, callerId: string) {
    const created = this.cache.get(file.path) == undefined;
    this.cache.set(file.path, file);
    file.counter.inc(callerId);

    if (file.sizeBytes <= 0)
      throw new Error(`empty sizeBytes: ${file}`);

    if (created)
      this.totalSizeBytes += file.sizeBytes;
  }

  removeCache(file: T) {
    this.cache.delete(file.path);
    this.totalSizeBytes -= file.sizeBytes;
  }
}

