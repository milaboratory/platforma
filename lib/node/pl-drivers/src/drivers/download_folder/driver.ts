/*
  TODO:
  - rename to just DownloadBlobToURLDriver
  - signatures
  - refactor, extract blob url
  - more archive types

  */

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
import * as fs from 'node:fs/promises';
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

export type DownloadBlobToURLDriverOps = {
  cacheSoftSizeBytes: number;
  nConcurrentDownloads: number;
};

/** Downloads .tar, .tar.gz or zip archives,
 * extracts them into saveDir and gets a url for it. */
export class DownloadBlobToURLDriver implements BlobToURLDriver {
  private idToDownload: Map<ResourceId, DownloadAndUnarchiveTask> = new Map();
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
    this.downloadQueue = new TaskProcessor(this.logger, this.opts.nConcurrentDownloads);
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
    const parsed = new URL(url);
    const signAndSubfolder = parsed.host;
    const subfolder = signAndSubfolder.slice(signAndSubfolder.indexOf('.') + 1);
    // TODO: add signature validation
    let fPath = path.join(this.saveDir, subfolder, parsed.pathname);

    if (parsed.pathname == '' || parsed.pathname == '/')
      fPath = path.join(fPath, 'index.html');

    return path.resolve(fPath);
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

    ctx.addOnDestroy(() => this.releasePath(rInfo.id, callerId));

    const result = this.extractArchiveAndGetURLNoCtx(rInfo, ctx.watcher, callerId);
    if (result?.url === undefined)
      ctx.markUnstable(
        `a path to the downloaded and untared archive might be undefined. The current result: ${result}`,
      );
    if (result?.error !== undefined)
      throw result?.error;

    return result?.url;
  }

  private extractArchiveAndGetURLNoCtx(rInfo: DownloadableBlobSnapshot, w: Watcher, callerId: string) {
    const task = this.idToDownload.get(rInfo.id);

    if (task != undefined) {
      task.attach(w, callerId);
      return task.getURL();
    }

    const newTask = this.setNewTask(w, rInfo, callerId);
    this.downloadQueue.push({
      fn: async () => this.downloadUrl(newTask, callerId),
      recoverableErrorPredicate: (e) => true,
    });

    return newTask.getURL();
  }

  /** Downloads and extracts a tar archive if it wasn't downloaded yet. */
  async downloadUrl(task: DownloadAndUnarchiveTask, callerId: string) {
    await task.download(true);
    // Might be undefined if a error happened
    if (task.getURL()?.url != undefined) this.cache.addCache(task, callerId);
  }

  /** Removes a directory and aborts a downloading task when all callers
   * are not interested in it. */
  async releasePath(id: ResourceId, callerId: string): Promise<void> {
    const task = this.idToDownload.get(id);
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
      Array.from(this.idToDownload.entries()).map(async ([id, task]) => {
        await rmRFDir(task.path);
        this.cache.removeCache(task);

        this.removeTask(
          task,
          `the task ${stringifyWithResourceId(task.info())} was released when the driver was closed`,
        );
      }),
    );
  }

  private setNewTask(w: Watcher, rInfo: DownloadableBlobSnapshot, callerId: string) {
    const result = new DownloadAndUnarchiveTask(this.logger, this.saveDir, this.getFilePath(rInfo.id), rInfo, this.clientDownload);
    result.attach(w, callerId);
    this.idToDownload.set(rInfo.id, result);

    return result;
  }

  private removeTask(task: DownloadAndUnarchiveTask, reason: string) {
    task.abort(reason);
    task.change.markChanged();
    this.idToDownload.delete(task.rInfo.id);
  }

  private getFilePath(id: ResourceId): string {
    return path.join(this.saveDir, String(BigInt(id)));
  }
}
