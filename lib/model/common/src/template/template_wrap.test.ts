import { describe, expect, test } from "vitest";
import type { ColumnUniversalId } from "../drivers";
import { createColumnFilteredId } from "../drivers";
import { createGlobalPObjectId, createLocalPObjectId } from "../pool";
import { createPlRef } from "../ref";
import { toTemplateRef } from "./template_ref";
import { wrapTemplateRefs } from "./template_wrap";

/**
 * The half of the contract that knows the reference system.
 *
 * A block writes `templateParams()` in live terms and this finds the identifiers in what it
 * returned. Everything downstream sees only `{ $ref: … }`, so what these tests pin is the one
 * question the rest of the pipeline cannot answer for itself: which values are identifiers.
 */

const leafId = (blockId: string, name: string) =>
  createGlobalPObjectId(blockId, name) as ColumnUniversalId;

describe("wrapTemplateRefs", () => {
  test("a PlRef is wrapped where it sits", () => {
    const ref = createPlRef("samples", "reads");

    expect(wrapTemplateRefs({ input: ref })).toEqual({ input: { $ref: ref } });
  });

  test("an identifier held as a canonical string is wrapped too", () => {
    const id = leafId("samples", "reads");

    expect(wrapTemplateRefs({ anchor: id })).toEqual({ anchor: { $ref: id } });
  });

  test("a wrapper form is wrapped as a whole, not descended into", () => {
    // A filtered id nests another identifier inside its own string. Wrapping the outer one
    // and stopping is what keeps the payload the value the block actually stored.
    const filtered = createColumnFilteredId({
      source: leafId("samples", "clonotypes"),
      axisFilters: [[0, "IGH"]],
    });

    expect(wrapTemplateRefs({ anchor: filtered })).toEqual({ anchor: { $ref: filtered } });
  });

  test("a key object is wrapped as a whole rather than walked into", () => {
    // Params hold key objects as well as canonical strings. Descending would wrap `source`
    // separately and leave the key itself unmarked — the identifier would come apart.
    const key = {
      __isFiltered: true,
      source: leafId("samples", "clonotypes"),
      axisFilters: [[0, "IGH"]],
    };

    expect(wrapTemplateRefs({ anchor: key })).toEqual({ anchor: { $ref: key } });
  });

  test("identifiers are found at any depth, in objects and arrays alike", () => {
    const a = createPlRef("samples", "reads");
    const b = leafId("mixcr", "clones");

    expect(
      wrapTemplateRefs({ sources: [a], nested: { deeper: { anchor: b } }, species: "hsa" }),
    ).toEqual({
      sources: [{ $ref: a }],
      nested: { deeper: { anchor: { $ref: b } } },
      species: "hsa",
    });
  });

  test("a local leaf is an identifier as well, though it carries no block id", () => {
    // It has nothing to redirect, but marking it keeps the rule one sentence long: an
    // identifier is wrapped, full stop.
    const id = createLocalPObjectId(["pf", "byChain"], "abundance");

    expect(wrapTemplateRefs({ column: id })).toEqual({ column: { $ref: id } });
  });

  test("an identifier under escape padding is recognized and stored as found", () => {
    const padded = JSON.stringify(leafId("samples", "reads"));

    expect(wrapTemplateRefs({ hit: padded })).toEqual({ hit: { $ref: padded } });
  });

  test("everything that is not an identifier is left exactly as it was", () => {
    const params = {
      species: "hsa",
      sampleId: "3f1b8c2e-5d4a-4c9f-8b17-2a6e0d9f4c31",
      note: `see {"not":"an id"}`,
      count: 42,
      enabled: true,
      missing: null,
      steps: [{ name: "filter", enabled: true }],
      empty: {},
    };

    expect(wrapTemplateRefs(params)).toEqual(params);
  });

  test("a value the block wrapped by hand is left alone, not wrapped twice", () => {
    // The escape hatch for a carrier this walk cannot recognize — a foreign document holding
    // a reference, say. Taking the block's word for it is what makes the hatch usable.
    const foreign = JSON.stringify({ wrapper: createPlRef("samples", "reads") });
    const params = { odd: toTemplateRef(foreign) };

    expect(wrapTemplateRefs(params)).toEqual({ odd: { $ref: foreign } });
  });

  test("params with nothing to mark come back unchanged", () => {
    expect(wrapTemplateRefs({})).toEqual({});
    expect(wrapTemplateRefs({ numbers: [3, 1, 2] })).toEqual({ numbers: [3, 1, 2] });
  });
});
