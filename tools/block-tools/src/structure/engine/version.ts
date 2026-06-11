// `.structure` metadata file — read/write + floor check.
//
// Single JSON file at the block root holding the layout-version
// integer and (in future) any other structurer metadata. Two
// constants govern lifecycle gates:
//   - STRUCTURE_VERSION       : latest known. Initial value 1.
//   - STRUCTURE_MIN_SUPPORTED : floor. Initial value 0.
// Both are bumped by structurer releases; rule predicates may consult
// `ctx.version` for one-shot version-gated transitions.

import type { FileSystem } from "./fs/api";

export const STRUCTURE_VERSION = 1;
export const STRUCTURE_MIN_SUPPORTED = 0;
/** Block-relative path of the structurer metadata file. */
export const STRUCTURE_META_FILE = ".structure";

export type StructureMeta = { version: number };

/** Read `.structure`. Missing file or invalid payload → 0. */
export function readStructureVersion(fs: FileSystem): number {
  if (!fs.exists(STRUCTURE_META_FILE)) return 0;
  try {
    const raw = fs.read(STRUCTURE_META_FILE);
    const parsed = JSON.parse(raw) as Partial<StructureMeta>;
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
      `Block .structure version is ${version}, below floor ${floor}. ` +
        `Bootstrap via the legacy-migration skill, then re-run.`,
    );
    this.name = "StructureVersionFloorError";
  }
}

export function writeStructureVersion(fs: FileSystem, version: number = STRUCTURE_VERSION): void {
  const payload: StructureMeta = { version };
  // Compact, single-line — this is a tiny machine file, no pretty-print.
  fs.write(STRUCTURE_META_FILE, JSON.stringify(payload));
}
