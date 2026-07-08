// `.structure` metadata file handling: read default, read parsed
// value, write, floor enforcement.

import { describe, test, expect } from "vitest";
import { MemoryFileSystem } from "../fs/memory";
import {
  readStructureMeta,
  writeStructureMeta,
  assertVersionAboveFloor,
  STRUCTURE_VERSION,
  StructureVersionFloorError,
} from "../version";

describe(".structure metadata file", () => {
  test("missing file reads as version 0", async () => {
    const fs = new MemoryFileSystem();
    expect(readStructureMeta(fs)).toEqual({ version: 0 });
  });

  test("write then read round-trips the version", async () => {
    const fs = new MemoryFileSystem();
    writeStructureMeta(fs, { version: 3 });
    expect(readStructureMeta(fs).version).toBe(3);
    expect(JSON.parse(fs.read(".structure"))).toEqual({ version: 3 });
  });

  test("floor check throws below floor", () => {
    expect(() => assertVersionAboveFloor(2, 3)).toThrow(StructureVersionFloorError);
    expect(() => assertVersionAboveFloor(3, 3)).not.toThrow();
    expect(() => assertVersionAboveFloor(0, 0)).not.toThrow();
  });

  test("invalid JSON reads as version 0", async () => {
    const fs = new MemoryFileSystem({ ".structure": "not-json" });
    expect(readStructureMeta(fs)).toEqual({ version: 0 });
  });

  test("STRUCTURE_VERSION is a positive integer", () => {
    expect(Number.isInteger(STRUCTURE_VERSION) && STRUCTURE_VERSION >= 1).toBe(true);
  });
});
