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
import { stringifyWithResourceId } from '@milaboratories/pl-client';
import type {
  AnyLogHandle,
  BlobDriver,
  LocalBlobHandle,
  LocalBlobHandleAndSize,
  ReadyLogHandle,
  RemoteBlobHandle,
  RemoteBlobHandleAndSize,
  StreamingApiResponse,
} from '@milaboratories/pl-model-common';
import type {
  PlTreeEntry,
  ResourceInfo,
  ResourceSnapshot } from '@milaboratories/pl-tree';
import {
  isPlTreeEntry,
  makeResourceSnapshot,
  treeEntryToResourceInfo,
} from '@milaboratories/pl-tree';
import type { MiLogger, Signer } from '@milaboratories/ts-helpers';
import { CallersCounter, TaskProcessor } from '@milaboratories/ts-helpers';
import Denque from 'denque';
import * as fs from 'fs';
import { randomUUID } from 'node:crypto';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import { Readable, Writable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import type { ClientDownload } from '../clients/download';
import type { ClientLogs } from '../clients/logs';
import { DownloadBlobTask, nonRecoverableError } from './download_blob_task';
import { FilesCache } from './helpers/files_cache';
import {
  isLocalBlobHandle,
  newLocalHandle,
  parseLocalHandle,
} from './helpers/download_local_handle';
import { getSize, OnDemandBlobResourceSnapshot } from './types';
import {
  isRemoteBlobHandle,
  newRemoteHandle,
  parseRemoteHandle,
} from './helpers/download_remote_handle';
import { getResourceInfoFromLogHandle, newLogHandle } from './helpers/logs_handle';
import { Updater, WrongResourceTypeError } from './helpers/helpers';

export type DownloadDriverOps = {
  /**
   * A soft limit of the amount of blob storage, in bytes.
   * Once exceeded, the download driver will start deleting blobs one by one
   * when they become unneeded.
   * */
  cacheSoftSizeBytes: number;
  /**
   * Max number of concurrent downloads while calculating computable states
   * derived from this driver
   * */
  nConcurrentDownloads: number;
};

/** DownloadDriver holds a queue of downloading tasks,
 * and notifies every watcher when a file were downloaded. */
export class DownloadDriver implements BlobDriver {
  /** Represents a Resource Id to the path of a blob as a map. */
  private idToDownload: Map<ResourceId, DownloadBlobTask> = new Map();

  /** Writes and removes files to a hard drive and holds a counter for every
   * file that should be kept. */
  private cache: FilesCache<DownloadBlobTask>;

  /** Downloads files and writes them to the local dir. */
  private downloadQueue: TaskProcessor;

  private idToOnDemand: Map<ResourceId, OnDemandBlobHolder> = new Map();

  private idToLastLines: Map<ResourceId, LastLinesGetter> = new Map();
  private idToProgressLog: Map<ResourceId, LastLinesGetter> = new Map();

  private readonly saveDir: string;

  constructor(
    private readonly logger: MiLogger,
    private readonly clientDownload: ClientDownload,
    private readonly clientLogs: ClientLogs,
    saveDir: string,
    private readonly signer: Signer,
    ops: DownloadDriverOps,
  ) {
    this.cache = new FilesCache(ops.cacheSoftSizeBytes);
    this.downloadQueue = new TaskProcessor(this.logger, ops.nConcurrentDownloads);

    this.saveDir = path.resolve(saveDir);
  }

  /** Gets a blob by its resource id or downloads a blob and sets it in a cache. */
  public getDownloadedBlob(
    res: ResourceInfo | PlTreeEntry,
    ctx: ComputableCtx
  ): LocalBlobHandleAndSize | undefined;
  public getDownloadedBlob(
    res: ResourceInfo | PlTreeEntry
  ): ComputableStableDefined<LocalBlobHandleAndSize>;
  public getDownloadedBlob(
    res: ResourceInfo | PlTreeEntry,
    ctx?: ComputableCtx,
  ): Computable<LocalBlobHandleAndSize | undefined> | LocalBlobHandleAndSize | undefined {
    if (ctx === undefined) return Computable.make((ctx) => this.getDownloadedBlob(res, ctx));

    const rInfo = treeEntryToResourceInfo(res, ctx);

    const callerId = randomUUID();
    ctx.addOnDestroy(() => this.releaseBlob(rInfo.id, callerId));

    const result = this.getDownloadedBlobNoCtx(ctx.watcher, rInfo as ResourceSnapshot, callerId);
    if (result == undefined) ctx.markUnstable('download blob is still undefined');

    return result;
  }

  private getDownloadedBlobNoCtx(
    w: Watcher,
    rInfo: ResourceSnapshot,
    callerId: string,
  ): LocalBlobHandleAndSize | undefined {
    validateDownloadableResourceType('getDownloadedBlob', rInfo.type);

    let task = this.idToDownload.get(rInfo.id);

    if (task === undefined) {
      // schedule the blob downloading
      const newTask = this.setNewDownloadTask(rInfo);
      this.downloadQueue.push({
        fn: () => this.downloadBlob(newTask, callerId),
        recoverableErrorPredicate: (e) => !nonRecoverableError(e),
      });
      task = newTask;
    }

    task.attach(w, callerId);
    const result = task.getBlob();
    if (!result.done) return undefined;
    if (result.result.ok) return result.result.value;
    throw result.result.error;
  }

  private setNewDownloadTask(rInfo: ResourceSnapshot) {
    const fPath = this.getFilePath(rInfo.id);
    const result = new DownloadBlobTask(
      this.logger,
      this.clientDownload,
      rInfo,
      fPath,
      newLocalHandle(fPath, this.signer),
    );
    this.idToDownload.set(rInfo.id, result);

    return result;
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
    res: OnDemandBlobResourceSnapshot | PlTreeEntry
  ): Computable<RemoteBlobHandleAndSize>;
  public getOnDemandBlob(
    res: OnDemandBlobResourceSnapshot | PlTreeEntry,
    ctx: ComputableCtx
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

    let blob = this.idToOnDemand.get(info.id);

    if (blob === undefined) {
      blob = new OnDemandBlobHolder(getSize(info), newRemoteHandle(info, this.signer));
      this.idToOnDemand.set(info.id, blob);
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
  public async getContent(handle: LocalBlobHandle | RemoteBlobHandle): Promise<Uint8Array> {
    if (isLocalBlobHandle(handle)) {
      return await read(this.getLocalPath(handle));
    }
    if (isRemoteBlobHandle(handle)) {
      const result = parseRemoteHandle(handle, this.signer);
      const { content } = await this.clientDownload.downloadBlob(result);

      return await buffer(content);
    }

    throw new Error('Malformed remote handle');
  }

  /**
   * Creates computable that will return blob content once it is downloaded.
   * Uses downloaded blob handle under the hood, so stores corresponding blob in file system.
   */
  public getComputableContent(
    res: ResourceInfo | PlTreeEntry
  ): ComputableStableDefined<Uint8Array>{
    return Computable.make((ctx) =>
      this.getDownloadedBlob(res, ctx), {
        postprocessValue: (v) => v ? this.getContent(v.handle) : undefined
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
    ctx.addOnDestroy(() => this.releaseBlob(r.id, callerId));

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

    let logGetter = this.idToLastLines.get(rInfo.id);

    if (logGetter == undefined) {
      const newLogGetter = new LastLinesGetter(path, lines);
      this.idToLastLines.set(rInfo.id, newLogGetter);
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
    ctx.addOnDestroy(() => this.releaseBlob(r.id, callerId));

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

    let logGetter = this.idToProgressLog.get(rInfo.id);

    if (logGetter == undefined) {
      const newLogGetter = new LastLinesGetter(path, 1, patternToSearch);
      this.idToProgressLog.set(rInfo.id, newLogGetter);

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

  private async releaseBlob(blobId: ResourceId, callerId: string) {
    const task = this.idToDownload.get(blobId);
    if (task == undefined) return;

    if (this.cache.existsFile(task.path)) {
      const toDelete = this.cache.removeFile(task.path, callerId);
      await Promise.all(
        toDelete.map(async (task) => {
          await fsp.rm(task.path);

          this.cache.removeCache(task);

          this.removeTask(
            task,
            `the task ${stringifyWithResourceId(task.info())} was removed`
            + `from cache along with ${stringifyWithResourceId(toDelete.map((d) => d.info()))}`,
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
    task.change.markChanged();
    this.idToDownload.delete(task.rInfo.id);
    this.idToLastLines.delete(task.rInfo.id);
    this.idToProgressLog.delete(task.rInfo.id);
  }

  private async releaseOnDemandBlob(blobId: ResourceId, callerId: string) {
    const deleted = this.idToOnDemand.get(blobId)?.release(callerId) ?? false;
    if (deleted) this.idToOnDemand.delete(blobId);
  }

  /** Removes all files from a hard drive. */
  async releaseAll() {
    this.downloadQueue.stop();

    this.idToDownload.forEach((task, blobId) => {
      this.idToDownload.delete(blobId);
      task.change.markChanged();
    });
  }

  private getFilePath(rId: ResourceId): string {
    return path.resolve(this.saveDir, String(BigInt(rId)));
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

      if (this.log != newLogs) this.change.markChanged();
      this.log = newLogs;
    } catch (e: any) {
      if (e.name == 'RpcError' && e.code == 'NOT_FOUND') {
        // No resource
        this.log = '';
        this.error = e;
        this.change.markChanged();
        return;
      }

      throw e;
    }
  }
}

/** Gets last lines from a file by reading the file from the top and keeping
 * last N lines in a window queue. */
function getLastLines(fPath: string, nLines: number, patternToSearch?: string): Promise<string> {
  const inStream = fs.createReadStream(fPath);
  const outStream = new Writable();

  return new Promise((resolve, reject) => {
    const rl = readline.createInterface(inStream, outStream);

    const lines = new Denque();
    rl.on('line', function (line) {
      if (patternToSearch != undefined && !line.includes(patternToSearch)) return;

      lines.push(line);
      if (lines.length > nLines) {
        lines.shift();
      }
    });

    rl.on('error', reject);

    rl.on('close', function () {
      // last EOL is for keeping backward compat with platforma implementation.
      resolve(lines.toArray().join(os.EOL) + os.EOL);
    });
  });
}

async function read(path: string): Promise<Uint8Array> {
  return await buffer(Readable.toWeb(fs.createReadStream(path)));
}

function validateDownloadableResourceType(methodName: string, rType: ResourceType) {
  if (!rType.name.startsWith('Blob/')) {
    let message = `${methodName}: wrong resource type: ${rType.name}, expected: a resource of type that starts with 'Blob/'.`;
    if (rType.name == 'Blob')
      message += ` If it's called from workflow, should a file be exported with 'file.exportFile' function?`;

    throw new WrongResourceTypeError(message);
  }
}
