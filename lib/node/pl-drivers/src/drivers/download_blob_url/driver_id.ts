import { ResourceId } from "@milaboratories/pl-client";
import { ArchiveFormat } from "@milaboratories/pl-model-common";

/** A key in the driver task queue. */
export type Id = string;

export function newId(id: ResourceId, format: ArchiveFormat): Id {
  return `id:${String(BigInt(id))}-${format}`;
}

// export function 
