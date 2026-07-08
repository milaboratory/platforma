// `.structure` metadata file — read/write + floor check.
//
// Single JSON file at the block root holding the layout-version
// integer and (in future) any other structurer metadata. Two
// constants govern lifecycle gates:
//   - STRUCTURE_VERSION       : latest known. v2 = software-build layout.
//   - STRUCTURE_MIN_SUPPORTED : floor. Initial value 0.
// Both are bumped by structurer releases; rule predicates may consult
// `ctx.version` for one-shot version-gated transitions.

import type { FileSystem } from "./fs/api";

export const STRUCTURE_VERSION = 2;
export const STRUCTURE_MIN_SUPPORTED = 0;
/** Block-relative path of the structurer metadata file. */
export const STRUCTURE_META_FILE = ".structure";

export type StructureMeta = { version: number };

/** Read `.structure`. Missing file or invalid payload → version 0. */
export function readStructureMeta(fs: FileSystem): StructureMeta {
  if (!fs.exists(STRUCTURE_META_FILE)) return { version: 0 };
  try {
    const parsed = JSON.parse(fs.read(STRUCTURE_META_FILE)) as Partial<StructureMeta>;
    return { version: typeof parsed?.version === "number" ? parsed.version : 0 };
  } catch {
    return { version: 0 };
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
      `Block .structure version is ${version}, below floor ${floor}. ` +
        `Bootstrap via the legacy-migration skill, then re-run.`,
    );
    this.name = "StructureVersionFloorError";
  }
}

/** Write `.structure`. Writes a fresh payload rather than merging. */
export function writeStructureMeta(fs: FileSystem, meta: StructureMeta): void {
  // Compact, single-line — this is a tiny machine file, no pretty-print.
  fs.write(STRUCTURE_META_FILE, JSON.stringify(meta));
}
