import {
  createPlDataTableStateV2,
  getAxisId,
  type AxisSpec,
  type PlDataTableSheet,
  type PlDataTableStateV2,
  type PlDataTableStateV2CacheEntry,
  type PlDataTableStateV2Normalized,
  upgradePlDataTableStateV2,
} from "@platforma-sdk/model";
import { describe, expect, it } from "vitest";
import { effectScope, nextTick, shallowRef } from "vue";
import type { PlDataTableSettingsV2 } from "../types";
import { reduceTableState, resolveSheetsState, useTableState } from "./table-state-v2";

describe("reduceTableState", () => {
  it("points the stored state at the source on screen, even with nothing edited", () => {
    const stored = state("A", [entry("A", { searchString: "a" })]);
    const next = reduceTableState(stored, target("B"), []);
    expect(next.pTableParams.sourceId).toBe("B");
    expect(next.stateCache.map((e) => e.sourceId)).toEqual(["A", "B"]);
    expect(next.stateCache[0].searchString).toBe("a");
  });

  it("leaves a stored state that already describes the source on screen as it is", () => {
    const stored = reduceTableState(state("A", []), target("A"), []);
    expect(reduceTableState(stored, target("A"), [])).toEqual(stored);
  });

  it("moves a source the user returns to to the recent end of the cache", () => {
    const stored = state("B", [entry("A"), entry("B")]);
    expect(reduceTableState(stored, target("A"), []).stateCache.map((e) => e.sourceId)).toEqual([
      "B",
      "A",
    ]);
  });

  it("applies an edit to the source it was made on, not to the one now on screen", () => {
    const stored = state("A", [entry("A")]);
    const next = reduceTableState(stored, target("B"), [
      { sourceId: "A", patch: { searchString: "late" } },
    ]);
    expect(next.pTableParams.sourceId).toBe("B");
    expect(next.stateCache.find((e) => e.sourceId === "A")?.searchString).toBe("late");
    expect(next.stateCache.find((e) => e.sourceId === "B")?.searchString).toBeUndefined();
  });

  it("keeps five sources", () => {
    const stored = state(
      "E",
      ["A", "B", "C", "D", "E"].map((id) => entry(id)),
    );
    expect(reduceTableState(stored, target("F"), []).stateCache.map((e) => e.sourceId)).toEqual([
      "B",
      "C",
      "D",
      "E",
      "F",
    ]);
  });

  it("does not touch the stored state while no source is on screen", () => {
    const stored = state("A", [entry("A")]);
    expect(reduceTableState(stored, null, [])).toBe(stored);
  });
});

describe("resolveSheetsState", () => {
  const sheet: PlDataTableSheet = {
    axis: axis("sample"),
    options: [
      { label: "S1", value: "s1" },
      { label: "S2", value: "s2" },
    ],
    defaultValue: "s2",
  };
  const axisId = getAxisId(axis("sample"));

  it("keeps a saved value the sheet still offers", () => {
    expect(resolveSheetsState([sheet], [{ axisId, value: "s1" }])).toEqual([
      { axisId, value: "s1" },
    ]);
  });

  it("falls back to the sheet's default, then to its first option", () => {
    expect(resolveSheetsState([sheet], [{ axisId, value: "gone" }])).toEqual([
      { axisId, value: "s2" },
    ]);
    expect(resolveSheetsState([{ ...sheet, defaultValue: "gone" }], [])).toEqual([
      { axisId, value: "s1" },
    ]);
  });

  it("gives a sheet without options no entry", () => {
    expect(resolveSheetsState([{ ...sheet, options: [] }], [])).toEqual([]);
  });
});

describe("useTableState", () => {
  it("writes the source on screen when mounted on one the stored state does not point at", async () => {
    const { tableState, stop } = setup(state("A", [entry("A")]), settings("B"));
    await nextTick();
    expect(normalized(tableState.value).pTableParams.sourceId).toBe("B");
    stop();
  });

  it("keeps an edit while the platform pushes back the state from before it", async () => {
    const before = reduceTableState(state("A", [entry("A")]), target("A"), []);
    const { tableState, table, stop } = setup(before, settings("A"));
    await nextTick();

    table.searchString.value = "needle";
    expect(normalized(tableState.value).stateCache[0].searchString).toBe("needle");

    // The platform re-pushes the project state, which does not have the edit yet.
    tableState.value = before;
    await nextTick();
    expect(table.searchString.value).toBe("needle");
    expect(normalized(tableState.value).stateCache[0].searchString).toBe("needle");
    stop();
  });

  it("stores a grid report under the source the grid was built for", async () => {
    const { tableState, table, stop } = setup(state("A", [entry("A")]), settings("B"));
    await nextTick();
    table.updateGrid("A", {
      gridState: { sort: { sortModel: [] } },
      sorting: [],
      hiddenColIds: null,
    });
    const stored = normalized(tableState.value);
    expect(stored.stateCache.find((e) => e.sourceId === "A")).toMatchObject({
      gridState: { sort: { sortModel: [] } },
      sorting: [],
    });
    expect(stored.stateCache.find((e) => e.sourceId === "B")).toMatchObject({
      gridState: {},
      sorting: null,
    });
    stop();
  });
});

// Fixtures

function axis(name: string): AxisSpec {
  return { name, type: "String" };
}

function target(sourceId: string) {
  return { sourceId, sheets: [] };
}

function settings(sourceId: string): PlDataTableSettingsV2 {
  return { sourceId, sheets: [], model: undefined, pending: false };
}

function entry(
  sourceId: string,
  fields: Partial<Omit<PlDataTableStateV2CacheEntry, "sourceId">> = {},
): PlDataTableStateV2CacheEntry {
  return {
    sourceId,
    gridState: {},
    sorting: null,
    hiddenColIds: null,
    sheetsState: [],
    filtersState: null,
    defaultFiltersState: null,
    ...fields,
  };
}

function state(
  sourceId: null | string,
  stateCache: PlDataTableStateV2CacheEntry[],
): PlDataTableStateV2Normalized {
  const empty = createPlDataTableStateV2();
  return { ...empty, stateCache, pTableParams: { ...empty.pTableParams, sourceId } };
}

function normalized(value: PlDataTableStateV2): PlDataTableStateV2Normalized {
  if (!("version" in value) || value.version !== 9) throw new Error("expected a v9 state");
  return upgradePlDataTableStateV2(value);
}

function setup(initial: PlDataTableStateV2Normalized, current: PlDataTableSettingsV2) {
  const tableState = shallowRef<PlDataTableStateV2>(initial);
  const scope = effectScope();
  const table = scope.run(() =>
    useTableState(tableState, shallowRef(current), shallowRef(undefined)),
  );
  if (table === undefined) throw new Error("effect scope did not run");
  return { tableState, table, stop: () => scope.stop() };
}
