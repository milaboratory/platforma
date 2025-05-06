import { ResourceId } from '@milaboratories/pl-client';
import type { CallersCounter } from '@milaboratories/ts-helpers';
import { mapEntries, mapGet } from '@milaboratories/ts-helpers';

type PathLike = string;

/** The file for a cache.
 * If it's a whole file, then range is a whole file
 * and the difference equals to the whole file size. */
export type CachedFileRange = {
  range: RangeBytes;
  path: PathLike;
  baseKey: string;
  key: string;
  counter: CallersCounter;
};

export function validateCachedFileRange(file: CachedFileRange, errMsg: string) {
  validateRangeBytes(file.range, errMsg);
}

export function fileRangeSize(file: CachedFileRange): number {
  return file.range.to - file.range.from;
}

export type RangeBytes = {
  from: number;
  to: number;
}

export function validateRangeBytes(range: RangeBytes, errMsg: string) {
  if (range.from < 0 || range.to < 0 || range.from >= range.to) {
    throw new Error(`${errMsg}: invalid bytes range: ${range}`);
  }
}

/** A cache for ranged files.
 * Base key represents a key for all ranges of files.
 * Key represents a unique id of the file range.
 */
export class RangeBlobsCache {
  // all the fields are public to be used in tests.
  // They should not be used by clients of the class.

  public keyToFile: Map<string, CachedFileRange> = new Map();

  /** Base path, for that path there might be several parts of the file with different ranges, and there might be the whole file. */
  public baseKeyToFiles: Map<string, string[]> = new Map();

  public totalSizeBytes: number = 0;

  constructor(public readonly softSizeBytes: number) {}

  exists(baseKey: string, range?: RangeBytes): boolean {
    if (range == undefined) {
      return this.getFile(baseKey) != undefined;
    }

    return this.getFileByRange(baseKey, range) != undefined;
  }

  /** Returns the file that contains the range and adds a counter to it. */
  getFileAndInc(baseKey: string, callerId: string, range?: RangeBytes): CachedFileRange | undefined {
    let file: CachedFileRange | undefined;

    if (range == undefined) {
      file = this.getFile(baseKey);
    } else {
      file = this.getFileByRange(baseKey, range);
    }

    if (file == undefined) {
      return undefined;
    }

    file.counter.inc(callerId);

    return file;
  }

  /** Decrements a counter in a cache and if we exceeds
   * a soft limit, removes files with zero counters. */
  removeFile(key: string, callerId: string): CachedFileRange[] {
    mapGet(this.keyToFile, key).counter.dec(callerId);
    return this.toDelete();
  }

  /** Returns what results should be deleted to comply with the soft limit. */
  toDelete(): CachedFileRange[] {
    if (this.totalSizeBytes <= this.softSizeBytes) {
      return [];
    }

    const result: CachedFileRange[] = [];
    let freedBytes = 0;

    mapEntries(this.keyToFile)
      .filter(([_, file]: [string, CachedFileRange]) => file.counter.isZero())
      .forEach(([key, _]) => {
        if (this.totalSizeBytes - freedBytes <= this.softSizeBytes) {
          return;
        }

        const file = mapGet(this.keyToFile, key);
        freedBytes += fileRangeSize(file);
        result.push(file);
      });

    return result;
  }

  addCache(file: CachedFileRange, callerId?: string) {
    validateCachedFileRange(file, 'addCache');

    const created = this.keyToFile.get(file.key) == undefined;
    this.keyToFile.set(file.key, file);

    if (callerId != undefined) {
      file.counter.inc(callerId);
    }

    if (created) {
      const files = this.baseKeyToFiles.get(file.baseKey);
      if (files == undefined) {
        this.baseKeyToFiles.set(file.baseKey, [file.key]);
      } else {
        files.push(file.key);
      }

      this.totalSizeBytes += fileRangeSize(file);
    }
  }

  removeCache(file: CachedFileRange) {
    this.keyToFile.delete(file.key);
    const files = this.baseKeyToFiles.get(file.baseKey);
    if (files != undefined) {
      const newFiles = files.filter((key) => key !== file.key);
      if (newFiles.length > 0) {
        this.baseKeyToFiles.set(file.baseKey, newFiles);
      } else {
        this.baseKeyToFiles.delete(file.baseKey);
      }
    }

    this.totalSizeBytes -= fileRangeSize(file);
  }

  private getFile(baseKey: string): CachedFileRange | undefined {
    return this.keyToFile.get(baseKey);
  }

  private getFileByRange(baseKey: string, range: RangeBytes): CachedFileRange | undefined {
    const files = this.baseKeyToFiles.get(baseKey);
    if (files == undefined) {
      return undefined;
    }

    for (const key of files) {
      const file = mapGet(this.keyToFile, key);

      if (file.range.from <= range.from && range.to <= file.range.to) {
        return file;
      }
    }

    return undefined;
  }
}
