import type { Watcher } from '@milaboratories/computable';
import { ChangeSource } from '@milaboratories/computable';
import { stringifyWithResourceId } from '@milaboratories/pl-client';
import type * as sdk from '@milaboratories/pl-model-common';
import type { AsyncPoolController, MiLogger, Signer } from '@milaboratories/ts-helpers';
import { asyncPool, CallersCounter } from '@milaboratories/ts-helpers';
import type { ClientProgress, ProgressStatus } from '../clients/progress';
import type { ClientUpload } from '../clients/upload';
import { MTimeError, NoFileForUploading, UnexpectedEOF } from '../clients/upload';
import type { ImportResourceSnapshot } from './types';
import { ImportFileHandleUploadData } from './types';
import assert from 'node:assert';
import { ResourceInfo } from '@milaboratories/pl-tree';

/** Holds all info needed to upload a file and a status of uploading
 * and indexing. Also, has a method to update a status of the progress.
 * And holds a change source. */
export class UploadTask {
  private readonly change: ChangeSource = new ChangeSource();
  private readonly counter: CallersCounter = new CallersCounter();
  private nMaxUploads: number;
  private nPartsWithThisUploadSpeed = 0;
  private nPartsToIncreaseUpload = 10; // how many parts we have to wait to increase concurrency, 50 mb, 10 parts by 5 mb each.

  /** If this is upload progress this field will be defined */
  private uploadData?: ImportFileHandleUploadData;
  public progress: sdk.ImportProgress;

  /** If failed, then getting a progress is terminally failed. */
  public failed?: boolean;

  /** True if the blob was existed.
   * At this case, the task will show progress == 1.0. */
  private alreadyExisted = false;

  constructor(
    private readonly logger: MiLogger,
    private readonly clientBlob: ClientUpload,
    private readonly clientProgress: ClientProgress,
    private readonly maxNConcurrentPartsUpload: number,
    signer: Signer,
    public readonly res: ImportResourceSnapshot,
  ) {
    this.nMaxUploads = this.maxNConcurrentPartsUpload;
    const { uploadData, progress } = newProgress(res, signer);
    this.uploadData = uploadData;
    this.progress = progress;
  }

  public getProgress(w: Watcher, callerId: string) {
    this.incCounter(w, callerId);

    if (this.failed) {
      this.logger.error(`Uploading terminally failed: ${this.progress.lastError}`);
      throw new Error(this.progress.lastError);
    }

    return cloneProgress(this.progress);
  }

  public shouldScheduleUpload(): boolean {
    return isMyUpload(this.progress);
  }

  /** Uploads a blob if it's not BlobIndex. */
  public async uploadBlobTask() {
    try {
      await uploadBlob(
        this.logger,
        this.clientBlob,
        this.res,
        this.uploadData!,
        this.isComputableDone.bind(this),
        {
          nPartsWithThisUploadSpeed: this.nPartsWithThisUploadSpeed,
          nPartsToIncreaseUpload: this.nPartsToIncreaseUpload,
          currentSpeed: this.nMaxUploads,
          maxSpeed: this.maxNConcurrentPartsUpload,
        },
      );
      this.change.markChanged();
    } catch (e: any) {
      this.setRetriableError(e);

      if (isResourceWasDeletedError(e)) {
        this.logger.warn(`resource was deleted while uploading a blob: ${e}`);
        this.change.markChanged();
        this.setDone(true);

        return;
      }

      this.logger.error(`error while uploading a blob: ${e}`);
      this.change.markChanged();

      if (nonRecoverableError(e)) {
        this.setTerminalError(e);
        return;
      }

      if (isHeadersTimeoutError(e)) {
        // we probably have a slow internet, we need to slow things a bit.
        this.nMaxUploads = decreaseConcurrency(this.logger, this.nMaxUploads, 1);
      }

      throw e;
    }
  }

  public async updateStatus() {
    try {
      // we do it with timeout in case we have slow internet.
      const status = await this.clientProgress.getStatus(this.res, { timeout: 10000 });

      const oldStatus = this.progress.status;
      const newStatus = doneProgressIfExisted(this.alreadyExisted, protoToStatus(status));
      this.progress.status = newStatus;
      this.setDone(status.done);

      if (status.done || this.progress.status.progress != oldStatus?.progress) {
        this.change.markChanged();
      }
    } catch (e: any) {
      this.setRetriableError(e);

      if ((e.name == 'RpcError' && e.code == 'DEADLINE_EXCEEDED') || e?.message?.includes('DEADLINE_EXCEEDED')) {
        this.logger.warn(`deadline exceeded while getting a status of BlobImport`);
        return;
      }

      if (isResourceWasDeletedError(e)) {
        this.logger.warn(
          `resource was not found while updating a status of BlobImport: ${e}, ${stringifyWithResourceId(this.res)}`,
        );
        this.change.markChanged();
        this.setDone(true);
        return;
      }

      this.logger.error(`retryable error while updating a status of BlobImport: ${e}`);
      // It was a terminal error, but when a connection drops,
      // this will stop the whole task, so we make it retryable.
      // It was like that:
      // this.change.markChanged();
      // this.setTerminalError(e);
    }
  }

  /** Set non-terminal error, that task can be retried. */
  private setRetriableError(e: unknown) {
    this.progress.lastError = String(e);
  }

  /** Set a terminal error, the task will throw a error instead of a progress. */
  private setTerminalError(e: unknown) {
    this.progress.lastError = String(e);
    this.progress.done = false;
    this.failed = true;
  }

  public setDoneIfOutputSet(res: ImportResourceSnapshot) {
    if (isImportResourceOutputSet(res)) {
      this.setDone(true);
      this.alreadyExisted = true;
    }
  }

  private setDone(done: boolean) {
    this.progress.done = done;
    if (done) this.progress.lastError = undefined;
  }

  public incCounter(w: Watcher, callerId: string) {
    this.change.attachWatcher(w);
    this.counter.inc(callerId);
  }

  public decCounter(callerId: string) {
    return this.counter.dec(callerId);
  }

  private isComputableDone() {
    return this.counter.isZero();
  }
}

/** Uploads a blob if it's not BlobIndex. */
export async function uploadBlob(
  logger: MiLogger,
  clientBlob: ClientUpload,
  res: ResourceInfo,
  uploadData: ImportFileHandleUploadData,
  isDoneFn: () => boolean,
  speed: {
    nPartsWithThisUploadSpeed: number,
    nPartsToIncreaseUpload: number,
    currentSpeed: number,
    maxSpeed: number,
  },
) {
  assert(isUpload(res), 'the upload operation can be done only for BlobUploads');
  const timeout = 10000; // 10 sec instead of standard 5 sec, things might be slow with a slow connection.

    if (isDoneFn()) return;
    const parts = await clientBlob.initUpload(res, { timeout });
    logger.info(
      `started to upload blob ${res.id},`
        + ` parts overall: ${parts.overall}, parts remained: ${parts.toUpload.length},`
        + ` number of concurrent uploads: ${speed.currentSpeed}`,
    );

    const partUploadFn = (part: bigint) => async (controller: AsyncPoolController) => {
      if (isDoneFn()) return;
      await clientBlob.partUpload(
        res,
        uploadData.localPath,
        BigInt(uploadData.modificationTime),
        part,
        { timeout }
      );
      logger.info(`uploaded chunk ${part}/${parts.overall} of resource: ${res.id}`);

      // if we had a network freeze, it will be increased slowly.
      speed.nPartsWithThisUploadSpeed++;
      if (speed.nPartsWithThisUploadSpeed >= speed.nPartsToIncreaseUpload) {
        speed.nPartsWithThisUploadSpeed = 0;
        speed.currentSpeed = increaseConcurrency(logger, speed.currentSpeed, speed.maxSpeed);
        controller.setConcurrency(speed.currentSpeed);
      }
    };

    await asyncPool(speed.currentSpeed, parts.toUpload.map(partUploadFn));

    if (isDoneFn()) return;
    await clientBlob.finalize(res, { timeout });

    logger.info(`uploading of resource ${res.id} finished.`);
}

function newProgress(res: ImportResourceSnapshot, signer: Signer) {
  let isUploadSignMatch: boolean | undefined;
  let uploadData: ImportFileHandleUploadData | undefined;
  if (isUpload(res)) {
    uploadData = ImportFileHandleUploadData.parse(res.data);
    isUploadSignMatch = isSignMatch(signer, uploadData.localPath, uploadData.pathSignature);
  }

  return {
    uploadData: uploadData,
    progress: {
      done: false,
      status: undefined,
      isUpload: isUpload(res),
      isUploadSignMatch: isUploadSignMatch,
      lastError: undefined,
    } satisfies sdk.ImportProgress,
  };
}

/** Returns true if we need to upload the blob that got from this progress. */
export function isMyUpload(p: sdk.ImportProgress): boolean {
  return p.isUpload && (p.isUploadSignMatch ?? false);
}

/** Creates a deep copy of progress,
 * since we do not want to pass a mutable object
 * to API, it led to bugs before.
 * We do not use '...' cloning syntax
 * for the compiler to fail here if we change API. */
function cloneProgress(progress: sdk.ImportProgress): sdk.ImportProgress {
  const cloned: sdk.ImportProgress = {
    done: progress.done,
    isUpload: progress.isUpload,
    isUploadSignMatch: progress.isUploadSignMatch,
    lastError: progress.lastError,
  };

  if (progress.status)
    cloned.status = {
      progress: progress.status.progress,
      bytesProcessed: progress.status.bytesProcessed,
      bytesTotal: progress.status.bytesTotal,
    };

  return progress;
}

function isImportResourceOutputSet(res: ImportResourceSnapshot) {
  return 'blob' in res.fields
    ? res.fields.blob !== undefined
    : res.fields.incarnation !== undefined;
}

function isUpload(res: ResourceInfo) {
  return res.type.name.startsWith('BlobUpload');
}

function isSignMatch(signer: Signer, path: string, signature: string): boolean {
  try {
    signer.verify(path, signature);
    return true;
  } catch (e) {
    return false;
  }
}

function protoToStatus(proto: ProgressStatus): sdk.ImportStatus {
  return {
    progress: proto.progress ?? 0,
    bytesProcessed: Number(proto.bytesProcessed),
    bytesTotal: Number(proto.bytesTotal),
  };
}

/** Special hack: if we didn't even start to upload the blob
  * to backend because the result was already there,
  * the backend does show us a status that nothing were uploaded,
  * but we need to show the client that everything is OK.
  * Thus, here we set progress to be 1.0 and all bytes are become processed. */
function doneProgressIfExisted(alreadyExisted: boolean, status: sdk.ImportStatus) {
  if (alreadyExisted && status.bytesTotal != 0 && status.bytesProcessed == 0) {
    return {
      progress: 1.0,
      bytesProcessed: Number(status.bytesTotal),
      bytesTotal: Number(status.bytesTotal),
    };
  }

  return status;
}

export function isResourceWasDeletedError(e: any) {
  return (
    e.name == 'RpcError'
    && (e.code == 'NOT_FOUND' || e.code == 'ABORTED' || e.code == 'ALREADY_EXISTS')
  );
}

export function nonRecoverableError(e: any) {
  return e instanceof MTimeError || e instanceof UnexpectedEOF || e instanceof NoFileForUploading;
}

function isHeadersTimeoutError(e: any) {
  return (e as Error)?.message.includes(`UND_ERR_HEADERS_TIMEOUT`);
}

/** It's called for every upload success so if everyone is succeeded, we'll double the concurrency. */
function increaseConcurrency(logger: MiLogger, current: number, max: number): number {
  const newConcurrency = Math.min(current + 2, max);
  if (newConcurrency != current)
    logger.info(`uploadTask.increaseConcurrency: increased from ${current} to ${newConcurrency}`)

  return newConcurrency;
}

/** When a error happens, this will half the concurrency level, so the next time
 * we'll try to upload blobs slower. */
function decreaseConcurrency(logger: MiLogger, current: number, min: number): number {
  const newConcurrency = Math.max(Math.round(current / 2), min);
  if (newConcurrency != current)
    logger.info(`uploadTask.decreaseConcurrency: decreased from ${current} to ${newConcurrency}`)

  return newConcurrency;
}
