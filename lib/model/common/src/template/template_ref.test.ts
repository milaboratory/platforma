import { describe, expect, test } from "vitest";
import canonicalize from "canonicalize";
import type { ColumnUniversalId } from "../drivers";
import { createColumnFilteredId, createColumnDiscoveredId, stringifyColumnId } from "../drivers";
import { createGlobalPObjectId } from "../pool";
import { createPlRef } from "../ref";
import { remapRefPayload, resolveTemplateRefs, toTemplateRef } from "./template_ref";

/**
 * The redirect, against identifiers that nest.
 *
 * These are the cases the engine is *not* supposed to know about — a filtered id over a
 * discovered id over a leaf, escape padding, an id in a map key — asserted from the outside:
 * whatever the reference system stacks up, redirecting a block id must leave a value the
 * reference system still reads the same way.
 */

const leafId = (blockId: string, name: string) =>
  createGlobalPObjectId(blockId, name) as ColumnUniversalId;

const remap = <T>(payload: T, from: string, to: string): T =>
  remapRefPayload(payload, new Map([[from, to]]));

describe("nesting", () => {
  test("a block id inside a wrapped identifier is redirected", () => {
    const filtered = createColumnFilteredId({
      source: leafId("old", "clonotypes"),
      axisFilters: [[0, "IGH"]],
    });

    const remapped = remap(filtered, "old", "new");

    expect(remapped).toBe(
      createColumnFilteredId({ source: leafId("new", "clonotypes"), axisFilters: [[0, "IGH"]] }),
    );
  });

  test("two levels of nesting are no different from one", () => {
    // Filtered over discovered over a leaf: the block id is three JSON encodings deep.
    const discovered = createColumnDiscoveredId({ column: leafId("old", "clonotypes") });
    const filtered = createColumnFilteredId({
      source: discovered as ColumnUniversalId,
      axisFilters: [[0, "IGH"]],
    });

    const remapped = remap(filtered, "old", "new");

    expect(remapped).toBe(
      createColumnFilteredId({
        source: createColumnDiscoveredId({
          column: leafId("new", "clonotypes"),
        }) as ColumnUniversalId,
        axisFilters: [[0, "IGH"]],
      }),
    );
  });

  test("escape padding around the identifier is preserved exactly", () => {
    // A value that was stringified again on the way into params: the id inside is reached, and
    // the padding it was found in is put back.
    const padded = JSON.stringify(leafId("old", "reads"));

    expect(remap(padded, "old", "new")).toBe(JSON.stringify(leafId("new", "reads")));
  });

  test("the remapped identifier is still canonical", () => {
    // Identity of an identifier IS its string, so a redirect that left it non-canonical would
    // make two logically identical columns compare unequal everywhere downstream.
    const filtered = createColumnFilteredId({
      source: leafId("old", "clonotypes"),
      axisFilters: [[0, "IGH"]],
    });

    const remapped = remap(filtered, "old", "new");

    expect(remapped).toBe(canonicalize(JSON.parse(remapped)));
  });

  test("a mixed payload keeps its non-reference parts byte-for-byte", () => {
    const payload = {
      column: leafId("old", "reads"),
      label: "old faithful",
      threshold: 0.85,
      note: null,
    };

    expect(remap(payload, "old", "new")).toEqual({
      column: leafId("new", "reads"),
      label: "old faithful",
      threshold: 0.85,
      note: null,
    });
  });

  test("an identifier in a map KEY is redirected — but canonical order is not restored", () => {
    // `ColumnDiscoveredKey.queriesQualifications` is the one place an identifier is a map key.
    // Textual replacement reaches it like any other token, and that is the whole problem: the
    // canonical form sorts keys, and a redirect changes what the sorted order should be. What
    // comes out is valid JSON that is no longer canonical, so it is a different string from
    // the identifier the same column would have in a fresh project.
    // Two keys, so that sorted order is observable at all.
    const discovered = createColumnDiscoveredId({
      column: leafId("kept", "c"),
      queriesQualifications: {
        [leafId("zzz", "a")]: [],
        [leafId("mmm", "b")]: [],
      } as never,
    });

    const remapped = remap(discovered, "zzz", "aaa");

    expect(remapped).toContain("aaa");
    // The failure this pins: canonical form would sort the rewritten key differently.
    expect(remapped).not.toBe(canonicalize(JSON.parse(remapped)));
  });
});

describe("resolveTemplateRefs", () => {
  test("wrappers come off and the payload keeps its own shape", () => {
    const params = {
      wire: toTemplateRef(createPlRef("old", "reads")),
      anchor: toTemplateRef(leafId("old", "clonotypes")),
      species: "hsa",
    };

    expect(resolveTemplateRefs(params, new Map([["old", "new"]]))).toEqual({
      wire: createPlRef("new", "reads"),
      anchor: leafId("new", "clonotypes"),
      species: "hsa",
    });
  });

  test("a key form wrapped as an object is redirected too", () => {
    // Params hold key objects as well as canonical strings; neither is special here.
    const key = { __isFiltered: true, source: leafId("old", "c"), axisFilters: [] };

    expect(resolveTemplateRefs({ a: toTemplateRef(key) }, new Map([["old", "new"]]))).toEqual({
      a: { __isFiltered: true, source: leafId("new", "c"), axisFilters: [] },
    });
  });

  test("an empty map hands the payload back untouched, without a round trip", () => {
    const payload = createPlRef("old", "reads");

    expect(resolveTemplateRefs({ a: toTemplateRef(payload) }, new Map()).a).toBe(payload);
  });

  test("stringifyColumnId of a redirected key matches the redirected id", () => {
    // The two directions agree: rewriting the string and rewriting the key then serializing
    // it land on the same identifier.
    const key = { __isRef: true, blockId: "old", name: "reads" };

    expect(remap(stringifyColumnId(key), "old", "new")).toBe(
      stringifyColumnId({ ...key, blockId: "new" }),
    );
  });
});
