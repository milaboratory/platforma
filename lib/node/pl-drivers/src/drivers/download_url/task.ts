import type { Watcher } from "@milaboratories/computable";
import { ChangeSource } from "@milaboratories/computable";
import type { MiLogger, Signer } from "@milaboratories/ts-helpers";
import {
  CallersCounter,
  createPathAtomically,
  ensureDirExists,
  fileExists,
  notEmpty,
} from "@milaboratories/ts-helpers";
import { createReadStream } from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { Readable, Transform, Writable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import * as zlib from "node:zlib";
import * as tar from "tar-fs";
import type { RemoteFileDownloader } from "../../helpers/download";
import { isDownloadNetworkError400 } from "../../helpers/download_errors";
import type { UrlResult } from "./driver";
import { newBlockUIURL } from "../urls/url";

/** Source an archive is fetched from before extraction: a remote URL or a
 * local `.tgz` file on disk. Both flow through the same untar machinery. */
export type DownloadSource =
  | { type: "url"; url: URL }
  | { type: "local-tgz"; path: string; mtime: string };

/** Fetches (over HTTP or from a local file) and extracts an archive to a
 * directory. `key` is the task's identity in the driver's task map and cache. */
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
    readonly source: DownloadSource,
    readonly key: string,
    readonly signer: Signer,
    readonly saveDir: string,
  ) {}

  public info() {
    return {
      key: this.key,
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
      const size = await this.fetchAndUntar(clientDownload, withGunzip, this.signalCtl.signal);
      this.setDone(size);
      this.change.markChanged(`download of ${this.key} finished`);
    } catch (e: unknown) {
      if (
        e instanceof URLAborted ||
        isDownloadNetworkError400(e) ||
        this.signalCtl.signal.aborted
      ) {
        this.setError(e);
        this.change.markChanged(`download of ${this.key} failed`);
        // Just in case we were half-way extracting an archive.
        await rmRFDir(this.path);
        return;
      }

      throw e;
    }
  }

  private async fetchAndUntar(
    clientDownload: RemoteFileDownloader,
    withGunzip: boolean,
    signal: AbortSignal,
  ): Promise<number> {
    await ensureDirExists(path.dirname(this.path));

    if (await fileExists(this.path)) {
      return await dirSize(this.path);
    }

    if (this.source.type === "url") {
      return await clientDownload.withContent(
        this.source.url.toString(),
        {},
        { signal },
        async (content, size) => {
          await this.untarStream(content, withGunzip, signal);
          return size;
        },
      );
    }

    // local-tgz: read the archive from disk and untar through the same path.
    const content = Readable.toWeb(createReadStream(this.source.path)) as ReadableStream;
    await this.untarStream(content, withGunzip, signal);
    return await dirSize(this.path);
  }

  /** Optionally gunzips, then untars the content stream into `this.path`. */
  private async untarStream(
    content: ReadableStream,
    withGunzip: boolean,
    signal: AbortSignal,
  ): Promise<void> {
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
  }

  getUrl(): UrlResult | undefined {
    if (this.done)
      return {
        url: newBlockUIURL(this.signer, this.saveDir, notEmpty(this.path)),
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
  name = "URLAborted";
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
