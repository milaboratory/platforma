import { bigintToResourceId, ResourceId } from "@milaboratories/pl-client";
import { RangeBytes } from "../helpers/range_blobs_cache";
import * as path from 'node:path';

/** Returns a file name and the unique key of the file.
 * It should be backward compatible with the previous implementation,
 * when it always returned a key with resource id for a whole file,
 * or else we won't recognize keys for all clients. */
export function blobKey(rId: ResourceId, range?: RangeBytes): string {
  if (range !== undefined) {
    return `${BigInt(rId)}_${range.from}-${range.to}`;
  }

  return `${BigInt(rId)}`;
}

export function pathToBlobInfo(fPath: string): {
  resourceId: ResourceId;
  range?: RangeBytes;
} | undefined {
  const base = path.basename(fPath);

  // https://regex101.com/r/74SF5p/1
  const match = base.match(/(?<resourceId>.+?)(?<range>_(?<rangeFrom>\d+?)-(?<rangeTo>\d+?))?$/);
  if (match == null) {
    return undefined;
  }

  const { resourceId, rangeFrom, rangeTo } = match.groups!;

  let range: RangeBytes | undefined;
  if (rangeFrom && rangeTo) {
    range = {
      from: parseInt(rangeFrom),
      to: parseInt(rangeTo),
    };
  }

  return {
    resourceId: bigintToResourceId(BigInt(resourceId)),
    range,
  };
}
