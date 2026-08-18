import { describe, expect, test } from "vitest";
import { createGlobalPObjectId, createLocalPObjectId } from "../../../pool";
import { createColumnDiscoveredId } from "./discovered_column";
import { createColumnFilteredId } from "./filtered_column";
import { peelJsonLayers, type ColumnUniversalId } from "./ids";

/**
 * The escape-layer peeler.
 *
 * It is the one definition of "how a value can be hiding inside a string", and the reference
 * detector in `pl-middle-layer` (`inferAllReferencedBlocks`) is built on it — a block id can
 * sit under any number of `JSON.stringify` passes, and a walk over object properties reaches
 * none of them. It deliberately says nothing about which values count as identifiers; the
 * cases below are identifiers only because that is what the callers care about.
 */

const leaf = (blockId: string, name: string) =>
  createGlobalPObjectId(blockId, name) as ColumnUniversalId;

describe("peelJsonLayers", () => {
  test("a canonical id is layer zero — encoded once, and that once is the id itself", () => {
    const id = leaf("samples", "reads");

    expect(peelJsonLayers(id)).toEqual({
      value: { __isRef: true, blockId: "samples", name: "reads" },
      layers: 0,
    });
  });

  test("each extra stringify pass is one more layer", () => {
    const id = leaf("samples", "reads");

    expect(peelJsonLayers(JSON.stringify(id))?.layers).toBe(1);
    expect(peelJsonLayers(JSON.stringify(JSON.stringify(id)))?.layers).toBe(2);
  });

  test("the value at the bottom is the same however deep it was", () => {
    const id = leaf("samples", "reads");
    const bottom = { __isRef: true, blockId: "samples", name: "reads" };

    expect(peelJsonLayers(JSON.stringify(JSON.stringify(id)))?.value).toEqual(bottom);
  });

  test("a nested identifier peels to its own outer key, not to the leaf", () => {
    // Wrapper forms nest by *string*, so peeling reaches the outermost key and stops. Walking
    // further in is the caller's business, and no caller does — which is the point.
    const filtered = createColumnFilteredId({
      source: createColumnDiscoveredId({ column: leaf("samples", "clonotypes") }),
      axisFilters: [[0, "IGH"]],
    });

    const peeled = peelJsonLayers(filtered);

    expect(peeled?.layers).toBe(0);
    expect(peeled?.value).toMatchObject({ __isFiltered: true });
  });

  test("a local leaf peels too, though it carries no marker at all", () => {
    // The gate must not demand `__isRef`: a filtered id whose innermost leaf is local has
    // none, and a peeler that required one would miss the whole chain.
    const id = createLocalPObjectId(["pf", "byChain"], "abundance");

    expect(peelJsonLayers(id)?.value).toEqual({
      resolvePath: ["pf", "byChain"],
      name: "abundance",
    });
  });

  test("an ordinary string is not JSON and stops at the first character", () => {
    for (const value of ["samples", "", "not json", "1.0", "yes"]) {
      expect(peelJsonLayers(value)).toBeUndefined();
    }
  });

  test("a quoted string that only ever yields strings is refused", () => {
    // `"\"abc\""` peels to `abc`, which is not JSON — there is no encoded value in there, so
    // there is nothing for a caller to look at.
    expect(peelJsonLayers(JSON.stringify("abc"))).toBeUndefined();
  });

  test("malformed JSON is refused rather than thrown", () => {
    expect(peelJsonLayers('{"__isRef": true')).toBeUndefined();
  });

  test("a JSON array or scalar is a value like any other", () => {
    // Nothing here is identifier-specific: the peeler answers "what was encoded", full stop.
    expect(peelJsonLayers("[1,2]")).toBeUndefined();
    expect(peelJsonLayers('{"a":1}')).toEqual({ value: { a: 1 }, layers: 0 });
  });
});
