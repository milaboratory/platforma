/** Handle of remote blob. This handle is issued as soon as the data becomes
 * available on the remote server. */

import type { Signer } from '@milaboratories/ts-helpers';
import type { OnDemandBlobResourceSnapshot } from '../types';
import type { RemoteBlobHandle } from '@milaboratories/pl-model-common';
import { bigintToResourceId } from '@milaboratories/pl-client';
import { ResourceInfo } from '@milaboratories/pl-tree';
import { getSize } from '../types';

// https://regex101.com/r/Q4YdTa/5
const remoteHandleRegex
  = /^blob\+remote:\/\/download\/(?<content>(?<resourceType>.+)\/(?<resourceVersion>.+?)\/(?<resourceId>\d+?)\/(?<size>\d+?))#(?<signature>.*)$/;

export function newRemoteHandle(
  rInfo: OnDemandBlobResourceSnapshot,
  signer: Signer,
): RemoteBlobHandle {
  let content = `${rInfo.type.name}/${rInfo.type.version}/${BigInt(rInfo.id)}/${getSize(rInfo)}`;

  return `blob+remote://download/${content}#${signer.sign(content)}` as RemoteBlobHandle;
}

export function isRemoteBlobHandle(handle: string): handle is RemoteBlobHandle {
  return Boolean(handle.match(remoteHandleRegex));
}

export function parseRemoteHandle(handle: RemoteBlobHandle, signer: Signer): {
  info: ResourceInfo;
  size: number;
 } {
  const parsed = handle.match(remoteHandleRegex);
  if (parsed === null) {
    throw new Error(`Remote handle is malformed: ${handle}, matches: ${parsed}`);
  }

  const { content, resourceType, resourceVersion, resourceId, size, signature } = parsed.groups!;

  signer.verify(content, signature, `Signature verification failed for ${handle}`);

  return {
    info:{
      id: bigintToResourceId(BigInt(resourceId)),
      type: { name: resourceType, version: resourceVersion },
    },
    size: Number(size),
  };
}
