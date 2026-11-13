import { describe, expect, it } from "vitest";
import type {
  ColumnUniversalId,
  PlDataTableGridStateCore,
  PlTableColumnIdJson,
} from "@platforma-sdk/model";
import {
  convertAgSortingToPTableSorting,
  createGridRestoreState,
  isStoredStateApplied,
  readGridReport,
} from "./grid-state";

const colA = '{"id":"a","type":"column"}' as PlTableColumnIdJson;
const colB = '{"id":"b","type":"column"}' as PlTableColumnIdJson;
const dropped = '{"id":"gone","type":"column"}' as PlTableColumnIdJson;

const grid = new Set<PlTableColumnIdJson>([colA, colB]);
const noColumns = new Set<PlTableColumnIdJson>();

const order = (...ids: PlTableColumnIdJson[]): PlDataTableGridStateCore => ({
  columnOrder: { orderedColIds: ids },
});
const hidden = (...ids: PlTableColumnIdJson[]): PlDataTableGridStateCore => ({
  columnVisibility: { hiddenColIds: ids },
});
const sorted = (id: PlTableColumnIdJson): PlDataTableGridStateCore => ({
  sort: { sortModel: [{ colId: id, sort: "asc" }] },
});

describe("isStoredStateApplied", () => {
  // Every case below is one a rebuild could not satisfy, so counting it as a
  // disagreement makes the reload watch rebuild the grid forever.
  describe("does not ask for what a rebuild cannot deliver", () => {
    it("ignores a field the stored state says nothing about", () => {
      expect(
        isStoredStateApplied(hidden(colA), { ...hidden(colA), ...order(colA, colB) }, grid),
      ).toBe(true);
    });

    it("ignores a column order naming a column the grid no longer has", () => {
      expect(isStoredStateApplied(order(colA, dropped, colB), order(colA, colB), grid)).toBe(true);
    });

    it("ignores a hidden column the grid no longer has", () => {
      expect(isStoredStateApplied(hidden(colA, dropped), hidden(colA), grid)).toBe(true);
    });

    it("ignores a sort on a column the grid no longer has", () => {
      expect(isStoredStateApplied(sorted(dropped), {}, grid)).toBe(true);
    });

    it("asks for nothing while the grid has no columns at all", () => {
      expect(isStoredStateApplied({ ...order(colA, colB), ...hidden(colA) }, {}, noColumns)).toBe(
        true,
      );
    });

    it("asks for nothing when the stored state is empty", () => {
      expect(isStoredStateApplied({}, order(colA), grid)).toBe(true);
    });
  });

  describe("still asks for what a rebuild can deliver", () => {
    it("reloads for a different hidden set", () => {
      expect(isStoredStateApplied(hidden(colA), hidden(colB), grid)).toBe(false);
    });

    it("reloads for a different order of columns it knows", () => {
      expect(isStoredStateApplied(order(colA, colB), order(colB, colA), grid)).toBe(false);
    });

    it("reloads for a different sort", () => {
      expect(isStoredStateApplied(sorted(colA), sorted(colB), grid)).toBe(false);
    });

    it("ignores where the grid puts columns the stored order does not mention", () => {
      expect(isStoredStateApplied(order(colA, colB), order(colA, dropped, colB), grid)).toBe(true);
    });
  });

  describe("an explicitly cleared stored state is an opinion, not silence", () => {
    it("reloads when the stored state cleared the sorting and the grid is still sorted", () => {
      expect(isStoredStateApplied({ sort: { sortModel: [] } }, sorted(colA), grid)).toBe(false);
    });

    it("reloads when the stored state shows every column and the grid still hides one", () => {
      expect(isStoredStateApplied(hidden(), hidden(colA), grid)).toBe(false);
    });
  });

  describe("treats a state the grid reported as absent or empty alike", () => {
    it("for columnVisibility", () => {
      expect(isStoredStateApplied(hidden(), { columnVisibility: undefined }, grid)).toBe(true);
    });

    it("for sort", () => {
      expect(isStoredStateApplied({ sort: { sortModel: [] } }, { sort: undefined }, grid)).toBe(
        true,
      );
    });
  });
});

describe("readGridReport", () => {
  const a = { type: "column", id: "a" as ColumnUniversalId } as const;
  const untouched = { sorting: null, hiddenColIds: null };
  const noDefaults = () => [];

  it("keeps the report as it came, to restore the grid from", () => {
    const reported = order(colB, colA);
    expect(readGridReport(reported, untouched, noDefaults).gridState).toBe(reported);
  });

  it("reads a missing sort as untouched until the user has sorted, and as cleared after", () => {
    expect(readGridReport({}, untouched, noDefaults).sorting).toBeNull();
    expect(readGridReport({}, { ...untouched, sorting: [] }, noDefaults).sorting).toEqual([]);
  });

  it("reads a missing visibility as every column shown once the user has hidden some", () => {
    expect(
      readGridReport({}, { ...untouched, hiddenColIds: [a] }, noDefaults).hiddenColIds,
    ).toEqual([]);
  });

  it("reads a missing visibility of an untouched table as the default hidden columns", () => {
    expect(readGridReport({}, untouched, () => [colA]).hiddenColIds).toEqual([a]);
    expect(readGridReport({}, untouched, noDefaults).hiddenColIds).toBeNull();
  });

  it("takes reported sorting and visibility as they are", () => {
    const reported: PlDataTableGridStateCore = {
      sort: { sortModel: [{ colId: colA, sort: "desc" }] },
      columnVisibility: { hiddenColIds: [colA] },
    };
    expect(readGridReport(reported, untouched, noDefaults)).toEqual({
      gridState: reported,
      sorting: [{ column: a, ascending: false, naAndAbsentAreLeastValues: false }],
      hiddenColIds: [a],
    });
  });
});

describe("createGridRestoreState", () => {
  const a = { type: "column", id: "a" as ColumnUniversalId } as const;

  it("spells out the sorting and hidden columns the report leaves out", () => {
    expect(
      createGridRestoreState({ gridState: order(colA), sorting: [], hiddenColIds: [] }),
    ).toEqual({ ...order(colA), sort: { sortModel: [] }, columnVisibility: { hiddenColIds: [] } });
    expect(
      createGridRestoreState({
        gridState: {},
        sorting: [{ column: a, ascending: false, naAndAbsentAreLeastValues: false }],
        hiddenColIds: [a],
      }),
    ).toEqual({ ...hidden(colA), sort: { sortModel: [{ colId: colA, sort: "desc" }] } });
  });

  it("keeps the report's own parts and adds nothing for untouched settings", () => {
    const reported = { ...order(colA), ...sorted(colB) };
    const sorting = [{ column: a, ascending: true, naAndAbsentAreLeastValues: true }];
    expect(createGridRestoreState({ gridState: reported, sorting, hiddenColIds: null })).toEqual(
      reported,
    );
  });

  it("makes a grid still sorted elsewhere drop the sorting the user cleared", () => {
    const restore = createGridRestoreState({ gridState: {}, sorting: [], hiddenColIds: null });
    expect(isStoredStateApplied(restore, sorted(colA), grid)).toBe(false);
  });
});

describe("convertAgSortingToPTableSorting", () => {
  it("takes NA and absent values as the least ones only when ascending", () => {
    const column = { type: "column", id: "a" as ColumnUniversalId } as const;
    expect(
      convertAgSortingToPTableSorting({
        sortModel: [
          { colId: colA, sort: "asc" },
          { colId: colA, sort: "desc" },
        ],
      }),
    ).toEqual([
      { column, ascending: true, naAndAbsentAreLeastValues: true },
      { column, ascending: false, naAndAbsentAreLeastValues: false },
    ]);
  });
});
