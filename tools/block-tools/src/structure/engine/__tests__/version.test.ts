// .structure-version handling: read default, read parsed value, write,
// floor enforcement.

import { describe, test, expect } from "vitest";
import { MemoryFileSystem } from "../fs/memory";
import {
  readStructureVersion,
  writeStructureVersion,
  assertVersionAboveFloor,
  STRUCTURE_VERSION,
  StructureVersionFloorError,
} from "../version";

describe(".structure-version", () => {
  test("missing file reads as 0", async () => {
    const fs = new MemoryFileSystem();
    expect(await readStructureVersion(fs)).toBe(0);
  });

  test("write then read round-trips", async () => {
    const fs = new MemoryFileSystem();
    await writeStructureVersion(fs, 3);
    expect(await readStructureVersion(fs)).toBe(3);
    const written = await fs.read(".structure-version");
    expect(JSON.parse(written)).toEqual({ version: 3 });
  });

  test("default write uses STRUCTURE_VERSION", async () => {
    const fs = new MemoryFileSystem();
    await writeStructureVersion(fs);
    expect(await readStructureVersion(fs)).toBe(STRUCTURE_VERSION);
  });

  test("floor check throws below floor", () => {
    expect(() => assertVersionAboveFloor(2, 3)).toThrow(StructureVersionFloorError);
    expect(() => assertVersionAboveFloor(3, 3)).not.toThrow();
    expect(() => assertVersionAboveFloor(0, 0)).not.toThrow();
  });

  test("invalid JSON reads as 0", async () => {
    const fs = new MemoryFileSystem({ ".structure-version": "not-json" });
    expect(await readStructureVersion(fs)).toBe(0);
  });
});
