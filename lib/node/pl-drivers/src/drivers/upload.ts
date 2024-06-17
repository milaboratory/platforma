import {
  BasicResourceData,
  PlClient,
  ResourceId,
  ResourceType,
  stringifyWithResourceId
} from '@milaboratory/pl-client-v2';
import {
  TrackedAccessorProvider,
  Watcher,
  ChangeSource
} from '@milaboratory/computable';
import {
  MiLogger,
  JitterOpts,
  asyncPool,
  mapGet,
  notEmpty,
  TaskProcessor,
  CallersCounter
} from '@milaboratory/ts-helpers';
import { ProgressStatus, ClientProgress } from '../clients/progress';
import { ClientUpload, MTimeError, UnexpectedEOF } from '../clients/upload';

export interface UploadReader {
  /** Returns a progress id and schedules an upload task if it's necessary.
   * @param callerId the caller (e.g. cell) must give their ID for right logic
   * of uploading preregistration. */
  getProgressId(
    w: Watcher,
    originalRId: ResourceId,
    rType: ResourceType,
    callerId: string
  ): string;
}

export interface UploadReaderAsync {
  /** Awaits progress status and and returns a progress by given progress id. */
  getProgress(progressId: string): Promise<Progress>;
}

/** Every cell must call it on destroy. */
export interface UploadReleaser {
  release(uid: string, callerId: string): Promise<void>;
}

/** Just binds a watcher to a UploadReader. */
export class UploadAccessor {
  constructor(
    private readonly w: Watcher,
    private readonly reader: UploadReader
  ) {}

  getProgressId(
    originalRId: ResourceId,
    rType: ResourceType,
    callerId: string
  ): string {
    return this.reader.getProgressId(this.w, originalRId, rType, callerId);
  }
}

/** Uploads blobs in a queue and holds counters, so it can stop not-needed
 * uploads.
 * Handles both Index and Upload blobs,
 * the client needs to pass concrete blobs from `handle` field. */
export class UploadDriver
  implements
    TrackedAccessorProvider<UploadAccessor>,
    UploadReader,
    UploadReaderAsync,
    UploadReleaser
{
  /** Holds a map of Resource Ids to Progress Ids. */
  private readonly rIdToProgressId: Map<ResourceId, string> = new Map();
  /** With the Progress Id the client can get a progress in an async func. */
  public readonly progressIdToValue: Map<string, ProgressUpdater> = new Map();

  /** Holds a queue that upload blobs. */
  private readonly uploadQueue: TaskProcessor;

  constructor(
    private readonly logger: MiLogger,
    private readonly getSignature: (path: string) => Promise<string>,
    private readonly client: PlClient,
    private readonly clientBlob: ClientUpload,
    private readonly clientProgress: ClientProgress,
    private readonly opts: {
      nConcurrentPartUploads: number;
      queueClosingPoolMs: number;
      nUploadRetries: number;
      jitterOpts: JitterOpts;
    } = {
      nConcurrentPartUploads: 10,
      queueClosingPoolMs: 100,
      nUploadRetries: 10,
      jitterOpts: { ms: 50, factor: 0.1 }
    }
  ) {
    this.uploadQueue = new TaskProcessor(this.logger, 1);
  }

  /** Just binds a watcher to UploadAccessor. */
  createInstance(watcher: Watcher): UploadAccessor {
    return new UploadAccessor(watcher, this);
  }

  getProgressId(
    w: Watcher,
    originalRId: ResourceId,
    rType: ResourceType,
    callerId: string
  ): string {
    const uid = this.rIdToProgressId.get(originalRId);

    if (uid == undefined) {
      // Schedule the uploading or indexing.
      const newUid = makeUid(originalRId);
      const value = new ProgressUpdater(
        this.logger,
        this.client,
        this.clientBlob,
        this.clientProgress,
        this.opts.nConcurrentPartUploads,
        this.getSignature,
        originalRId,
        rType
      );

      this.rIdToProgressId.set(originalRId, newUid);
      this.progressIdToValue.set(newUid, value);

      value.change.attachWatcher(w);
      value.counter.inc(callerId);
      value.scheduleUpdateStatus();

      if (value.progress.isUpload)
        this.uploadQueue.push({
          fn: () => value.uploadBlobTask(),
          recoverableErrorPredicate: (e) =>
            !(e instanceof MTimeError || e instanceof UnexpectedEOF)
        });

      return newUid;
    }

    const value = mapGet(this.progressIdToValue, uid);
    value.counter.inc(callerId);

    if (!value.progress.done) {
      // Uploading is already scheduled.
      value.change.attachWatcher(w);
      value.scheduleUpdateStatus();
      return uid;
    }

    // Uploading is done.
    return uid;
  }

  async getProgress(uid: string): Promise<Progress> {
    return await mapGet(this.progressIdToValue, uid).waitProgress();
  }

  /** Decrement counters for the file and remove an uploading if counter == 0.
   *  It is safe to call it even if the counter wasn't incremented before. */
  public async release(uid: string, callerId: string) {
    const value = this.progressIdToValue.get(uid);
    if (value === undefined) return;

    const deleted = value.counter.dec(callerId);
    if (deleted) {
      this.removeProgress(uid);
    }
  }

  /** Must be called when the driver is closing. */
  public async releaseAll() {
    this.uploadQueue.stop();
  }

  private removeProgress(uid: string) {
    this.progressIdToValue.delete(uid);
  }
}

/** Holds all info needed to upload a file and a status of uploadong
 * and indexing. Also, has a method to update a status of the progress.
 * And holds a change source. */
class ProgressUpdater {
  public readonly progress: Progress;
  /** Not undefined if updating a status is happening now. */
  private updatingStatus: Promise<void> | undefined = undefined;
  public readonly change: ChangeSource = new ChangeSource();
  public readonly counter: CallersCounter = new CallersCounter();

  constructor(
    private readonly logger: MiLogger,
    private readonly client: PlClient,
    private readonly clientBlob: ClientUpload,
    private readonly clientProgress: ClientProgress,
    private readonly nConcurrentPartsUpload: number,
    private readonly getSignature: (path: string) => Promise<string>,

    rId: ResourceId,
    rType: ResourceType
  ) {
    this.progress = new Progress(rId, rType);
  }

  /** Sets a promise that updates a status. */
  scheduleUpdateStatus() {
    if (this.updatingStatus !== undefined) return;
    this.updatingStatus = this.updateStatus();
  }

  async updateStatus() {
    const status = await this.clientProgress.getStatus(this.progress);
    this.progress.setStatus(status);
    if (status.done) {
      this.change.markChanged();
    }
    this.updatingStatus = undefined;
  }

  /** awaits a fulfillment of a status. */
  async waitProgress() {
    if (this.updatingStatus === undefined) return this.progress;
    await this.updatingStatus;

    return this.progress;
  }

  /** Uploads a blob if it's not BlobIndex. */
  async uploadBlobTask() {
    try {
      const r = await this.client.withReadTx(
        'TSUploadDriverGetResource',
        (tx) => tx.getResourceData(this.progress.id, false)
      );
      const data = this.parseUploadData(r);

      const isSignMatch = await this.isSignMatch(
        data.localPath,
        data.pathSignature
      );
      this.progress.isUploadSignMatch = isSignMatch;
      if (isSignMatch) {
        await this.uploadBlob(data);
      }
    } catch (e) {
      this.logger.error(`error while uploading or indexing a blob: ${e}`);
      this.progress.setLastError(e);
      this.change.markChanged();

      if (e instanceof MTimeError) {
        this.progress.terminateWithError();
      }

      throw e;
    }
  }

  private parseUploadData(r: BasicResourceData): UploadOpts {
    const data = JSON.parse(notEmpty(r.data).toString());
    if (data.ModificationTime === undefined) {
      throw new Error(
        'no modification time in data: ' + stringifyWithResourceId(data)
      );
    }
    if (data.LocalPath === undefined) {
      throw new Error(
        'no local path in data: ' + stringifyWithResourceId(data)
      );
    }
    if (data.PathSignature === undefined) {
      throw new Error(
        'no path signature in data: ' + stringifyWithResourceId(data)
      );
    }

    return {
      modificationTime: data.ModificationTime,
      localPath: data.LocalPath,
      pathSignature: data.PathSignature
    };
  }

  /** Uploads a blob using client. */
  private async uploadBlob(upload: UploadOpts) {
    if (this.counter.isZero()) return;
    const parts = await this.clientBlob.initUpload(this.progress);

    this.logger.info(
      `start to upload blob ${this.progress.id}, parts count: ${parts.length}`
    );

    await asyncPool(
      this.nConcurrentPartsUpload,
      parts,
      async (part: bigint) => {
        if (this.counter.isZero()) return;
        await this.clientBlob.partUpload(
          this.progress,
          upload.localPath,
          part,
          upload.modificationTime
        );
        this.logger.info(
          `uploaded part ${part} of resource ${this.progress.id}`
        );
      }
    );

    if (this.counter.isZero()) return;
    await this.clientBlob.finalizeUpload(this.progress);

    this.logger.info(`uploading of resource ${this.progress.id} finished.`);
    this.change.markChanged();
  }

  private async isSignMatch(path: string, signature: string): Promise<boolean> {
    return signature == (await this.getSignature(path));
  }
}

export class Progress {
  public done: boolean = false;
  public status?: ProgressStatus;

  public readonly isUpload: boolean;
  public isUploadSignMatch?: boolean;
  public lastError?: string;
  public uploadingTerminallyFailed?: boolean;

  constructor(
    public readonly id: ResourceId,
    public readonly type: ResourceType
  ) {
    this.isUpload = type.name.startsWith('BlobUpload');
  }

  public terminateWithError() {
    this.done = false;
    this.uploadingTerminallyFailed = true;
  }

  public setLastError(e: unknown) {
    this.lastError = String(e);
  }

  public setStatus(status: ProgressStatus) {
    this.status = status;
    this.done = status.done;
    if (status.done) {
      this.lastError = undefined;
    }
  }
}

/** Options from BlobUpload resource that have to be passed to getProgress. */
type UploadOpts = {
  localPath: string;
  pathSignature: string;
  modificationTime: bigint;
};

function makeUid(rId: ResourceId) {
  return `uid:${rId}`;
}
