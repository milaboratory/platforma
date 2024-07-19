import {
  bigintToResourceId,
  isNotNullResourceId,
  PlClient,
  ResourceData,
  ResourceId,
  ResourceType
} from '@milaboratory/pl-client-v2';
import { MiLogger, notEmpty, Signer } from '@milaboratory/ts-helpers';
import * as sdk from '@milaboratory/sdk-model';
import { ClientLs } from '../clients/ls_api';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { Dirent, Stats } from 'node:fs';
import { Timestamp } from '../proto/google/protobuf/timestamp';

//
// Driver:
//

/**
 * Extends public and safe SDK's driver API with methods used internally in the middle
 * layer and in tests.
 */
export interface InternalLsDriver extends sdk.LsDriver {
  /**
   * Given local path, generates well structured and signed upload handle.
   * To be used in tests and in implementation of the native file selection UI API.
   * */
  getLocalFileHandle(localPath: string): Promise<sdk.ImportFileHandleUpload>;
}

export class LsDriver implements InternalLsDriver {
  private storageIdToResourceId?: Record<string, ResourceId>;

  constructor(
    private readonly logger: MiLogger,
    private readonly clientLs: ClientLs,
    private readonly client: PlClient,
    private readonly signer: Signer,
    private readonly localStorageToPath: Record<string, string>
  ) {}

  public async getLocalFileHandle(
    localPath: string
  ): Promise<sdk.ImportFileHandleUpload> {
    const stat = await fs.stat(localPath, { bigint: true });
    return createUploadHandle(
      localPath,
      this.signer,
      stat.size,
      stat.mtimeMs / 1000n // integer division
    );
  }

  public async getStorageList(): Promise<sdk.StorageEntry[]> {
    return toStorageEntry(
      this.localStorageToPath,
      await this.getAvailableStorageIds()
    );
  }

  public async listFiles(
    storageHandle: sdk.StorageHandle,
    path: string
  ): Promise<sdk.LsEntry[]> {
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

    this.checkPathIsReallyInStorage(fullPath, storagePath);

    const files = await fs.opendir(fullPath);
    const direntsWithStats: any[] = [];
    for await (const dirent of files) {
      // We cannot use no dirent.path no dirent.parentPath,
      // since the former is deprecated
      // and the later works differently on different versions.
      const fullName = path.join(fullPath, dirent.name);

      direntsWithStats.push({
        fullName,
        dirent,
        stat: await fs.stat(fullName)
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

  private checkPathIsReallyInStorage(fullPath: string, storagePath: string) {
    if (fullPath.startsWith(storagePath)) return;

    throw new Error(
      `path must be in storage path, ` +
        `path in storage: ${fullPath}, storagePath: ${storagePath}`
    );
  }
}

export function toListItem(
  logger: MiLogger,
  info: {
    fullName: string;
    dirent: Dirent;
    stat: Stats;
  }
): ListItem | undefined {
  if (!(info.dirent.isFile() || info.dirent.isDirectory())) {
    logger.warn(`tried to get non-dir and non-file ${info.dirent}, skip it`);
    return;
  }

  return {
    isDir: info.dirent.isDirectory(),
    name: info.dirent.name,
    fullName: info.fullName,
    lastModified: {
      seconds: BigInt(Math.floor(info.stat.mtimeMs / 1000)),
      nanos: 0
    },
    size: BigInt(info.stat.size)
  };
}

function storageType(name: string): ResourceType {
  return { name: `LS/${name}`, version: '1' };
}

async function doGetAvailableStorageIds(
  client: PlClient
): Promise<Record<string, ResourceId>> {
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

//
// File Handles
//

function toLsEntries(info: {
  storageName: string;
  list: ListResponse;
  signer: Signer;
  remote: boolean;
}): sdk.LsEntry[] {
  return info.list.items.map((item) => {
    if (item.isDir)
      return {
        type: 'dir',
        name: item.name,
        fullPath: item.fullName
      };

    return {
      type: 'file',
      name: item.name,
      fullPath: item.fullName,
      handle: toFileHandle({ item: item, ...info })
    };
  });
}

export function toFileHandle(info: {
  storageName: string;
  item: ListItem;
  signer: Signer;
  remote: boolean;
}): sdk.ImportFileHandle {
  if (info.remote) {
    // ImportInternal data
    const data = encodeURIComponent(
      JSON.stringify({
        storageId: info.storageName,
        path: info.item.fullName
      })
    );

    return `index://index/${data}`;
  }

  // UploadBlob data
  return createUploadHandle(
    info.item.fullName,
    info.signer,
    info.item.size,
    notEmpty(info.item.lastModified).seconds
  );
}

export type UploadHandleData = {
  /** Local file path, to take data for upload */
  localPath: string;
  /** Path signature, to check this data was generated by us */
  pathSignature: string;
  /** File size in bytes */
  sizeBytes: string;
  /** Modification time unix timestamp in seconds */
  modificationTime: string;
};

export function createUploadHandle(
  localPath: string,
  signer: Signer,
  sizeBytes: bigint,
  modificationTimeSeconds: bigint
): sdk.ImportFileHandleUpload {
  const data: UploadHandleData = {
    localPath,
    pathSignature: signer.sign(localPath),
    sizeBytes: String(sizeBytes),
    modificationTime: String(modificationTimeSeconds)
  };

  return `upload://upload/${encodeURIComponent(JSON.stringify(data))}` as sdk.ImportFileHandleUpload;
}

export function fromFileHandle(handle: sdk.ImportFileHandle) {
  const url = new URL(handle);
  return JSON.parse(decodeURIComponent(url.pathname.substring(1)));
}

//
// Storage Handles:
//

function toStorageEntry(
  locals: Record<string, string>,
  remotes: Record<string, ResourceId>
): sdk.StorageEntry[] {
  const localEntries: sdk.StorageEntry[] = Object.entries(locals).map(
    ([name, path]) => {
      return {
        name: name,
        handle: toLocalHandle(name, path)
      };
    }
  );

  const remoteEntries = Object.entries(remotes).map(([name, rId]) => {
    return {
      name: name,
      handle: toRemoteHandle(name, rId)
    };
  });

  return localEntries.concat(remoteEntries);
}

const remoteHandleRegex = /^remote:\/\/(?<name>.*)\/(?<resourceId>.*)$/;
const localHandleRegex = /^local:\/\/(?<name>.*)\/(?<path>.*)$/;

function isRemoteStorageHandle(
  handle: sdk.StorageHandle
): handle is sdk.StorageHandleRemote {
  return remoteHandleRegex.test(handle);
}

function toRemoteHandle(
  name: string,
  rId: ResourceId
): sdk.StorageHandleRemote {
  return `remote://${name}/${BigInt(rId)}`;
}

function toLocalHandle(name: string, path: string): sdk.StorageHandleLocal {
  return `local://${name}/${encodeURIComponent(path)}`;
}

function fromStorageHandle(handle: sdk.StorageHandle):
  | {
      remote: true;
      name: string;
      id: ResourceId;
      type: ResourceType;
    }
  | {
      remote: false;
      name: string;
      path: string;
    } {
  if (isRemoteStorageHandle(handle)) {
    const parsed = handle.match(remoteHandleRegex);
    if (parsed == null)
      throw new Error(`Remote list handle wasn't parsed: ${handle}`);
    const { name, resourceId } = parsed.groups!;

    return {
      id: bigintToResourceId(BigInt(resourceId)),
      type: storageType(name),
      name,
      remote: true
    };
  }

  const parsed = handle.match(localHandleRegex);
  if (parsed == null)
    throw new Error(`Local list handle wasn't parsed: ${handle}`);
  const { name, path } = parsed.groups!;

  return {
    path: decodeURIComponent(path),
    name,
    remote: false
  };
}

interface ListResponse {
  items: ListItem[];
  delimiter: string;
}

interface ListItem {
  isDir: boolean;
  name: string;
  fullName: string;
  lastModified?: Timestamp;
  size: bigint;
}
