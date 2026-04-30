import { bigintToResourceId, parseSignedResourceId, ResourceId } from "@milaboratories/pl-client";
import * as path from "node:path";

export function blobKey(rId: ResourceId): string {
  const { globalId } = parseSignedResourceId(rId);
  return `${globalId}`;
}

export function pathToKey(fPath: string): string {
  return path.basename(fPath);
}

export function pathToBlobInfo(fPath: string): ResourceId | undefined {
  const base = path.basename(fPath);
  return bigintToResourceId(BigInt(base));
}
