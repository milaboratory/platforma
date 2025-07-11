import type { ComputableCtx, Watcher } from '@milaboratories/computable';
import { ChangeSource, Computable } from '@milaboratories/computable';
import type {
  MiLogger } from '@milaboratories/ts-helpers';
import {
  CallersCounter,
  TaskProcessor,
  createPathAtomically,
  ensureDirExists,
  fileExists,
  notEmpty,
} from '@milaboratories/ts-helpers';
import { createHash, randomUUID } from 'node:crypto';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { Transform, Writable } from 'node:stream';
import * as zlib from 'node:zlib';
import * as tar from 'tar-fs';
import type { Dispatcher } from 'undici';
import { NetworkError400, RemoteFileDownloader } from '../helpers/download';
import { FilesCache } from './helpers/files_cache';
import { stringifyWithResourceId } from '@milaboratories/pl-client';

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
  private readonly downloadHelper: RemoteFileDownloader;

  private urlToDownload: Map<string, DownloadByUrlTask> = new Map();
  private downloadQueue: TaskProcessor;

  /** Writes and removes files to a hard drive and holds a counter for every
   * file that should be kept. */
  private cache: FilesCache<DownloadByUrlTask>;

  constructor(
    private readonly logger: MiLogger,
    httpClient: Dispatcher,
    private readonly saveDir: string,
    private readonly opts: DownloadUrlDriverOps = {
      cacheSoftSizeBytes: 1 * 1024 * 1024 * 1024, // 1 GB
      withGunzip: true,
      nConcurrentDownloads: 50,
    },
  ) {
    this.downloadQueue = new TaskProcessor(this.logger, this.opts.nConcurrentDownloads);
    this.cache = new FilesCache(this.opts.cacheSoftSizeBytes);
    this.downloadHelper = new RemoteFileDownloader(httpClient);
  }

  /** Use to get a path result inside a computable context */
  getPath(url: URL, ctx: ComputableCtx): PathResult | undefined;

  /** Returns a Computable that do the work */
  getPath(url: URL): Computable<PathResult | undefined>;

  getPath(
    url: URL,
    ctx?: ComputableCtx,
  ): Computable<PathResult | undefined> | PathResult | undefined {
    // wrap result as computable, if we were not given an existing computable context
    if (ctx === undefined) return Computable.make((c) => this.getPath(url, c));

    const callerId = randomUUID();

    // read as ~ golang's defer
    ctx.addOnDestroy(() => this.releasePath(url, callerId));

    const result = this.getPathNoCtx(url, ctx.watcher, callerId);
    if (result?.path === undefined)
      ctx.markUnstable(
        `a path to the downloaded and untared archive might be undefined. The current result: ${result}`,
      );

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
      recoverableErrorPredicate: (e) => true,
    });

    return newTask.getPath();
  }

  /** Downloads and extracts a tar archive if it wasn't downloaded yet. */
  async downloadUrl(task: DownloadByUrlTask, callerId: string) {
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
        toDelete.map(async (task: DownloadByUrlTask) => {
          await rmRFDir(task.path);
          this.cache.removeCache(task);

          this.removeTask(
            task,
            `the task ${stringifyWithResourceId(task.info())} was removed`
            + `from cache along with ${stringifyWithResourceId(toDelete.map((t) => t.info()))}`,
          );
        }),
      );
    } else {
      // The task is still in a downloading queue.
      const deleted = task.counter.dec(callerId);
      if (deleted)
        this.removeTask(
          task,
          `the task ${stringifyWithResourceId(task.info())} was removed from cache`,
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
          `the task ${stringifyWithResourceId(task.info())} was released when the driver was closed`,
        );
      }),
    );
  }

  private setNewTask(w: Watcher, url: URL, callerId: string) {
    const result = new DownloadByUrlTask(this.logger, this.getFilePath(url), url);
    result.attach(w, callerId);
    this.urlToDownload.set(url.toString(), result);

    return result;
  }

  private removeTask(task: DownloadByUrlTask, reason: string) {
    task.abort(reason);
    task.change.markChanged(`task for url ${task.url} removed: ${reason}`);
    this.urlToDownload.delete(task.url.toString());
  }

  private getFilePath(url: URL): string {
    const sha256 = createHash('sha256').update(url.toString()).digest('hex');
    return path.join(this.saveDir, sha256);
  }
}

/** Downloads and extracts an archive to a directory. */
class DownloadByUrlTask {
  readonly counter = new CallersCounter();
  readonly change = new ChangeSource();
  private readonly signalCtl = new AbortController();
  error: string | undefined;
  done = false;
  size = 0;

  constructor(
    private readonly logger: MiLogger,
    readonly path: string,
    readonly url: URL,
  ) {}

  public info() {
    return {
      url: this.url.toString(),
      path: this.path,
      done: this.done,
      size: this.size,
      error: this.error,
    };
  }

  attach(w: Watcher, callerId: string) {
    this.counter.inc(callerId);
    if (!this.done) this.change.attachWatcher(w);
  }

  async download(clientDownload: RemoteFileDownloader, withGunzip: boolean) {
    try {
      const size = await this.downloadAndUntar(clientDownload, withGunzip, this.signalCtl.signal);
      this.setDone(size);
      this.change.markChanged(`download of ${this.url} finished`);
    } catch (e: any) {
      if (e instanceof URLAborted || e instanceof NetworkError400) {
        this.setError(e);
        this.change.markChanged(`download of ${this.url} failed`);
        // Just in case we were half-way extracting an archive.
        await rmRFDir(this.path);
        return;
      }

      throw e;
    }
  }

  private async downloadAndUntar(
    clientDownload: RemoteFileDownloader,
    withGunzip: boolean,
    signal: AbortSignal,
  ): Promise<number> {
    await ensureDirExists(path.dirname(this.path));

    if (await fileExists(this.path)) {
      return await dirSize(this.path);
    }

    const resp = await clientDownload.download(this.url.toString(), {}, signal);

    let content = resp.content;
    if (withGunzip) {
      const gunzip = Transform.toWeb(zlib.createGunzip());
      content = content.pipeThrough(gunzip, { signal });
    }

    await createPathAtomically(this.logger, this.path, async (fPath: string) => {
      await fsp.mkdir(fPath); // throws if a directory already exists.
      const untar = Writable.toWeb(tar.extract(fPath));
      await content.pipeTo(untar, { signal });
    });

    return resp.size;
  }

  getPath(): PathResult | undefined {
    if (this.done) return { path: notEmpty(this.path) };

    if (this.error) return { error: this.error };

    return undefined;
  }

  private setDone(size: number) {
    this.done = true;
    this.size = size;
  }

  private setError(e: any) {
    this.error = String(e);
  }

  abort(reason: string) {
    this.signalCtl.abort(new URLAborted(reason));
  }
}

/** Throws when a downloading aborts. */
class URLAborted extends Error {
  name = 'URLAborted';
}

/** Gets a directory size by calculating sizes recursively. */
async function dirSize(dir: string): Promise<number> {
  const files = await fsp.readdir(dir, { withFileTypes: true });
  const sizes = await Promise.all(
    files.map(async (file: any) => {
      const fPath = path.join(dir, file.name);

      if (file.isDirectory()) return await dirSize(fPath);

      const stat = await fsp.stat(fPath);
      return stat.size;
    }),
  );

  return sizes.reduce((sum: any, size: any) => sum + size, 0);
}

/** Do rm -rf on dir. */
async function rmRFDir(path: string) {
  await fsp.rm(path, { recursive: true, force: true });
}
