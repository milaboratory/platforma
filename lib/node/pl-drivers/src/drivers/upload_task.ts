import { ChangeSource, Watcher } from '@milaboratories/computable';
import { stringifyWithResourceId } from '@milaboratories/pl-client';
import * as sdk from '@milaboratories/pl-model-common';
import { asyncPool, CallersCounter, MiLogger, Signer } from '@milaboratories/ts-helpers';
import { ClientProgress, ProgressStatus } from '../clients/progress';
import { ClientUpload, MTimeError, NoFileForUploading, UnexpectedEOF } from '../clients/upload';
import { ImportFileHandleUploadData, ImportResourceSnapshot } from './types';
import assert from 'node:assert';

/** Holds all info needed to upload a file and a status of uploading
 * and indexing. Also, has a method to update a status of the progress.
 * And holds a change source. */
export class UploadTask {
  private readonly change: ChangeSource = new ChangeSource();
  private readonly counter: CallersCounter = new CallersCounter();

  /** If this is upload progress this field will be defined */
  private uploadData?: ImportFileHandleUploadData;
  public progress: sdk.ImportProgress;

  /** If failed, then getting a progress is terminally failed. */
  public failed?: boolean;

  constructor(
    private readonly logger: MiLogger,
    private readonly clientBlob: ClientUpload,
    private readonly clientProgress: ClientProgress,
    private readonly nConcurrentPartsUpload: number,
    signer: Signer,
    public readonly res: ImportResourceSnapshot
  ) {
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
    return this.progress.isUpload && this.progress.isUploadSignMatch!;
  }

  /** Uploads a blob if it's not BlobIndex. */
  public async uploadBlobTask() {
    assert(isUpload(this.res), 'the upload operation can be done only for BlobUploads');

    try {
      if (this.isComputableDone()) return;
      const parts = await this.clientBlob.initUpload(this.res);
      this.logger.info(
        `started to upload blob ${this.res.id},` +
          ` parts overall: ${parts.overall}, parts remained: ${parts.toUpload.length}`
      );

      const partUploadFn = (part: bigint) => async () => {
        if (this.isComputableDone()) return;
        await this.clientBlob.partUpload(
          this.res,
          this.uploadData!.localPath,
          BigInt(this.uploadData!.modificationTime),
          part
        );
        this.logger.info(`uploaded chunk ${part}/${parts.overall} of resource: ${this.res.id}`);
      };

      await asyncPool(this.nConcurrentPartsUpload, parts.toUpload.map(partUploadFn));

      if (this.isComputableDone()) return;
      await this.clientBlob.finalize(this.res);

      this.logger.info(`uploading of resource ${this.res.id} finished.`);
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

      throw e;
    }
  }

  public async updateStatus() {
    try {
      const status = await this.clientProgress.getStatus(this.res);

      const oldStatus = this.progress.status;
      this.progress.status = protoToStatus(status);
      this.setDone(status.done);

      if (status.done || status.progress != oldStatus?.progress) this.change.markChanged();
    } catch (e: any) {
      this.setRetriableError(e);

      if (e.name == 'RpcError' && e.code == 'DEADLINE_EXCEEDED') {
        this.logger.warn(`deadline exceeded while getting a status of BlobImport`);
        return;
      }

      if (isResourceWasDeletedError(e)) {
        this.logger.warn(
          `resource was not found while updating a status of BlobImport: ${e}, ${stringifyWithResourceId(this.res)}`
        );
        this.change.markChanged();
        this.setDone(true);
        return;
      }

      this.logger.error(`error while updating a status of BlobImport: ${e}`);
      this.change.markChanged();
      this.setTerminalError(e);
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
    if (isImportResourceOutputSet(res)) this.setDone(true);
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
      lastError: undefined
    }
  };
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
    lastError: progress.lastError
  };

  if (progress.status)
    cloned.status = {
      progress: progress.status.progress,
      bytesProcessed: progress.status.bytesProcessed,
      bytesTotal: progress.status.bytesTotal
    };

  return progress;
}

function isImportResourceOutputSet(res: ImportResourceSnapshot) {
  return 'blob' in res.fields
    ? res.fields.blob !== undefined
    : res.fields.incarnation !== undefined;
}

function isUpload(res: ImportResourceSnapshot) {
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
    bytesTotal: Number(proto.bytesTotal)
  };
}

export function isResourceWasDeletedError(e: any) {
  return (
    e.name == 'RpcError' &&
    (e.code == 'NOT_FOUND' || e.code == 'ABORTED' || e.code == 'ALREADY_EXISTS')
  );
}

export function nonRecoverableError(e: any) {
  return e instanceof MTimeError || e instanceof UnexpectedEOF || e instanceof NoFileForUploading;
}
