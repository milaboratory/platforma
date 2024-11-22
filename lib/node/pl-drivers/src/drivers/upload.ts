import { randomUUID } from 'node:crypto';
import { ResourceId } from '@milaboratories/pl-client';
import {
  Watcher,
  ComputableCtx,
  Computable,
  PollingComputableHooks
} from '@milaboratories/computable';
import { MiLogger, asyncPool, TaskProcessor, Signer } from '@milaboratories/ts-helpers';
import * as sdk from '@milaboratories/pl-model-common';
import { ClientProgress } from '../clients/progress';
import { ClientUpload } from '../clients/upload';
import {
  isPlTreeEntry,
  isPlTreeEntryAccessor,
  makeResourceSnapshot,
  PlTreeEntry,
  PlTreeEntryAccessor,
  PlTreeNodeAccessor
} from '@milaboratories/pl-tree';
import { scheduler } from 'node:timers/promises';
import { PollingOps } from './helpers/polling_ops';
import { ImportResourceSnapshot, IndexResourceSnapshot, UploadResourceSnapshot } from './types';
import { nonRecoverableError, UploadTask } from './upload_task';

export function makeBlobImportSnapshot(
  entryOrAccessor: PlTreeEntry | PlTreeNodeAccessor | PlTreeEntryAccessor,
  ctx: ComputableCtx
): ImportResourceSnapshot {
  const node = isPlTreeEntry(entryOrAccessor)
    ? ctx.accessor(entryOrAccessor).node()
    : isPlTreeEntryAccessor(entryOrAccessor)
      ? entryOrAccessor.node()
      : entryOrAccessor;

  if (node.resourceType.name.startsWith('BlobUpload'))
    return makeResourceSnapshot(node, UploadResourceSnapshot);
  return makeResourceSnapshot(node, IndexResourceSnapshot);
}

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
  private readonly idToProgress: Map<ResourceId, UploadTask> = new Map();

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
    this.uploadQueue = new TaskProcessor(this.logger, 1, {
      type: 'exponentialWithMaxDelayBackoff',
      initialDelay: 20,
      maxDelay: 15000, // 15 seconds
      backoffMultiplier: 1.5,
      jitter: 0.5
    });

    this.hooks = new PollingComputableHooks(
      () => this.startUpdating(),
      () => this.stopUpdating(),
      { stopDebounce: opts.stopPollingDelay },
      (resolve, reject) => this.scheduleOnNextState(resolve, reject)
    );
  }

  /** Returns a progress id and schedules an upload task if it's necessary. */
  getProgressId(
    handleResource: ImportResourceSnapshot | PlTreeEntry
  ): Computable<sdk.ImportProgress>;
  getProgressId(
    handleResource: ImportResourceSnapshot | PlTreeEntry,
    ctx: ComputableCtx
  ): sdk.ImportProgress;
  getProgressId(
    handleResource: ImportResourceSnapshot | PlTreeEntry,
    ctx?: ComputableCtx
  ): Computable<sdk.ImportProgress> | sdk.ImportProgress {
    if (ctx == undefined) return Computable.make((ctx) => this.getProgressId(handleResource, ctx));

    const rInfo: ImportResourceSnapshot = isPlTreeEntry(handleResource)
      ? makeBlobImportSnapshot(handleResource, ctx)
      : handleResource;

    const callerId = randomUUID();
    ctx.attacheHooks(this.hooks);
    ctx.addOnDestroy(() => this.release(rInfo.id, callerId));

    const result = this.getProgressIdNoCtx(ctx.watcher, rInfo, callerId);
    if (!isProgressStable(result)) {
      ctx.markUnstable(
        `upload/index progress was got, but it's not stable: ${JSON.stringify(result)}`
      );
    }

    return result;
  }

  private getProgressIdNoCtx(
    w: Watcher,
    res: ImportResourceSnapshot,
    callerId: string
  ): sdk.ImportProgress {
    const task = this.idToProgress.get(res.id);

    if (task != undefined) {
      task.setDoneIfOutputSet(res);
      return task.getProgress(w, callerId);
    }

    const newTask = new UploadTask(
      this.logger,
      this.clientBlob,
      this.clientProgress,
      this.opts.nConcurrentPartUploads,
      this.signer,
      res
    );

    this.idToProgress.set(res.id, newTask);

    if (newTask.shouldScheduleUpload())
      this.uploadQueue.push({
        fn: () => newTask.uploadBlobTask(),
        recoverableErrorPredicate: (e) => !nonRecoverableError(e)
      });

    newTask.setDoneIfOutputSet(res);
    return newTask.getProgress(w, callerId);
  }

  /** Decrement counters for the file and remove an uploading if counter == 0. */
  private async release(id: ResourceId, callerId: string) {
    const task = this.idToProgress.get(id);
    if (task === undefined) return;

    const deleted = task.decCounter(callerId);
    if (deleted) this.idToProgress.delete(id);
  }

  /** Must be called when the driver is closing. */
  public async releaseAll() {
    this.uploadQueue.stop();
  }

  private scheduledOnNextState: ScheduledRefresh[] = [];

  private scheduleOnNextState(resolve: () => void, reject: (err: any) => void): void {
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
          this.getAllNotDoneProgresses().map((p) => async () => await p.updateStatus())
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

  private getAllNotDoneProgresses(): Array<UploadTask> {
    return Array.from(this.idToProgress.entries())
      .filter(([_, p]) => !isProgressStable(p.progress))
      .map(([_, p]) => p);
  }
}

function isProgressStable(p: sdk.ImportProgress) {
  return p.done && (p.status?.progress ?? 0.0) >= 1.0;
}

type ScheduledRefresh = {
  resolve: () => void;
  reject: (err: any) => void;
};
