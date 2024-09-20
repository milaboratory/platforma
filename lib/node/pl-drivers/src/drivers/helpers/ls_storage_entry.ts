import * as sdk from '@milaboratory/sdk-model';
import {
  bigintToResourceId,
  ResourceId,
  ResourceType
} from '@milaboratory/pl-client-v2';
import { assertNever } from '@milaboratory/ts-helpers';

/**
 * Converts local and remote storages to StorageEntries.
 */
export function toStorageEntry(
  locals: Record<string, string>,
  remotes: Record<string, ResourceId>
): sdk.StorageEntry[] {
  const localEntries = Object.entries(locals).map(localToEntry);
  const remoteEntries = Object.entries(remotes).map(remoteToEntry);

  return localEntries.concat(remoteEntries);
}

export type StorageHandleData =
  | RemoteStorageHandleData
  | LocalStorageHandleData;

/**
 * Gets a storage handle and gives an underlying data from it.
 */
export function fromStorageHandle(
  handle: sdk.StorageHandle
): StorageHandleData {
  if (isRemoteStorageHandle(handle)) {
    return fromRemoteHandle(handle);
  } else if (isLocalStorageHandle(handle)) {
    return fromLocalHandle(handle);
  }

  assertNever(handle);
}

//
// Local storage:
//

export type LocalStorageHandleData = {
  remote: false;
  name: string;
  path: string;
};

function localToEntry([name, path]: [string, string]): sdk.StorageEntry {
  return {
    name: name,
    handle: toLocalHandle(name, path),
    initialFullPath: path
  };
}

const localHandleRegex = /^local:\/\/(?<name>.*)\/(?<path>.*)$/;

export function isLocalStorageHandle(
  handle: sdk.StorageHandle
): handle is sdk.StorageHandleLocal {
  return localHandleRegex.test(handle);
}

function toLocalHandle(name: string, path: string): sdk.StorageHandleLocal {
  return `local://${name}/${encodeURIComponent(path)}`;
}

function fromLocalHandle(handle: string): LocalStorageHandleData {
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

//
// Remote storage:
//

export type RemoteStorageHandleData = {
  remote: true;
  name: string;
  id: ResourceId;
  type: ResourceType;
};

function remoteToEntry([name, rId]: [string, ResourceId]): sdk.StorageEntry {
  return {
    name: name,
    handle: toRemoteHandle(name, rId),
    initialFullPath: ''
  };
}

const remoteHandleRegex = /^remote:\/\/(?<name>.*)\/(?<resourceId>.*)$/;

export function isRemoteStorageHandle(
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

function fromRemoteHandle(handle: string): RemoteStorageHandleData {
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

function storageType(name: string): ResourceType {
  return { name: `LS/${name}`, version: '1' };
}
