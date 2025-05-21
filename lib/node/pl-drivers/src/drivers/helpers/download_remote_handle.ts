/** Handle of remote blob. This handle is issued as soon as the data becomes
 * available on the remote server. */

import type { Signer } from '@milaboratories/ts-helpers';
import type { OnDemandBlobResourceSnapshot } from '../types';
import type { RemoteBlobHandle, RangeBytes } from '@milaboratories/pl-model-common';
import { bigintToResourceId, ResourceId, ResourceType } from '@milaboratories/pl-client';
import { ResourceInfo } from '@milaboratories/pl-tree';

// https://regex101.com/r/Q4YdTa/4
const remoteHandleRegex
  = /^blob\+remote:\/\/download\/(?<content>(?<resourceType>.+)\/(?<resourceVersion>.+?)\/(?<resourceId>\d+?))#(?<signature>.*)$/;

export function newRemoteHandle(
  rInfo: OnDemandBlobResourceSnapshot,
  signer: Signer,
): RemoteBlobHandle {
  let content = `${rInfo.type.name}/${rInfo.type.version}/${BigInt(rInfo.id)}`;

  return `blob+remote://download/${content}#${signer.sign(content)}` as RemoteBlobHandle;
}

export function isRemoteBlobHandle(handle: string): handle is RemoteBlobHandle {
  return Boolean(handle.match(remoteHandleRegex));
}

export function parseRemoteHandle(handle: RemoteBlobHandle, signer: Signer): ResourceInfo {
  const parsed = handle.match(remoteHandleRegex);
  if (parsed === null) {
    throw new Error(`Remote handle is malformed: ${handle}, matches: ${parsed}`);
  }

  const { content, resourceType, resourceVersion, resourceId, signature } = parsed.groups!;

  signer.verify(content, signature, `Signature verification failed for ${handle}`);

  return {
    id: bigintToResourceId(BigInt(resourceId)),
    type: { name: resourceType, version: resourceVersion },
  };
}
