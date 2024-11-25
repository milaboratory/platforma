import { Writable } from 'node:stream';
import * as fs from 'fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { ChangeSource, Watcher } from "@milaboratories/computable";
import { CallersCounter, ValueOrError } from "@milaboratories/ts-helpers";
import { ClientDownload, UnknownStorageError, WrongLocalFileUrl } from "../clients/download";
import { ResourceSnapshot } from "@milaboratories/pl-tree";
import { LocalBlobHandle, LocalBlobHandleAndSize } from "@milaboratories/pl-model-common";
import { NetworkError400 } from '../helpers/download';

/** Downloads a blob. */
export class DownloadTask {
  readonly counter = new CallersCounter();
  readonly change = new ChangeSource();
  readonly signalCtl = new AbortController();
  error: any | undefined;
  done = false;
  /** Represents a size in bytes of the downloaded blob. */
  size = 0;

  constructor(
    readonly clientDownload: ClientDownload,
    readonly rInfo: ResourceSnapshot,
    readonly path: string,
    readonly handle: LocalBlobHandle
  ) {}

  public attach(w: Watcher, callerId: string) {
    this.counter.inc(callerId);
    if (!this.done) this.change.attachWatcher(w);
  }

  public async download() {
    try {
      // TODO: move size bytes inside fileExists check like in download_url.
      const { content, size } = await this.clientDownload.downloadBlob(this.rInfo);

      const dir = path.dirname(this.path);
      if (!(await pathExists(dir)))
        await fsp.mkdir(dir, { recursive: true });

      // check in case we already have a file by this resource id
      // in the directory. It can happen when we forgot to call removeAll
      // in the previous launch.
      if (await pathExists(this.path)) {
        await content.cancel(`the file already existed`); // finalize body
      } else {
        const fileToWrite = Writable.toWeb(fs.createWriteStream(this.path));
        await content.pipeTo(fileToWrite);
      }

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

  public abort(reason: string) {
    this.signalCtl.abort(new DownloadAborted(reason));
  }

  public getBlob():
    | { done: false }
    | {
      done: true;
      result: ValueOrError<LocalBlobHandleAndSize>;
    } {
    if (!this.done)
      return { done: false };

    if (this.error)
      return {
        done: true,
        result: { ok: false, error: this.error }
      };

    return {
      done: true,
      result: {
        ok: true,
        value: {
          handle: this.handle,
          size: this.size
        }
      }
    };
  }

  private setDone(sizeBytes: number) {
    this.done = true;
    this.size = sizeBytes;
  }

  private setError(e: any) {
    this.error = e;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fsp.access(path);
    return true;
  } catch {
    return false;
  }
}

export function nonRecoverableError(e: any) {
  return (
    e instanceof DownloadAborted ||
    e instanceof NetworkError400 ||
    e instanceof UnknownStorageError ||
    e instanceof WrongLocalFileUrl ||

    // file that we downloads from was moved or deleted.
    e?.code == 'ENOENT' ||

    // A resource was deleted.
    (e.name == 'RpcError' && (e.code == 'NOT_FOUND' || e.code == 'ABORTED'))
  );
}

/** The downloading task was aborted by a signal.
 * It may happen when the computable is done, for example. */
class DownloadAborted extends Error {}
