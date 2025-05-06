import type { Watcher } from '@milaboratories/computable';
import { ChangeSource } from '@milaboratories/computable';
import type { LocalBlobHandle, LocalBlobHandleAndSize } from '@milaboratories/pl-model-common';
import type { ResourceSnapshot } from '@milaboratories/pl-tree';
import type {
  ValueOrError,
  MiLogger,
} from '@milaboratories/ts-helpers';
import {
  ensureDirExists,
  fileExists,
  createPathAtomically,
} from '@milaboratories/ts-helpers';
import fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { Writable } from 'node:stream';
import type { ClientDownload } from '../../clients/download';
import { UnknownStorageError, WrongLocalFileUrl } from '../../clients/download';
import { NetworkError400 } from '../../helpers/download';
import { CachedFileRange, fileRangeSize, RangeBytes } from '../helpers/range_blobs_cache';
import { randomBytes } from 'node:crypto';

/** Sometimes we don't know the size of the file until we download it. */
export type NotDownloadedFile = Omit<CachedFileRange, 'range'> & { range?: RangeBytes };

/** Downloads a blob and holds callers and watchers for the blob. */
export class DownloadBlobTask {
  readonly change = new ChangeSource();
  private readonly signalCtl = new AbortController();
  private error: unknown | undefined;
  private done = false;
  private size = 0;
  private state: DownloadState = {};

  constructor(
    private readonly logger: MiLogger,
    private readonly clientDownload: ClientDownload,
    readonly rInfo: ResourceSnapshot,
    private readonly handle: LocalBlobHandle,
    readonly file: NotDownloadedFile,
  ) {}

  static fromCachedFile(
    logger: MiLogger,
    clientDownload: ClientDownload,
    rInfo: ResourceSnapshot,
    handle: LocalBlobHandle,
    cachedFile: CachedFileRange,
  ) {
    const task = new DownloadBlobTask(
      logger,
      clientDownload,
      rInfo,
      handle,
      cachedFile,
    );
    task.setDone(fileRangeSize(cachedFile));

    return task;
  }

  /** Returns a simple object that describes this task for debugging purposes. */
  public info() {
    return {
      rInfo: this.rInfo,
      file: this.file,
      done: this.done,
      error: this.error,
      state: this.state,
    };
  }

  public cachedFile(): CachedFileRange {
    if (!this.done) {
      // we need the size of the download file.
      throw new Error('Cannot get cached file if the download is not done');
    }

    const range = this.file.range ?? { from: 0, to: this.size };

    return {
      path: this.file.path,
      baseKey: this.file.baseKey,
      key: this.file.key,
      range,
      counter: this.file.counter,
    };
  }

  public attach(w: Watcher, callerId: string) {
    this.file.counter.inc(callerId);
    if (!this.done) this.change.attachWatcher(w);
  }

  public async download() {
    try {
      const size = await this.ensureDownloaded();
      this.setDone(size);
      this.change.markChanged();
    } catch (e: any) {
      this.logger.error(`task failed: ${e}, ${JSON.stringify(this.state)}`);
      if (nonRecoverableError(e)) {
        this.setError(e);
        this.change.markChanged();
        // Just in case we were half-way extracting an archive.
        await fsp.rm(this.file.path);
      }

      throw e;
    }
  }

  private async ensureDownloaded() {
    this.state = {};
    this.state.filePath = this.file.path;
    await ensureDirExists(path.dirname(this.state.filePath));
    this.state.dirExists = true;

    if (await fileExists(this.state.filePath)) {
      this.state.fileExists = true;
      this.logger.info(`a blob was already downloaded: ${this.state.filePath}`);
      const stat = await fsp.stat(this.state.filePath);
      this.state.fileSize = stat.size;

      return this.state.fileSize;
    }

    const { content, size } = await this.clientDownload.downloadBlob(
      this.rInfo,
      {},
      undefined,
      this.file.range?.from,
      this.file.range?.to,
    );
    this.state.fileSize = size;
    this.state.downloaded = true;

    await createPathAtomically(this.logger, this.state.filePath, async (fPath: string) => {
      const f = Writable.toWeb(fs.createWriteStream(fPath, { flags: 'wx' }));
      await content.pipeTo(f);
      this.state.tempWritten = true;
    });

    this.state.done = true;

    return size;
  }

  public abort(reason: string) {
    this.signalCtl.abort(new DownloadAborted(reason));
  }

  public getBlob(neededRange?: RangeBytes):
    | { done: false }
    | {
      done: true;
      result: ValueOrError<LocalBlobHandleAndSize>;
    } {
    if (!this.done) return { done: false };

    return {
      done: this.done,
      result: getDownloadedBlobResponse({ cached: this.cachedFile(), handle: this.handle }, this.error, neededRange),
    };
  }

  private setDone(sizeBytes: number) {
    this.done = true;
    this.size = sizeBytes;
  }

  private setError(e: unknown) {
    this.done = true;
    this.error = e;
  }
}

export function nonRecoverableError(e: any) {
  return (
    e instanceof DownloadAborted
    || e instanceof NetworkError400
    || e instanceof UnknownStorageError
    || e instanceof WrongLocalFileUrl
    // file that we downloads from was moved or deleted.
    || e?.code == 'ENOENT'
    // A resource was deleted.
    || (e.name == 'RpcError' && (e.code == 'NOT_FOUND' || e.code == 'ABORTED'))
  );
}

/** The downloading task was aborted by a signal.
 * It may happen when the computable is done, for example. */
class DownloadAborted extends Error {}

export function getDownloadedBlobResponse(
  file?: { cached: CachedFileRange, handle: LocalBlobHandle },
  error?: unknown,
  neededRange?: RangeBytes,
): ValueOrError<LocalBlobHandleAndSize> {
  if (error) {
    return { ok: false, error };
  }

  if (!file) {
    return { ok: false, error: new Error('No file or handle provided') };
  }

  let start = 0;
  let end = fileRangeSize(file.cached);

  if (neededRange != undefined) {
    start = neededRange.from - file.cached.range.from;
    end = start + neededRange.to - neededRange.from;
  }

  return {
    ok: true,
    value: {
      handle: file.handle,
      size: end - start,
      startByte: start,
      endByte: end,
    },
  };
}

type DownloadState = {
  filePath?: string;
  dirExists?: boolean;
  fileExists?: boolean;
  fileSize?: number;
  downloaded?: boolean;
  tempWritten?: boolean;
  done?: boolean;
}
