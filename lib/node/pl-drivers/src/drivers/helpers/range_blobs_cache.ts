import { ResourceId } from '@milaboratories/pl-client';
import type { CallersCounter } from '@milaboratories/ts-helpers';
import { mapEntries, mapGet } from '@milaboratories/ts-helpers';

type PathLike = string;

export type CachedFile = WholeFile | RangeFile;

export type WholeFile = {
  type: 'whole';
  size: number;
  path: PathLike;
  basePath: PathLike;
  key: string;
  counter: CallersCounter;
}

export type RangeFile = {
  type: 'range';
  size: number;
  range: RangeBytes;
  path: PathLike;
  basePath: PathLike;
  key: string;
  counter: CallersCounter;
}

export type RangeBytes = {
  from: number;
  to: number;
}

export class RangeBlobsCache {
  // all the fields are public to be used in tests.
  // They should not be used by clients of the class.

  public pathToFile: Map<PathLike, CachedFile> = new Map();

  /** Base path, for that path there might be several parts of the file with different ranges, and there might be the whole file. */
  public basePathToFiles: Map<PathLike, PathLike[]> = new Map();

  public totalSizeBytes: number = 0;

  constructor(public readonly softSizeBytes: number) {}

  existsWholeFile(path: PathLike): boolean {
    return this.pathToFile.get(path) != undefined;
  }

  exists(basePath: string, range?: RangeBytes): boolean {
    if (range == undefined) {
      return this.existsWholeFile(basePath);
    }

    return this.getFileByRange(basePath, range) != undefined;
  }

  /** Returns the file that contains the range. */
  getFile(path: PathLike, callerId: string, range?: RangeBytes): CachedFile | undefined {
    if (range == undefined) {
      const file = this.pathToFile.get(path);
      if (file != undefined) {
        file.counter.inc(callerId);
      }

      return file;
    }

    const file = this.getFileByRange(path, range);
    if (file == undefined) {
      return undefined;
    }

    file.counter.inc(callerId);
    return file;
  }

  /** Decrements a counter in a cache and if we exceeds
   * a soft limit, removes files with zero counters. */
  removeFile(path: PathLike, callerId: string): CachedFile[] {
    mapGet(this.pathToFile, path).counter.dec(callerId);
    return this.toDelete();
  }

  /** Returns what results should be deleted to comply with the soft limit. */
  toDelete(): CachedFile[] {
    if (this.totalSizeBytes <= this.softSizeBytes) return [];

    const result: CachedFile[] = [];
    let freedBytes = 0;

    mapEntries(this.pathToFile)
      .filter(([_, file]: [string, CachedFile]) => file.counter.isZero())
      .forEach(([path, _]) => {
        if (this.totalSizeBytes - freedBytes <= this.softSizeBytes) {
          return;
        }

        const file = mapGet(this.pathToFile, path);
        freedBytes += file.size;
        result.push(file);
      });

    return result;
  }

  addCache(file: CachedFile, callerId: string) {
    const created = this.pathToFile.get(file.path) == undefined;
    this.pathToFile.set(file.path, file);
    file.counter.inc(callerId);

    if (file.size < 0) {
      throw new Error(`empty sizeBytes: ${file}`);
    }

    if (created) {
      const files = this.basePathToFiles.get(file.basePath);
      if (files == undefined) {
        this.basePathToFiles.set(file.basePath, [file.path]);
      } else {
        files.push(file.path);
      }

      this.totalSizeBytes += file.size;
    }
  }

  removeCache(file: CachedFile) {
    this.pathToFile.delete(file.path);
    const files = this.basePathToFiles.get(file.basePath);
    if (files != undefined) {
      const newFiles = files.filter((path) => path !== file.path);
      if (newFiles.length > 0) {
        this.basePathToFiles.set(file.basePath, newFiles);
      } else {
        this.basePathToFiles.delete(file.basePath);
      }
    }

    this.totalSizeBytes -= file.size;
  }

  private getFileByRange(basePath: PathLike, range: RangeBytes): CachedFile | undefined {
    const files = this.basePathToFiles.get(basePath);
    if (files == undefined) {
      return undefined;
    }

    for (const path of files) {
      const file = mapGet(this.pathToFile, path);

      if (file.type === 'whole') {
        return file;
      }

      if (file.range.from <= range.from && range.to <= file.range.to) {
        return file;
      }
    }

    return undefined;
  }
}
