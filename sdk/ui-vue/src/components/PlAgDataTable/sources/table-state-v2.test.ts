// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { computed } from "vue";

// The module pulls in uikit for `computedCached`; stub it so the test does not
// drag the whole component library (and its DOM-time side effects) in.
vi.mock("@milaboratories/uikit", () => ({
  computedCached: computed,
}));

const { convertAgSortingToPTableSorting } = await import("./table-state-v2");

describe("convertAgSortingToPTableSorting", () => {
  it("reports an absent sort state as untouched, so the model keeps its default sorting", () => {
    expect(convertAgSortingToPTableSorting(undefined)).toBeNull();
  });

  it("reports an empty sort model as explicitly cleared, which suppresses the default", () => {
    expect(convertAgSortingToPTableSorting({ sortModel: [] })).toEqual([]);
  });

  it("converts a sort model, taking NA/absent as least values only when ascending", () => {
    const column = { type: "column", id: "colId" };
    const colId = JSON.stringify(column) as never;
    expect(
      convertAgSortingToPTableSorting({
        sortModel: [
          { colId, sort: "asc" },
          { colId, sort: "desc" },
        ],
      }),
    ).toEqual([
      { column, ascending: true, naAndAbsentAreLeastValues: true },
      { column, ascending: false, naAndAbsentAreLeastValues: false },
    ]);
  });
});
