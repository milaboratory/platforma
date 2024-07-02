import {
  bigintToResourceId,
  isNotNullResourceId,
  PlClient,
  ResourceData,
  ResourceId,
  ResourceType
} from '@milaboratory/pl-client-v2';
import { Signer } from '@milaboratory/ts-helpers';
import * as sdk from '@milaboratory/sdk-model';
import { ClientLs } from '../clients/ls_api';
import { ResourceInfo } from '@milaboratory/pl-tree';
import {
  LsAPI_List_Response,
  LsAPI_ListItem
} from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/lsapi/protocol';

//
// Driver:
//

export class LsDriver implements sdk.LsDriver {
  private storageIdToResourceId?: Record<string, ResourceId>;

  constructor(
    private readonly clientLs: ClientLs,
    private readonly client: PlClient,
    private readonly signer: Signer
  ) {}

  async getStorageList(): Promise<sdk.StorageEntry[]> {
    return toStorageEntry(await this.getOrSetAvailableStorageIds());
  }

  async listFiles(
    storageHandle: sdk.StorageHandle,
    path: string
  ): Promise<sdk.LsEntry[]> {
    const storage = fromStorageHandle(storageHandle);
    const rInfo: ResourceInfo = {
      id: storage.id,
      type: storageType(storage.name)
    };

    const list = await this.clientLs.list(rInfo, path);

    return toLsEntries({
      storageName: storage.name,
      list,
      signer: this.signer,
      remote: storage.remote
    });
  }

  private async getOrSetAvailableStorageIds() {
    if (this.storageIdToResourceId == undefined)
      this.storageIdToResourceId = await doGetAvailableStorageIds(this.client);

    return this.storageIdToResourceId;
  }
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
// File Handles:
//

function toLsEntries(info: {
  storageName: string;
  list: LsAPI_List_Response;
  signer: Signer;
  remote: boolean;
}): sdk.LsEntry[] {
  return info.list.items.map((e) => {
    if (e.isDir)
      return {
        type: 'dir',
        name: e.name,
        fullPath: e.fullName
      };

    return {
      type: 'file',
      name: e.name,
      fullPath: e.fullName,
      handle: toFileHandle({ item: e, ...info })
    };
  });
}

export function toFileHandle(info: {
  storageName: string;
  item: LsAPI_ListItem;
  signer: Signer;
  remote: boolean;
}): sdk.ImportFileHandle {
  if (info.remote) {
    // UploadBlob data
    const data = encodeURIComponent(
      JSON.stringify({
        modificationTimeUnix: String(info.item.lastModified?.seconds),
        localPath: info.item.fullName,
        pathSignature: info.signer.sign(info.item.fullName),
        sizeBytes: String(info.item.size)
      })
    );

    return `upload://upload/${data}`;
  }

  // ImportInternal data
  const data = encodeURIComponent(
    JSON.stringify({
      storageId: info.storageName,
      path: info.item.fullName
    })
  );

  return `index://index/${data}`;
}

export function fromFileHandle(handle: sdk.ImportFileHandle) {
  const url = new URL(handle);
  return JSON.parse(decodeURIComponent(url.pathname.substring(1)));
}

//
// Storage Handles:
//

function toStorageEntry(ids: Record<string, ResourceId>) {
  return Object.entries(ids).map(([name, rId]) => {
    return {
      name: name,
      handle: toStorageHandle(name, rId, true)
    };
  });
}

const remoteHandleRegex = /^remote:\/\/(?<name>.*)\/(?<resourceId>.*)$/;
const localHandleRegex = /^local:\/\/(?<name>.*)\/(?<resourceId>.*)$/;

function isRemoteStorageHandle(
  handle: sdk.StorageHandle
): handle is sdk.StorageHandleRemote {
  return remoteHandleRegex.test(handle);
}

function toStorageHandle(
  name: string,
  rId: ResourceId,
  remote: boolean
): sdk.StorageHandle {
  if (remote) return `remote://${name}/${BigInt(rId)}`;
  return `local://${name}/${BigInt(rId)}`;
}

function fromStorageHandle(handle: sdk.StorageHandle) {
  let parsed: RegExpMatchArray | null;
  let remote: boolean | null;

  if (isRemoteStorageHandle(handle)) {
    parsed = handle.match(remoteHandleRegex);
    remote = true;
  } else {
    parsed = handle.match(localHandleRegex);
    remote = false;
  }

  if (parsed == null) throw new Error(`Ls handle wasn't parsed: ${handle}`);

  const { name, resourceId } = parsed.groups!;

  return {
    id: bigintToResourceId(BigInt(resourceId)),
    name,
    remote
  };
}
