import { isNotNullResourceId, PlClient, ResourceData, ResourceId } from '@milaboratories/pl-client';
import { MiLogger, Signer } from '@milaboratories/ts-helpers';
import * as sdk from '@milaboratories/pl-model-common';
import {
  isImportFileHandleIndex,
  LocalImportFileHandle,
  OpenDialogOps,
  OpenMultipleFilesResponse,
  OpenSingleFileResponse,
  TableRange
} from '@milaboratories/pl-model-common';
import { ClientLs } from '../clients/ls_api';
import * as path from 'node:path';
import * as fsp from 'node:fs/promises';
import {
  createIndexImportHandle,
  createUploadImportHandle,
  ListResponse,
  parseIndexHandle,
  parseUploadHandle,
  toListItem
} from './helpers/ls_list_entry';
import {
  createLocalStorageHandle,
  createRemoteStorageHandle,
  parseStorageHandle
} from './helpers/ls_storage_entry';
import { LocalStorageProjection } from './types';

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

/** Allows to add parts of local FS as virtual storages, presenting homogeneous API to UI */
export type VirtualLocalStorageSpec = {
  /** Virtual storage ID, must not intersect with other storage ids */
  readonly name: string;

  /** Local path to "chroot" the API in */
  readonly root: string;

  /** Used as hint to UI controls to, set as initial path during browsing */
  readonly initialPath: string;
};

function validateAbsolute(p: string): string {
  if (!path.isAbsolute(p)) throw new Error(`Path ${p} is not absolute.`);
  return p;
}

// /** Throws error on paths like this: /a/b/../c */
// function validateNormalized(p: string): string {
//   if (path.normalize(p) !== p) throw new Error(`Path is not normalized.`);
//   return p;
// }

export class LsDriver implements InternalLsDriver {
  /** Pl storage id, to resource id. THe resource id can be used to make LS GRPC calls to. */
  private storageIdToResourceId?: Record<string, ResourceId>;
  /** Virtual storages by name */
  private readonly virtualStoragesMap: Map<string, VirtualLocalStorageSpec>;
  /** Local projections by storageId */
  private readonly localProjectionsMap: Map<string, LocalStorageProjection>;

  constructor(
    private readonly logger: MiLogger,
    private readonly clientLs: ClientLs,
    private readonly client: PlClient,
    private readonly signer: Signer,
    virtualStorages: VirtualLocalStorageSpec[],
    /** Pl storages available locally */
    localProjections: LocalStorageProjection[],
    private readonly openFileDialogCallback: OpenFileDialogCallback
  ) {
    // validating inputs
    for (const vp of virtualStorages) validateAbsolute(vp.root);
    for (const lp of localProjections) validateAbsolute(lp.localPath);

    // creating indexed maps for quick access
    this.virtualStoragesMap = new Map(virtualStorages.map((s) => [s.name, s]));
    this.localProjectionsMap = new Map(localProjections.map((s) => [s.storageId, s]));
  }

  public async getLocalFileContent(
    file: LocalImportFileHandle,
    range?: TableRange
  ): Promise<Uint8Array> {
    const localPath = await this.tryResolveLocalFileHandle(file);
    if (range) throw new Error('Range request not yet supported.');
    return await fsp.readFile(localPath);
  }

  public async getLocalFileSize(file: LocalImportFileHandle): Promise<number> {
    const localPath = await this.tryResolveLocalFileHandle(file);
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
  private async tryResolveLocalFileHandle(handle: LocalImportFileHandle): Promise<string> {
    if (isImportFileHandleIndex(handle)) {
      const handleData = parseIndexHandle(handle);
      const localProjection = this.localProjectionsMap.get(handleData.storageId);
      if (!localProjection)
        throw new Error(`Storage ${handleData.storageId} is not mounted locally.`);
      return path.join(localProjection.localPath, handleData.path);
    } else {
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
  }

  public async getLocalFileHandle(
    localPath: string
  ): Promise<sdk.ImportFileHandleUpload & LocalImportFileHandle> {
    validateAbsolute(localPath);

    // Checking if local path is directly reachable by pl, because it is in one of the
    // locally mounted storages
    for (const lp of this.localProjectionsMap.values()) {
      // note: empty lp.localPath will match any address
      if (localPath.startsWith(lp.localPath)) {
        // Just in case:
        //  > path.relative("/a/b", "/a/b/c");
        //    'c'
        const pathWithinStorage =
          lp.localPath === '' ? localPath : path.relative(lp.localPath, localPath);
        return createIndexImportHandle(
          lp.storageId,
          pathWithinStorage
        ) as sdk.ImportFileHandleUpload & LocalImportFileHandle;
      }
    }

    // we get here if none of the local projections matched the path

    const stat = await fsp.stat(localPath, { bigint: true });
    return createUploadImportHandle(
      localPath,
      this.signer,
      stat.size,
      stat.mtimeMs / 1000n // integer division
    ) as sdk.ImportFileHandleUpload & LocalImportFileHandle;
  }

  public async getStorageList(): Promise<sdk.StorageEntry[]> {
    return [
      ...[...this.virtualStoragesMap.values()].map((vs) => ({
        name: vs.name,
        handle: createLocalStorageHandle(vs.name, vs.root),
        initialFullPath: vs.initialPath
      })),
      ...Object.entries(this.storageIdToResourceId!).map(([storageId, resourceId]) => ({
        name: storageId,
        handle: createRemoteStorageHandle(storageId, resourceId),
        initialFullPath: '' // we don't have any additional information from where to start browsing remote storages
      }))
    ] as sdk.StorageEntry[];
  }

  public async listFiles(
    storageHandle: sdk.StorageHandle,
    path: string
  ): Promise<sdk.ListFilesResult> {
    const storageHandleData = parseStorageHandle(storageHandle);

    if (storageHandleData.isRemote) {
      const list = await this.clientLs.list(storageHandleData, path);

    } else {
      list = await this.getLocalFiles(this.logger, storageHandleData.rootPath, path);
    }

    // return toLsEntries({
    //   storageName: storageHandleData.name,
    //   list,
    //   signer: this.signer,
    //   remote: storageHandleData.isRemote
    // });
  }

  private async getLocalFiles(
    logger: MiLogger,
    storagePath: string,
    pathInStorage: string
  ): Promise<ListResponse> {
    if (storagePath !== '') validateAbsolute(storagePath);

    const fullPath =
      storagePath === '' ? validateAbsolute(pathInStorage) : path.join(storagePath, pathInStorage);

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

    return {
      delimiter: path.sep,
      items: direntsWithStats
        .map((ds) => toListItem(logger, ds))
        .filter((item) => item != undefined)
        .map((item) => item!)
    };
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
