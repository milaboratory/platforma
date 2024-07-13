import {
  CallersCounter,
  MiLogger,
  TaskProcessor,
  notEmpty
} from '@milaboratory/ts-helpers';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { Writable, Transform } from 'node:stream';
import {
  ChangeSource,
  Computable,
  ComputableCtx,
  Watcher
} from '@milaboratory/computable';
import { randomUUID, createHash } from 'node:crypto';
import * as zlib from 'node:zlib';
import * as tar from 'tar-fs';
import { FilesCache } from './files_cache';
import { Dispatcher } from 'undici';
import { DownloadHelper, NetworkError400 } from '../helpers/download';

export interface DownloadUrlSyncReader {
  /** Returns a Computable that (when the time will come)
   * downloads an archive from an URL,
   * extracts it to the local dir and returns a path to that dir. */
  getPath(url: URL): Computable<PathResult | undefined>;
}

export interface PathResult {
  /** Path to the downloadable blob, might be undefined when the error happened. */
  path?: string;
  /** Error that happened when the archive were downloaded. */
  error?: string;
}

export type DownloadUrlDriverOps = {
  cacheSoftSizeBytes: number;
  withGunzip: boolean;
  nConcurrentDownloads: number;
};

/** Downloads .tar or .tar.gz archives by given URLs
 * and extracts them into saveDir. */
export class DownloadUrlDriver implements DownloadUrlSyncReader {
  private readonly downloadHelper: DownloadHelper;

  private urlToDownload: Map<string, Download> = new Map();
  private downloadQueue: TaskProcessor;

  /** Writes and removes files to a hard drive and holds a counter for every
   * file that should be kept. */
  private cache: FilesCache<Download>;

  constructor(
    private readonly logger: MiLogger,
    private readonly httpClient: Dispatcher,
    private readonly saveDir: string,
    private readonly opts: DownloadUrlDriverOps = {
      cacheSoftSizeBytes: 50 * 1024 * 1024,
      withGunzip: true,
      nConcurrentDownloads: 50
    }
  ) {
    this.downloadQueue = new TaskProcessor(
      this.logger,
      this.opts.nConcurrentDownloads
    );
    this.cache = new FilesCache(this.opts.cacheSoftSizeBytes);
    this.downloadHelper = new DownloadHelper(httpClient);
  }

  /** Use to get a path result inside a computable context */
  getPath(url: URL, ctx: ComputableCtx): PathResult | undefined;

  /** Returns a Computable that do the work */
  getPath(url: URL): Computable<PathResult | undefined>;

  getPath(
    url: URL,
    ctx?: ComputableCtx
  ): Computable<PathResult | undefined> | PathResult | undefined {
    // wrap result as computable, if we were not given an existing computable context
    if (ctx === undefined) return Computable.make((c) => this.getPath(url, c));

    const callerId = randomUUID();

    // read as ~ golang's defer
    ctx.addOnDestroy(() => this.releasePath(url, callerId));

    const result = this.getPathNoCtx(url, ctx.watcher, callerId);
    if (result?.path === undefined) ctx.markUnstable();

    return result;
  }

  getPathNoCtx(url: URL, w: Watcher, callerId: string) {
    const key = url.toString();
    const task = this.urlToDownload.get(key);

    if (task != undefined) {
      task.attach(w, callerId);
      return task.getPath();
    }

    const newTask = this.setNewTask(w, url, callerId);
    this.downloadQueue.push({
      fn: async () => this.downloadUrl(newTask, callerId),
      recoverableErrorPredicate: (e) => true
    });

    return newTask.getPath();
  }

  /** Downloads and extracts a tar archive if it wasn't downloaded yet. */
  async downloadUrl(task: Download, callerId: string) {
    await task.download(this.downloadHelper, this.opts.withGunzip);
    // Might be undefined if a error happened
    if (task.getPath()?.path != undefined) this.cache.addCache(task, callerId);
  }

  /** Removes a directory and aborts a downloading task when all callers
   * are not interested in it. */
  async releasePath(url: URL, callerId: string): Promise<void> {
    const key = url.toString();
    const task = this.urlToDownload.get(key);
    if (task == undefined) return;

    if (this.cache.existsFile(task.path)) {
      const toDelete = this.cache.removeFile(task.path, callerId);

      await Promise.all(
        toDelete.map(async (task) => {
          await rmRFDir(task.path);
          this.cache.removeCache(task);

          this.removeTask(
            task,
            `the task ${JSON.stringify(task)} was removed` +
              `from cache along with ${JSON.stringify(toDelete)}`
          );
        })
      );
    } else {
      // The task is still in a downloading queue.
      const deleted = task.counter.dec(callerId);
      if (deleted)
        this.removeTask(
          task,
          `the task ${JSON.stringify(task)} was removed from cache`
        );
    }
  }

  /** Removes all files from a hard drive. */
  async releaseAll() {
    this.downloadQueue.stop();

    await Promise.all(
      Array.from(this.urlToDownload.entries()).map(async ([id, task]) => {
        await rmRFDir(task.path);
        this.cache.removeCache(task);

        this.removeTask(
          task,
          `the task ${task} was released when the driver was closed`
        );
      })
    );
  }

  private setNewTask(w: Watcher, url: URL, callerId: string) {
    const result = new Download(this.getFilePath(url), url);
    result.attach(w, callerId);
    this.urlToDownload.set(url.toString(), result);

    return result;
  }

  private removeTask(task: Download, reason: string) {
    task.abort(reason);
    task.change.markChanged();
    this.urlToDownload.delete(task.url.toString());
  }

  private getFilePath(url: URL): string {
    const sha256 = createHash('sha256').update(url.toString()).digest('hex');
    return path.join(this.saveDir, sha256);
  }
}

class Download {
  readonly counter = new CallersCounter();
  readonly change = new ChangeSource();
  readonly signalCtl = new AbortController();
  error: string | undefined;
  done = false;
  sizeBytes = 0;

  constructor(
    readonly path: string,
    readonly url: URL
  ) {}

  attach(w: Watcher, callerId: string) {
    this.counter.inc(callerId);
    if (!this.done) this.change.attachWatcher(w);
  }

  async download(clientDownload: DownloadHelper, withGunzip: boolean) {
    try {
      const sizeBytes = await this.downloadAndUntar(
        clientDownload,
        withGunzip,
        this.signalCtl.signal
      );
      this.setDone(sizeBytes);
    } catch (e: any) {
      if (e instanceof URLAborted || e instanceof NetworkError400) {
        this.setError(e);
        // Just in case we were half-way extracting an archive.
        await rmRFDir(this.path);
        return;
      }

      throw e;
    }
  }

  private async downloadAndUntar(
    clientDownload: DownloadHelper,
    withGunzip: boolean,
    signal: AbortSignal
  ): Promise<number> {
    if (await fileExists(this.path)) {
      return await dirSize(this.path);
    }

    const resp = await clientDownload.downloadRemoteFile(
      this.url.toString(),
      {},
      signal
    );
    let content = resp.content;

    if (withGunzip) {
      const gunzip = Transform.toWeb(zlib.createGunzip());
      content = content.pipeThrough(gunzip, { signal });
    }
    const untar = Writable.toWeb(tar.extract(this.path));
    await content.pipeTo(untar, { signal });

    return resp.size;
  }

  getPath(): PathResult | undefined {
    if (this.done) return { path: notEmpty(this.path) };

    if (this.error) return { error: this.error };

    return undefined;
  }

  private setDone(sizeBytes: number) {
    this.done = true;
    this.sizeBytes = sizeBytes;
    this.change.markChanged();
  }

  abort(reason: string) {
    this.signalCtl.abort(new URLAborted(reason));
  }

  private setError(e: any) {
    this.error = String(e);
    this.change.markChanged();
  }
}

class URLAborted extends Error {}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fsp.access(path);
    return true;
  } catch {
    return false;
  }
}

/** Gets a directory size by calculating sizes recursively. */
async function dirSize(dir: string): Promise<number> {
  const files = await fsp.readdir(dir, { withFileTypes: true });
  const sizes = await Promise.all(
    files.map(async (file) => {
      const fPath = path.join(dir, file.name);

      if (file.isDirectory()) return await dirSize(fPath);

      const stat = await fsp.stat(fPath);
      return stat.size;
    })
  );

  return sizes.reduce((sum, size) => sum + size, 0);
}

/** Do rm -rf on dir. */
async function rmRFDir(path: string) {
  await fsp.rm(path, { recursive: true, force: true });
}
