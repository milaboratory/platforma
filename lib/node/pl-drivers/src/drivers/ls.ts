import type { PlClient, ResourceData, ResourceId } from '@milaboratories/pl-client';
import { isNotNullResourceId } from '@milaboratories/pl-client';
import type { MiLogger, Signer } from '@milaboratories/ts-helpers';
import type * as sdk from '@milaboratories/pl-model-common';
import type {
  LocalImportFileHandle,
  LsEntry,
  OpenDialogOps,
  OpenMultipleFilesResponse,
  OpenSingleFileResponse,
  TableRange,
} from '@milaboratories/pl-model-common';
import {
  isImportFileHandleIndex,
} from '@milaboratories/pl-model-common';
import type { ClientLs } from '../clients/ls_api';
import * as path from 'node:path';
import * as fsp from 'node:fs/promises';
import {
  createIndexImportHandle,
  createUploadImportHandle,
  parseIndexHandle,
  parseUploadHandle,
} from './helpers/ls_remote_import_handle';
import {
  createLocalStorageHandle,
  createRemoteStorageHandle,
  parseStorageHandle,
} from './helpers/ls_storage_entry';
import type { LocalStorageProjection, VirtualLocalStorageSpec } from './types';
import { validateAbsolute } from '../helpers/validate';
import { DefaultVirtualLocalStorages } from './virtual_storages';
import { createLsFilesClient } from '../clients/constructors';

/**
 * Extends public and safe SDK's driver API with methods used internally in the middle
 * layer and in tests.
 */
export interface InternalLsDriver extends sdk.LsDriver {
  /**
   * Given local path, generates well-structured and signed upload handle.
   * To be used in tests and in implementation of the native file selection UI API.
   * */
  getLocalFileHandle(localPath: string): Promise<sdk.LocalImportFileHandle>;
}

export type OpenFileDialogCallback = (
  multipleFiles: boolean,
  ops?: OpenDialogOps
) => Promise<undefined | string[]>;

export class LsDriver implements InternalLsDriver {
  private constructor(
    private readonly logger: MiLogger,
    private readonly lsClient: ClientLs,
    /** Pl storage id, to resource id. The resource id can be used to make LS GRPC calls to. */
    private readonly storageIdToResourceId: Record<string, ResourceId>,
    private readonly signer: Signer,
    /** Virtual storages by name */
    private readonly virtualStoragesMap: Map<string, VirtualLocalStorageSpec>,
    /** Local projections by storageId */
    private readonly localProjectionsMap: Map<string, LocalStorageProjection>,
    private readonly openFileDialogCallback: OpenFileDialogCallback,
  ) {}

  public async getLocalFileContent(
    file: LocalImportFileHandle,
    range?: TableRange,
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
    ops?: OpenDialogOps,
  ): Promise<OpenMultipleFilesResponse> {
    const result = await this.openFileDialogCallback(true, ops);
    if (result === undefined) return {};
    return {
      files: await Promise.all(result.map((localPath) => this.getLocalFileHandle(localPath))),
    };
  }

  public async showOpenSingleFileDialog(ops?: OpenDialogOps): Promise<OpenSingleFileResponse> {
    const result = await this.openFileDialogCallback(false, ops);
    if (result === undefined) return {};
    return {
      file: await this.getLocalFileHandle(result[0]),
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
        'Failed to validate local file handle signature.',
      );

      const localPath = handleData.localPath;

      const stat = await fsp.stat(localPath, { bigint: true });
      if (String(stat.mtimeMs / 1000n) !== handleData.modificationTime)
        throw new Error('File has changed since the handle was created.');

      return localPath;
    }
  }

  public async getLocalFileHandle(
    localPath: string,
  ): Promise<sdk.ImportFileHandle & LocalImportFileHandle> {
    validateAbsolute(localPath);

    // Checking if local path is directly reachable by pl, because it is in one of the
    // locally mounted storages
    for (const lp of this.localProjectionsMap.values()) {
      // note: empty lp.localPath will match any address
      if (localPath.startsWith(lp.localPath)) {
        // Just in case:
        //  > path.relative("/a/b", "/a/b/c");
        //    'c'
        const pathWithinStorage
          = lp.localPath === '' ? localPath : path.relative(lp.localPath, localPath);
        return createIndexImportHandle(
          lp.storageId,
          pathWithinStorage,
        ) as sdk.ImportFileHandleIndex & LocalImportFileHandle;
      }
    }

    // we get here if none of the local projections matched the path

    const stat = await fsp.stat(localPath, { bigint: true });
    return createUploadImportHandle(
      localPath,
      this.signer,
      stat.size,
      stat.mtimeMs / 1000n, // integer division
    ) as sdk.ImportFileHandleUpload & LocalImportFileHandle;
  }

  public async getStorageList(): Promise<sdk.StorageEntry[]> {
    const virtualStorages = [...this.virtualStoragesMap.values()].map((s) => ({
      name: s.name,
      handle: createLocalStorageHandle(s.name, s.root),
      initialFullPath: s.initialPath,
    }));

    const otherStorages = Object.entries(this.storageIdToResourceId!).map(
      ([storageId, resourceId]) => ({
        name: storageId,
        handle: createRemoteStorageHandle(storageId, resourceId),
        initialFullPath: '', // we don't have any additional information from where to start browsing remote storages
        isInitialPathHome: false,
      }),
    );

    // root must be a storage so we can index any file,
    // but for UI it's enough
    // to have local virtual storage on *nix,
    // and local_disk_${drive} on Windows.
    const noRoot = otherStorages.filter((it) => it.name !== 'root');

    return [...virtualStorages, ...noRoot];
  }

  public async listFiles(
    storageHandle: sdk.StorageHandle,
    fullPath: string,
  ): Promise<sdk.ListFilesResult> {
    const storageData = parseStorageHandle(storageHandle);

    if (storageData.isRemote) {
      const response = await this.lsClient.list(storageData, fullPath);
      return {
        entries: response.items.map((e) => ({
          type: e.isDir ? 'dir' : 'file',
          name: e.name,
          fullPath: e.fullName,
          handle: createIndexImportHandle(storageData.name, e.fullName),
        })),
      };
    }

    if (path.sep === '/' && fullPath === '') fullPath = '/';

    if (storageData.rootPath === '') {
      validateAbsolute(fullPath);
    }
    const lsRoot = path.isAbsolute(fullPath) ? fullPath : path.join(storageData.rootPath, fullPath);

    const entries: LsEntry[] = [];
    for await (const dirent of await fsp.opendir(lsRoot)) {
      if (!dirent.isFile() && !dirent.isDirectory()) continue;

      // We cannot use no dirent.fullPath no dirent.parentPath,
      // since the former is deprecated
      // and the later works differently on different versions.
      const absolutePath = path.join(lsRoot, dirent.name);

      entries.push({
        type: dirent.isFile() ? 'file' : 'dir',
        name: dirent.name,
        fullPath: absolutePath,
        handle: await this.getLocalFileHandle(absolutePath),
      });
    }

    return { entries };
  }

  public async fileToImportHandle(file: sdk.FileLike): Promise<sdk.ImportFileHandle> {
    throw new Error(
      'Not implemented. This method must be implemented and intercepted in desktop preload script.',
    );
  }

  public static async init(
    logger: MiLogger,
    client: PlClient,
    signer: Signer,
    /** Pl storages available locally */
    localProjections: LocalStorageProjection[],
    openFileDialogCallback: OpenFileDialogCallback,
    virtualStorages?: VirtualLocalStorageSpec[],
  ): Promise<LsDriver> {
    const lsClient = createLsFilesClient(client, logger);

    if (!virtualStorages) virtualStorages = await DefaultVirtualLocalStorages();

    // validating inputs
    for (const vp of virtualStorages) validateAbsolute(vp.root);
    for (const lp of localProjections) if (lp.localPath !== '') validateAbsolute(lp.localPath);

    // creating indexed maps for quick access
    const virtualStoragesMap = new Map(virtualStorages.map((s) => [s.name, s]));
    const localProjectionsMap = new Map(localProjections.map((s) => [s.storageId, s]));

    // validating there is no intersection
    if (
      new Set([...virtualStoragesMap.keys(), ...localProjectionsMap.keys()]).size
        !== virtualStoragesMap.size + localProjectionsMap.size
    )
      throw new Error(
        'Intersection between local projection storage ids and virtual storages names detected.',
      );

    return new LsDriver(
      logger,
      lsClient,
      await doGetAvailableStorageIds(client),
      signer,
      virtualStoragesMap,
      localProjectionsMap,
      openFileDialogCallback,
    );
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
      .map((f) => [f.name.substring('storage/'.length), f.value as ResourceId]),
  );
}
