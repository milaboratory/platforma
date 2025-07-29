import type { Watcher } from '@milaboratories/computable';
import { ChangeSource } from '@milaboratories/computable';
import type {
  MiLogger,
  Signer,
} from '@milaboratories/ts-helpers';
import {
  CallersCounter,
  createPathAtomically,
  ensureDirExists,
  fileExists,
  notEmpty,
} from '@milaboratories/ts-helpers';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { Transform, Writable } from 'node:stream';
import * as zlib from 'node:zlib';
import * as tar from 'tar-fs';
import type { RemoteFileDownloader } from '../../helpers/download';
import { NetworkError400 } from '../../helpers/download';
import type { UrlResult } from './driver';
import { newBlockUIURL } from '../urls/url';

/** Downloads and extracts an archive to a directory. */
export class DownloadByUrlTask {
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
    readonly signer: Signer,
    readonly saveDir: string,
  ) { }

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
    } catch (e: unknown) {
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

    const size = await clientDownload.withContent(
      this.url.toString(), 
      {}, 
      { signal },
      async (content, size) => {
        let processedContent = content;
        if (withGunzip) {
          const gunzip = Transform.toWeb(zlib.createGunzip());
          processedContent = content.pipeThrough(gunzip, { signal });
        }

        await createPathAtomically(this.logger, this.path, async (fPath: string) => {
          await fsp.mkdir(fPath); // throws if a directory already exists.
          const untar = Writable.toWeb(tar.extract(fPath));
          await processedContent.pipeTo(untar, { signal });
        });

        return size;
      }
    );

    return size;
  }

  getUrl(): UrlResult | undefined {
    if (this.done) return {
      url: newBlockUIURL(this.signer, this.saveDir, notEmpty(this.path))
     };

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
export class URLAborted extends Error {
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
export async function rmRFDir(path: string) {
  await fsp.rm(path, { recursive: true, force: true });
}
