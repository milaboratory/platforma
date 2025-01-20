import type { Watcher } from '@milaboratories/computable';
import { ChangeSource } from '@milaboratories/computable';
import type { LocalBlobHandle, LocalBlobHandleAndSize } from '@milaboratories/pl-model-common';
import type { ResourceSnapshot } from '@milaboratories/pl-tree';
import type {
  ValueOrError,
  MiLogger,
} from '@milaboratories/ts-helpers';
import {
  CallersCounter,
  ensureDirExists,
  fileExists,
  createPathAtomically,
} from '@milaboratories/ts-helpers';
import fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { Writable } from 'node:stream';
import type { ClientDownload } from '../clients/download';
import { UnknownStorageError, WrongLocalFileUrl } from '../clients/download';
import { NetworkError400 } from '../helpers/download';

/** Downloads a blob. */
export class DownloadBlobTask {
  readonly counter = new CallersCounter();
  readonly change = new ChangeSource();
  private readonly signalCtl = new AbortController();
  private error: any | undefined;
  private done = false;
  /** Represents a size in bytes of the downloaded blob. */
  size = 0;

  constructor(
    private readonly logger: MiLogger,
    private readonly clientDownload: ClientDownload,
    readonly rInfo: ResourceSnapshot,
    readonly path: string,
    private readonly handle: LocalBlobHandle,
  ) {}

  /** Returns a simple object that describes this task. */
  public info() {
    return {
      rInfo: this.rInfo,
      path: this.path,
      done: this.done,
      size: this.size,
      error: this.error,
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
    await ensureDirExists(path.dirname(this.path));

    if (await fileExists(this.path)) {
      this.logger.info(`a blob was already downloaded: ${this.path}`);
      const stat = await fsp.stat(this.path);
      return stat.size;
    }

    const { content, size } = await this.clientDownload.downloadBlob(this.rInfo);

    await createPathAtomically(this.logger, this.path, async (fPath: string) => {
      const f = Writable.toWeb(fs.createWriteStream(fPath, { flags: 'wx' }));
      await content.pipeTo(f);
    });

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

    if (this.error)
      return {
        done: true,
        result: { ok: false, error: this.error },
      };

    return {
      done: true,
      result: {
        ok: true,
        value: {
          handle: this.handle,
          size: this.size,
        },
      },
    };
  }

  private setDone(sizeBytes: number) {
    this.done = true;
    this.size = sizeBytes;
  }

  private setError(e: any) {
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
