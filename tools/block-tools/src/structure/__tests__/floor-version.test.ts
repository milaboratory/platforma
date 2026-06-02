// Floor-version refusal — when `.structure` carries a version below
// `STRUCTURE_MIN_SUPPORTED`, structurer entry points must abort with a
// hard error pointing at the legacy-migration skill.
// testing-strategy.md § "Floor-Version Refusal Test".

import { describe, test, expect } from "vitest";
import {
  STRUCTURE_MIN_SUPPORTED,
  StructureVersionFloorError,
  assertVersionAboveFloor,
  readStructureVersion,
} from "../engine/version";
import { MemoryFileSystem } from "../engine/fs/memory";

describe("floor-version refusal", () => {
  test("version 0 below floor 1 throws StructureVersionFloorError", () => {
    expect(() => assertVersionAboveFloor(0, 1)).toThrow(StructureVersionFloorError);
  });

  test("error message names the version, the floor, and points at legacy migration", () => {
    try {
      assertVersionAboveFloor(0, 1);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(StructureVersionFloorError);
      const msg = (e as Error).message;
      expect(msg).toContain("0");
      expect(msg).toContain("1");
      expect(msg).toMatch(/legacy-migration/i);
    }
  });

  test("at-floor and above-floor versions do not throw", () => {
    expect(() => assertVersionAboveFloor(1, 1)).not.toThrow();
    expect(() => assertVersionAboveFloor(5, 1)).not.toThrow();
  });

  test("default floor is STRUCTURE_MIN_SUPPORTED", () => {
    // Document the constant invariant: shipping floor stays 0 until a
    // legacy-migration skill exists. Bumping the floor without that
    // skill in place would brick existing blocks.
    expect(STRUCTURE_MIN_SUPPORTED).toBe(0);
  });

  test("read+assert against a fixture .structure with version 0 and floor 1 throws", async () => {
    const fs = new MemoryFileSystem({
      ".structure": JSON.stringify({ version: 0 }) + "\n",
    });
    const version = await readStructureVersion(fs);
    expect(version).toBe(0);
    expect(() => assertVersionAboveFloor(version, 1)).toThrow(StructureVersionFloorError);
  });
});
