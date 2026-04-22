import type * as sdk from "@milaboratories/pl-model-common";
import type {
  ResourceId,
  ResourceType,
  SignedResourceId,
  StorageInfo,
} from "@milaboratories/pl-client";
import { resourceTypeToString, parseResourceType } from "@milaboratories/pl-client";
import { assertNever } from "@milaboratories/ts-helpers";

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
    isRemote: false,
    rootPath: decodeURIComponent(path),
    name,
  };
}

//
// Remote storage:
//

export type RemoteStorageHandleData = {
  isRemote: true;
  storageId: string;
  resourceType: ResourceType;
  resourceId: ResourceId;
};

const remoteHandleRegex = /^remote:\/\/(?<storageId>.*)\/(?<resourceType>.*)\/(?<resourceId>.*)$/;

export function isRemoteStorageHandle(
  handle: sdk.StorageHandle,
): handle is sdk.StorageHandleRemote {
  return remoteHandleRegex.test(handle);
}

export function createRemoteStorageHandle(info: StorageInfo): sdk.StorageHandleRemote {
  return `remote://${info.storageId}/${encodeURIComponent(resourceTypeToString(info.resourceType))}/${encodeURIComponent(info.resourceId)}`;
}

function parseRemoteStorageHandle(handle: string): RemoteStorageHandleData {
  const parsed = handle.match(remoteHandleRegex);
  if (parsed == null) throw new Error(`Remote list handle wasn't parsed: ${handle}`);
  const { storageId, resourceType: encodedRType, resourceId: encodedRId } = parsed.groups!;

  const resourceType = parseResourceType(decodeURIComponent(encodedRType));
  const resourceId = decodeURIComponent(encodedRId) as SignedResourceId;
  return {
    isRemote: true,
    storageId,
    resourceType: resourceType,
    resourceId: resourceId,
  };
}
