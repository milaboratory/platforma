/** Handle of logs. This handle should be passed
 * to the driver for retrieving logs. */

import type { ResourceInfo } from "@milaboratories/pl-tree";
import type * as sdk from "@milaboratories/pl-model-common";
import {
  createSignedResourceId,
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
    id: createSignedResourceId(BigInt(resourceId), sig),
    type: { name: resourceType, version: resourceVersion },
  };
}

/** One attempt of a composite log handle. */
export type CompositeLogPart = {
  /** Handle of the attempt's own log; absent while the attempt's stream is not known yet. */
  handle?: sdk.LiveLogHandle | sdk.ReadyLogHandle;
  /** A line that follows the attempt's text, once the attempt has failed. */
  delimiter?: string;
};

const compositeLiveLogPrefix = "log+live://log/composite/";
const compositeReadyLogPrefix = "log+ready://log/composite/";

/** Joins the logs of several exec attempts into one handle. The handle keeps the live/ready
 * prefixes of a single log handle, so consumers read it the same way; its parts travel in the
 * handle itself, as base64url-encoded JSON, because the driver reads logs without the tree.
 * `isCompositeLogHandle` of the model tells such a handle apart. */
/** The most parts a composite log handle may have: attempts and restarts of one job are bounded by
 * the backend's caps, far below this. */
export const maxCompositeLogParts = 256;

export function newCompositeLogHandle(live: boolean, parts: CompositeLogPart[]): sdk.AnyLogHandle {
  // the latest parts, if a collection ever holds more than a handle may carry
  const kept = parts.length > maxCompositeLogParts ? parts.slice(-maxCompositeLogParts) : parts;
  const payload = Buffer.from(JSON.stringify({ parts: kept })).toString("base64url");
  if (live) return `${compositeLiveLogPrefix}${payload}` as sdk.LiveLogHandle;
  return `${compositeReadyLogPrefix}${payload}` as sdk.ReadyLogHandle;
}

/** Decodes a handle made by {@link newCompositeLogHandle}. */
export function parseCompositeLogHandle(handle: sdk.AnyLogHandle): {
  live: boolean;
  parts: CompositeLogPart[];
} {
  const live = handle.startsWith(compositeLiveLogPrefix);
  if (!live && !handle.startsWith(compositeReadyLogPrefix))
    throw new Error(`Log handle is not composite: ${handle}`);

  const payload = handle.slice(
    live ? compositeLiveLogPrefix.length : compositeReadyLogPrefix.length,
  );
  const decoded: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (typeof decoded !== "object" || decoded === null || !("parts" in decoded))
    throw new Error(`Composite log handle is malformed: ${handle}`);
  const { parts } = decoded;
  if (!Array.isArray(parts)) throw new Error(`Composite log handle is malformed: ${handle}`);
  // Every read fans out to each part: a handle is client-supplied, so bound it (review finding m4).
  if (parts.length > maxCompositeLogParts)
    throw new Error(
      `Composite log handle has ${parts.length} parts, more than ${maxCompositeLogParts}`,
    );

  return {
    live,
    parts: parts.map((p: unknown): CompositeLogPart => {
      if (typeof p !== "object" || p === null)
        throw new Error(`Composite log handle is malformed: ${handle}`);
      const part: CompositeLogPart = {};
      if ("handle" in p && p.handle !== undefined) {
        if (
          typeof p.handle !== "string" ||
          !(isLiveLogHandle(p.handle) || isReadyLogHandle(p.handle))
        )
          throw new Error(`Composite log handle has a malformed part: ${handle}`);
        part.handle = p.handle;
      }
      if ("delimiter" in p && p.delimiter !== undefined) {
        if (typeof p.delimiter !== "string")
          throw new Error(`Composite log handle has a malformed delimiter: ${handle}`);
        part.delimiter = p.delimiter;
      }
      return part;
    }),
  };
}
