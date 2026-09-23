import { describe, expect, it } from "vitest";
import type { PlDataTableGridStateCore, PlTableColumnIdJson } from "@platforma-sdk/model";
import { storedStateApplied } from "./grid-state";

const colA = '{"id":"a","type":"column"}' as PlTableColumnIdJson;
const colB = '{"id":"b","type":"column"}' as PlTableColumnIdJson;

const order = (...ids: PlTableColumnIdJson[]): PlDataTableGridStateCore => ({
  columnOrder: { orderedColIds: ids },
});
const hidden = (...ids: PlTableColumnIdJson[]): PlDataTableGridStateCore => ({
  columnVisibility: { hiddenColIds: ids },
});

describe("storedStateApplied", () => {
  it("ignores a field the stored state says nothing about", () => {
    // The state a table ends up with in the wild: hidden columns were recorded,
    // the column order never was. AG Grid always reports an order once it has
    // columns, so treating that as a disagreement asks it to unreport the
    // order — which no remount can do, and the grid was rebuilt forever.
    expect(storedStateApplied(hidden(colA), { ...hidden(colA), ...order(colA, colB) })).toBe(true);
  });

  it("still reloads for a field the stored state does express", () => {
    expect(storedStateApplied(hidden(colA), hidden(colB))).toBe(false);
    expect(storedStateApplied(order(colA, colB), order(colB, colA))).toBe(false);
  });

  it("treats an absent and an empty columnVisibility / sort as the same", () => {
    expect(storedStateApplied(hidden(), { columnVisibility: undefined })).toBe(true);
    expect(storedStateApplied({ sort: { sortModel: [] } }, { sort: undefined })).toBe(true);
  });

  it("asks for nothing when the stored state is empty", () => {
    expect(storedStateApplied({}, order(colA))).toBe(true);
  });
});
