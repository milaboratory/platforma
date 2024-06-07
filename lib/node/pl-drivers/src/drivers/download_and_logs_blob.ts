import { ChangeSource, ComputableCtx, TrackedAccessorProvider, UsageGuard, Watcher } from '@milaboratory/computable';
import { ResourceId } from '@milaboratory/pl-client-v2';
import { CallersCounter, TaskProcessor, mapGet, notEmpty } from '@milaboratory/ts-helpers';
import * as fsp from 'node:fs/promises';
import * as fs from 'fs';
import * as path from 'node:path';
import { Writable } from 'node:stream'
import { ClientDownload } from '../clients/download';
import { ResourceInfo } from '../clients/helpers';
import { Log, LogId, LogResult, LogsAsyncReader, LogsSyncReader } from './logs_stream';
import { ClientLogs } from '../clients/logs';
import { Updater } from './helpers';
import * as readline from 'node:readline/promises';
import Denque from 'denque';
import * as os from 'node:os';
import { FilesCache } from './files_cache';

export interface DownloadSyncReader {
  /** If a blob were already downloaded, returns a path. */
  getDownloadedBlob(
    watcher: Watcher,
    { id, type }: ResourceInfo,
    callerId: string,
  ): BlobResult | undefined;

  /** Get an Url for downloading without downloading it on a hard drive. */
  getUrl(
    watcher: Watcher,
    { id, type }: ResourceInfo,
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
    private readonly ctx: ComputableCtx,
    private readonly reader: DownloadSyncReader & LogsSyncReader,
  ) {}

  getDownloadedBlob(rInfo: ResourceInfo, callerId: string) {
    const blob = this.reader.getDownloadedBlob(this.w, rInfo, callerId);
    if (blob == undefined)
      this.ctx.markUnstable();
    return blob;
  }

  getUrl(rInfo: ResourceInfo, callerId: string): string | undefined {
    const url = this.reader.getUrl(this.w, rInfo, callerId);
    if (url == undefined)
      this.ctx.markUnstable();
    return url;
  }

  getLastLogs(
    rInfo: ResourceInfo,
    lines: number,
    callerId: string,
  ): LogResult {
    const logs = this.reader.getLastLogs(this.w, rInfo, lines, callerId);
    if (logs.log == '')
      this.ctx.markUnstable();
    return logs;
  }

  getProgressLog(
    rInfo: ResourceInfo,
    patternToSearch: string,
    callerId: string,
  ): LogResult {
    const logs = this.reader.getProgressLog(this.w, rInfo, patternToSearch, callerId);
    if (logs.log == '')
      this.ctx.markUnstable();
    return logs;
  }

  getLogId(
    rInfo: ResourceInfo,
    callerId: string,
  ): LogId | undefined {
    return this.reader.getLogId(this.w, rInfo, callerId);
  }
}

export class BlobResult {
  readonly counter = new CallersCounter();

  constructor(
    readonly rId: ResourceId,
    readonly path: PathLike,
    readonly sizeBytes: number,
  ) {}
}

type PathLike = string;

/** DownloadDriver holds a queue of downloading tasks,
 * and notifies every watcher when a file were downloaded. */
export class DownloadDriver implements
TrackedAccessorProvider<DownloadSyncAccessor>,
DownloadSyncReader,
DownloadDestroyer,
LogsSyncReader,
LogsAsyncReader {
  /** Represents a Resource Id to the path of a blob as a map. */
  private idToDownloadedPath: Map<ResourceId, string> = new Map();

  /** Writes and removes files to a hard drive and holds a counter for every
   * file that should be kept. */
  private cache: FilesCache<BlobResult>;

  /** Represents a Resource Id to ChangeSource as a map. */
  private idToChange: Map<ResourceId, ChangeSource> = new Map();

  /** Downloads files and writes them to the local dir. */
  private downloadQueue: TaskProcessor;

  /** Holds Urls */
  private idToUrl: Map<ResourceId, UrlGetter> = new Map();

  private idToLastLines: Map<ResourceId, LastLinesGetter> = new Map();
  private idToProgressLog: Map<ResourceId, LastLinesGetter> = new Map();

  constructor(
    private readonly clientDownload: ClientDownload,
    private readonly clientLogs: ClientLogs,
    private readonly saveDir: string,
    cacheSoftSizeBytes: number,
    nConcurrentDownloads: number = 10,
  ) {
    this.cache = new FilesCache(cacheSoftSizeBytes);
    this.downloadQueue = new TaskProcessor(nConcurrentDownloads);
  }

  /** Just binds a watcher to DownloadSyncAccessor. */
  createInstance(watcher: Watcher, _: UsageGuard, ctx: ComputableCtx): DownloadSyncAccessor {
    return new DownloadSyncAccessor(watcher, ctx, this);
  }

  /** Gets a blob by its resource id or downloads a blob and sets it in a cache.*/
  getDownloadedBlob(
    w: Watcher,
    rInfo: ResourceInfo,
    callerId: string,
  ): BlobResult | undefined {
    const path = this.idToDownloadedPath.get(rInfo.id);

    if (path == undefined) {
      // Schedule the blob downloading.
      const fPath = this.setNewFilePath(w, rInfo.id);
      this.downloadQueue.push({
        fn: () => this.downloadBlob(rInfo, fPath, callerId),
        recoverableErrorPredicate: (_) => true,
      })

      return undefined;
    }

    const result = this.cache.getFile(path, callerId);

    if (result == undefined) {
      // Another thing is already calculating a result.
      this.attachWatcherToFilePath(w, rInfo.id);
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
    { id, type }: ResourceInfo,
    fPath: string,
    callerId: string,
  ) {
    const { content, size } = await this.clientDownload.downloadBlob(
      { id, type },
    );
    const result = new BlobResult(id, fPath, size);

    // check in case we already have a file by this resource id
    // in the directory. It can happen when we forgot to call removeAll
    // in the previous launch.
    if (!(await fileExists(fPath))) {
      const fileToWrite = Writable.toWeb(fs.createWriteStream(fPath));
      await content.pipeTo(fileToWrite);
    }

    this.cache.addCache(result, callerId);
    mapGet(this.idToChange, id).markChanged();
  }

  private attachWatcherToFilePath(w: Watcher, rId: ResourceId) {
    mapGet(this.idToChange, rId).attachWatcher(w);
  }

  /** Gets an URL by its resource id or downloads a blob and sets it in a cache. */
  getUrl(
    w: Watcher,
    { id, type }: ResourceInfo,
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

  /** Returns all logs and schedules a job that reads remain logs.
   * Notifies when a new portion of the log appeared. */
  getLastLogs(
    w: Watcher,
    rInfo: ResourceInfo,
    lines: number,
    callerId: string,
  ): LogResult {
    const blob = this.getDownloadedBlob(w, rInfo, callerId);
    if (blob == undefined)
      return { log: '' };

    const logGetter = this.idToLastLines.get(rInfo.id);

    if (logGetter == undefined) {
      const newLogGetter = new LastLinesGetter(blob.path, lines);
      this.idToLastLines.set(rInfo.id, newLogGetter);
      return newLogGetter.getOrSchedule(w);
    }

    return logGetter.getOrSchedule(w);
  }

  /** Returns a last line that has patternToSearch.
   * Notifies when a new line appeared or EOF reached. */
  getProgressLog(
    w: Watcher,
    rInfo: ResourceInfo,
    patternToSearch: string,
    callerId: string,
  ): LogResult {
    const blob = this.getDownloadedBlob(w, rInfo, callerId);
    if (blob == undefined)
      return { log: '' };

    const logGetter = this.idToProgressLog.get(rInfo.id);

    if (logGetter == undefined) {
      const newLogGetter = new LastLinesGetter(
        blob.path, 1, patternToSearch,
      );
      this.idToProgressLog.set(rInfo.id, newLogGetter);
      return newLogGetter.getOrSchedule(w);
    }

    return logGetter.getOrSchedule(w);
  }

  /** Returns an Id of a smart object, that can read logs directly from
   * the platform. */
  getLogId(
    w: Watcher,
    rInfo: ResourceInfo,
    callerId: string,
  ): LogId | undefined {
    const path = this.getDownloadedBlob(w, rInfo, callerId)?.path;
    if (path == undefined)
      return undefined;

    return {
      id: path,
      rInfo: rInfo,
    }
  }

  getLog(logId: LogId): Log {
    return {
      lastLines: async (
        lineCount: number,
        offsetBytes: bigint,
        searchStr?: string,
      ) => this.clientLogs.lastLines(logId.rInfo, lineCount, offsetBytes, searchStr),

      readText: async (
        lineCount: number,
        offsetBytes: bigint, // if 0n, then start from the beginning.
        searchStr?: string,
      ) => this.clientLogs.readText(logId.rInfo, lineCount, offsetBytes, searchStr),
    }
  }

  /** Implements DownloadDestroyer. */
  async releaseBlob(blobId: ResourceId, callerId: string) {
    const path = this.idToDownloadedPath.get(blobId);
    if (path == undefined)
      return;

    const toDelete = this.cache.removeFile(notEmpty(path), callerId);

    await Promise.all(toDelete.map(async (blob) => {
      await fsp.rm(blob.path);

      this.cache.removeCache(blob);

      this.idToChange.get(blob.rId)?.markChanged();
      this.idToChange.delete(blob.rId);
      this.idToDownloadedPath.delete(blob.rId);
      this.idToLastLines.delete(blob.rId);
      this.idToProgressLog.delete(blob.rId);
    }))
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

class LastLinesGetter {
  private updater: Updater;
  private logs: string = "";
  private readonly change: ChangeSource = new ChangeSource();
  private error: string | undefined = undefined;

  constructor(
    private readonly path: string,
    private readonly lines: number,
    private readonly patternToSearch?: string,
  ) {
    this.updater = new Updater(
      async () => this.update(),
    )
  }

  getOrSchedule(w: Watcher): LogResult {
    this.change.attachWatcher(w);

    this.updater.schedule();

    return {
      log: this.logs,
      error: this.error,
    };
  }

  async update(): Promise<void> {
    try {
      this.logs = await getLastLines(this.path, this.lines, this.patternToSearch);
      this.change.markChanged();
    } catch (e: any) {
      if (e.name == 'RpcError' && e.code == 'UNKNOWN') {
        // No resource
        this.logs = '';
        this.error = e;
        this.change.markChanged();
        return;
      }

      throw e;
    }
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

/** Gets last lines from a file by reading the file from the top and keeping
 * last N lines in a window queue. */
function getLastLines(fPath: PathLike, nLines: number, patternToSearch?: string): Promise<string> {
  const inStream = fs.createReadStream(fPath);
  const outStream = new Writable();

  return new Promise((resolve, reject) => {
    const rl = readline.createInterface(inStream, outStream);

    const lines = new Denque();
    rl.on('line', function (line) {
      if (patternToSearch != undefined && !line.includes(patternToSearch))
        return;

      lines.push(line);
      if (lines.length > nLines) {
        lines.shift();
      }
    });

    rl.on('error', reject)

    rl.on('close', function () {
      // last EOL is for keeping backward compat with platforma implementation.
      resolve(lines.toArray().join(os.EOL) + os.EOL);
    });
  })
}
