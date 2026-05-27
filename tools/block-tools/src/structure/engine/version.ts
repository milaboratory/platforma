// `.structure-version` read/write and the floor check.
//
// Two constants govern lifecycle gates:
//   - STRUCTURE_VERSION       : latest known. Initial value 1.
//   - STRUCTURE_MIN_SUPPORTED : floor. Initial value 0.
// Both bumped by structurer releases; rule predicates may consult
// `ctx.version` for one-shot version-gated transitions.

import type { FileSystem } from "./fs/api";

export const STRUCTURE_VERSION = 1;
export const STRUCTURE_MIN_SUPPORTED = 0;
export const STRUCTURE_VERSION_FILE = ".structure-version";

export type VersionPayload = { version: number };

/** Read `.structure-version`. Missing file or invalid payload → 0. */
export async function readStructureVersion(fs: FileSystem): Promise<number> {
  if (!(await fs.exists(STRUCTURE_VERSION_FILE))) return 0;
  try {
    const raw = await fs.read(STRUCTURE_VERSION_FILE);
    const parsed = JSON.parse(raw) as Partial<VersionPayload>;
    if (typeof parsed?.version === "number") return parsed.version;
    return 0;
  } catch {
    return 0;
  }
}

/** Throw if version is below floor. */
export function assertVersionAboveFloor(
  version: number,
  floor: number = STRUCTURE_MIN_SUPPORTED,
): void {
  if (version < floor) {
    throw new StructureVersionFloorError(version, floor);
  }
}

export class StructureVersionFloorError extends Error {
  constructor(
    public readonly version: number,
    public readonly floor: number,
  ) {
    super(
      `Block .structure-version is ${version}, below floor ${floor}. ` +
        `Bootstrap via the legacy-migration skill, then re-run.`,
    );
    this.name = "StructureVersionFloorError";
  }
}

export async function writeStructureVersion(
  fs: FileSystem,
  version: number = STRUCTURE_VERSION,
): Promise<void> {
  const payload: VersionPayload = { version };
  await fs.write(STRUCTURE_VERSION_FILE, JSON.stringify(payload, null, 2) + "\n");
}
