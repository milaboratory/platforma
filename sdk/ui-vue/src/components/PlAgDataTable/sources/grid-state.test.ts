import { describe, expect, it } from "vitest";
import type { PlDataTableGridStateCore, PlTableColumnIdJson } from "@platforma-sdk/model";
import { isStoredStateApplied } from "./grid-state";

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
