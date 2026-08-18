import { describe, expect, test } from "vitest";
import type { ColumnUniversalId } from "../drivers";
import {
  createColumnDiscoveredId,
  createColumnFilteredId,
  createColumnOverriddenId,
} from "../drivers";
import { canonicalizeJson } from "../json";
import { createGlobalPObjectId, createLocalPObjectId } from "../pool";
import { createPlRef } from "../ref";
import { relocateBlockIds } from "./template_relocate";

/**
 * Pointing a block's params at the project being built.
 *
 * This is the whole of what a template does about references, so what these tests pin is not
 * "the walk visits everything" but the two properties a textual rewrite could not have: a
 * value that merely looks like an id is left alone, and an identifier comes back canonical.
 */

const leafId = (blockId: string, name: string) =>
  createGlobalPObjectId(blockId, name) as ColumnUniversalId;

const to = (from: string, into: string) => new Map([[from, into]]);

describe("relocateBlockIds", () => {
  test("a PlRef is repointed where it sits", () => {
    const params = { input: createPlRef("old", "reads") };

    expect(relocateBlockIds(params, to("old", "new"))).toEqual({
      input: createPlRef("new", "reads"),
    });
  });

  test("an identifier held as a canonical string is repointed too", () => {
    const params = { anchor: leafId("old", "reads") };

    expect(relocateBlockIds(params, to("old", "new"))).toEqual({ anchor: leafId("new", "reads") });
  });

  test("an id the map does not mention is left alone — that is the ordering rule", () => {
    // A reference to an entry further down the file: the caller's map holds only entries
    // already created, so this keeps its template-local id and the applied block reports
    // itself as missing references instead of pointing at a block below it.
    const params = { input: createPlRef("later", "reads") };

    expect(relocateBlockIds(params, to("earlier", "new"))).toEqual(params);
  });

  test("a local leaf has no block id, and comes back the same string", () => {
    const local = createLocalPObjectId("some/path") as ColumnUniversalId;

    expect(relocateBlockIds({ column: local }, to("old", "new"))).toEqual({ column: local });
  });

  test("nothing to relocate means the very same params object", () => {
    const params = { species: "hsa", numbers: [1, 2, 3], note: `see {"not":"an id"}` };

    expect(relocateBlockIds(params, to("old", "new"))).toEqual(params);
  });

  test("an empty map hands the params back untouched", () => {
    const params = { input: createPlRef("old", "reads") };

    expect(relocateBlockIds(params, new Map())).toBe(params);
  });

  describe("what a textual rewrite got wrong", () => {
    test("a value that merely equals a block id is NOT rewritten", () => {
      // The whole reason this is structural. `producedBy` is spec data that happens to carry
      // the same string; a textual pass over the payload rewrote it along with the reference.
      const id = createColumnOverriddenId({
        source: leafId("old", "clonotypes"),
        specOverrides: { domain: { producedBy: "old", chain: "old" } },
      });

      const moved = relocateBlockIds({ a: id }, to("old", "new")) as { a: string };
      const key = JSON.parse(moved.a) as { source: string; specOverrides: { domain: unknown } };

      expect(key.source).toContain('"blockId":"new"');
      expect(key.specOverrides.domain).toEqual({ producedBy: "old", chain: "old" });
    });

    test("an identifier in a map KEY is repointed, and the result is canonical again", () => {
      // Rebuilding is what restores canonical order: the keys sort by their new values, so
      // the result equals the id a fresh project would build for the same column.
      const qual = [{ axis: { name: "sampleId" }, contextDomain: {} }];
      const before = createColumnDiscoveredId({
        column: leafId("src", "clonotypes"),
        queriesQualifications: { [leafId("aaa", "x")]: qual, [leafId("zzz", "y")]: qual },
      });

      const moved = relocateBlockIds(
        { a: before },
        new Map([
          ["src", "src2"],
          ["aaa", "zz9"],
          ["zzz", "aa1"],
        ]),
      ) as { a: string };

      expect(moved.a).toBe(
        createColumnDiscoveredId({
          column: leafId("src2", "clonotypes"),
          queriesQualifications: { [leafId("zz9", "x")]: qual, [leafId("aa1", "y")]: qual },
        }),
      );
      expect(moved.a).toBe(canonicalizeJson(JSON.parse(moved.a)));
    });
  });

  describe("depth", () => {
    test("three nested forms are repointed at the bottom and rebuilt on the way up", () => {
      const deep = (block: string) =>
        createColumnFilteredId({
          source: createColumnOverriddenId({
            source: leafId(block, "clonotypes"),
            specOverrides: { domain: { species: "hsa" } },
          }),
          axisFilters: [[0, "IGH"]],
        });

      expect(relocateBlockIds({ anchor: deep("old") }, to("old", "new"))).toEqual({
        anchor: deep("new"),
      });
    });

    test("a discovered column's linker path names other blocks, and each is repointed", () => {
      // The case one wrapper around the whole identifier had to cover: several ids, from
      // several blocks, at several depths.
      const disc = (a: string, b: string, c: string) =>
        createColumnDiscoveredId({
          column: leafId(a, "clonotypes"),
          path: [
            { type: "linker", column: leafId(b, "cell-to-clone") },
            { type: "linker", column: leafId(c, "clone-to-gene") },
          ],
        });

      const moved = relocateBlockIds(
        { anchor: disc("A", "B", "C") },
        new Map([
          ["A", "A2"],
          ["B", "B2"],
          ["C", "C2"],
        ]),
      );

      expect(moved).toEqual({ anchor: disc("A2", "B2", "C2") });
    });

    test("escape padding is peeled and put back as it was found", () => {
      const padded = (block: string) => JSON.stringify(leafId(block, "reads"));

      expect(relocateBlockIds({ hit: padded("old") }, to("old", "new"))).toEqual({
        hit: padded("new"),
      });
    });

    test("identifiers are reached in arrays and nested objects alike", () => {
      const params = {
        inputs: [createPlRef("old", "a"), { nested: leafId("old", "b") }],
        deeper: { list: [[createPlRef("old", "c")]] },
      };

      expect(relocateBlockIds(params, to("old", "new"))).toEqual({
        inputs: [createPlRef("new", "a"), { nested: leafId("new", "b") }],
        deeper: { list: [[createPlRef("new", "c")]] },
      });
    });

    test("params keyed BY a column id have the key repointed", () => {
      // A block may key its params by column — per-column settings. A key carries a
      // reference exactly as much as a value does.
      const params = { [leafId("old", "reads")]: { visible: true } };

      expect(relocateBlockIds(params, to("old", "new"))).toEqual({
        [leafId("new", "reads")]: { visible: true },
      });
    });
  });
});
