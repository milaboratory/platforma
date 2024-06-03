import { ChangeSource, TrackedAccessorProvider, Watcher } from '@milaboratory/computable';
import { ResourceId, ResourceType } from '@milaboratory/pl-client-v2';
import { CallersCounter, TaskProcessor, mapEntries, mapGet, notEmpty } from '@milaboratory/ts-helpers';
import * as fsp from 'node:fs/promises';
import * as fs from 'fs';
import * as path from 'node:path';
import { Writable } from 'node:stream'
import { ClientDownload } from '../clients/download';
import { ReadableStream } from "node:stream/web";
import { ResourceInfo } from '../clients/helpers';

export interface DownloadSyncReader {
  /** If a blob were already downloaded, returns a path.
   * A path can be passed to a DownloadAsyncReader to retrieve a blob content. */
  getPathToDownloadedBlob(
    watcher: Watcher,
    blobId: ResourceId,
    rType: ResourceType,
    callerId: string,
  ): BlobResult | undefined;

  /** Get an Url for downloading without downloading it on a hard drive. */
  getUrl(
    watcher: Watcher,
    blobId: ResourceId,
    rType: ResourceType,
    callerId: string,
  ): string | undefined;
}

export interface DownloadDestroyer {
  /** Call when a renderer will be destroyed.
   * It will clean a cache on a hard drive if it exceeds a soft limit. */
  releaseBlob(rId: ResourceId, callerId: string): Promise<void>;

  /** Call it when the cell that holds an url is destroyed. */
  releaseUrl(rId: ResourceId, callerId: string): Promise<void>;
}

/** Just binds a watcher to a DownloadSyncReader. */
export class DownloadSyncAccessor {
  constructor(
    private readonly w: Watcher,
    private readonly reader: DownloadSyncReader
  ) {}

  getPathToDownloadedBlob(rId: ResourceId, rType: ResourceType, callerId: string) {
    return this.reader.getPathToDownloadedBlob(this.w, rId, rType, callerId);
  }

  getUrl(rId: ResourceId, rType: ResourceType, callerId: string): string | undefined {
    return this.reader.getUrl(this.w, rId, rType, callerId);
  }
}

export interface BlobResult {
  readonly rId: ResourceId;
  readonly path: PathLike;
  readonly sizeBytes: number;
}

export type PathLike = string;

/** DownloadDriver holds a queue of downloading tasks,
 * and notifies every watcher when a file were downloaded. */
export class DownloadDriver implements
TrackedAccessorProvider<DownloadSyncAccessor>,
DownloadSyncReader,
DownloadDestroyer {
  /** Represents a Resource Id to the path of a blob as a map. */
  private idToDownloadedPath: Map<ResourceId, string> = new Map();

  /** Writes and removes files to a hard drive and holds a counter for every
   * file that should be kept. */
  private cache: FilesCache;

  /** Represents a Resource Id to ChangeSource as a map. */
  private idToChange: Map<ResourceId, ChangeSource> = new Map();

  /** Downloads files and writes them to the local dir. */
  private downloadQueue: TaskProcessor;

  /** Holds Urls */
  private idToUrl: Map<ResourceId, UrlGetter> = new Map();

  constructor(
    private readonly clientDownload: ClientDownload,
    private readonly saveDir: string,
    cacheSoftSizeBytes: number,
    nConcurrentDownloads: number = 10,
  ) {
    this.cache = new FilesCache(cacheSoftSizeBytes);
    this.downloadQueue = new TaskProcessor(nConcurrentDownloads);
  }

  /** Just binds a watcher to DownloadSyncAccessor. */
  createInstance(watcher: Watcher): DownloadSyncAccessor {
    return new DownloadSyncAccessor(watcher, this);
  }

  /** Implements DownloadAsyncReader. */
  getBlob(path: PathLike): BlobResult | undefined {
    return this.cache.getBlob(path);
  }

  /** Gets a blob by its resource id or downloads a blob and sets it in a cache.*/
  getPathToDownloadedBlob(
    w: Watcher,
    rId: ResourceId,
    rType: ResourceType,
    callerId: string,
  ): BlobResult | undefined {
    const path = this.idToDownloadedPath.get(rId);

    if (path == undefined) {
      // Schedule the blob downloading.
      const fPath = this.setNewFilePath(w, rId);
      this.downloadQueue.push({
        fn: () => this.downloadBlob(rId, rType, fPath, callerId),
        recoverableErrorPredicate: (e: unknown) => true,
      })

      return undefined;
    }

    const result = this.cache.getBlob(path, callerId);

    if (result == undefined) {
      // Another thing is already calculating a result.
      this.attachWatcherToFilePath(w, rId);
      return undefined;
    }

    // Path is ready, the client can request a blob.
    return result;
  }

  private setNewFilePath(w: Watcher, rId: ResourceId) {
    const change = new ChangeSource();
    this.idToChange.set(rId, change);
    change.attachWatcher(w);

    const fPath = this.getFilePath(rId);
    this.idToDownloadedPath.set(rId, fPath);

    return fPath;
  }

  private async downloadBlob(
    id: ResourceId,
    type: ResourceType,
    fPath: string,
    callerId: string,
  ) {
    const { content, size } = await this.clientDownload.downloadBlob(
      { id, type },
    );
    const result: BlobResult = {rId: id, path: fPath, sizeBytes: size};
    await this.cache.addBlob(result, content, callerId);
    mapGet(this.idToChange, id).markChanged();
  }

  private attachWatcherToFilePath(w: Watcher, rId: ResourceId) {
    mapGet(this.idToChange, rId).attachWatcher(w);
  }

  /** Gets an URL by its resource id or downloads a blob and sets it in a cache. */
  getUrl(
    w: Watcher,
    id: ResourceId,
    type: ResourceType,
    callerId: string,
  ): string | undefined {
    const urlGetter = this.idToUrl.get(id);

    if (urlGetter == undefined) {
      const newUrlGetter = new UrlGetter(this.clientDownload, { id, type });
      this.idToUrl.set(id, newUrlGetter);
      return newUrlGetter.getUrlOrSchedule(w, callerId);
    }

    return urlGetter.getUrlOrSchedule(w, callerId);
  }

  /** Implements DownloadDestroyer. */
  async releaseBlob(blobId: ResourceId, callerId: string) {
    const path = this.idToDownloadedPath.get(blobId);
    if (path == undefined)
      return;

    const deletedBlobIds = await this.cache.removeBlob(notEmpty(path), callerId);

    deletedBlobIds.forEach((blobId) => {
      this.idToChange.delete(blobId);
      this.idToDownloadedPath.delete(blobId);
      this.idToChange.get(blobId)?.markChanged();
    })
  }

  /** Implements DownloadDestroyer. */
  async releaseUrl(blobId: ResourceId, callerId: string) {
    const deleted = this.idToUrl.get(blobId)?.release(callerId) ?? false;
    if (deleted)
      this.idToUrl.delete(blobId);
  }

  /** Removes all files from a hard drive. */
  async releaseAll() {
    this.downloadQueue.stop();

    this.idToChange.forEach((change, blobId) => {
      this.idToChange.delete(blobId);
      this.idToDownloadedPath.delete(blobId);
      change.markChanged();
    });
    await this.cache.removeAll();
  }

  private getFilePath(rId: ResourceId): string {
    return path.join(this.saveDir, String(BigInt(rId)));
  }
}

class UrlGetter {
  private updating: Promise<void> | undefined;
  private url: string | undefined;
  private change: ChangeSource = new ChangeSource();
  private counter: CallersCounter = new CallersCounter();

  constructor(
    private readonly clientDownload: ClientDownload,
    private readonly rInfo: ResourceInfo,
  ) {
  }

  getUrlOrSchedule(w: Watcher, callerId: string) {
    this.counter.inc(callerId);
    this.change.attachWatcher(w);

    if (this.url !== undefined) {
      const url = this.url;
      // this.url = undefined; // TODO: do we need to refresh Url somehow? It expires.
      return url;
    }    

    if (this.updating !== undefined) {
      return undefined;
    }

    this.updating = this.getUrl();
    return undefined;
  }

  private async getUrl() {
    this.url = (await this.clientDownload.getUrl(this.rInfo)).downloadUrl;
    this.change.markChanged();
    this.updating = undefined;
  }

  release(callerId: string): boolean {
    return this.counter.dec(callerId);
  }
}

/** Holds counters of how many renders need the file.
 * If some counters become zero and a cache size exceeds a soft limit,
 * remove not needed blobs one by one.
 * If all the files are needed, do nothing. */
export class FilesCache {
  private cache: Map<PathLike, BlobResult> = new Map();
  private counters: Map<PathLike, CallersCounter> = new Map();
  private totalSizeBytes: number = 0;

  constructor(private readonly softSizeBytes: number) {}

  async removeAll() {
    this.cache.forEach((blob) => this.doDelete(blob));
  }

  getBlob(path: PathLike, callerId?: string): BlobResult | undefined {
    if (callerId !== undefined)
      this.incCounter(path, callerId)

    return this.cache.get(path);
  }

  /** Writes a file (if it doesn't exist) and sets it in a cache. */
  async addBlob(blob: BlobResult, content: ReadableStream, callerId: string) {
    // check in case we already have a file by this resource id
    // in the directory. It can happen when we forgot to call removeAll
    // in the previous launch.
    if (!(await fileExists(blob.path))) {
      const fileToWrite = Writable.toWeb(fs.createWriteStream(blob.path));
      await content.pipeTo(fileToWrite);
    }

    this.addCache(blob, callerId);
  }

  /** Decrements a counter in a cache and if we exceeds
   * a soft limit, removes files with zero counters. */
  async removeBlob(path: PathLike, callerId: string): Promise<ResourceId[]> {
    this.decCounter(path, callerId);
    const toDelete = this.needDelete();
    await Promise.all(toDelete.map((blob) => this.doDelete(blob)));

    return toDelete.map((blob) => blob.rId);
  }

  /** Returns what results should be deleted to comply with the soft limit. */
  needDelete(): BlobResult[] {
    if (this.totalSizeBytes <= this.softSizeBytes) return [];

    const toDelete = new Array<BlobResult>();
    let freedBytes = 0;

    mapEntries(this.counters)
      .filter(([_, counter]: [string, CallersCounter]) => counter.isZero())
      .forEach(([path, _]) => {
        const blob = mapGet(this.cache, path);
        if (this.totalSizeBytes - freedBytes <= this.softSizeBytes)
          return;
        freedBytes += blob.sizeBytes;
        toDelete.push(blob);
      });

    return toDelete;
  }

  /** Deletes a file. */
  private async doDelete(blob: BlobResult) {
    await fsp.rm(blob.path);
    this.removeCache(blob);
  }

  addCache(blob: BlobResult, callerId: string) {
    this.cache.set(blob.path, blob);
    const created = this.incCounter(blob.path, callerId);

    if (created)
      this.totalSizeBytes += blob.sizeBytes;
  }

  removeCache(blob: BlobResult) {
    this.counters.delete(blob.path);
    this.cache.delete(blob.path);
    this.totalSizeBytes -= blob.sizeBytes;
  }

  incCounter(path: string, callerId: string): boolean {
    let c = this.counters.get(path);
    if (c === undefined) {
      c = new CallersCounter();
      this.counters.set(path, c);
    }

    return c.inc(callerId);
  }

  decCounter(path: string, callerId: string): boolean {
    return mapGet(this.counters, path).dec(callerId);
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fsp.access(path);
    return true;
  } catch {
    return false;
  }
}
