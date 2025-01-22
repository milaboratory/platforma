import { Transform, Writable } from 'node:stream';
import * as zlib from 'node:zlib';
import * as tar from 'tar-fs';
import path from 'path';
import fs from 'fs';
import * as fsp from 'fs/promises';
import { NetworkError400 } from '../../helpers/download';
import type { Watcher } from '@milaboratories/computable';
import { ChangeSource } from '@milaboratories/computable';
import type { MiLogger, Signer } from '@milaboratories/ts-helpers';
import { CallersCounter, createPathAtomically, ensureDirExists, fileExists, notEmpty } from '@milaboratories/ts-helpers';
import type { DownloadableBlobSnapshot } from './snapshot';
import { UnknownStorageError, WrongLocalFileUrl, type ClientDownload } from '../../clients/download';
import type { ArchiveFormat, FolderURL } from '@milaboratories/pl-model-common';
import { newFolderURL } from './url';
import decompress from 'decompress';
import { assertNever } from '@protobuf-ts/runtime';
import { stringifyWithResourceId } from '@milaboratories/pl-client';

export type URLResult = {
  url?: FolderURL;
  error?: string;
};

/** Downloads and extracts an archive to a directory. */
export class DownloadAndUnarchiveTask {
  readonly counter = new CallersCounter();
  readonly change = new ChangeSource();
  private readonly signalCtl = new AbortController();
  error: string | undefined;
  done = false;
  size = 0;
  private url: FolderURL | undefined;
  private state: DownloadCtx | undefined;

  constructor(
    private readonly logger: MiLogger,
    private readonly signer: Signer,
    readonly saveDir: string,
    readonly path: string,
    readonly rInfo: DownloadableBlobSnapshot,
    readonly format: ArchiveFormat,
    private readonly clientDownload: ClientDownload,
  ) {}

  /** A debug info of the task. */
  public info() {
    return {
      rInfo: this.rInfo,
      format: this.format,
      path: this.path,
      done: this.done,
      size: this.size,
      error: this.error,
      taskHistory: this.state,
    };
  }

  attach(w: Watcher, callerId: string) {
    this.counter.inc(callerId);
    if (!this.done) this.change.attachWatcher(w);
  }

  async download() {
    try {
      const size = await this.downloadAndDecompress(this.signalCtl.signal);
      this.setDone(size);
      this.change.markChanged();

      this.logger.info(`blob to URL task is done: ${stringifyWithResourceId(this.info())}`);
    } catch (e: any) {
      this.logger.warn(`a error was produced: ${e} for blob to URL task: ${stringifyWithResourceId(this.info())}`);

      if (nonRecoverableError(e)) {
        this.setError(e);
        this.change.markChanged();
        // Just in case we were half-way extracting an archive.
        await rmRFDir(this.path);
        return;
      }

      throw e;
    }
  }

  /** Does the download part and keeps a state of the process. */
  private async downloadAndDecompress(signal: AbortSignal): Promise<number> {
    this.state = {};

    this.state.parentDir = path.dirname(this.path);
    await ensureDirExists(this.state.parentDir);

    this.state.fileExisted = await fileExists(this.path);
    if (this.state.fileExisted) {
      return await dirSize(this.path);
    }

    let { content, size } = await this.clientDownload.downloadBlob(
      this.rInfo, {}, signal,
    );
    this.state.downloaded = true;

    await createPathAtomically(this.logger, this.path, async (fPath: string) => {
      this.state!.tempPath = fPath;
      this.state!.archiveFormat = this.format;

      switch (this.format) {
      case 'tar':
          await fsp.mkdir(fPath); // throws if a directory already exists.
          const simpleUntar = Writable.toWeb(tar.extract(fPath));
          await content.pipeTo(simpleUntar, { signal });
          return;

      case 'tgz':
          await fsp.mkdir(fPath); // throws if a directory already exists.
          const gunzip = Transform.toWeb(zlib.createGunzip());
          const untar = Writable.toWeb(tar.extract(fPath));

          await content.
            pipeThrough(gunzip, { signal }).
            pipeTo(untar, { signal });
          return;

      case 'zip':
          this.state!.zipPath = this.path + '.zip';

          const f = Writable.toWeb(fs.createWriteStream(this.state!.zipPath));
          await content.pipeTo(f, { signal });
          this.state!.zipPathCreated = true;

          await decompress(this.path + '.zip', fPath);

          await fs.promises.rm(this.state!.zipPath);
          this.state!.zipPathDeleted = true;

          return;

      default:
          assertNever(this.format);
      }
    });

    this.state.pathCreated = true;

    return size;
  }

  getURL(): URLResult | undefined {
    if (this.done) return { url: notEmpty(this.url) };

    if (this.error) return { error: this.error };

    return undefined;
  }

  private setDone(size: number) {
    this.done = true;
    this.size = size;
    this.url = newFolderURL(this.signer, this.saveDir, this.path);
  }

  private setError(e: any) {
    this.error = String(e);
  }

  abort(reason: string) {
    this.signalCtl.abort(new URLAborted(reason));
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
    }),
  );

  return sizes.reduce((sum, size) => sum + size, 0);
}

/** Do rm -rf on dir. */
export async function rmRFDir(path: string) {
  await fsp.rm(path, { recursive: true, force: true });
}

/** Just a type that adds lots of context when the error happens. */
type DownloadCtx = {
  parentDir?: string;
  fileExisted?: boolean;
  downloaded?: boolean;
  archiveFormat?: ArchiveFormat;
  tempPath?: string;
  zipPath?: string;
  zipPathCreated?: boolean;
  zipPathDeleted?: boolean;
  pathCreated?: boolean;
};

/** Throws when a downloading aborts. */
class URLAborted extends Error {}

export function nonRecoverableError(e: any) {
  return (
    e instanceof URLAborted
    || e instanceof NetworkError400
    || e instanceof UnknownStorageError
    || e instanceof WrongLocalFileUrl
    // file that we downloads from was moved or deleted.
    || e?.code == 'ENOENT'
    // A resource was deleted.
    || (e.name == 'RpcError' && (e.code == 'NOT_FOUND' || e.code == 'ABORTED'))
    // wrong archive format
    || (String(e).includes('incorrect header check'))
  );
}
