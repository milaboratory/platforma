import { randomUUID } from 'node:crypto';
import {
  ResourceId,
  stringifyWithResourceId
} from '@milaboratory/pl-client-v2';
import {
  Watcher,
  ChangeSource,
  ComputableCtx,
  Computable,
  PollingComputableHooks
} from '@milaboratory/computable';
import {
  MiLogger,
  asyncPool,
  TaskProcessor,
  CallersCounter,
  Signer
} from '@milaboratory/ts-helpers';
import * as sdk from '@milaboratory/sdk-model';
import { ProgressStatus, ClientProgress } from '../clients/progress';
import { ClientUpload, MTimeError, UnexpectedEOF } from '../clients/upload';
import {
  InferSnapshot,
  isPlTreeEntry,
  makeResourceSnapshot,
  PlTreeEntry,
  rsSchema
} from '@milaboratory/pl-tree';
import { scheduler } from 'node:timers/promises';
import { PollingOps } from './helpers/polling_ops';
import { z } from 'zod';

/** Options from BlobUpload resource that have to be passed to getProgress. */

const UploadOptsSchema = z.object({
  localPath: z.string(),
  pathSignature: z.string(),
  modificationTime: z.string()
});

const ImportOptsSchema = z.union([UploadOptsSchema, z.object({})]);

export type UploadOpts = z.infer<typeof UploadOptsSchema>;

/** ResourceSnapshot that can be passed to GetProgressID */
export const UploadResourceSnapshot = rsSchema({
  data: ImportOptsSchema,
  fields: {
    blob: false, // for BlobUpload
    incarnation: false // for BlobIndex
  }
});

export type UploadResourceSnapshot = InferSnapshot<
  typeof UploadResourceSnapshot
>;

export type UploadDriverOps = PollingOps & {
  /** How much parts of a file can be multipart-uploaded to S3 at once. */
  nConcurrentPartUploads: number;
  /** How much upload/indexing statuses of blobs can the driver ask
   * from the platform gRPC at once. */
  nConcurrentGetProgresses: number;
};

// TODO: add abort signal to Upload Tasks.

/** Uploads blobs in a queue and holds counters, so it can stop not-needed
 * uploads.
 * Handles both Index and Upload blobs,
 * the client needs to pass concrete blobs from `handle` field. */
export class UploadDriver {
  private readonly idToProgress: Map<ResourceId, ProgressUpdater> = new Map();

  /** Holds a queue that upload blobs. */
  private readonly uploadQueue: TaskProcessor;
  private readonly hooks: PollingComputableHooks;

  constructor(
    private readonly logger: MiLogger,
    private readonly signer: Signer,
    private readonly clientBlob: ClientUpload,
    private readonly clientProgress: ClientProgress,
    private readonly opts: UploadDriverOps = {
      nConcurrentPartUploads: 10,
      nConcurrentGetProgresses: 10,
      pollingInterval: 1000,
      stopPollingDelay: 1000
    }
  ) {
    this.uploadQueue = new TaskProcessor(this.logger, 1);

    this.hooks = new PollingComputableHooks(
      () => this.startUpdating(),
      () => this.stopUpdating(),
      { stopDebounce: opts.stopPollingDelay },
      (resolve, reject) => this.scheduleOnNextState(resolve, reject)
    );
  }

  /** Returns a progress id and schedules an upload task if it's necessary. */
  getProgressId(
    res: UploadResourceSnapshot | PlTreeEntry
  ): Computable<sdk.ImportProgress>;
  getProgressId(
    res: UploadResourceSnapshot | PlTreeEntry,
    ctx: ComputableCtx
  ): sdk.ImportProgress;
  getProgressId(
    res: UploadResourceSnapshot | PlTreeEntry,
    ctx?: ComputableCtx
  ): Computable<sdk.ImportProgress> | sdk.ImportProgress {
    if (ctx == undefined)
      return Computable.make((ctx) => this.getProgressId(res, ctx));

    const rInfo: UploadResourceSnapshot = isPlTreeEntry(res)
      ? makeResourceSnapshot(res, UploadResourceSnapshot, ctx)
      : res;

    const callerId = randomUUID();
    ctx.attacheHooks(this.hooks);
    ctx.addOnDestroy(() => this.release(rInfo.id, callerId));

    const result = this.getProgressIdNoCtx(ctx.watcher, rInfo, callerId);
    if (!isProgressStable(result)) {
      ctx.markUnstable(
        `upload/index progress was got, but it's not stable: ${result}`
      );
    }

    return result;
  }

  private getProgressIdNoCtx(
    w: Watcher,
    res: UploadResourceSnapshot,
    callerId: string
  ): sdk.ImportProgress {
    const blobExists =
      res.fields.blob != undefined || res.fields.incarnation != undefined;

    const value = this.idToProgress.get(res.id);

    if (value != undefined) {
      value.attach(w, callerId);
      return value.mustGetProgress(blobExists);
    }

    const newValue = new ProgressUpdater(
      this.logger,
      this.clientBlob,
      this.clientProgress,
      this.opts.nConcurrentPartUploads,
      this.signer,
      res
    );

    this.idToProgress.set(res.id, newValue);
    newValue.attach(w, callerId);

    if (newValue.progress.isUpload && newValue.progress.isUploadSignMatch)
      this.uploadQueue.push({
        fn: () => newValue.uploadBlobTask(),
        recoverableErrorPredicate: (e) =>
          !(e instanceof MTimeError || e instanceof UnexpectedEOF)
      });

    return newValue.mustGetProgress(blobExists);
  }

  /** Decrement counters for the file and remove an uploading if counter == 0. */
  private async release(id: ResourceId, callerId: string) {
    const value = this.idToProgress.get(id);
    if (value === undefined) return;

    const deleted = value.decCounter(callerId);
    if (deleted) this.idToProgress.delete(id);
  }

  /** Must be called when the driver is closing. */
  public async releaseAll() {
    this.uploadQueue.stop();
  }

  private scheduledOnNextState: ScheduledRefresh[] = [];

  private scheduleOnNextState(
    resolve: () => void,
    reject: (err: any) => void
  ): void {
    this.scheduledOnNextState.push({ resolve, reject });
  }

  /** Called from observer */
  private startUpdating(): void {
    this.keepRunning = true;
    if (this.currentLoop === undefined) this.currentLoop = this.mainLoop();
  }

  /** Called from observer */
  private stopUpdating(): void {
    this.keepRunning = false;
  }

  /** If true, main loop will continue polling pl state. */
  private keepRunning = false;
  /** Actual state of main loop. */
  private currentLoop: Promise<void> | undefined = undefined;

  private async mainLoop() {
    while (this.keepRunning) {
      const toNotify = this.scheduledOnNextState;
      this.scheduledOnNextState = [];

      try {
        await asyncPool(
          this.opts.nConcurrentGetProgresses,
          this.getAllNotDoneProgresses().map(
            async (p) => await p.updateStatus()
          )
        );

        toNotify.forEach((n) => n.resolve());
      } catch (e: any) {
        console.error(e);
        toNotify.forEach((n) => n.reject(e));
      }

      if (!this.keepRunning) break;
      await scheduler.wait(this.opts.pollingInterval);
    }

    this.currentLoop = undefined;
  }

  private getAllNotDoneProgresses(): Array<ProgressUpdater> {
    return Array.from(this.idToProgress.entries())
      .filter(([_, p]) => !isProgressStable(p.progress))
      .map(([_, p]) => p);
  }
}

/** Holds all info needed to upload a file and a status of uploadong
 * and indexing. Also, has a method to update a status of the progress.
 * And holds a change source. */
class ProgressUpdater {
  private readonly change: ChangeSource = new ChangeSource();
  private readonly counter: CallersCounter = new CallersCounter();

  public progress: sdk.ImportProgress;
  private uploadOpts?: UploadOpts;
  public uploadingTerminallyFailed?: boolean;

  constructor(
    private readonly logger: MiLogger,
    private readonly clientBlob: ClientUpload,
    private readonly clientProgress: ClientProgress,
    private readonly nConcurrentPartsUpload: number,
    signer: Signer,

    public readonly res: UploadResourceSnapshot
  ) {
    const isUpload = res.type.name.startsWith('BlobUpload');
    let isUploadSignMatch: boolean | undefined;
    if (isUpload) {
      this.uploadOpts = importToUploadOpts(res);
      isUploadSignMatch = isSignMatch(
        signer,
        this.uploadOpts.localPath,
        this.uploadOpts.pathSignature
      );
    }

    this.progress = {
      done: false,
      status: undefined,
      isUpload: isUpload,
      isUploadSignMatch: isUploadSignMatch,
      lastError: undefined
    };
  }

  public mustGetProgress(blobExists: boolean) {
    if (blobExists) {
      this.setDone(blobExists);

      return this.progress;
    }

    if (this.uploadingTerminallyFailed) {
      this.logger.error(
        `Uploading terminally failed: ${this.progress.lastError}`
      );
      throw new Error(this.progress.lastError);
    }

    return this.progress;
  }

  public attach(w: Watcher, callerId: string) {
    this.change.attachWatcher(w);
    this.counter.inc(callerId);
  }

  public decCounter(callerId: string) {
    return this.counter.dec(callerId);
  }

  /** Uploads a blob if it's not BlobIndex. */
  async uploadBlobTask() {
    try {
      await this.uploadBlob();
    } catch (e: any) {
      this.setLastError(e);

      if (
        e.name == 'RpcError' &&
        (e.code == 'NOT_FOUND' ||
          e.code == 'ABORTED' ||
          e.code == 'ALREADY_EXISTS')
      ) {
        this.logger.warn(`resource was deleted while uploading a blob: ${e}`);
        this.change.markChanged();
        this.setDone(true);

        return;
      }

      this.logger.error(`error while uploading a blob: ${e}`);
      this.change.markChanged();

      if (e instanceof MTimeError) this.terminateWithError(e);

      throw e;
    }
  }

  /** Uploads a blob using client. */
  private async uploadBlob() {
    if (this.counter.isZero()) return;
    const parts = await this.clientBlob.initUpload(this.res);

    this.logger.info(
      `start to upload blob ${this.res.id}, parts count: ${parts.length}`
    );

    await asyncPool(
      this.nConcurrentPartsUpload,
      parts.map(async (part) => {
        if (this.counter.isZero()) return;
        await this.clientBlob.partUpload(
          this.res,
          this.uploadOpts!.localPath,
          part,
          BigInt(this.uploadOpts!.modificationTime)
        );
      })
    );

    if (this.counter.isZero()) return;
    await this.clientBlob.finalizeUpload(this.res);

    this.logger.info(`uploading of resource ${this.res.id} finished.`);
    this.change.markChanged();
  }

  private terminateWithError(e: unknown) {
    this.progress.lastError = String(e);
    this.progress.done = false;
    this.uploadingTerminallyFailed = true;
  }

  private setLastError(e: unknown) {
    this.progress.lastError = String(e);
  }

  private setDone(done: boolean) {
    this.progress.done = done;
  }

  async updateStatus() {
    try {
      const status = await this.clientProgress.getStatus(this.res);

      const oldStatus = this.progress.status;
      this.progress.status = protoToStatus(status);
      this.setDone(status.done);

      if (status.done || status.progress != oldStatus?.progress)
        this.change.markChanged();
    } catch (e: any) {
      this.setLastError(e);

      if (
        e.name == 'RpcError' &&
        (e.code == 'NOT_FOUND' ||
          e.code == 'ABORTED' ||
          e.code == 'ALREADY_EXISTS')
      ) {
        this.logger.warn(
          `resource was not found while updating a status of BlobIndex: ${e}, ${stringifyWithResourceId(this.res)}`
        );
        this.change.markChanged();
        this.setDone(true);

        return;
      }

      this.logger.error(`error while updating a status of BlobIndex: ${e}`);
      this.terminateWithError(e);
    }
  }
}

function isProgressStable(p: sdk.ImportProgress) {
  return (
    p.done &&
    p.status !== undefined &&
    p.status !== null &&
    p.status.progress >= 1.0
  );
}

export function importToUploadOpts(res: UploadResourceSnapshot): UploadOpts {
  if (res.data == undefined || !('modificationTime' in res.data)) {
    throw new Error(
      'no upload options in BlobUpload resource data: ' +
        stringifyWithResourceId(res.data)
    );
  }

  const opts = res.data;
  if (opts.modificationTime === undefined) {
    throw new Error(
      'no modification time in data: ' + stringifyWithResourceId(res.data)
    );
  }
  if (opts.localPath === undefined) {
    throw new Error(
      'no local path in data: ' + stringifyWithResourceId(res.data)
    );
  }
  if (opts.pathSignature === undefined) {
    throw new Error(
      'no path signature in data: ' + stringifyWithResourceId(res.data)
    );
  }

  return {
    modificationTime: opts.modificationTime,
    localPath: opts.localPath,
    pathSignature: opts.pathSignature
  };
}

function protoToStatus(proto: ProgressStatus): sdk.ImportStatus {
  return {
    progress: proto.progress ?? 0,
    bytesProcessed: Number(proto.bytesProcessed),
    bytesTotal: Number(proto.bytesTotal)
  };
}

function isSignMatch(signer: Signer, path: string, signature: string): boolean {
  try {
    signer.verify(path, signature);
    return true;
  } catch (e) {
    return false;
  }
}

type ScheduledRefresh = {
  resolve: () => void;
  reject: (err: any) => void;
};
