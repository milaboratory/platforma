import { RangeBytes } from '@milaboratories/pl-model-common';
import { ensureDirExists, fileExists, mapEntries, MiLogger } from '@milaboratories/ts-helpers';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { addRange, doesRangeExist, Ranges, rangesFileName, rangesFilePostfix, rangesSize, readRangesFile, writeRangesFile } from './ranges';
import { writeToSparseFile } from './file';
import { functions } from '@milaboratories/helpers';

/** The implementer of SparseCacheRanges could throw it if ranges were corrupted. */
export class CorruptedRangesError extends Error {
  name = 'CorruptedRangesError';
}

/** Extracted ranges methods to be able to store ranges somewhere else (e.g. in memory for tests). */
export interface SparseCacheRanges {
  get(key: string): Promise<Ranges>;
  set(key: string, ranges: Ranges): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Stores ranges in a directory as JSON files (the default implementation). */
export class SparseCacheFsRanges implements SparseCacheRanges {
  constructor(
    private readonly logger: MiLogger,
    private readonly cacheDir: string,
  ) {}

  private fPath(key: string): string {
    return path.join(this.cacheDir, rangesFileName(key));
  }

  async get(key: string): Promise<Ranges> {
    return await readRangesFile(this.logger, this.fPath(key));
  }

  async set(key: string, ranges: Ranges) {
    return await writeRangesFile(this.logger, this.fPath(key), ranges);
  }

  async delete(key: string) {
    await fs.rm(this.fPath(key));
  }
}

/** Extracted interface for storing sparse files. */
export interface SparseFileStorage {
  all(): Promise<string[]>;
  exists(key: string): Promise<boolean>;
  path(key: string): string;
  write(key: string, data: Uint8Array, from: number): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Stores sparse files in a directory (the default implementation). */
export class SparseCacheFsFile implements SparseFileStorage {
  private readonly suffix = '.sparse.bin';

  constructor(
    private readonly logger: MiLogger,
    private readonly cacheDir: string,
  ) {}

  async all(): Promise<string[]> {
    await ensureDirExists(this.cacheDir);
    const files = await fs.readdir(this.cacheDir);
    return files.filter((f) => f.endsWith(this.suffix));
  }

  async exists(key: string): Promise<boolean> {
    return await fileExists(this.path(key));
  }

  path(key: string): string {
    return path.join(this.cacheDir, key + this.suffix);
  }

  async write(key: string, data: Uint8Array, from: number): Promise<void> {
    await ensureDirExists(this.cacheDir);
    await writeToSparseFile(this.logger, process.platform, this.path(key), data, from);
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.path(key));
  }
}

/** LRU cache for ranges of sparse files. */
export class SparseCache implements AsyncDisposable {
  /** Fields are public for tests. */

  /** The lock to make sure cache requests are done one by one. */
  private lock = new functions.AwaitLock()

  public keyToLastAccessTime = new Map<string, Date>();
  public size = 0;

  constructor(
    public readonly logger: MiLogger,
    /** The hard limit in bytes. */
    public readonly maxSize: number,
    public readonly ranges: SparseCacheRanges,
    public readonly storage: SparseFileStorage,
  ) {}

  /** Resets a cache's size by rereading everything we already store.
   * Safe for concurrent use. */
  async reset() {
    await withLock(this.lock, async () => {
      await this.resetUnsafe();
    })
  }

  /** Returns a path to the key if the range exists in a cache, otherwise returns undefined.
   * Safe for concurrent use. */
  async get(key: string, range: RangeBytes): Promise<string | undefined> {
    return await withLock(this.lock, async () => {
      return await this.getUnsafe(key, range);
    });
  }

  /** Sets data to the cache's file and clear the cache if it's needed.
   * Safe for concurrent use. */
  async set(key: string, range: RangeBytes, data: Uint8Array): Promise<void> {
    await withLock(this.lock, async () => {
      await this.setUnsafe(key, range, data);
    })
  }

  private async resetUnsafe() {
    this.size = 0;
    this.keyToLastAccessTime = new Map<string, Date>();

    const now = new Date();
    // In rmKey method we first deletes the key from a storage and only then from ranges,
    // so if something goes wrong between 2 operations,
    // on reset the logic will be correct.
    for (const key of await this.storage.all()) {
      const ranges = await this.ranges.get(key);
      this.size += rangesSize(ranges);
      this.keyToLastAccessTime.set(key, now);
    }
  }

  private async getUnsafe(key: string, range: RangeBytes): Promise<string | undefined> {
    // It first checks the storage, and then the ranges.
    // In another method, when we remove a key, it first deletes a key from a storage and then from ranges,
    // so if we don't have a key in storage but have it in ranges, the logic here is correct.
    // We probably could reverse the operations here and there, and everywhere we work with both storage and ranges.
    if (await this.storage.exists(key)) {
      this.keyToLastAccessTime.set(key, new Date());

      const ranges = await this.getRanges(key);
      if (doesRangeExist(ranges, range)) {
        return this.storage.path(key);
      }

      return undefined;
    }

    return undefined;
  }

  private async setUnsafe(key: string, range: { from: number; to: number; }, data: Uint8Array) {
    await this.setWithoutEviction(key, range, data);
    await this.ensureEvicted();
  }

  /** Sets a key and recalculates a size, but doesn't ensures that the size is less than the hard limit. */
  async setWithoutEviction(key: string, range: RangeBytes, data: Uint8Array): Promise<void> {
    if (range.to - range.from !== data.length) {
      throw new Error(
        `SparseCache.set: trying to set ${key} with wrong range length: `
        + `range: ${JSON.stringify(range)}, data: ${data.length}`
      );
    }

    this.keyToLastAccessTime.set(key, new Date());

    const ranges = await this.getRanges(key);
    this.size -= rangesSize(ranges);

    await this.storage.write(key, data, range.from);

    const newRanges = addRange(ranges, range);
    this.size += rangesSize(newRanges);

    await this.ranges.set(key, newRanges);
  }

  /** Ensures the size is less than hard limit by deleting the oldest keys. */
  async ensureEvicted(): Promise<void> {
    const byTime = mapEntries(this.keyToLastAccessTime);
    byTime.sort(([_, aDate], [__, bDate]) => bDate.getTime() - aDate.getTime());

    while (this.size > this.maxSize) {
      const keyAndDate = byTime.pop(); // removes the oldest
      if (!keyAndDate) {
        break;
      }
      const [key, _] = keyAndDate;

      const ranges = await this.getRanges(key);
      this.size -= rangesSize(ranges);
      this.rmKey(key);
    }
  }

  /** Gets ranges and if they were corrupted, then remove the file from the cache and reset the cache's size. */
  private async getRanges(key: string) {
    try {
      return await this.ranges.get(key);
    } catch (e: unknown) {
      if (e instanceof CorruptedRangesError) {
        // We need to reset a state of the cache and update current size,
        // it's the only way to calculate the real size when one of the ranges were corrupted.
        await this.rmKey(key);
        await this.resetUnsafe();

        return await this.ranges.get(key);
      }

      throw e;
    }
  }

  /** Removes a key the state of the cache. The size should be updated. */
  private async rmKey(key: string) {
    await this.storage.delete(key);
    await this.ranges.delete(key);
    this.keyToLastAccessTime.delete(key);
  }

  async dispose(): Promise<void> {
    await this.lock.acquireAsync();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }
}

/** Acquires the lock and executes a callback. */
async function withLock<T>(lock: functions.AwaitLock, cb: () => Promise<T>): Promise<T> {
  try {
    await lock.acquireAsync();
    return await cb();
  } finally {
    lock.release();
  }
}
