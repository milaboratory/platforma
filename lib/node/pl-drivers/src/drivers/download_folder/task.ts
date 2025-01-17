import { Transform, Writable } from 'node:stream';
import * as zlib from 'node:zlib';
import * as tar from 'tar-fs';
import path from 'path';
import * as fsp from 'fs/promises';
import { NetworkError400 } from '../../helpers/download';
import { ChangeSource, Watcher } from "@milaboratories/computable";
import { CallersCounter, createPathAtomically, ensureDirExists, fileExists, MiLogger, notEmpty } from "@milaboratories/ts-helpers";
import { DownloadableBlobSnapshot } from './snapshot';
import { ClientDownload } from '../../clients/download';
import { FolderURL } from '@milaboratories/pl-model-common';

export type URLResult = {
  url?: FolderURL;
  error?: string;
}

/** Downloads and extracts an archive to a directory. */
export class DownloadFolderTask {
  readonly counter = new CallersCounter();
  readonly change = new ChangeSource();
  private readonly signalCtl = new AbortController();
  error: string | undefined;
  done = false;
  size = 0;
  private url: FolderURL | undefined;

  constructor(
    private readonly logger: MiLogger,
    readonly path: string,
    readonly rInfo: DownloadableBlobSnapshot,
    private readonly clientDownload: ClientDownload,
  ) {}

  public info() {
    return {
      rInfo: this.rInfo,
      path: this.path,
      done: this.done,
      size: this.size,
      error: this.error
    };
  }

  attach(w: Watcher, callerId: string) {
    this.counter.inc(callerId);
    if (!this.done) this.change.attachWatcher(w);
  }

  async download(withGunzip: boolean) {
    try {
      const size = await this.downloadAndUntar(withGunzip, this.signalCtl.signal);
      this.setDone(size);
      this.change.markChanged();
    } catch (e: any) {
      if (e instanceof URLAborted || e instanceof NetworkError400) {
        this.setError(e);
        this.change.markChanged();
        // Just in case we were half-way extracting an archive.
        await rmRFDir(this.path);
        return;
      }

      throw e;
    }
  }

  private async downloadAndUntar(
    withGunzip: boolean,
    signal: AbortSignal
  ): Promise<number> {
    await ensureDirExists(path.dirname(this.path));

    if (await fileExists(this.path)) {
      return await dirSize(this.path);
    }

    let { content, size } = await this.clientDownload.downloadBlob(
      this.rInfo, {}, signal,
    );

    if (withGunzip) {
      const gunzip = Transform.toWeb(zlib.createGunzip());
      content = content.pipeThrough(gunzip, { signal });
    }

    await createPathAtomically(this.logger, this.path, async (fPath: string) => {
      await fsp.mkdir(fPath); // throws if a directory already exists.
      const untar = Writable.toWeb(tar.extract(fPath));
      await content.pipeTo(untar, { signal });
    });

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
    // TODO: signature
    const sign: string = "sign";
    this.url = `plblob+folder://${sign}.${this.path}`;
  }

  private setError(e: any) {
    this.error = String(e);
  }

  abort(reason: string) {
    this.signalCtl.abort(new URLAborted(reason));
  }
}

/** Throws when a downloading aborts. */
class URLAborted extends Error {}

/** Gets a directory size by calculating sizes recursively. */
async function dirSize(dir: string): Promise<number> {
  const files = await fsp.readdir(dir, { withFileTypes: true });
  const sizes = await Promise.all(
    files.map(async (file) => {
      const fPath = path.join(dir, file.name);

      if (file.isDirectory()) return await dirSize(fPath);

      const stat = await fsp.stat(fPath);
      return stat.size;
    })
  );

  return sizes.reduce((sum, size) => sum + size, 0);
}

/** Do rm -rf on dir. */
export async function rmRFDir(path: string) {
  await fsp.rm(path, { recursive: true, force: true });
}
