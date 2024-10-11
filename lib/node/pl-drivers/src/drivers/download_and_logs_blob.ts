import {
  ChangeSource,
  Computable,
  ComputableCtx,
  ComputableStableDefined,
  Watcher
} from '@milaboratories/computable';
import { bigintToResourceId, ResourceId } from '@milaboratories/pl-client';
import {
  CallersCounter,
  MiLogger,
  TaskProcessor,
  Signer,
  ValueOrError
} from '@milaboratories/ts-helpers';
import * as fsp from 'node:fs/promises';
import * as fs from 'fs';
import * as path from 'node:path';
import { Writable } from 'node:stream';
import {
  ClientDownload,
  UnknownStorageError,
  WrongLocalFileUrl
} from '../clients/download';
import { ClientLogs } from '../clients/logs';
import * as helper from './helpers/helpers';
import * as readline from 'node:readline/promises';
import Denque from 'denque';
import * as os from 'node:os';
import { FilesCache } from './helpers/files_cache';
import { randomUUID } from 'node:crypto';
import { buffer } from 'node:stream/consumers';
import { Readable } from 'node:stream';
import {
  InferSnapshot,
  ResourceInfo,
  PlTreeEntry,
  ResourceWithMetadata,
  rsSchema,
  makeResourceSnapshot,
  treeEntryToResourceWithMetadata,
  ResourceSnapshot,
  treeEntryToResourceInfo,
  isPlTreeEntry
} from '@milaboratories/pl-tree';
import {
  AnyLogHandle,
  BlobDriver,
  LocalBlobHandle,
  LocalBlobHandleAndSize,
  ReadyLogHandle,
  RemoteBlobHandle,
  RemoteBlobHandleAndSize,
  StreamingApiResponse
} from '@milaboratories/pl-model-common';
import { dataToHandle, handleToData, isReadyLogHandle } from './logs';
import { z } from 'zod';
import { NetworkError400 } from '../helpers/download';
import { pipeline } from 'node:stream/promises';

/** ResourceSnapshot that can be passed to OnDemandBlob */
export const OnDemandBlobResourceSnapshot = rsSchema({
  kv: {
    'ctl/file/blobInfo': z.object({
      sizeBytes: z.coerce.number()
    })
  }
});

export type OnDemandBlobResourceSnapshot = InferSnapshot<
  typeof OnDemandBlobResourceSnapshot
>;

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
  private idToDownload: Map<ResourceId, Download> = new Map();

  /** Writes and removes files to a hard drive and holds a counter for every
   * file that should be kept. */
  private cache: FilesCache<Download>;

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
    ops: DownloadDriverOps
  ) {
    this.cache = new FilesCache(ops.cacheSoftSizeBytes);
    this.downloadQueue = new TaskProcessor(
      this.logger,
      ops.nConcurrentDownloads
    );

    this.saveDir = path.resolve(saveDir);
  }

  /** Gets a blob by its resource id or downloads a blob and sets it in a cache.*/
  getDownloadedBlob(
    res: ResourceInfo | PlTreeEntry,
    ctx: ComputableCtx
  ): LocalBlobHandleAndSize | undefined;
  getDownloadedBlob(
    res: ResourceInfo | PlTreeEntry
  ): ComputableStableDefined<LocalBlobHandleAndSize>;
  getDownloadedBlob(
    res: ResourceInfo | PlTreeEntry,
    ctx?: ComputableCtx
  ):
    | Computable<LocalBlobHandleAndSize | undefined>
    | LocalBlobHandleAndSize
    | undefined {
    if (ctx === undefined)
      return Computable.make((ctx) => this.getDownloadedBlob(res, ctx));

    const rInfo = treeEntryToResourceInfo(res, ctx);

    const callerId = randomUUID();
    ctx.addOnDestroy(() => this.releaseBlob(rInfo.id, callerId));

    const result = this.getDownloadedBlobNoCtx(
      ctx.watcher,
      rInfo as ResourceSnapshot,
      callerId
    );
    if (result == undefined)
      ctx.markUnstable('download blob is still undefined');

    return result;
  }

  getOnDemandBlob(
    res: OnDemandBlobResourceSnapshot | PlTreeEntry
  ): Computable<RemoteBlobHandleAndSize>;
  getOnDemandBlob(
    res: OnDemandBlobResourceSnapshot | PlTreeEntry,
    ctx: ComputableCtx
  ): RemoteBlobHandleAndSize;
  getOnDemandBlob(
    res: OnDemandBlobResourceSnapshot | PlTreeEntry,
    ctx?: ComputableCtx
  ):
    | ComputableStableDefined<RemoteBlobHandleAndSize>
    | RemoteBlobHandleAndSize
    | undefined {
    if (ctx === undefined)
      return Computable.make((ctx) => this.getOnDemandBlob(res, ctx));

    const rInfo: OnDemandBlobResourceSnapshot = isPlTreeEntry(res)
      ? makeResourceSnapshot(res, OnDemandBlobResourceSnapshot, ctx)
      : res;

    const callerId = randomUUID();
    ctx.addOnDestroy(() => this.releaseOnDemandBlob(rInfo.id, callerId));

    const result = this.getOnDemandBlobNoCtx(ctx.watcher, rInfo, callerId);

    return result;
  }

  public getLocalPath(handle: LocalBlobHandle): string {
    return localHandleToPath(handle, this.signer);
  }

  public async getContent(
    handle: LocalBlobHandle | RemoteBlobHandle
  ): Promise<Uint8Array> {
    if (isLocalBlobHandle(handle)) return await read(this.getLocalPath(handle));

    if (!isRemoteBlobHandle(handle)) throw new Error('Malformed remote handle');

    const result = remoteHandleToData(handle, this.signer);
    const { content } = await this.clientDownload.downloadBlob(result);

    const chunks = []
    for await (let chunk of content) {
      chunks.push(chunk)
    }
    return Buffer.concat(chunks);
  }

  private getDownloadedBlobNoCtx(
    w: Watcher,
    rInfo: ResourceSnapshot,
    callerId: string
  ): LocalBlobHandleAndSize | undefined {
    let task = this.idToDownload.get(rInfo.id);

    if (task === undefined) {
      // schedule the blob downloading
      const newTask = this.setNewDownloadTask(w, rInfo, callerId);
      this.downloadQueue.push({
        fn: () => this.downloadBlob(newTask, callerId),
        recoverableErrorPredicate: (_) => true
      });
      task = newTask;
    }

    task.attach(w, callerId);
    const result = task.getBlob();
    if (result === undefined) return undefined;
    if (result.ok) return result.value;
    throw result.error;
  }

  private setNewDownloadTask(
    w: Watcher,
    rInfo: ResourceSnapshot,
    callerId: string
  ) {
    const fPath = this.getFilePath(rInfo.id);
    const result = new Download(
      this.clientDownload,
      rInfo,
      fPath,
      dataToLocalHandle(fPath, this.signer)
    );
    this.idToDownload.set(rInfo.id, result);

    return result;
  }

  private async downloadBlob(task: Download, callerId: string) {
    await task.download();
    if (task.getBlob()?.ok) this.cache.addCache(task, callerId);
  }

  private getOnDemandBlobNoCtx(
    w: Watcher,
    info: OnDemandBlobResourceSnapshot,
    callerId: string
  ): RemoteBlobHandleAndSize {
    let blob = this.idToOnDemand.get(info.id);

    if (blob === undefined) {
      blob = new OnDemandBlobHolder(
        info.kv['ctl/file/blobInfo'].sizeBytes,
        dataToRemoteHandle(info, this.signer)
      );
      this.idToOnDemand.set(info.id, blob);
    }

    blob.attach(w, callerId);

    return blob.getHandle();
  }

  /** Returns all logs and schedules a job that reads remain logs.
   * Notifies when a new portion of the log appeared. */
  getLastLogs(
    res: ResourceInfo | PlTreeEntry,
    lines: number
  ): Computable<string | undefined>;
  getLastLogs(
    res: ResourceInfo | PlTreeEntry,
    lines: number,
    ctx: ComputableCtx
  ): Computable<string | undefined>;
  getLastLogs(
    res: ResourceInfo | PlTreeEntry,
    lines: number,
    ctx?: ComputableCtx
  ): Computable<string | undefined> | string | undefined {
    if (ctx == undefined)
      return Computable.make((ctx) => this.getLastLogs(res, lines, ctx));

    const r = treeEntryToResourceInfo(res, ctx);
    const callerId = randomUUID();
    ctx.addOnDestroy(() => this.releaseBlob(r.id, callerId));

    const result = this.getLastLogsNoCtx(
      ctx.watcher,
      r as ResourceSnapshot,
      lines,
      callerId
    );
    if (result == undefined)
      ctx.markUnstable('either a file was not downloaded or logs was not read');

    return result;
  }

  private getLastLogsNoCtx(
    w: Watcher,
    rInfo: ResourceSnapshot,
    lines: number,
    callerId: string
  ): string | undefined {
    const blob = this.getDownloadedBlobNoCtx(w, rInfo, callerId);
    if (blob == undefined) return undefined;

    const path = localHandleToPath(blob.handle, this.signer);

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
  getProgressLog(
    res: ResourceInfo | PlTreeEntry,
    patternToSearch: string
  ): Computable<string | undefined>;
  getProgressLog(
    res: ResourceInfo | PlTreeEntry,
    patternToSearch: string,
    ctx: ComputableCtx
  ): string | undefined;
  getProgressLog(
    res: ResourceInfo | PlTreeEntry,
    patternToSearch: string,
    ctx?: ComputableCtx
  ): Computable<string | undefined> | string | undefined {
    if (ctx == undefined)
      return Computable.make((ctx) =>
        this.getProgressLog(res, patternToSearch, ctx)
      );

    const r = treeEntryToResourceInfo(res, ctx);
    const callerId = randomUUID();
    ctx.addOnDestroy(() => this.releaseBlob(r.id, callerId));

    const result = this.getProgressLogNoCtx(
      ctx.watcher,
      r as ResourceSnapshot,
      patternToSearch,
      callerId
    );
    if (result === undefined)
      ctx.markUnstable(
        'either a file was not downloaded or a progress log was not read'
      );

    return result;
  }

  private getProgressLogNoCtx(
    w: Watcher,
    rInfo: ResourceSnapshot,
    patternToSearch: string,
    callerId: string
  ): string | undefined {
    const blob = this.getDownloadedBlobNoCtx(w, rInfo, callerId);
    if (blob == undefined) return undefined;
    const path = localHandleToPath(blob.handle, this.signer);

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
  getLogHandle(res: ResourceInfo | PlTreeEntry): Computable<AnyLogHandle>;
  getLogHandle(
    res: ResourceInfo | PlTreeEntry,
    ctx: ComputableCtx
  ): AnyLogHandle;
  getLogHandle(
    res: ResourceInfo | PlTreeEntry,
    ctx?: ComputableCtx
  ): Computable<AnyLogHandle> | AnyLogHandle {
    if (ctx == undefined)
      return Computable.make((ctx) => this.getLogHandle(res, ctx));

    const r = treeEntryToResourceInfo(res, ctx);

    return this.getLogHandleNoCtx(r as ResourceSnapshot);
  }

  private getLogHandleNoCtx(rInfo: ResourceSnapshot): AnyLogHandle {
    return dataToHandle(false, rInfo);
  }

  async lastLines(
    handle: ReadyLogHandle,
    lineCount: number,
    offsetBytes?: number, // if 0n, then start from the end.
    searchStr?: string
  ): Promise<StreamingApiResponse> {
    const resp = await this.clientLogs.lastLines(
      handleToData(handle),
      lineCount,
      BigInt(offsetBytes ?? 0),
      searchStr
    );

    return {
      live: false,
      shouldUpdateHandle: false,
      data: resp.data,
      size: Number(resp.size),
      newOffset: Number(resp.newOffset)
    };
  }

  async readText(
    handle: ReadyLogHandle,
    lineCount: number,
    offsetBytes?: number,
    searchStr?: string
  ): Promise<StreamingApiResponse> {
    const resp = await this.clientLogs.readText(
      handleToData(handle),
      lineCount,
      BigInt(offsetBytes ?? 0),
      searchStr
    );

    return {
      live: false,
      shouldUpdateHandle: false,
      data: resp.data,
      size: Number(resp.size),
      newOffset: Number(resp.newOffset)
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
            `the task ${task.path} was removed` +
            `from cache along with ${toDelete.map((d) => d.path)}`
          );
        })
      );
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
    return path.resolve(path.join(this.saveDir, String(BigInt(rId))));
  }
}

class OnDemandBlobHolder {
  private readonly change = new ChangeSource();
  private readonly counter = new CallersCounter();

  constructor(
    private readonly size: number,
    private readonly handle: RemoteBlobHandle
  ) {}

  getHandle(): RemoteBlobHandleAndSize {
    return { handle: this.handle, size: this.size };
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
  private updater: helper.Updater;
  private log: string | undefined;
  private readonly change: ChangeSource = new ChangeSource();
  private error: any | undefined = undefined;

  constructor(
    private readonly path: string,
    private readonly lines: number,
    private readonly patternToSearch?: string
  ) {
    this.updater = new helper.Updater(async () => this.update());
  }

  getOrSchedule(w: Watcher): {
    log: string | undefined;
    error?: any | undefined;
  } {
    this.change.attachWatcher(w);

    this.updater.schedule();

    return {
      log: this.log,
      error: this.error
    };
  }

  async update(): Promise<void> {
    try {
      const newLogs = await getLastLines(
        this.path,
        this.lines,
        this.patternToSearch
      );

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

async function fileOrDirExists(path: string): Promise<boolean> {
  try {
    await fsp.access(path);
    return true;
  } catch {
    return false;
  }
}

async function read(path: string): Promise<Uint8Array> {
  return await buffer(Readable.toWeb(fs.createReadStream(path)));
}

/** Gets last lines from a file by reading the file from the top and keeping
 * last N lines in a window queue. */
function getLastLines(
  fPath: PathLike,
  nLines: number,
  patternToSearch?: string
): Promise<string> {
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

    rl.on('error', reject);

    rl.on('close', function () {
      // last EOL is for keeping backward compat with platforma implementation.
      resolve(lines.toArray().join(os.EOL) + os.EOL);
    });
  });
}

export class Download {
  readonly counter = new CallersCounter();
  readonly change = new ChangeSource();
  readonly signalCtl = new AbortController();
  error: any | undefined;
  done = false;
  sizeBytes = 0;

  constructor(
    readonly clientDownload: ClientDownload,
    readonly rInfo: ResourceSnapshot,
    readonly path: string,
    readonly handle: LocalBlobHandle
  ) {}

  attach(w: Watcher, callerId: string) {
    this.counter.inc(callerId);
    if (!this.done) this.change.attachWatcher(w);
  }

  async download() {
    try {
      // TODO: move size bytes inside fileExists check like in download_url.
      const { content, size } = await this.clientDownload.downloadBlob(
        this.rInfo
      );

      console.log("download before if fileOrDirExists: ", this.path, path.dirname(this.path));

      // await fsp.mkdir(path.dirname(this.path), { recursive: true });

      console.log("download after if fileOrDirExists: ", this.path, path.dirname(this.path));

      // check in case we already have a file by this resource id
      // in the directory. It can happen when we forgot to call removeAll
      // in the previous launch.
      if (await fileOrDirExists(this.path)) {
        console.log("download in if this path exists, then branch before: ", this.path)
        content.on('close', () => {}).destroy(); // we don't need the blob
        console.log("download in if this path exists, then branch after: ", this.path)
      } else {
        console.log("download in if this path exists, else branch before", this.path)
        const toFile = fs.createWriteStream(this.path);
        await pipeline(content, toFile);
      }

      console.log("download after if", this.path)
      this.setDone(size);
    } catch (e: any) {
      console.log("download catch: ", e)
      if (
        e instanceof DownloadAborted ||
        e instanceof NetworkError400 ||
        e instanceof UnknownStorageError ||
        e instanceof WrongLocalFileUrl ||
        e.code == 'ENOENT' // file that we downloads from was moved or deleted.
      ) {
        this.setError(e);
        // Just in case we were half-way extracting an archive.
        await fsp.rm(this.path);
        return;
      }

      throw e;
    }
  }

  getBlob(): ValueOrError<LocalBlobHandleAndSize> | undefined {
    if (this.done)
      return {
        ok: true,
        value: {
          handle: this.handle,
          size: this.sizeBytes
        }
      };

    if (this.error)
      return {
        ok: false,
        error: this.error
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
    this.error = e;
    this.change.markChanged();
  }
}

type PathLike = string;

class DownloadAborted extends Error {}

// https://regex101.com/r/kfnBVX/1
const localHandleRegex =
  /^blob\+local:\/\/download\/(?<path>.*)#(?<signature>.*)$/;

function isLocalBlobHandle(handle: string): handle is LocalBlobHandle {
  return Boolean(handle.match(localHandleRegex));
}

function localHandleToPath(handle: LocalBlobHandle, signer: Signer): string {
  const parsed = handle.match(localHandleRegex);

  if (parsed === null)
    throw new Error(`Local handle is malformed: ${handle}, matches: ${parsed}`);

  const { path, signature } = parsed.groups!;

  signer.verify(
    path,
    signature,
    `Signature verification failed for: ${handle}`
  );

  return path;
}

function dataToLocalHandle(path: string, signer: Signer): LocalBlobHandle {
  return `blob+local://download/${path}#${signer.sign(path)}` as LocalBlobHandle;
}

// https://regex101.com/r/rvbPZt/1
const remoteHandleRegex =
  /^blob\+remote:\/\/download\/(?<content>(?<resourceType>.*)\/(?<resourceVersion>.*)\/(?<resourceId>.*))#(?<signature>.*)$/;

function isRemoteBlobHandle(handle: string): handle is RemoteBlobHandle {
  return Boolean(handle.match(remoteHandleRegex));
}

function remoteHandleToData(
  handle: RemoteBlobHandle,
  signer: Signer
): ResourceInfo {
  const parsed = handle.match(remoteHandleRegex);
  if (parsed === null)
    throw new Error(
      `Remote handle is malformed: ${handle}, matches: ${parsed}`
    );

  const { content, resourceType, resourceVersion, resourceId, signature } =
    parsed.groups!;

  signer.verify(
    content,
    signature,
    `Signature verification failed for ${handle}`
  );

  return {
    id: bigintToResourceId(BigInt(resourceId)),
    type: { name: resourceType, version: resourceVersion }
  };
}

function dataToRemoteHandle(
  rInfo: OnDemandBlobResourceSnapshot,
  signer: Signer
): RemoteBlobHandle {
  const content = `${rInfo.type.name}/${rInfo.type.version}/${BigInt(rInfo.id)}`;
  return `blob+remote://download/${content}#${signer.sign(content)}` as RemoteBlobHandle;
}
