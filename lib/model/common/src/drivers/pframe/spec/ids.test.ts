import { describe, expect, test } from "vitest";
import {
  createGlobalPObjectId,
  createLocalPObjectId,
  type PObjectId,
  type GlobalPObjectKey,
} from "../../../pool";
import { createColumnDiscoveredId, createColumnDiscoveredKey } from "./discovered_column";
import { createColumnFilteredId } from "./filtered_column";
import { createColumnOverriddenId } from "./overridden";
import {
  extractPObjectId,
  isColumnUniversalKey,
  parseColumnId,
  remapColumnIdBlockIds,
  type ColumnUniversalId,
} from "./ids";

const oldBlock = "3f2b9c10-aaaa-4bbb-8ccc-1d2e3f405060";
const newBlock = "9999aaaa-0000-4000-8000-00000000000a";

/** The remap a template apply performs: one project's block id becomes another's. */
const reassign = (blockId: string) => (blockId === oldBlock ? newBlock : blockId);
const identity = (blockId: string) => blockId;

/** Every block id anywhere in a canonical id, at any escape depth. */
function blockIdsIn(id: string): string[] {
  return [...id.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)].map(
    (m) => m[0],
  );
}

describe("remapColumnIdBlockIds", () => {
  test("a global leaf id gets its block id replaced and stays a parseable id", () => {
    const id = createGlobalPObjectId(oldBlock, "clonotypes") as ColumnUniversalId;

    const remapped = remapColumnIdBlockIds(id, reassign);

    expect(remapped).toBe(createGlobalPObjectId(newBlock, "clonotypes"));
    expect(parseColumnId(remapped)).toEqual({
      __isRef: true,
      blockId: newBlock,
      name: "clonotypes",
    });
  });

  test("an unchanged id is returned as the very same value, not re-serialized", () => {
    const id = createGlobalPObjectId(oldBlock, "clonotypes") as ColumnUniversalId;

    // Identity mapping is what export uses; it must not rewrite stored ids at all.
    expect(remapColumnIdBlockIds(id, identity)).toBe(id);
  });

  test("a local leaf carries no block id and is left alone", () => {
    const id = createLocalPObjectId(["outputs", "table"], "column") as ColumnUniversalId;

    expect(remapColumnIdBlockIds(id, reassign)).toBe(id);
  });

  test("a string that is not a column id passes through untouched", () => {
    for (const value of ["human", "", "{not json", '{"some":"object"}', oldBlock]) {
      expect(remapColumnIdBlockIds(value, reassign)).toBe(value);
    }
  });

  test("a block id nested under two wrappers is reached at its own escape depth", () => {
    const leaf = createGlobalPObjectId(oldBlock, "clonotypes") as ColumnUniversalId;
    const discovered = createColumnDiscoveredId({ column: leaf });
    const filtered = createColumnFilteredId({
      source: discovered,
      axisFilters: [[0, "SAMPLE-1"]],
    });

    // The leaf sits behind two layers of JSON escaping — a property walk never sees it.
    expect(blockIdsIn(filtered)).toEqual([oldBlock]);

    const remapped = remapColumnIdBlockIds(filtered as ColumnUniversalId, reassign);

    expect(blockIdsIn(remapped)).toEqual([newBlock]);
    expect(extractPObjectId(remapped)).toBe(createGlobalPObjectId(newBlock, "clonotypes"));
  });

  test("every linker hop in a discovered path is remapped", () => {
    const id = createColumnDiscoveredId({
      column: createGlobalPObjectId(oldBlock, "clonotypes") as ColumnUniversalId,
      path: [
        { type: "linker", column: createGlobalPObjectId(oldBlock, "linker") as ColumnUniversalId },
        { type: "linker", column: createGlobalPObjectId(oldBlock, "linker2") as ColumnUniversalId },
      ],
    });

    expect(blockIdsIn(id)).toEqual([oldBlock, oldBlock, oldBlock]);
    expect(blockIdsIn(remapColumnIdBlockIds(id as ColumnUniversalId, reassign))).toEqual([
      newBlock,
      newBlock,
      newBlock,
    ]);
  });

  test("a block id held in a queriesQualifications map key is remapped", () => {
    const queryId = createGlobalPObjectId(oldBlock, "query") as PObjectId;
    const id = createColumnDiscoveredId({
      column: createLocalPObjectId(["outputs"], "column") as ColumnUniversalId,
      queriesQualifications: {
        [queryId]: [{ axis: { name: "pl7.app/sampleId" }, contextDomain: { chain: "IGH" } }],
      },
    });

    const remapped = remapColumnIdBlockIds(id as ColumnUniversalId, reassign);

    const key = parseColumnId(remapped);
    expect(isColumnUniversalKey(key)).toBe(true);
    expect(Object.keys((key as { queriesQualifications: object }).queriesQualifications)).toEqual([
      createGlobalPObjectId(newBlock, "query"),
    ]);
  });

  test("an overridden wrapper keeps its overrides while its source is remapped", () => {
    const id = createColumnOverriddenId({
      source: createGlobalPObjectId(oldBlock, "clonotypes") as ColumnUniversalId,
      specOverrides: { annotations: { "pl7.app/label": "Clonotypes" } },
    });

    const remapped = remapColumnIdBlockIds(id as ColumnUniversalId, reassign);

    expect(blockIdsIn(remapped)).toEqual([newBlock]);
    expect(parseColumnId(remapped)).toMatchObject({
      __isOverridden: true,
      specOverrides: { annotations: { "pl7.app/label": "Clonotypes" } },
    });
  });

  test("the key form is remapped in place, staying a key", () => {
    const key = createColumnDiscoveredKey({
      column: createGlobalPObjectId(oldBlock, "clonotypes") as ColumnUniversalId,
    });

    const remapped = remapColumnIdBlockIds(key, reassign);

    expect(remapped.__isDiscovered).toBe(true);
    expect(remapped.column).toBe(createGlobalPObjectId(newBlock, "clonotypes"));
  });

  test("a bare global key is remapped without becoming a string", () => {
    const key: GlobalPObjectKey = { __isRef: true, blockId: oldBlock, name: "clonotypes" };

    expect(remapColumnIdBlockIds(key, reassign)).toEqual({
      __isRef: true,
      blockId: newBlock,
      name: "clonotypes",
    });
  });

  test("a remap that rejects an id surfaces as a throw from the caller's mapper", () => {
    const id = createGlobalPObjectId(oldBlock, "clonotypes") as ColumnUniversalId;

    expect(() =>
      remapColumnIdBlockIds(id, () => {
        throw new Error("unknown block");
      }),
    ).toThrow(/unknown block/);
  });
});
