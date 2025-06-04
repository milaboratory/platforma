import { RangeBytes } from '@milaboratories/pl-model-common';
import { ensureDirExists, fileExists, mapEntries, MiLogger } from '@milaboratories/ts-helpers';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { addRange, existRange, Ranges, rangesFileName, rangesFilePostfix, rangesSize, readRangesFile, writeRangesFile } from './ranges';
import { writeToSparseFile } from './file';

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

  async set(key: string, ranges: Ranges): Promise<void> {
    return await writeRangesFile(this.fPath(key), ranges);
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.fPath(key));
  }
}

/** Extracted interface for storing sparse files. */
export interface SparseFile {
  exists(key: string): Promise<boolean>;
  path(key: string): string;
  write(key: string, data: Uint8Array, from: number): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Stores sparse files in a directory (the default implementation). */
export class SparseCacheFsFile implements SparseFile {
  constructor(
    private readonly logger: MiLogger,
    private readonly cacheDir: string,
  ) {}

  async exists(key: string): Promise<boolean> {
    return await fileExists(this.path(key));
  }

  path(key: string): string {
    return path.join(this.cacheDir, key);
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
export class SparseCache {
  /** Fields are public for tests. */

  public keyToLastAccessTime = new Map<string, Date>();
  public size = 0;

  constructor(
    public readonly logger: MiLogger,
    public readonly maxSize: number,
    public readonly ranges: SparseCacheRanges,
    public readonly storage: SparseFile,
  ) {}

  public async initFromDir(cacheDir: string) {
    await ensureDirExists(cacheDir);

    const now = new Date();
    for (const file of await fs.readdir(cacheDir)) {
      if (file.endsWith(rangesFilePostfix)) {
        continue;
      }

      const ranges = await this.ranges.get(file);
      this.size += rangesSize(ranges);
      this.keyToLastAccessTime.set(file, now);
    }
  }

  async get(key: string, range: RangeBytes): Promise<string | undefined> {
    if (await this.storage.exists(key)) {
      this.keyToLastAccessTime.set(key, new Date());

      const ranges = await this.ranges.get(key);
      if (existRange(ranges, range)) {
        return this.storage.path(key);
      }

      return undefined;
    }

    return undefined;
  }

  async set(key: string, range: RangeBytes, data: Uint8Array): Promise<void> {
    await this.setNoClear(key, range, data);
    await this.ensureCleared();
  }

  async setNoClear(key: string, range: RangeBytes, data: Uint8Array): Promise<void> {
    this.keyToLastAccessTime.set(key, new Date());

    const ranges = await this.ranges.get(key);
    this.size -= rangesSize(ranges);

    await this.storage.write(key, data, range.from);

    const newRanges = addRange(ranges, range);
    this.size += rangesSize(newRanges);

    await this.ranges.set(key, newRanges);
  }

  async ensureCleared(): Promise<void> {
    const byTime = mapEntries(this.keyToLastAccessTime);
    byTime.sort(([_, aDate], [__, bDate]) => bDate.getTime() - aDate.getTime());

    while (this.size > this.maxSize) {
      const keyAndDate = byTime.pop(); // removes the oldest
      if (!keyAndDate) {
        break;
      }
      const [key, _] = keyAndDate;

      const ranges = await this.ranges.get(key);

      this.size -= rangesSize(ranges);
      await this.ranges.delete(key);
      await this.storage.delete(key);
    }
  }
}
