import { ChangeSource, Computable, ComputableCtx, TrackedAccessorProvider, UsageGuard, Watcher, rawComputable } from '@milaboratory/computable';
import { ResourceId } from '@milaboratory/pl-client-v2';
import { CallersCounter, MiLogger, TaskProcessor, asyncPool, notEmpty } from '@milaboratory/ts-helpers';
import * as fsp from 'node:fs/promises';
import * as fs from 'fs';
import * as path from 'node:path';
import { Writable } from 'node:stream'
import { ClientDownload } from '../clients/download';
import { ResourceInfo } from '../clients/helpers';
import { Log, LogId, LogResult, LogsAsyncReader, LogsSyncAccessor, LogsSyncReader } from './logs_stream';
import { ClientLogs } from '../clients/logs';
import { Updater } from './helpers';
import * as readline from 'node:readline/promises';
import Denque from 'denque';
import * as os from 'node:os';
import { FilesCache } from './files_cache';
import { randomUUID } from 'node:crypto';
import { scheduler } from 'node:timers/promises';
import { text, buffer } from "node:stream/consumers";
import { Readable } from 'node:stream';

export type BlobResult =
  & {
    readonly type: 'BlobResult'
  }
  & (
    | {
      readonly success: true;
      readonly path: PathLike;
      readonly sizeBytes: number
    }
    | {
      readonly success: false;
      readonly error: string;
    }
  );

export interface OnDemandBlob {
  type: 'OnDemandBlob';
  rInfo: ResourceInfo
}

/** DownloadDriver holds a queue of downloading tasks,
 * and notifies every watcher when a file were downloaded. */
export class DownloadDriver implements
TrackedAccessorProvider<LogsSyncAccessor>,
LogsSyncReader,
LogsAsyncReader {
  /** Represents a Resource Id to the path of a blob as a map. */
  private idToDownload: Map<ResourceId, Download> = new Map();

  /** Writes and removes files to a hard drive and holds a counter for every
   * file that should be kept. */
  private cache: FilesCache<Download>;

  /** Downloads files and writes them to the local dir. */
  private downloadQueue: TaskProcessor;

  private idToOnDemand: Map<ResourceId, OnDemandBlobHolder> = new Map();

  private idToLastLines: Map<ResourceId, LastLinesGetter> = new Map();
  private idToProgressLog: Map<ResourceId, LastLinesGetter> = new Map();

  constructor(
    private readonly logger: MiLogger,
    private readonly clientDownload: ClientDownload,
    private readonly clientLogs: ClientLogs,
    private readonly saveDir: string,
    cacheSoftSizeBytes: number,
    nConcurrentDownloads: number = 10,
  ) {
    this.cache = new FilesCache(cacheSoftSizeBytes);
    this.downloadQueue = new TaskProcessor(this.logger, nConcurrentDownloads);
  }

  createInstance(watcher: Watcher, _: UsageGuard, ctx: ComputableCtx): LogsSyncAccessor {
    return new LogsSyncAccessor(watcher, ctx, this);
  }

  /** Gets a blob by its resource id or downloads a blob and sets it in a cache.*/
  getDownloadedBlob(
    rInfo: ResourceInfo,
  ): Computable<BlobResult | undefined> {
    return rawComputable((w: Watcher, ctx: ComputableCtx) => {
      const callerId = randomUUID();
      ctx.setOnDestroy(() => this.releaseBlob(rInfo.id, callerId));

      const result = this.getDownloadedBlobNoComputable(w, rInfo, callerId);
      if (result == undefined)
        ctx.markUnstable();

      return result;
    })
  }

  getDownloadedBlobNoComputable(
    w: Watcher,
    rInfo: ResourceInfo,
    callerId: string,
  ): BlobResult | undefined {
    const task = this.idToDownload.get(rInfo.id);

    if (task != undefined) {
      task.attach(w, callerId);
      return task.getBlob();
    }

    // Schedule the blob downloading.
    const newTask = this.setNewDownloadTask(w, rInfo, callerId);
    this.downloadQueue.push({
      fn: () => this.downloadBlob(newTask, callerId),
      recoverableErrorPredicate: (_) => true,
    })

    return newTask.getBlob();
  }

  private setNewDownloadTask(w: Watcher, rInfo: ResourceInfo, callerId: string) {
    const fPath = this.getFilePath(rInfo.id);
    const result = new Download(this.clientDownload, rInfo, fPath);
    result.attach(w, callerId);
    this.idToDownload.set(rInfo.id, result);

    return result;
  }

  private async downloadBlob(
    task: Download,
    callerId: string,
  ) {
    await task.download();
    if (task.getBlob()?.success)
      this.cache.addCache(task, callerId);
  }

  getOnDemandBlob(rInfo: ResourceInfo): Computable<OnDemandBlob> {
    return rawComputable((w: Watcher, ctx: ComputableCtx) => {
      const callerId = randomUUID();
      ctx.setOnDestroy(() => this.releaseOnDemandBlob(rInfo.id, callerId));
      const result = this.getOnDemandBlobNoComputable(w, rInfo, callerId);
      return result;
    })
  }

  getOnDemandBlobNoComputable(
    w: Watcher,
    { id, type }: ResourceInfo,
    callerId: string,
  ): OnDemandBlob {
    const blob = this.idToOnDemand.get(id);

    if (blob == undefined) {
      const newBlob = new OnDemandBlobHolder({ id, type });
      newBlob.attach(w, callerId);
      this.idToOnDemand.set(id, newBlob);

      return newBlob.get();
    }

    return blob.get();
  }

  async getContent(b: OnDemandBlob | BlobResult): Promise<Uint8Array | undefined> {
    if (b.type == 'BlobResult') {
      if (!b.success)
        return undefined;

      return await read(b.path);
    }

    const { content } = await this.clientDownload.downloadBlob(b.rInfo);
    return await buffer(content);
  }

  /** Returns all logs and schedules a job that reads remain logs.
   * Notifies when a new portion of the log appeared. */
  getLastLogs(
    w: Watcher,
    rInfo: ResourceInfo,
    lines: number,
    callerId: string,
  ): LogResult {
    const blob = this.getDownloadedBlobNoComputable(w, rInfo, callerId);
    if (blob == undefined)
      return { log: '' };
    if (!blob.success)
      return { log: '', error: blob.error };

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
    const blob = this.getDownloadedBlobNoComputable(w, rInfo, callerId);
    if (blob == undefined)
      return { log: '' };
    if (!blob.success)
      return { log: '', error: blob.error };

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
    const blob = this.getDownloadedBlobNoComputable(w, rInfo, callerId);
    if (blob == undefined)
      return undefined;
    if (!blob.success)
      return undefined;

    return {
      id: blob.path,
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

  async releaseBlob(blobId: ResourceId, callerId: string) {
    const task = this.idToDownload.get(blobId);
    if (task == undefined)
      return;

    if (this.cache.existsFile(task.path)) {
      const toDelete = this.cache.removeFile(task.path, callerId)
      await Promise.all(toDelete.map(async (task) => {
        await fsp.rm(task.path);

        this.cache.removeCache(task);

        this.removeTask(
          task, `the task ${task.path} was removed`
            + `from cache along with ${toDelete.map(d => d.path)}`,
        )
      }))
    } else {
      // The task is still in a downloading queue.
      const deleted = task.counter.dec(callerId);
      if (deleted)
        this.removeTask(task, `the task ${task.path} was removed from cache`);
    }
  }

  private removeTask(task: Download, reason: string) {
    task.abort(reason);
    task.change.markChanged();
    this.idToDownload.delete(task.rInfo.id);
    this.idToLastLines.delete(task.rInfo.id);
    this.idToProgressLog.delete(task.rInfo.id);
  }

  async releaseOnDemandBlob(blobId: ResourceId, callerId: string) {
    const deleted = this.idToOnDemand.get(blobId)?.release(callerId) ?? false;
    if (deleted)
      this.idToOnDemand.delete(blobId);
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
    return path.join(this.saveDir, String(BigInt(rId)));
  }
}

class OnDemandBlobHolder {
  private change = new ChangeSource();
  private counter = new CallersCounter();

  constructor(private readonly rInfo: ResourceInfo) {}

  get(): OnDemandBlob {
    return {
      type: 'OnDemandBlob',
      rInfo: this.rInfo,
    }
  }

  attach(w: Watcher, callerId: string) {
    this.counter.inc(callerId);
    this.change.attachWatcher(w);
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
      if (e.name == 'RpcError' && e.code == 'NOT_FOUND') {
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

async function read(path: string): Promise<Uint8Array> {
  return await buffer(Readable.toWeb(fs.createReadStream(path)))
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

export class Download {
  readonly counter = new CallersCounter();
  readonly change = new ChangeSource();
  readonly signalCtl = new AbortController();
  error: string | undefined;
  done = false;
  sizeBytes = 0;

  constructor(
    readonly clientDownload: ClientDownload,
    readonly rInfo: ResourceInfo,
    readonly path: string,
  ) {}

  attach(w: Watcher, callerId: string) {
    this.counter.inc(callerId);
    if (!this.done)
      this.change.attachWatcher(w);
  }

  async download() {
    try {
      // TODO: move size bytes inside fileExists check like in download_url.
      const { content, size } = await this.clientDownload.downloadBlob(this.rInfo);

      // check in case we already have a file by this resource id
      // in the directory. It can happen when we forgot to call removeAll
      // in the previous launch.
      if (!(await fileExists(this.path))) {
        const fileToWrite = Writable.toWeb(fs.createWriteStream(this.path));
        await content.pipeTo(fileToWrite);
      }

      this.setDone(size);
    } catch (e: any) {
      if (e instanceof DownloadAborted) {
        this.setError(e);
        // Just in case we were half-way extracting an archive.
        await fsp.rm(this.path);
        return;
      }

      throw e;
    }
  }

  getBlob(): BlobResult | undefined {
    if (this.done)
      return {
        type: 'BlobResult',
        success: true,
        path: notEmpty(this.path),
        sizeBytes: this.sizeBytes,
      };

    if (this.error)
      return {
        type: 'BlobResult',
        success: false,
        error: this.error,
      };

    return undefined;
  }

  private setDone(sizeBytes: number) {
    this.done = true;
    this.sizeBytes = sizeBytes;
    this.change.markChanged();
  }

  abort(reason: string) {
    this.signalCtl.abort(new DownloadAborted(reason));
  }

  private setError(e: any) {
    this.error = String(e);
    this.change.markChanged();
  }
}

type PathLike = string;

class DownloadAborted extends Error {}
