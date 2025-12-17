import type { ComputableCtx, Watcher } from '@milaboratories/computable';
import { Computable } from '@milaboratories/computable';
import type {
  MiLogger,
  Signer,
} from '@milaboratories/ts-helpers';
import {
  TaskProcessor,
} from '@milaboratories/ts-helpers';
import { createHash, randomUUID } from 'node:crypto';
import * as path from 'node:path';
import type { Dispatcher } from 'undici';
import { RemoteFileDownloader } from '../../helpers/download';
import { isDownloadNetworkError400 } from '../../helpers/download_errors';
import { FilesCache } from '../helpers/files_cache';
import { stringifyWithResourceId } from '@milaboratories/pl-client';
import type { BlockUIURL, FrontendDriver } from '@milaboratories/pl-model-common';
import { isBlockUIURL } from '@milaboratories/pl-model-common';
import { getPathForBlockUIURL } from '../urls/url';
import { DownloadByUrlTask, rmRFDir, URLAborted } from './task';

export interface DownloadUrlSyncReader {
  /** Returns a Computable that (when the time will come)
   * downloads an archive from an URL,
   * extracts it to the local dir and returns a path to that dir. */
  getUrl(url: URL): Computable<UrlResult | undefined>;
}

export interface UrlResult {
  /** Path to the downloadable blob along with the signature and a custom protocol,
   * might be undefined when the error happened. */
  url?: BlockUIURL;
  /** Error that happened when the archive were downloaded. */
  error?: string;
}

export type DownloadUrlDriverOps = {
  /** A soft limit of the amount of blob storage, in bytes.
   * Once exceeded, the download driver will start deleting blobs one by one
   * when they become unneeded.
   * */
  cacheSoftSizeBytes: number;

  /** Whether to gunzip the downloaded archive (it will be untared automatically). */
  withGunzip: boolean;

  /** Max number of concurrent downloads while calculating computable states
   * derived from this driver.
   * */
  nConcurrentDownloads: number;
};

/** Downloads .tar or .tar.gz archives by given URLs
 * and extracts them into saveDir. */
export class DownloadUrlDriver implements DownloadUrlSyncReader, FrontendDriver {
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
    private readonly signer: Signer,
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
  getUrl(url: URL, ctx: ComputableCtx): UrlResult | undefined;

  /** Returns a Computable that do the work */
  getUrl(url: URL): Computable<UrlResult | undefined>;

  /** Returns a computable that returns a custom protocol URL to the downloaded and unarchived path. */
  getUrl(
    url: URL,
    ctx?: ComputableCtx,
  ): Computable<UrlResult | undefined> | UrlResult | undefined {
    // wrap result as computable, if we were not given an existing computable context
    if (ctx === undefined) return Computable.make((c) => this.getUrl(url, c));

    const callerId = randomUUID();

    // read as ~ golang's defer
    ctx.addOnDestroy(() => {
      console.log('DownloadUrlDriver.getUrl onDestroy callback', { url, callerId });
      this.releasePath(url, callerId);
    });

    const result = this.getUrlNoCtx(url, ctx.watcher, callerId);
    if (result?.url === undefined)
      ctx.markUnstable(
        `a path to the downloaded and untared archive might be undefined. The current result: ${result}`,
      );

    return result;
  }

  getUrlNoCtx(url: URL, w: Watcher, callerId: string) {
    const key = url.toString();
    const task = this.urlToDownload.get(key);

    if (task !== undefined) {
      console.log('DownloadUrlDriver.getUrlNoCtx existing task found', { url, task, callerId });
      task.attach(w, callerId);
      return task.getUrl();
    }

    console.log('DownloadUrlDriver.getUrlNoCtx new task created', { url, task, callerId });
    const newTask = this.setNewTask(w, url, callerId);
    this.downloadQueue.push({
      fn: async () => this.downloadUrl(newTask, callerId),
      recoverableErrorPredicate: (e) => !(e instanceof URLAborted) && !isDownloadNetworkError400(e),
    });

    return newTask.getUrl();
  }

  getPathForBlockUI(url: string): string {
    if (!isBlockUIURL(url)) {
      throw new Error(`getPathForBlockUI: ${url} is invalid`);
    }

    return getPathForBlockUIURL(this.signer, url, this.saveDir);
  }

  /** Downloads and extracts a tar archive if it wasn't downloaded yet. */
  async downloadUrl(task: DownloadByUrlTask, callerId: string) {
    console.log('DownloadUrlDriver.downloadUrl', { task, callerId });
    await task.download(this.downloadHelper, this.opts.withGunzip);
    console.log('DownloadUrlDriver.downloadUrl awaited', { task, callerId });
    // Might be undefined if an error happened
    if (task.getUrl()?.url !== undefined) this.cache.addCache(task, callerId);
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
    const result = new DownloadByUrlTask(
      this.logger,
      this.getFilePath(url),
      url,
      this.signer,
      this.saveDir,
    );
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
