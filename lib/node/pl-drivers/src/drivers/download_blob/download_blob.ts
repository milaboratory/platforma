import type {
  ComputableCtx,
  ComputableStableDefined,
  Watcher,
} from '@milaboratories/computable';
import {
  ChangeSource,
  Computable,
} from '@milaboratories/computable';
import type { ResourceId, ResourceType } from '@milaboratories/pl-client';
import { resourceIdToString, stringifyWithResourceId } from '@milaboratories/pl-client';
import type {
  AnyLogHandle,
  BlobDriver,
  ContentHandler,
  GetContentOptions,
  LocalBlobHandle,
  LocalBlobHandleAndSize,
  ReadyLogHandle,
  RemoteBlobHandle,
  RemoteBlobHandleAndSize,
  StreamingApiResponse,
} from '@milaboratories/pl-model-common';
import { type RangeBytes, validateRangeBytes } from '@milaboratories/pl-model-common';
import type {
  PlTreeEntry,
  ResourceInfo,
  ResourceSnapshot
} from '@milaboratories/pl-tree';
import {
  isPlTreeEntry,
  makeResourceSnapshot,
  treeEntryToResourceInfo,
} from '@milaboratories/pl-tree';
import type { MiLogger, Signer } from '@milaboratories/ts-helpers';
import { CallersCounter, mapGet, TaskProcessor } from '@milaboratories/ts-helpers';
import Denque from 'denque';
import * as fs from 'fs';
import { randomUUID } from 'node:crypto';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import { buffer } from 'node:stream/consumers';
import { Readable } from 'node:stream';
import type { ClientDownload } from '../../clients/download';
import type { ClientLogs } from '../../clients/logs';
import { withFileContent } from '../helpers/read_file';
import {
  isLocalBlobHandle,
  newLocalHandle,
  parseLocalHandle,
} from '../helpers/download_local_handle';
import {
  isRemoteBlobHandle,
  newRemoteHandle,
  parseRemoteHandle,
} from '../helpers/download_remote_handle';
import { Updater, WrongResourceTypeError } from '../helpers/helpers';
import { getResourceInfoFromLogHandle, newLogHandle } from '../helpers/logs_handle';
import { getSize, OnDemandBlobResourceSnapshot } from '../types';
import { blobKey, pathToKey } from './blob_key';
import { DownloadBlobTask, nonRecoverableError } from './download_blob_task';
import { FilesCache } from '../helpers/files_cache';
import { SparseCache, SparseCacheFsFile, SparseCacheFsRanges } from './sparse_cache/cache';
import { isOffByOneError } from '../../helpers/errors';

export type DownloadDriverOps = {
  /**
   * A soft limit of the amount of blob storage, in bytes.
   * Once exceeded, the download driver will start deleting blobs one by one
   * when they become unneeded.
   * */
  cacheSoftSizeBytes: number;

  /**
   * A hard limit of the amount of sparse cache, in bytes.
   * Once exceeded, the download driver will start deleting blobs one by one.
   *
   * The sparse cache is used to store ranges of blobs.
   * */
  rangesCacheMaxSizeBytes: number;

  /**
   * Max number of concurrent downloads while calculating computable states
   * derived from this driver
   * */
  nConcurrentDownloads: number;
};

/** DownloadDriver holds a queue of downloading tasks,
 * and notifies every watcher when a file were downloaded. */
export class DownloadDriver implements BlobDriver {
  /** Represents a unique key to the path of a blob as a map. */
  private keyToDownload: Map<string, DownloadBlobTask> = new Map();

  /** Writes and removes files to a hard drive and holds a counter for every
   * file that should be kept. */
  private cache: FilesCache<DownloadBlobTask>;
  private rangesCache: SparseCache;

  /** Downloads files and writes them to the local dir. */
  private downloadQueue: TaskProcessor;

  private keyToOnDemand: Map<string, OnDemandBlobHolder> = new Map();

  private idToLastLines: Map<string, LastLinesGetter> = new Map();
  private idToProgressLog: Map<string, LastLinesGetter> = new Map();

  private readonly saveDir: string;

  constructor(
    private readonly logger: MiLogger,
    private readonly clientDownload: ClientDownload,
    private readonly clientLogs: ClientLogs,
    saveDir: string,
    private readonly rangesCacheDir: string,
    private readonly signer: Signer,
    private readonly ops: DownloadDriverOps,
  ) {
    this.cache = new FilesCache(this.ops.cacheSoftSizeBytes);

    const fsRanges = new SparseCacheFsRanges(this.logger, this.rangesCacheDir);
    const fsStorage = new SparseCacheFsFile(this.logger, this.rangesCacheDir);
    this.rangesCache = new SparseCache(this.logger, this.ops.rangesCacheMaxSizeBytes, fsRanges, fsStorage);

    this.downloadQueue = new TaskProcessor(this.logger, ops.nConcurrentDownloads);

    this.saveDir = path.resolve(saveDir);
  }

  static async init(
    logger: MiLogger,
    clientDownload: ClientDownload,
    clientLogs: ClientLogs,
    saveDir: string,
    rangesCacheDir: string,
    signer: Signer,
    ops: DownloadDriverOps,
  ): Promise<DownloadDriver> {
    const driver = new DownloadDriver(logger, clientDownload, clientLogs, saveDir, rangesCacheDir, signer, ops);
    await driver.rangesCache.reset();

    return driver;
  }

  /** Gets a blob or part of the blob by its resource id or downloads a blob and sets it in a cache. */
  public getDownloadedBlob(
    res: ResourceInfo | PlTreeEntry,
    ctx: ComputableCtx,
  ): LocalBlobHandleAndSize | undefined;
  public getDownloadedBlob(
    res: ResourceInfo | PlTreeEntry,
  ): ComputableStableDefined<LocalBlobHandleAndSize>;
  public getDownloadedBlob(
    res: ResourceInfo | PlTreeEntry,
    ctx?: ComputableCtx,
  ): Computable<LocalBlobHandleAndSize | undefined> | LocalBlobHandleAndSize | undefined {
    if (ctx === undefined) {
      return Computable.make((ctx) => this.getDownloadedBlob(res, ctx));
    }

    const rInfo = treeEntryToResourceInfo(res, ctx);

    const callerId = randomUUID();
    ctx.addOnDestroy(() => this.releaseBlob(rInfo, callerId));

    const result = this.getDownloadedBlobNoCtx(ctx.watcher, rInfo as ResourceSnapshot, callerId);
    if (result == undefined) {
      ctx.markUnstable('download blob is still undefined');
    }

    return result;
  }

  private getDownloadedBlobNoCtx(
    w: Watcher,
    rInfo: ResourceSnapshot,
    callerId: string,
  ): LocalBlobHandleAndSize | undefined {
    validateDownloadableResourceType('getDownloadedBlob', rInfo.type);

    // We don't need to request files with wider limits,
    // PFrame's engine does it disk-optimally by itself.

    const task = this.getOrSetNewTask(rInfo, callerId);
    task.attach(w, callerId);

    const result = task.getBlob();
    if (!result.done) {
      return undefined;
    }
    if (result.result.ok) {
      return result.result.value;
    }
    throw result.result.error;
  }

  private getOrSetNewTask(
    rInfo: ResourceSnapshot,
    callerId: string,
  ): DownloadBlobTask {
    const key = blobKey(rInfo.id);

    const inMemoryTask = this.keyToDownload.get(key);
    if (inMemoryTask) {
      return inMemoryTask;
    }

    // schedule the blob downloading, then it'll be added to the cache.
    const fPath = path.resolve(this.saveDir, key);

    const newTask = new DownloadBlobTask(
      this.logger,
      this.clientDownload,
      rInfo,
      newLocalHandle(fPath, this.signer),
      fPath,
    );
    this.keyToDownload.set(key, newTask);

    this.downloadQueue.push({
      fn: () => this.downloadBlob(newTask, callerId),
      recoverableErrorPredicate: (e) => !nonRecoverableError(e),
    });

    return newTask;
  }

  private async downloadBlob(task: DownloadBlobTask, callerId: string) {
    await task.download();
    const blob = task.getBlob();
    if (blob.done && blob.result.ok) {
      this.cache.addCache(task, callerId);
    }
  }

  /** Gets on demand blob. */
  public getOnDemandBlob(
    res: OnDemandBlobResourceSnapshot | PlTreeEntry,
  ): Computable<RemoteBlobHandleAndSize>;
  public getOnDemandBlob(
    res: OnDemandBlobResourceSnapshot | PlTreeEntry,
    ctx?: undefined,
    fromBytes?: number,
    toBytes?: number,
  ): Computable<RemoteBlobHandleAndSize>;
  public getOnDemandBlob(
    res: OnDemandBlobResourceSnapshot | PlTreeEntry,
    ctx: ComputableCtx,
    fromBytes?: number,
    toBytes?: number,
  ): RemoteBlobHandleAndSize;
  public getOnDemandBlob(
    res: OnDemandBlobResourceSnapshot | PlTreeEntry,
    ctx?: ComputableCtx,
  ): ComputableStableDefined<RemoteBlobHandleAndSize> | RemoteBlobHandleAndSize | undefined {
    if (ctx === undefined) return Computable.make((ctx) => this.getOnDemandBlob(res, ctx));

    const rInfo: OnDemandBlobResourceSnapshot = isPlTreeEntry(res)
      ? makeResourceSnapshot(res, OnDemandBlobResourceSnapshot, ctx)
      : res;

    const callerId = randomUUID();
    ctx.addOnDestroy(() => this.releaseOnDemandBlob(rInfo.id, callerId));

    // note that the watcher is not needed,
    // the handler never changes.
    const result = this.getOnDemandBlobNoCtx(rInfo, callerId);

    return result;
  }

  private getOnDemandBlobNoCtx(
    info: OnDemandBlobResourceSnapshot,
    callerId: string,
  ): RemoteBlobHandleAndSize {
    validateDownloadableResourceType('getOnDemandBlob', info.type);

    let blob = this.keyToOnDemand.get(blobKey(info.id));

    if (blob === undefined) {
      blob = new OnDemandBlobHolder(getSize(info), newRemoteHandle(info, this.signer));
      this.keyToOnDemand.set(blobKey(info.id), blob);
    }

    blob.attach(callerId);

    return blob.getHandle();
  }

  /** Gets a path from a handle. */
  public getLocalPath(handle: LocalBlobHandle): string {
    const { path } = parseLocalHandle(handle, this.signer);
    return path;
  }

  /** Gets a content of a blob by a handle. */
  public async getContent(
    handle: LocalBlobHandle | RemoteBlobHandle,
    options?: GetContentOptions,
  ): Promise<Uint8Array>;
  /** @deprecated Use {@link getContent} with {@link GetContentOptions} instead */
  public async getContent(
    handle: LocalBlobHandle | RemoteBlobHandle,
    range?: RangeBytes,
  ): Promise<Uint8Array>;
  public async getContent(
    handle: LocalBlobHandle | RemoteBlobHandle,
    optionsOrRange?: GetContentOptions | RangeBytes,
  ): Promise<Uint8Array> {
    let options: GetContentOptions = {};
    if (typeof optionsOrRange === 'object' && optionsOrRange !== null) {
      if ('range' in optionsOrRange) {
        options = optionsOrRange;
      } else {
        const range = optionsOrRange as RangeBytes;
        validateRangeBytes(range, `getContent`);
        options = { range };
      }
    }

    const request = () => this.withContent(handle, {
      ...options,
      handler: async (content) => {
        const chunks: Uint8Array[] = [];
        for await (const chunk of content) {
          options.signal?.throwIfAborted();
          chunks.push(chunk);
        }
        return Buffer.concat(chunks);
      }
    });

    try {
      return await request();
    } catch (error) {
      if (isOffByOneError(error)) {
        return await request();
      }
      throw error;
    }
  }

  /** Gets a content stream of a blob by a handle and calls handler with it. */
  public async withContent<T>(
    handle: LocalBlobHandle | RemoteBlobHandle,
    options: GetContentOptions & {
      handler: ContentHandler<T>;
    },
  ): Promise<T> {
    const { range, signal, handler } = options;

    if (isLocalBlobHandle(handle)) {
      return await withFileContent({ path: this.getLocalPath(handle), range, signal, handler });
    }

    if (isRemoteBlobHandle(handle)) {
      const result = parseRemoteHandle(handle, this.signer);

      const key = blobKey(result.info.id);
      const filePath = await this.rangesCache.get(key, range ?? { from: 0, to: result.size });
      signal?.throwIfAborted();

      if (filePath) return await withFileContent({ path: filePath, range, signal, handler });

      return await this.clientDownload.withBlobContent(
        result.info,
        { signal },
        options,
        async (content, size) => {
          const [handlerStream, cacheStream] = content.tee();
          
          const handlerPromise = handler(handlerStream, size);
          const _cachePromise = buffer(cacheStream)
            .then((data) => this.rangesCache.set(key, range ?? { from: 0, to: result.size }, data))
            .catch(() => {
              // Ignore cache errors - they shouldn't affect the main handler result
              // This prevents unhandled promise rejections when the stream fails
            });

          return await handlerPromise;
        }
      );
    }

    throw new Error('Malformed remote handle');
  }

  /**
   * Creates computable that will return blob content once it is downloaded.
   * Uses downloaded blob handle under the hood, so stores corresponding blob in file system.
   */
  public getComputableContent(
    res: ResourceInfo | PlTreeEntry,
    range?: RangeBytes,
  ): ComputableStableDefined<Uint8Array> {
    if (range) {
      validateRangeBytes(range, `getComputableContent`);
    }

    return Computable.make((ctx) =>
      this.getDownloadedBlob(res, ctx), {
      postprocessValue: (v) => v ? this.getContent(v.handle, { range }) : undefined
    }
    ).withStableType()
  }

  /** Returns all logs and schedules a job that reads remain logs.
   * Notifies when a new portion of the log appeared. */
  public getLastLogs(
    res: ResourceInfo | PlTreeEntry,
    lines: number
  ): Computable<string | undefined>;
  public getLastLogs(
    res: ResourceInfo | PlTreeEntry,
    lines: number,
    ctx: ComputableCtx
  ): Computable<string | undefined>;
  public getLastLogs(
    res: ResourceInfo | PlTreeEntry,
    lines: number,
    ctx?: ComputableCtx,
  ): Computable<string | undefined> | string | undefined {
    if (ctx == undefined) return Computable.make((ctx) => this.getLastLogs(res, lines, ctx));

    const r = treeEntryToResourceInfo(res, ctx);
    const callerId = randomUUID();
    ctx.addOnDestroy(() => this.releaseBlob(r, callerId));

    const result = this.getLastLogsNoCtx(ctx.watcher, r as ResourceSnapshot, lines, callerId);
    if (result == undefined)
      ctx.markUnstable('either a file was not downloaded or logs was not read');

    return result;
  }

  private getLastLogsNoCtx(
    w: Watcher,
    rInfo: ResourceSnapshot,
    lines: number,
    callerId: string,
  ): string | undefined {
    validateDownloadableResourceType('getLastLogs', rInfo.type);
    const blob = this.getDownloadedBlobNoCtx(w, rInfo, callerId);
    if (blob == undefined) return undefined;

    const { path } = parseLocalHandle(blob.handle, this.signer);

    let logGetter = this.idToLastLines.get(blobKey(rInfo.id));

    if (logGetter == undefined) {
      const newLogGetter = new LastLinesGetter(path, lines);
      this.idToLastLines.set(blobKey(rInfo.id), newLogGetter);
      logGetter = newLogGetter;
    }

    const result = logGetter.getOrSchedule(w);
    if (result.error) throw result.error;

    return result.log;
  }

  /** Returns a last line that has patternToSearch.
   * Notifies when a new line appeared or EOF reached. */
  public getProgressLog(
    res: ResourceInfo | PlTreeEntry,
    patternToSearch: string
  ): Computable<string | undefined>;
  public getProgressLog(
    res: ResourceInfo | PlTreeEntry,
    patternToSearch: string,
    ctx: ComputableCtx
  ): string | undefined;
  public getProgressLog(
    res: ResourceInfo | PlTreeEntry,
    patternToSearch: string,
    ctx?: ComputableCtx,
  ): Computable<string | undefined> | string | undefined {
    if (ctx == undefined)
      return Computable.make((ctx) => this.getProgressLog(res, patternToSearch, ctx));

    const r = treeEntryToResourceInfo(res, ctx);
    const callerId = randomUUID();
    ctx.addOnDestroy(() => this.releaseBlob(r, callerId));

    const result = this.getProgressLogNoCtx(
      ctx.watcher,
      r as ResourceSnapshot,
      patternToSearch,
      callerId,
    );
    if (result === undefined)
      ctx.markUnstable('either a file was not downloaded or a progress log was not read');

    return result;
  }

  private getProgressLogNoCtx(
    w: Watcher,
    rInfo: ResourceSnapshot,
    patternToSearch: string,
    callerId: string,
  ): string | undefined {
    validateDownloadableResourceType('getProgressLog', rInfo.type);

    const blob = this.getDownloadedBlobNoCtx(w, rInfo, callerId);
    if (blob == undefined) return undefined;
    const { path } = parseLocalHandle(blob.handle, this.signer);

    let logGetter = this.idToProgressLog.get(blobKey(rInfo.id));

    if (logGetter == undefined) {
      const newLogGetter = new LastLinesGetter(path, 1, patternToSearch);
      this.idToProgressLog.set(blobKey(rInfo.id), newLogGetter);

      logGetter = newLogGetter;
    }

    const result = logGetter.getOrSchedule(w);
    if (result.error) throw result.error;

    return result.log;
  }

  /** Returns an Id of a smart object, that can read logs directly from
   * the platform. */
  public getLogHandle(res: ResourceInfo | PlTreeEntry): Computable<AnyLogHandle>;
  public getLogHandle(res: ResourceInfo | PlTreeEntry, ctx: ComputableCtx): AnyLogHandle;
  public getLogHandle(
    res: ResourceInfo | PlTreeEntry,
    ctx?: ComputableCtx,
  ): Computable<AnyLogHandle> | AnyLogHandle {
    if (ctx == undefined) return Computable.make((ctx) => this.getLogHandle(res, ctx));

    const r = treeEntryToResourceInfo(res, ctx);

    return this.getLogHandleNoCtx(r as ResourceSnapshot);
  }

  private getLogHandleNoCtx(rInfo: ResourceSnapshot): AnyLogHandle {
    validateDownloadableResourceType('getLogHandle', rInfo.type);
    return newLogHandle(false, rInfo);
  }

  public async lastLines(
    handle: ReadyLogHandle,
    lineCount: number,
    offsetBytes?: number, // if 0n, then start from the end.
    searchStr?: string,
  ): Promise<StreamingApiResponse> {
    const resp = await this.clientLogs.lastLines(
      getResourceInfoFromLogHandle(handle),
      lineCount,
      BigInt(offsetBytes ?? 0),
      searchStr,
    );

    return {
      live: false,
      shouldUpdateHandle: false,
      data: resp.data,
      size: Number(resp.size),
      newOffset: Number(resp.newOffset),
    };
  }

  public async readText(
    handle: ReadyLogHandle,
    lineCount: number,
    offsetBytes?: number,
    searchStr?: string,
  ): Promise<StreamingApiResponse> {
    const resp = await this.clientLogs.readText(
      getResourceInfoFromLogHandle(handle),
      lineCount,
      BigInt(offsetBytes ?? 0),
      searchStr,
    );

    return {
      live: false,
      shouldUpdateHandle: false,
      data: resp.data,
      size: Number(resp.size),
      newOffset: Number(resp.newOffset),
    };
  }

  private async releaseBlob(rInfo: ResourceInfo, callerId: string) {
    const task = this.keyToDownload.get(blobKey(rInfo.id));
    if (task == undefined) {
      return;
    }

    if (this.cache.existsFile(blobKey(rInfo.id))) {
      const toDelete = this.cache.removeFile(blobKey(rInfo.id), callerId);

      await Promise.all(
        toDelete.map(async (cachedFile) => {
          await fsp.rm(cachedFile.path);

          this.cache.removeCache(cachedFile);

          this.removeTask(
            mapGet(this.keyToDownload, pathToKey(cachedFile.path)),
            `the task ${stringifyWithResourceId(cachedFile)} was removed`
            + `from cache along with ${stringifyWithResourceId(toDelete.map((d) => d.path))}`,
          );
        }),
      );
    } else {
      // The task is still in a downloading queue.
      const deleted = task.counter.dec(callerId);
      if (deleted) {
        this.removeTask(
          task,
          `the task ${stringifyWithResourceId(task.info())} was removed from cache`,
        );
      }
    }
  }

  private removeTask(task: DownloadBlobTask, reason: string) {
    task.abort(reason);
    task.change.markChanged(`download task for ${task.path} removed: ${reason}`);
    this.keyToDownload.delete(pathToKey(task.path));
    this.idToLastLines.delete(blobKey(task.rInfo.id));
    this.idToProgressLog.delete(blobKey(task.rInfo.id));
  }

  private async releaseOnDemandBlob(blobId: ResourceId, callerId: string) {
    const deleted = this.keyToOnDemand.get(blobKey(blobId))?.release(callerId) ?? false;
    if (deleted) this.keyToOnDemand.delete(blobKey(blobId));
  }

  /** Removes all files from a hard drive. */
  async releaseAll() {
    this.downloadQueue.stop();

    this.keyToDownload.forEach((task, key) => {
      this.keyToDownload.delete(key);
      task.change.markChanged(`task ${resourceIdToString(task.rInfo.id)} released`);
    });
  }
}

/** Keeps a counter to the on demand handle. */
class OnDemandBlobHolder {
  private readonly counter = new CallersCounter();

  constructor(
    private readonly size: number,
    private readonly handle: RemoteBlobHandle,
  ) {}

  public getHandle(): RemoteBlobHandleAndSize {
    return { handle: this.handle, size: this.size };
  }

  public attach(callerId: string) {
    this.counter.inc(callerId);
  }

  public release(callerId: string): boolean {
    return this.counter.dec(callerId);
  }
}

class LastLinesGetter {
  private updater: Updater;
  private log: string | undefined;
  private readonly change: ChangeSource = new ChangeSource();
  private error: any | undefined = undefined;

  constructor(
    private readonly path: string,
    private readonly lines: number,
    private readonly patternToSearch?: string,
  ) {
    this.updater = new Updater(async () => this.update());
  }

  getOrSchedule(w: Watcher): {
    log: string | undefined;
    error?: any | undefined;
  } {
    this.change.attachWatcher(w);

    this.updater.schedule();

    return {
      log: this.log,
      error: this.error,
    };
  }

  async update(): Promise<void> {
    try {
      const newLogs = await getLastLines(this.path, this.lines, this.patternToSearch);

      if (this.log != newLogs) this.change.markChanged(`logs for ${this.path} updated`);
      this.log = newLogs;
    } catch (e: any) {
      if (e.name == 'RpcError' && e.code == 'NOT_FOUND') {
        // No resource
        this.log = '';
        this.error = e;
        this.change.markChanged(`log update for ${this.path} failed, resource not found`);
        return;
      }

      throw e;
    }
  }
}

/** Gets last lines from a file by reading the file from the top and keeping
 * last N lines in a window queue. */
async function getLastLines(fPath: string, nLines: number, patternToSearch?: string): Promise<string> {
  let inStream: fs.ReadStream | undefined;
  let rl: readline.Interface | undefined;

  try {
    inStream = fs.createReadStream(fPath);
    rl = readline.createInterface({ input: inStream, crlfDelay: Infinity });

    const lines = new Denque();

    for await (const line of rl) {
      if (patternToSearch != undefined && !line.includes(patternToSearch)) continue;

      lines.push(line);
      if (lines.length > nLines) {
        lines.shift();
      }
    }

    // last EOL is for keeping backward compat with platforma implementation.
    return lines.toArray().join(os.EOL) + os.EOL;
  } finally {
    // Cleanup resources in finally block to ensure they're always cleaned up
    try {
      if (rl) {
        rl.close();
      }
    } catch (cleanupError) {
      console.error('Error closing readline interface:', cleanupError);
    }

    try {
      if (inStream && !inStream.destroyed) {
        inStream.destroy();
      }
    } catch (cleanupError) {
      console.error('Error destroying read stream:', cleanupError);
    }
  }
}

function validateDownloadableResourceType(methodName: string, rType: ResourceType) {
  if (!rType.name.startsWith('Blob/')) {
    let message = `${methodName}: wrong resource type: ${rType.name}, expected: a resource of type that starts with 'Blob/'.`;
    if (rType.name == 'Blob')
      message += ` If it's called from workflow, should a file be exported with 'file.exportFile' function?`;

    throw new WrongResourceTypeError(message);
  }
}
