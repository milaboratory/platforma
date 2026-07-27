import { describe, expect, test } from "vitest";
import { concatFilters } from "./createPlDataTableV3";
import type { PlDataTableFilters, PlDataTableFilterSpecLeaf } from "../typesV8";

// concatFilters only inspects each operand's `.type` (and spreads `.filters` of
// an "and" node), so the leaf payload is irrelevant — minimal shapes suffice.
type Node = PlDataTableFilters | PlDataTableFilterSpecLeaf;

const leaf = (id: string): PlDataTableFilterSpecLeaf =>
  ({ type: "isNA", column: { type: "column", id } }) as unknown as PlDataTableFilterSpecLeaf;
const and = (...filters: Node[]): PlDataTableFilters =>
  ({ type: "and", filters }) as unknown as PlDataTableFilters;
const or = (...filters: Node[]): PlDataTableFilters =>
  ({ type: "or", filters }) as unknown as PlDataTableFilters;
const not = (filter: Node): PlDataTableFilters =>
  ({ type: "not", filter }) as unknown as PlDataTableFilters;

describe("concatFilters", () => {
  test("a nil operand returns the other side unchanged", () => {
    const a = and(leaf("x"));
    expect(concatFilters(null, a)).toBe(a);
    expect(concatFilters(a, null)).toBe(a);
    expect(concatFilters(null, null)).toBeNull();
  });

  test("two AND groups merge their children", () => {
    expect(concatFilters(and(leaf("u1"), leaf("u2")), and(leaf("d1")))).toEqual(
      and(leaf("u1"), leaf("u2"), leaf("d1")),
    );
  });

  test("a bare leaf is combined as a single AND operand (no crash)", () => {
    // Regression: a lone sheet-selection leaf used to throw on `[...a.filters]`.
    expect(concatFilters(leaf("sheet"), and(leaf("d1"), leaf("d2")))).toEqual(
      and(leaf("sheet"), leaf("d1"), leaf("d2")),
    );
    // ...and on either side.
    expect(concatFilters(and(leaf("u1")), leaf("d"))).toEqual(and(leaf("u1"), leaf("d")));
  });

  test("an OR group is preserved as one operand, not flattened into AND", () => {
    // Regression: old code kept type "or" (or spread the OR's children into the
    // AND), turning "d1 OR d2" into "d1 AND d2".
    expect(concatFilters(or(leaf("u1"), leaf("u2")), and(leaf("d1")))).toEqual(
      and(or(leaf("u1"), leaf("u2")), leaf("d1")),
    );
    expect(concatFilters(and(leaf("u1")), or(leaf("d1"), leaf("d2")))).toEqual(
      and(leaf("u1"), or(leaf("d1"), leaf("d2"))),
    );
  });

  test("an empty AND group contributes nothing", () => {
    expect(concatFilters(and(), and(leaf("d1")))).toEqual(and(leaf("d1")));
    expect(concatFilters(and(leaf("u1")), and())).toEqual(and(leaf("u1")));
  });

  test("a NOT node is combined as a single operand (no crash)", () => {
    const n = not(leaf("x"));
    expect(concatFilters(n, and(leaf("d1")))).toEqual(and(n, leaf("d1")));
  });
});
