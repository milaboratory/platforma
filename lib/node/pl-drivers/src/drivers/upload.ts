import { randomUUID } from "node:crypto";
import type { SignedResourceId, ResourceType } from "@milaboratories/pl-client";
import { isNotNullSignedResourceId } from "@milaboratories/pl-client";
import type { Watcher, ComputableCtx } from "@milaboratories/computable";
import { Computable, PollingComputableHooks } from "@milaboratories/computable";
import type { MiLogger, Signer } from "@milaboratories/ts-helpers";
import { asyncPool, TaskProcessor } from "@milaboratories/ts-helpers";
import type * as sdk from "@milaboratories/pl-model-common";
import type {
  ExtendedResourceData,
  PlTreeEntry,
  PlTreeEntryAccessor,
  PlTreeNodeAccessor,
} from "@milaboratories/pl-tree";
import {
  isPlTreeEntry,
  isPlTreeEntryAccessor,
  makeResourceSnapshot,
} from "@milaboratories/pl-tree";
import { scheduler } from "node:timers/promises";
import type { PollingOps } from "./helpers/polling_ops";
import type { ImportResourceSnapshot } from "./types";
import { ImportFileHandleUploadData, IndexResourceSnapshot, UploadResourceSnapshot } from "./types";
import type { BlobUploadClient, BlobProgressClient } from "./upload_task";
import {
  isImportResourceOutputSet,
  isUpload,
  nonRecoverableError,
  UploadTask,
} from "./upload_task";
import { WrongResourceTypeError } from "./helpers/helpers";

export function makeBlobImportSnapshot(
  entryOrAccessor: PlTreeEntry | PlTreeNodeAccessor | PlTreeEntryAccessor,
  ctx: ComputableCtx,
): ImportResourceSnapshot {
  const node = isPlTreeEntry(entryOrAccessor)
    ? ctx.accessor(entryOrAccessor).node()
    : isPlTreeEntryAccessor(entryOrAccessor)
      ? entryOrAccessor.node()
      : entryOrAccessor;

  if (node.resourceType.name.startsWith("BlobUpload"))
    return makeResourceSnapshot(node, UploadResourceSnapshot);
  return makeResourceSnapshot(node, IndexResourceSnapshot);
}

/** Reads the snapshot {@link UploadDriver.adopt} takes from the body of a BlobUpload resource,
 * as a tree mirror holds it. Throws if the resource is not a BlobUpload or its data is not an
 * upload handle. */
export function uploadSnapshotFromResourceData(res: ExtendedResourceData): UploadResourceSnapshot {
  if (!isUpload(res)) throw new WrongResourceTypeError(`not a BlobUpload: ${res.type.name}`);
  const data = ImportFileHandleUploadData.parse(
    JSON.parse(Buffer.from(res.data ?? new Uint8Array(0)).toString("utf8")),
  );
  const blob = res.fields.find((f) => f.name === "blob")?.value;
  return {
    id: res.id,
    type: res.type,
    data,
    fields: { blob: blob !== undefined && isNotNullSignedResourceId(blob) ? blob : undefined },
    kv: undefined,
  };
}

export type UploadDriverOps = PollingOps & {
  /** How much parts of a file can be multipart-uploaded to S3 at once. */
  nConcurrentPartUploads: number;
  /** How much upload/indexing statuses of blobs can the driver ask
   * from the platform gRPC at once. */
  nConcurrentGetProgresses: number;
  /** How many files are uploaded at once; the rest wait in a queue. 2 when not set. */
  nConcurrentUploads?: number;
};

/** What {@link UploadDriver.adopt} did with a resource.
 * - `adopted`: the owner now holds the upload, which is queued or running;
 * - `alreadyOwned`: the owner already held it;
 * - `alreadyUploaded`: the blob is set, nothing to upload;
 * - `notMine`: not an upload this machine signed, so it is uploaded elsewhere;
 * - `failed`: an earlier attempt failed for good; it is not retried. */
export type UploadAdoption = "adopted" | "alreadyOwned" | "alreadyUploaded" | "notMine" | "failed";

// TODO: add abort signal to Upload Tasks.

/** Uploads blobs in a queue and holds counters, so it can stop not-needed
 * uploads.
 * Handles both Index and Upload blobs,
 * the client needs to pass concrete blobs from `handle` field. */
export class UploadDriver {
  private readonly idToProgress: Map<SignedResourceId, UploadTask> = new Map();

  /** Holds a queue that upload blobs. */
  private readonly uploadQueue: TaskProcessor;
  private readonly hooks: PollingComputableHooks;

  constructor(
    private readonly logger: MiLogger,
    private readonly signer: Signer,
    private readonly clientBlob: BlobUploadClient,
    private readonly clientProgress: BlobProgressClient,
    private readonly opts: UploadDriverOps = {
      nConcurrentPartUploads: 10,
      nConcurrentGetProgresses: 10,
      nConcurrentUploads: 2,
      pollingInterval: 1000,
      stopPollingDelay: 1000,
    },
  ) {
    this.uploadQueue = new TaskProcessor(this.logger, opts.nConcurrentUploads ?? 2, {
      type: "exponentialWithMaxDelayBackoff",
      initialDelay: 20,
      maxDelay: 15000, // 15 seconds
      backoffMultiplier: 1.5,
      jitter: 0.5,
    });

    this.hooks = new PollingComputableHooks(
      () => this.startUpdating(),
      () => this.stopUpdating(),
      { stopDebounce: opts.stopPollingDelay },
      (resolve, reject) => this.scheduleOnNextState(resolve, reject),
    );
  }

  /** Returns a progress id and schedules an upload task if it's necessary. */
  getProgressId(
    handleResource: ImportResourceSnapshot | PlTreeEntry,
  ): Computable<sdk.ImportProgress>;
  getProgressId(
    handleResource: ImportResourceSnapshot | PlTreeEntry,
    ctx: ComputableCtx,
  ): sdk.ImportProgress;
  getProgressId(
    handleResource: ImportResourceSnapshot | PlTreeEntry,
    ctx?: ComputableCtx,
  ): Computable<sdk.ImportProgress> | sdk.ImportProgress {
    if (ctx == undefined) return Computable.make((ctx) => this.getProgressId(handleResource, ctx));

    const rInfo: ImportResourceSnapshot = isPlTreeEntry(handleResource)
      ? makeBlobImportSnapshot(handleResource, ctx)
      : handleResource;

    const callerId = randomUUID();
    ctx.attacheHooks(this.hooks);
    ctx.addOnDestroy(() => this.release(rInfo.id, callerId));

    const result = this.getProgressIdNoCtx(ctx.watcher, rInfo, callerId);

    return result;
  }

  private getProgressIdNoCtx(
    w: Watcher,
    res: ImportResourceSnapshot,
    callerId: string,
  ): sdk.ImportProgress {
    validateResourceType("getProgressId", res.type);

    const task = this.idToProgress.get(res.id);

    if (task != undefined) {
      task.setDoneIfOutputSet(res);
      return task.getProgress(w, callerId);
    }

    const newTask = this.newTask(res);

    this.idToProgress.set(res.id, newTask);

    if (newTask.shouldScheduleUpload()) this.enqueue(newTask);

    newTask.setDoneIfOutputSet(res);
    return newTask.getProgress(w, callerId);
  }

  /**
   * Takes the upload of a BlobUpload resource on behalf of an owner. The upload goes on while
   * the owner holds it, whether or not anybody reads its progress, until {@link releaseOwner}
   * or the driver terminates.
   *
   * Queues nothing for a finished upload (its blob is set), for an upload signed on another
   * machine, or for one that already failed for good: the failed task stays registered as the
   * marker of that failure, so adopting it again does not retry it.
   */
  public adopt(res: ImportResourceSnapshot, owner: string): UploadAdoption {
    if (!isUpload(res)) return "notMine";

    const existing = this.idToProgress.get(res.id);
    if (isImportResourceOutputSet(res)) {
      existing?.setDoneIfOutputSet(res);
      return "alreadyUploaded";
    }

    if (existing !== undefined) {
      if (existing.isFailed) return "failed";
      if (!existing.shouldScheduleUpload()) return "notMine";
      return existing.addOwner(owner) ? "adopted" : "alreadyOwned";
    }

    const task = this.newTask(res);
    if (!task.shouldScheduleUpload()) return "notMine";
    task.addOwner(owner);
    this.idToProgress.set(res.id, task);
    this.enqueue(task);
    return "adopted";
  }

  /** Drops the owner from every upload it holds. An upload nobody else holds stops before its
   * next part. Returns how many uploads the owner held. */
  public releaseOwner(owner: string): number {
    let released = 0;
    for (const [id, task] of this.idToProgress) {
      if (!task.removeOwner(owner)) continue;
      released++;
      if (!task.isHeld) this.idToProgress.delete(id);
    }
    if (released > 0) this.logger.info(`uploads released by ${owner}: ${released}`);
    return released;
  }

  /** Decrement counters for the file and remove an uploading if nothing holds it any more. */
  private async release(id: SignedResourceId, callerId: string) {
    const task = this.idToProgress.get(id);
    if (task === undefined) return;

    task.decCounter(callerId);
    if (!task.isHeld) this.idToProgress.delete(id);
  }

  private newTask(res: ImportResourceSnapshot): UploadTask {
    return new UploadTask(
      this.logger,
      this.clientBlob,
      this.clientProgress,
      this.opts.nConcurrentPartUploads,
      this.signer,
      res,
      this.terminating.signal,
    );
  }

  private enqueue(task: UploadTask): void {
    this.uploadQueue.push({
      fn: () => task.uploadBlobTask(),
      recoverableErrorPredicate: (e) => !nonRecoverableError(e),
    });
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

  private readonly terminating = new AbortController();

  /** Stops polling loop and waits for it to finish. Uploads stop before their next part. */
  public async terminate(): Promise<void> {
    this.stopUpdating();
    this.terminating.abort();
    if (this.currentLoop !== undefined) {
      await this.currentLoop;
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.terminate();
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
            (task) => async () => await task.updateStatus(this.terminating.signal),
          ),
        );

        for (const scheduled of toNotify) scheduled.resolve();
      } catch (error: unknown) {
        console.error(error);
        for (const scheduled of toNotify) scheduled.reject(error);
      }

      if (!this.keepRunning) break;
      try {
        await scheduler.wait(this.opts.pollingInterval, { signal: this.terminating.signal });
      } catch {
        break;
      }
    }

    this.currentLoop = undefined;
  }

  private getAllNotDoneProgresses(): Array<UploadTask> {
    return Array.from(this.idToProgress.entries())
      .filter(([_, p]) => !isProgressDone(p.progress))
      .map(([_, p]) => p);
  }
}

function isProgressDone(p: sdk.ImportProgress) {
  return p.done && (p.status?.progress ?? 0.0) >= 1.0;
}

type ScheduledRefresh = {
  resolve: () => void;
  reject: (err: any) => void;
};

function validateResourceType(methodName: string, rType: ResourceType) {
  if (!rType.name.startsWith("BlobUpload") && !rType.name.startsWith("BlobIndex")) {
    throw new WrongResourceTypeError(
      `${methodName}: wrong resource type: ${rType.name}, ` +
        `expected: a resource of either type 'BlobUpload' or 'BlobIndex'.`,
    );
  }
}
