/** Handle of remote blob. This handle is issued as soon as the data becomes
 * available on the remote server. */

import type { Signer } from '@milaboratories/ts-helpers';
import type { OnDemandBlobResourceSnapshot } from '../types';
import type { RemoteBlobHandle, RangeBytes } from '@milaboratories/pl-model-common';
import { bigintToResourceId, ResourceId, ResourceType } from '@milaboratories/pl-client';

// https://regex101.com/r/Q4YdTa/3
const remoteHandleRegex
  = /^blob\+remote:\/\/download\/(?<content>(?<resourceType>.+)\/(?<resourceVersion>.+?)\/(?<resourceId>\d+?)(\/(?<rangeFrom>\d+?)-(?<rangeTo>\d+?))?)#(?<signature>.*)$/;

export function newRemoteHandle(
  rInfo: OnDemandBlobResourceSnapshot,
  signer: Signer,
  range?: RangeBytes,
): RemoteBlobHandle {
  let content = `${rInfo.type.name}/${rInfo.type.version}/${BigInt(rInfo.id)}`;
  if (range) {
    content += `/${range.from}-${range.to}`;
  }
  return `blob+remote://download/${content}#${signer.sign(content)}` as RemoteBlobHandle;
}

export function isRemoteBlobHandle(handle: string): handle is RemoteBlobHandle {
  return Boolean(handle.match(remoteHandleRegex));
}

export function parseRemoteHandle(handle: RemoteBlobHandle, signer: Signer): {
  id: ResourceId;
  type: ResourceType;
  range?: RangeBytes;
} {
  const parsed = handle.match(remoteHandleRegex);
  if (parsed === null) {
    throw new Error(`Remote handle is malformed: ${handle}, matches: ${parsed}`);
  }

  const { content, resourceType, resourceVersion, resourceId, rangeFrom, rangeTo, signature } = parsed.groups!;

  signer.verify(content, signature, `Signature verification failed for ${handle}`);

  let range: RangeBytes | undefined;
  if (rangeFrom !== undefined && rangeTo !== undefined) {
    range = { from: parseInt(rangeFrom), to: parseInt(rangeTo) };
  }

  return {
    id: bigintToResourceId(BigInt(resourceId)),
    type: { name: resourceType, version: resourceVersion },
    range,
  };
}
