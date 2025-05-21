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
  CallersCounter,
} from '@milaboratories/ts-helpers';
import fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { Writable } from 'node:stream';
import type { ClientDownload } from '../../clients/download';
import { UnknownStorageError, WrongLocalFileUrl } from '../../clients/download';
import { NetworkError400 } from '../../helpers/download';

/** Downloads a blob and holds callers and watchers for the blob. */
export class DownloadBlobTask {
  readonly change = new ChangeSource();
  private readonly signalCtl = new AbortController();
  public readonly counter = new CallersCounter();
  private error: unknown | undefined;
  private done = false;
  public size = 0;
  private state: DownloadState = {};

  constructor(
    private readonly logger: MiLogger,
    private readonly clientDownload: ClientDownload,
    readonly rInfo: ResourceSnapshot,
    private readonly handle: LocalBlobHandle,
    readonly path: string,
  ) {}

  /** Returns a simple object that describes this task for debugging purposes. */
  public info() {
    return {
      rInfo: this.rInfo,
      fPath: this.path,
      done: this.done,
      error: this.error,
      state: this.state,
    };
  }

  public attach(w: Watcher, callerId: string) {
    this.counter.inc(callerId);
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
        await fsp.rm(this.path);
      }

      throw e;
    }
  }

  private async ensureDownloaded() {
    this.state = {};
    this.state.filePath = this.path;
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

  public getBlob():
    | { done: false }
    | {
      done: true;
      result: ValueOrError<LocalBlobHandleAndSize>;
    } {
    if (!this.done) return { done: false };

    return {
      done: this.done,
      result: getDownloadedBlobResponse(this.handle, this.size, this.error),
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
  handle: LocalBlobHandle | undefined,
  size: number,
  error?: unknown,
): ValueOrError<LocalBlobHandleAndSize> {
  if (error) {
    return { ok: false, error };
  }

  if (!handle) {
    return { ok: false, error: new Error('No file or handle provided') };
  }

  return {
    ok: true,
    value: {
      handle,
      size,
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
