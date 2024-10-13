import { isNotNullResourceId, PlClient, ResourceData, ResourceId } from '@milaboratories/pl-client';
import { MiLogger, Signer } from '@milaboratories/ts-helpers';
import * as sdk from '@milaboratories/pl-model-common';
import { ClientLs } from '../clients/ls_api';
import * as path from 'node:path';
import * as fsp from 'node:fs/promises';
import {
  createUploadHandle,
  ListResponse,
  parseUploadHandle,
  toListItem,
  toLsEntries
} from './helpers/ls_list_entry';
import { fromStorageHandle, toStorageEntry } from './helpers/ls_storage_entry';
import {
  isImportFileHandleUpload,
  LocalImportFileHandle,
  OpenDialogOps,
  OpenMultipleFilesResponse,
  OpenSingleFileResponse,
  TableRange
} from '@milaboratories/pl-model-common';

/**
 * Extends public and safe SDK's driver API with methods used internally in the middle
 * layer and in tests.
 */
export interface InternalLsDriver extends sdk.LsDriver {
  /**
   * Given local path, generates well-structured and signed upload handle.
   * To be used in tests and in implementation of the native file selection UI API.
   * */
  getLocalFileHandle(localPath: string): Promise<sdk.ImportFileHandleUpload>;
}

export type OpenFileDialogCallback = (
  multipleFiles: boolean,
  ops?: OpenDialogOps
) => Promise<undefined | string[]>;

export class LsDriver implements InternalLsDriver {
  private storageIdToResourceId?: Record<string, ResourceId>;

  constructor(
    private readonly logger: MiLogger,
    private readonly clientLs: ClientLs,
    private readonly client: PlClient,
    private readonly signer: Signer,
    private readonly localStorageToPath: Record<string, string>,
    private readonly openFileDialogCallback: OpenFileDialogCallback
  ) {}

  public async getLocalFileContent(
    file: LocalImportFileHandle,
    range?: TableRange
  ): Promise<Uint8Array> {
    const localPath = await this.decodeLocalFileHandle(file);
    if (range) throw new Error('Range request not yet supported.');
    return await fsp.readFile(localPath);
  }

  public async getLocalFileSize(file: LocalImportFileHandle): Promise<number> {
    const localPath = await this.decodeLocalFileHandle(file);
    const stat = await fsp.stat(localPath);
    return stat.size;
  }

  public async showOpenMultipleFilesDialog(
    ops?: OpenDialogOps
  ): Promise<OpenMultipleFilesResponse> {
    const result = await this.openFileDialogCallback(true, ops);
    if (result === undefined) return {};
    return {
      files: await Promise.all(result.map((localPath) => this.getLocalFileHandle(localPath)))
    };
  }

  public async showOpenSingleFileDialog(ops?: OpenDialogOps): Promise<OpenSingleFileResponse> {
    const result = await this.openFileDialogCallback(false, ops);
    if (result === undefined) return {};
    return {
      file: await this.getLocalFileHandle(result[0])
    };
  }

  /**
   * Resolves local handle to local file path.
   *
   * @param handle handle to be resolved
   * @private
   */
  private async decodeLocalFileHandle(handle: LocalImportFileHandle): Promise<string> {
    if (!isImportFileHandleUpload(handle))
      throw new Error(
        'Local mode pl index requests are not yet supported / not a local file handle.'
      );
    const handleData = parseUploadHandle(handle);

    // checking it is a valid local handle from out machine
    this.signer.verify(
      handleData.localPath,
      handleData.pathSignature,
      'Failed to validate local file handle signature.'
    );

    const localPath = handleData.localPath;

    const stat = await fsp.stat(localPath, { bigint: true });
    if (String(stat.mtimeMs / 1000n) !== handleData.modificationTime)
      throw new Error('File has changed since the handle was created.');

    return localPath;
  }

  // @todo extend to local mode case
  public async getLocalFileHandle(
    localPath: string
  ): Promise<sdk.ImportFileHandleUpload & LocalImportFileHandle> {
    const stat = await fsp.stat(localPath, { bigint: true });
    return createUploadHandle(
      localPath,
      this.signer,
      stat.size,
      stat.mtimeMs / 1000n // integer division
    ) as sdk.ImportFileHandleUpload & LocalImportFileHandle;
  }

  public async getStorageList(): Promise<sdk.StorageEntry[]> {
    return toStorageEntry(this.localStorageToPath, await this.getAvailableStorageIds());
  }

  public async listFiles(
    storageHandle: sdk.StorageHandle,
    path: string
  ): Promise<sdk.ListFilesResult> {
    const storage = fromStorageHandle(storageHandle);

    let list: ListResponse;

    if (storage.remote) {
      list = await this.clientLs.list(storage, path);
    } else {
      list = await this.getLocalFiles(this.logger, storage.path, path);
    }

    return toLsEntries({
      storageName: storage.name,
      list,
      signer: this.signer,
      remote: storage.remote
    });
  }

  private async getAvailableStorageIds() {
    if (this.storageIdToResourceId == undefined)
      this.storageIdToResourceId = await doGetAvailableStorageIds(this.client);

    return this.storageIdToResourceId;
  }

  private async getLocalFiles(
    logger: MiLogger,
    _storagePath: string,
    pathInStorage: string
  ): Promise<ListResponse> {
    const storagePath = path.resolve(_storagePath);

    const fullPath = path.isAbsolute(pathInStorage)
      ? pathInStorage
      : path.resolve(path.join(storagePath, pathInStorage));

    const files = await fsp.opendir(fullPath);
    const direntsWithStats: any[] = [];
    for await (const dirent of files) {
      // We cannot use no dirent.path no dirent.parentPath,
      // since the former is deprecated
      // and the later works differently on different versions.
      const fullName = path.join(fullPath, dirent.name);

      direntsWithStats.push({
        directory: fullPath,
        fullName,
        dirent,
        stat: await fsp.stat(fullName)
      });
    }

    const resp: ListResponse = {
      delimiter: path.sep,
      items: direntsWithStats
        .map((ds) => toListItem(logger, ds))
        .filter((item) => item != undefined)
        .map((item) => item!)
    };

    return resp;
  }
}

async function doGetAvailableStorageIds(client: PlClient): Promise<Record<string, ResourceId>> {
  return client.withReadTx('GetAvailableStorageIds', async (tx) => {
    const lsProviderId = await tx.getResourceByName('LSProvider');
    const provider = await tx.getResourceData(lsProviderId, true);

    return providerToStorageIds(provider);
  });
}

function providerToStorageIds(provider: ResourceData) {
  return Object.fromEntries(
    provider.fields
      .filter((f) => f.type == 'Dynamic' && isNotNullResourceId(f.value))
      .map((f) => [f.name.substring('storage/'.length), f.value as ResourceId])
  );
}
