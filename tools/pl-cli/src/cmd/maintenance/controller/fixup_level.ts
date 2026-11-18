import type { PlTransaction } from "@milaboratories/pl-client";

/**
 * Key of the resources fixup level in the key-value store of a controller.
 * Must match MetadataResourcesFixupLevel in the backend (controllers/shared/ctlsdk/resources_fixup.go).
 */
export const ResourcesFixupLevelKey = "ctl/ctlsdk/resourcesFixupLevel";

/** The backend keeps the level as a big-endian uint32. */
const ResourcesFixupLevelSize = 4;

/** Reads the resources fixup level of the controller as text: a number, "not set" or "invalid". */
export async function readFixupLevel(tx: PlTransaction, controllerType: string): Promise<string> {
  const value = await tx.getControllerKValueIfExists(controllerType, ResourcesFixupLevelKey);
  if (value === undefined) return "not set";
  if (value.length !== ResourcesFixupLevelSize) return `invalid (${value.length} bytes)`;
  return String(Buffer.from(value).readUInt32BE(0));
}

/** Sets the resources fixup level of the controller to 0. The transaction must be writable. */
export function resetFixupLevel(tx: PlTransaction, controllerType: string): void {
  tx.setControllerKValue(
    controllerType,
    ResourcesFixupLevelKey,
    new Uint8Array(ResourcesFixupLevelSize),
  );
}
