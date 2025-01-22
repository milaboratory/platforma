import type { ComputableCtx, Watcher } from '@milaboratories/computable';
import { Computable } from '@milaboratories/computable';
import type {
  MiLogger,
  Signer } from '@milaboratories/ts-helpers';
import {
  TaskProcessor,
} from '@milaboratories/ts-helpers';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { FilesCache } from '../helpers/files_cache';
import type { ResourceId } from '@milaboratories/pl-client';
import { stringifyWithResourceId } from '@milaboratories/pl-client';
import type { ArchiveFormat, BlobToURLDriver, FolderURL } from '@milaboratories/pl-model-common';
import type { DownloadableBlobSnapshot } from './snapshot';
import { makeDownloadableBlobSnapshot } from './snapshot';
import type { PlTreeEntry } from '@milaboratories/pl-tree';
import { isPlTreeEntry } from '@milaboratories/pl-tree';
import { DownloadAndUnarchiveTask, rmRFDir } from './task';
import type { ClientDownload } from '../../clients/download';
import { getPathForFolderURL, isFolderURL } from './url';
import type { Id } from './driver_id';
import { newId } from './driver_id';
import { nonRecoverableError } from '../download_blob_task';

export type DownloadBlobToURLDriverOps = {
  cacheSoftSizeBytes: number;
  nConcurrentDownloads: number;
};

/** Downloads .tar, .tar.gz or zip archives,
 * extracts them into saveDir and gets a url for it. */
export class DownloadBlobToURLDriver implements BlobToURLDriver {
  private idToDownload: Map<Id, DownloadAndUnarchiveTask> = new Map();
  private downloadQueue: TaskProcessor;

  /** Writes and removes files to a hard drive and holds a counter for every
   * file that should be kept. */
  private cache: FilesCache<DownloadAndUnarchiveTask>;

  constructor(
    private readonly logger: MiLogger,
    private readonly signer: Signer,
    private readonly clientDownload: ClientDownload,
    private readonly saveDir: string,
    private readonly opts: DownloadBlobToURLDriverOps = {
      cacheSoftSizeBytes: 50 * 1024 * 1024,
      nConcurrentDownloads: 50,
    },
  ) {
    this.downloadQueue = new TaskProcessor(this.logger, this.opts.nConcurrentDownloads, {
      type: 'exponentialWithMaxDelayBackoff',
      initialDelay: 10000,
      maxDelay: 30000,
      backoffMultiplier: 1.5,
      jitter: 0.5,
    });
    this.cache = new FilesCache(this.opts.cacheSoftSizeBytes);
  }

  public info(): any {
    return {
      saveDir: this.saveDir,
      opts: this.opts,
      idToDownloadSize: this.idToDownload.size,
      idToDownloadKeys: this.idToDownload.keys(),
      idToDownload: Array.from(this.idToDownload.entries()).map(([id, task]) => [id, task.info()]),
    };
  }

  /**
   * @returns full path to the referenced file
   */
  getPathForCustomProtocol(url: FolderURL): string {
    if (isFolderURL(url)) {
      return getPathForFolderURL(this.signer, url, this.saveDir);
    }

    throw new Error(`getPathForCustomProtocol: ${url} is invalid`);
  }

  extractArchiveAndGetURL(
    res: DownloadableBlobSnapshot | PlTreeEntry,
    format: ArchiveFormat,
    ctx: ComputableCtx,
  ): FolderURL | undefined;

  extractArchiveAndGetURL(
    res: DownloadableBlobSnapshot | PlTreeEntry,
    format: ArchiveFormat,
  ): Computable<FolderURL | undefined>;

  extractArchiveAndGetURL(
    res: DownloadableBlobSnapshot | PlTreeEntry,
    format: ArchiveFormat,
    ctx?: ComputableCtx,
  ): Computable<FolderURL | undefined> | FolderURL | undefined {
    // wrap result as computable, if we were not given an existing computable context
    if (ctx === undefined)
      return Computable.make((c) => this.extractArchiveAndGetURL(res, format, c));

    const rInfo: DownloadableBlobSnapshot = isPlTreeEntry(res)
      ? makeDownloadableBlobSnapshot(res, ctx)
      : res;

    const callerId = randomUUID();

    ctx.addOnDestroy(() => this.releasePath(rInfo.id, format, callerId));

    const result = this.extractArchiveAndGetURLNoCtx(rInfo, format, ctx.watcher, callerId);
    if (result?.url === undefined)
      ctx.markUnstable(
        `a path to the downloaded archive might be undefined. The current result: ${result}`,
      );

    if (result?.error !== undefined)
      throw result?.error;

    return result?.url;
  }

  private extractArchiveAndGetURLNoCtx(
    rInfo: DownloadableBlobSnapshot,
    format: ArchiveFormat,
    w: Watcher,
    callerId: string,
  ) {
    const task = this.idToDownload.get(newId(rInfo.id, format));

    if (task != undefined) {
      task.attach(w, callerId);
      return task.getURL();
    }

    const newTask = this.setNewTask(w, rInfo, format, callerId);
    this.downloadQueue.push({
      fn: async () => this.downloadUrl(newTask, callerId),
      recoverableErrorPredicate: (e) => !nonRecoverableError(e),
    });

    return newTask.getURL();
  }

  /** Downloads and extracts a tar archive if it wasn't downloaded yet. */
  async downloadUrl(task: DownloadAndUnarchiveTask, callerId: string) {
    await task.download();
    // Might be undefined if a error happened
    if (task.getURL()?.url != undefined) this.cache.addCache(task, callerId);
  }

  /** Removes a directory and aborts a downloading task when all callers
   * are not interested in it. */
  async releasePath(id: ResourceId, format: ArchiveFormat, callerId: string): Promise<void> {
    const task = this.idToDownload.get(newId(id, format));
    if (task == undefined) return;

    if (this.cache.existsFile(task.path)) {
      const toDelete = this.cache.removeFile(task.path, callerId);

      await Promise.all(
        toDelete.map(async (task: DownloadAndUnarchiveTask) => {
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
      Array.from(this.idToDownload.entries()).map(async ([_, task]) => {
        await rmRFDir(task.path);
        this.cache.removeCache(task);

        this.removeTask(
          task,
          `the task ${stringifyWithResourceId(task.info())} was released when the driver was closed`,
        );
      }),
    );
  }

  private setNewTask(w: Watcher, rInfo: DownloadableBlobSnapshot, format: ArchiveFormat, callerId: string) {
    const result = new DownloadAndUnarchiveTask(
      this.logger,
      this.signer,
      this.saveDir,
      this.getFilePath(rInfo.id, format),
      rInfo,
      format,
      this.clientDownload,
    );
    result.attach(w, callerId);
    this.idToDownload.set(newId(rInfo.id, format), result);

    return result;
  }

  private removeTask(task: DownloadAndUnarchiveTask, reason: string) {
    task.abort(reason);
    task.change.markChanged();
    this.idToDownload.delete(newId(task.rInfo.id, task.format));
  }

  private getFilePath(id: ResourceId, format: ArchiveFormat): string {
    return path.join(this.saveDir, `${String(BigInt(id))}_${format}`);
  }
}
