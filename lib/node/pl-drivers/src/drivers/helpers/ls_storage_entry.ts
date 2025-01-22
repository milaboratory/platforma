import type * as sdk from '@milaboratories/pl-model-common';
import type { ResourceId, ResourceType } from '@milaboratories/pl-client';
import { bigintToResourceId } from '@milaboratories/pl-client';
import { assertNever } from '@milaboratories/ts-helpers';

export type StorageHandleData = RemoteStorageHandleData | LocalStorageHandleData;

/**
 * Gets a storage handle and gives an underlying data from it.
 */
export function parseStorageHandle(handle: sdk.StorageHandle): StorageHandleData {
  if (isRemoteStorageHandle(handle)) {
    return parseRemoteStorageHandle(handle);
  } else if (isLocalStorageHandle(handle)) {
    return parseLocalStorageHandle(handle);
  }

  assertNever(handle);
}

//
// Local storage:
//

export type LocalStorageHandleData = {
  isRemote: false;
  name: string;
  rootPath: string;
};

const localHandleRegex = /^local:\/\/(?<name>.*)\/(?<path>.*)$/;

export function isLocalStorageHandle(handle: sdk.StorageHandle): handle is sdk.StorageHandleLocal {
  return localHandleRegex.test(handle);
}

export function createLocalStorageHandle(name: string, path: string): sdk.StorageHandleLocal {
  return `local://${name}/${encodeURIComponent(path)}`;
}

function parseLocalStorageHandle(handle: string): LocalStorageHandleData {
  const parsed = handle.match(localHandleRegex);
  if (parsed == null) throw new Error(`Local list handle wasn't parsed: ${handle}`);

  const { name, path } = parsed.groups!;

  return {
    rootPath: decodeURIComponent(path),
    name,
    isRemote: false,
  };
}

//
// Remote storage:
//

export type RemoteStorageHandleData = {
  isRemote: true;
  name: string;
  id: ResourceId;
  type: ResourceType;
};

const remoteHandleRegex = /^remote:\/\/(?<name>.*)\/(?<resourceId>.*)$/;

export function isRemoteStorageHandle(
  handle: sdk.StorageHandle,
): handle is sdk.StorageHandleRemote {
  return remoteHandleRegex.test(handle);
}

export function createRemoteStorageHandle(name: string, rId: ResourceId): sdk.StorageHandleRemote {
  return `remote://${name}/${BigInt(rId)}`;
}

function parseRemoteStorageHandle(handle: string): RemoteStorageHandleData {
  const parsed = handle.match(remoteHandleRegex);
  if (parsed == null) throw new Error(`Remote list handle wasn't parsed: ${handle}`);
  const { name, resourceId } = parsed.groups!;

  return {
    id: bigintToResourceId(BigInt(resourceId)),
    type: storageType(name),
    name,
    isRemote: true,
  };
}

function storageType(name: string): ResourceType {
  return { name: `LS/${name}`, version: '1' };
}
