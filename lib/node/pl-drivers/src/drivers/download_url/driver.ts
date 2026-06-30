import type { ComputableCtx, Watcher } from "@milaboratories/computable";
import { Computable } from "@milaboratories/computable";
import type { MiLogger, Signer } from "@milaboratories/ts-helpers";
import { TaskProcessor } from "@milaboratories/ts-helpers";
import { createHash, randomUUID } from "node:crypto";
import * as path from "node:path";
import type { Dispatcher } from "undici";
import { RemoteFileDownloader } from "../../helpers/download";
import { isDownloadNetworkError400 } from "../../helpers/download_errors";
import { FilesCache } from "../helpers/files_cache";
import { stringifyWithResourceId } from "@milaboratories/pl-client";
import type { BlockUIURL, FrontendDriver } from "@milaboratories/pl-model-common";
import { isBlockUIURL } from "@milaboratories/pl-model-common";
import { getPathForBlockUIURL } from "../urls/url";
import type { DownloadSource } from "./task";
import { DownloadByUrlTask, rmRFDir, URLAborted } from "./task";

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

  private taskByKey: Map<string, DownloadByUrlTask> = new Map();
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
  getUrl(url: URL, ctx?: ComputableCtx): Computable<UrlResult | undefined> | UrlResult | undefined {
    // wrap result as computable, if we were not given an existing computable context
    if (ctx === undefined) return Computable.make((c) => this.getUrl(url, c));
    return this.getResult({ type: "url", url }, url.toString(), ctx);
  }

  getLocalTgz(path: string, mtime: string, ctx: ComputableCtx): UrlResult | undefined;
  getLocalTgz(path: string, mtime: string): Computable<UrlResult | undefined>;

  /** Mirror of {@link getUrl} for a local `.tgz` archive: lazily unpacks it
   * into the recycled cache (so a live UI keeps the folder pinned) and returns
   * a custom-protocol URL. Keyed on `path + ":" + mtime`, so the unpacked UI is
   * re-derived when the source block changes. */
  getLocalTgz(
    path: string,
    mtime: string,
    ctx?: ComputableCtx,
  ): Computable<UrlResult | undefined> | UrlResult | undefined {
    if (ctx === undefined) return Computable.make((c) => this.getLocalTgz(path, mtime, c));
    return this.getResult({ type: "local-tgz", path, mtime }, `${path}:${mtime}`, ctx);
  }

  private getResult(
    source: DownloadSource,
    key: string,
    ctx: ComputableCtx,
  ): UrlResult | undefined {
    const callerId = randomUUID();

    // read as ~ golang's defer
    ctx.addOnDestroy(() => this.releaseByKey(key, callerId));

    const result = this.getResultNoCtx(source, key, ctx.watcher, callerId);
    if (result?.url === undefined)
      ctx.markUnstable(
        `a path to the downloaded and untared archive might be undefined. The current result: ${result}`,
      );

    return result;
  }

  private getResultNoCtx(source: DownloadSource, key: string, w: Watcher, callerId: string) {
    const task = this.taskByKey.get(key);

    if (task !== undefined) {
      task.attach(w, callerId);
      return task.getUrl();
    }

    const newTask = this.setNewTask(w, source, key, callerId);
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
    await task.download(this.downloadHelper, this.opts.withGunzip);
    // Might be undefined if a error happened
    if (task.getUrl()?.url !== undefined) this.cache.addCache(task, callerId);
  }

  /** Removes a directory and aborts a downloading task when all callers
   * are not interested in it. */
  async releaseByKey(key: string, callerId: string): Promise<void> {
    const task = this.taskByKey.get(key);
    if (task == undefined) return;

    if (this.cache.existsFile(task.path)) {
      const toDelete = this.cache.removeFile(task.path, callerId);

      await Promise.all(
        toDelete.map(async (task: DownloadByUrlTask) => {
          await rmRFDir(task.path);
          this.cache.removeCache(task);

          this.removeTask(
            task,
            `the task ${stringifyWithResourceId(task.info())} was removed` +
              `from cache along with ${stringifyWithResourceId(toDelete.map((t) => t.info()))}`,
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
      Array.from(this.taskByKey.entries()).map(async ([, task]) => {
        await rmRFDir(task.path);
        this.cache.removeCache(task);

        this.removeTask(
          task,
          `the task ${stringifyWithResourceId(task.info())} was released when the driver was closed`,
        );
      }),
    );
  }

  private setNewTask(w: Watcher, source: DownloadSource, key: string, callerId: string) {
    const result = new DownloadByUrlTask(
      this.logger,
      this.getExtractionPath(key),
      source,
      key,
      this.signer,
      this.saveDir,
    );
    result.attach(w, callerId);
    this.taskByKey.set(key, result);

    return result;
  }

  private removeTask(task: DownloadByUrlTask, reason: string) {
    task.abort(reason);
    task.change.markChanged(`task for ${task.key} removed: ${reason}`);
    this.taskByKey.delete(task.key);
  }

  /** Directory an archive (url or local file) is extracted into; keyed by a
   * hash of the task key so the same source maps to a stable on-disk path. */
  private getExtractionPath(key: string): string {
    const sha256 = createHash("sha256").update(key).digest("hex");
    return path.join(this.saveDir, sha256);
  }
}
