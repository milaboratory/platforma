/** Handle of logs. This handle should be passed
 * to the driver for retrieving logs. */

import type { ResourceInfo } from "@milaboratories/pl-tree";
import type * as sdk from "@milaboratories/pl-model-common";
import {
  bigintToResourceId,
  parseSignedResourceId,
  signatureToBase64Url,
  base64UrlToSignature,
} from "@milaboratories/pl-client";

export function newLogHandle(live: boolean, rInfo: ResourceInfo): sdk.AnyLogHandle {
  const { globalId, signature } = parseSignedResourceId(rInfo.id);
  const sigSegment = signatureToBase64Url(signature);
  if (live) {
    return `log+live://log/${rInfo.type.name}/${rInfo.type.version}/${globalId}/${sigSegment}` as sdk.LiveLogHandle;
  }

  return `log+ready://log/${rInfo.type.name}/${rInfo.type.version}/${globalId}/${sigSegment}` as sdk.ReadyLogHandle;
}

/** Handle of the live logs of a program.
 * The resource that represents a log can be deleted,
 * in this case the handle should be refreshed. */

export const liveHandleRegex =
  /^log\+live:\/\/log\/(?<resourceType>.+)\/(?<resourceVersion>[^/]+)\/(?<resourceId>\d+)\/(?<resourceSig>[A-Za-z0-9_\-=]*)$/;

export function isLiveLogHandle(handle: string): handle is sdk.LiveLogHandle {
  return liveHandleRegex.test(handle);
}

/** Handle of the ready logs of a program. */

export const readyHandleRegex =
  /^log\+ready:\/\/log\/(?<resourceType>.+)\/(?<resourceVersion>.+)\/(?<resourceId>\d+)\/(?<resourceSig>[A-Za-z0-9_\-=]*)$/;

export function isReadyLogHandle(handle: string): handle is sdk.ReadyLogHandle {
  return readyHandleRegex.test(handle);
}

export function getResourceInfoFromLogHandle(handle: sdk.AnyLogHandle): ResourceInfo {
  let parsed: RegExpMatchArray | null;

  if (isLiveLogHandle(handle)) {
    parsed = handle.match(liveHandleRegex);
  } else if (isReadyLogHandle(handle)) {
    parsed = handle.match(readyHandleRegex);
  } else throw new Error(`Log handle is malformed: ${handle}`);
  if (parsed == null) throw new Error(`Log handle wasn't parsed: ${handle}`);

  const { resourceType, resourceVersion, resourceId, resourceSig } = parsed.groups!;

  const sig = resourceSig ? base64UrlToSignature(resourceSig) : undefined;

  return {
    id: bigintToResourceId(BigInt(resourceId), sig),
    type: { name: resourceType, version: resourceVersion },
  };
}
