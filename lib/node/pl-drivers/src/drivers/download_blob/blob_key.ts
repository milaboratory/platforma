import { parseSignedResourceId, SignedResourceId } from "@milaboratories/pl-client";
import * as path from "node:path";

export function blobKey(rId: SignedResourceId): string {
  const { globalId } = parseSignedResourceId(rId);
  return `${globalId}`;
}

export function pathToKey(fPath: string): string {
  return path.basename(fPath);
}
