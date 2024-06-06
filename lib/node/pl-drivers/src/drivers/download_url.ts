import { CallersCounter, MiLogger, TaskProcessor, asyncPool, mapEntries, mapGet, notEmpty } from '@milaboratory/ts-helpers';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { Writable, Transform } from 'node:stream'
import { ClientDownload } from '../clients/download';
import { ChangeSource, Computable, ComputableCtx, Watcher, rawComputable } from '@milaboratory/computable';
import { randomUUID, createHash } from 'node:crypto';
import { PollingComputableHooks } from '@milaboratory/computable';
import { scheduler } from 'node:timers/promises';
import * as zlib from 'node:zlib';
import * as tar from 'tar-fs';

export interface DownloadUrlSyncReader {
  /** Returns a Computable that (when the time will come)
   * downloads an archive from an URL,
   * extracts it to the local dir and returns a path to that dir. */
  getPath(url: URL): Computable<string | undefined>;
}

/** Downloads .tar or .tar.gz archives by given URLs
 * and extracts them into saveDir. */
export class DownloadUrlDriver implements
DownloadUrlSyncReader {
  private idToPath: Map<string, PathResult> = new Map();
  private idToCounters: Map<string, CallersCounter> = new Map();
  private idToChange: Map<string, ChangeSource> = new Map();

  private hooks: PollingComputableHooks;

  constructor(
    private readonly logger: MiLogger,
    private readonly clientDownload: ClientDownload,
    private readonly saveDir: string,
    private readonly opts: {
      pollingInterval: number,
      stopDebounce: number,
      withUntar: boolean,
      withGunzip: boolean,
      nConcurrentDownloads: number,
    } = {
        pollingInterval: 100,
        stopDebounce: 1000,
        withUntar: true,
        withGunzip: true,
        nConcurrentDownloads: 50,
      }
  ) {
    this.hooks = new PollingComputableHooks(
      () => this.startUpdating(this.opts.pollingInterval),
      () => this.stopUpdating(),
      { stopDebounce: this.opts.stopDebounce },
      (resolve, reject) => this.scheduleOnNextState(resolve, reject),
    );
  }

  /** Returns a Computable that do the work.
   * With hooks, the caller will schedule the downloading. */
  getPath(url: URL): Computable<string | undefined> {
    return rawComputable(wrapUnstable((w: Watcher, ctx: ComputableCtx) => {
      const callerId = randomUUID();
      ctx.setOnDestroy(() => this.releasePath(url, callerId));
      ctx.attacheHooks(this.hooks);

      return this.getPathNoComputable(w, url, callerId)
    }))
  }

  /** If path is not ready, just updates ChangeSources and creates a task
   * that will be downloaded in a main loop (it is launched via hooks). */
  private getPathNoComputable(w: Watcher, url: URL, callerId: string): string | undefined {
    const id = url.toString();
    const result = this.idToPath.get(id);
    if (result == undefined) {
      this.setNewFilePath(w, url, callerId);
      return undefined;
    }

    mapGet(this.idToCounters, id).inc(callerId);
    if (!result.done) {
      this.attachWatcherToFilePath(w, url);
    }

    return result?.done ? notEmpty(result.path) : undefined;
  }

  /** Creates a task for downloading. */
  private setNewFilePath(w: Watcher, url: URL, callerId: string) {
    const id = url.toString();

    const change = new ChangeSource();
    this.idToChange.set(id, change);
    change.attachWatcher(w);

    const counter = new CallersCounter();
    this.idToCounters.set(id, counter);
    counter.inc(callerId);

    const result = { done: false, path: this.getFilePath(url) };
    this.idToPath.set(id, result);

    return result;
  }

  /** Just attaches a watcher to the url. */
  private attachWatcherToFilePath(w: Watcher, url: URL) {
    mapGet(this.idToChange, url.toString()).attachWatcher(w);
  }

  /** Computables that call refreshState will be notified via this array. */
  private scheduledOnNextState: ScheduledRefresh[] = [];

  /** Schedule to fulfill this promise
   * when the tick of the main loop will be done. */
  private scheduleOnNextState(resolve: () => void, reject: (err: any) => void): void {
    this.scheduledOnNextState.push({ resolve, reject });
  }

  /** Called from observer */
  private startUpdating(pollingInterval: number): void {
    this.keepRunning = true;
    if (this.currentLoop === undefined)
      this.currentLoop = this.mainLoop(pollingInterval);
  }

  /** Called from observer */
  private stopUpdating(): void {
    this.keepRunning = false;
  }

  /** If true, main loop will continue polling pl state. */
  private keepRunning = false;
  /** Actual state of main loop. */
  private currentLoop: Promise<void> | undefined = undefined;

  /** Downloads all remaining URLs and fulfill all promises that was interested. */
  private async mainLoop(pollingInterval: number) {
    while (this.keepRunning) {
      const toNotify = this.scheduledOnNextState;
      this.scheduledOnNextState = [];

      try {
        await asyncPool(
          this.opts.nConcurrentDownloads,
          this.getToDownload(),
          ([id, path]) => this.downloadUrl(id, path),
        )

        // notifying that we got new state
        toNotify.forEach(n => n.resolve());
      } catch (e: any) {
        this.logger.error(`error in DownloadUrlDriver in main loop: ${e}`);
        toNotify.forEach(n => n.reject(e));
      }

      if (!this.keepRunning) break;
      await scheduler.wait(pollingInterval);
    }

    this.currentLoop = undefined;
  }

  /** Returns all not done tasks. */
  private getToDownload() {
    return Array.from(this.idToPath.entries())
      .filter(([_, path]) => !path.done);
  }

  /** Downloads and extracts a tar archive if it wasn't downloaded yet. */
  private async downloadUrl(url: string, path: PathResult) {
    if (!(await fileExists(path.path))) {
      let { content } = await this.clientDownload.downloadRemoteFile(url, {});

      if (this.opts.withGunzip)
        content = content.pipeThrough(Transform.toWeb(zlib.createGunzip()));

      await content.pipeTo(Writable.toWeb(tar.extract(path.path)));
    }

    mapGet(this.idToPath, url).done = true;
    mapGet(this.idToChange, url).markChanged();
  }

  /** Removes a directory when all callers are not interested in it. */
  async releasePath(url: URL, callerId: string): Promise<void> {
    const key = url.toString();

    const deleted = this.idToCounters.get(key)?.dec(callerId);
    if (deleted) {
      this.idToChange.get(key)?.markChanged();
      const path = mapGet(this.idToPath, key);
      this.idToPath.delete(key);
      this.idToCounters.delete(key);
      this.idToChange.delete(key);

      await this.rmDir(path.path);
    }
  }

  /** Removes all files from a hard drive. */
  async releaseAll() {
    this.idToPath.forEach(async (path, id) => {
      mapGet(this.idToChange, id).markChanged();
      this.idToChange.delete(id);
      this.idToPath.delete(id);

      await this.rmDir(path.path);
    });
  }

  private getFilePath(url: URL): string {
    const sha256 = createHash('sha256').update(url.toString()).digest('hex');
    return path.join(this.saveDir, sha256);
  }

  private async rmDir(path: string) {
    await fsp.rm(path, { recursive: true, force: true }); // like rm -rf
  }
}

interface PathResult {
  path: string;
  done: boolean;
}

type ScheduledRefresh = {
  resolve: () => void,
  reject: (err: any) => void
}

type ComputableLambda<T> = (w: Watcher, ctx: ComputableCtx) => T;

/** Marks a ComputableCtx as unstable when there is no result from the lambda. */
function wrapUnstable<T>(cb: ComputableLambda<T>): ComputableLambda<T> {
  return (w, ctx) => {
    const result = cb(w, ctx);
    if (result == undefined)
      ctx.markUnstable();

    return result;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fsp.access(path);
    return true;
  } catch {
    return false;
  }
}
