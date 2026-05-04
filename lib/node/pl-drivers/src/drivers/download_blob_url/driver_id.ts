import type { SignedResourceId } from "@milaboratories/pl-client";
import { parseSignedResourceId } from "@milaboratories/pl-client";
import type { ArchiveFormat } from "@milaboratories/pl-model-common";

/** A key in the driver task queue. */
export type Id = string;

export function newId(id: SignedResourceId, format: ArchiveFormat): Id {
  const { globalId } = parseSignedResourceId(id);
  return `id:${String(globalId)}-${format}`;
}

// export function
