import { describe, expect, test } from "vitest";
import type { PObjectId, PTableColumnId } from "@milaboratories/pl-model-common";
import { createPlDataTableStateV2, upgradePlDataTableStateV2 } from "./state-migration";
import type {
  PlDataTableStateV2CacheEntry,
  PlDataTableStateV2V7,
  PlTableColumnIdJson,
} from "./typesV7";
import type { PlDataTableStateV2V6, PlDataTableV6ColIdJson } from "./typesV6";

const jsonId = (s: string): PlTableColumnIdJson => s as PlTableColumnIdJson;
const colRef = (s: string): PTableColumnId =>
  ({ type: "column", id: s as PObjectId }) as PTableColumnId;
const v6ColId = (id: string): PlDataTableV6ColIdJson =>
  `{"id":"${id}","type":"column"}` as PlDataTableV6ColIdJson;

function v7CacheEntry(
  sourceId: string,
  hiddenColIds: PlTableColumnIdJson[],
): PlDataTableStateV2CacheEntry {
  return {
    sourceId,
    // v7 stored the ABSOLUTE hidden set here.
    gridState: { columnVisibility: { hiddenColIds } },
    sheetsState: [],
    filtersState: null,
    defaultFiltersState: null,
  };
}

describe("upgradePlDataTableStateV2 — v7 to v8 column visibility", () => {
  test("fresh and empty state is created at the latest version (8)", () => {
    expect(createPlDataTableStateV2().version).toBe(8);
    expect(upgradePlDataTableStateV2(undefined).version).toBe(8);
  });

  // MILAB-6002: the v7 absolute hidden set can't be converted to deviations without
  // per-column defaults, so it is reset once; block defaults then reapply cleanly.
  test("resets the v7 absolute hidden set (grid state and derived params)", () => {
    const v7: PlDataTableStateV2V7 = {
      version: 7,
      stateCache: [v7CacheEntry("src1", [jsonId("a"), jsonId("b")])],
      pTableParams: {
        sourceId: "src1",
        hiddenColIds: [colRef("a"), colRef("b")],
        sorting: [],
        filters: null,
        defaultFilters: null,
      },
    };

    const out = upgradePlDataTableStateV2(v7);

    expect(out.version).toBe(8);
    expect(out.stateCache[0].gridState.columnVisibility).toBeUndefined();
    expect(out.pTableParams.hiddenColIds).toBeNull();
    expect(out.pTableParams.shownColIds).toBeNull();
    // non-visibility cache fields are preserved through the reset
    expect(out.stateCache[0].sourceId).toBe("src1");
  });

  test("null-sourceId params survive the v7->v8 reset unchanged", () => {
    const v7: PlDataTableStateV2V7 = {
      version: 7,
      stateCache: [],
      pTableParams: {
        sourceId: null,
        hiddenColIds: null,
        sorting: [],
        filters: null,
        defaultFilters: null,
      },
    };

    const out = upgradePlDataTableStateV2(v7);

    expect(out.version).toBe(8);
    expect(out.pTableParams.sourceId).toBeNull();
  });

  // The reset is keyed off pTableParams.sourceId, not a cache lookup — a sourceId with no
  // matching cache entry must still reset cleanly (params nulled, all cache visibility wiped).
  test("v7 sourceId with no matching cache entry still resets cleanly", () => {
    const v7: PlDataTableStateV2V7 = {
      version: 7,
      stateCache: [v7CacheEntry("other-source", [jsonId("a")])],
      pTableParams: {
        sourceId: "src1", // no cache entry for src1
        hiddenColIds: [colRef("a")],
        sorting: [],
        filters: null,
        defaultFilters: null,
      },
    };

    const out = upgradePlDataTableStateV2(v7);

    expect(out.version).toBe(8);
    expect(out.pTableParams.hiddenColIds).toBeNull();
    expect(out.pTableParams.shownColIds).toBeNull();
    expect(out.stateCache[0].gridState.columnVisibility).toBeUndefined();
  });

  // Full chain: a real upgrade enters at the persisted version and runs every migration
  // in sequence. v6 (PTableColumnSpec colIds) -> v7 (PTableColumnId colIds) -> v8 (reset).
  test("migrates a v6 state through v7 to v8, resetting column visibility", () => {
    const v6: PlDataTableStateV2V6 = {
      version: 6,
      stateCache: [
        {
          sourceId: "src1",
          gridState: { columnVisibility: { hiddenColIds: [v6ColId("a"), v6ColId("b")] } },
          sheetsState: [],
          filtersState: null,
          defaultFiltersState: null,
        },
      ],
      pTableParams: {
        sourceId: "src1",
        hiddenColIds: [colRef("a"), colRef("b")],
        shownColIds: null,
        sorting: [],
        filters: null,
        defaultFilters: null,
      },
    };

    const out = upgradePlDataTableStateV2(v6);

    expect(out.version).toBe(8);
    expect(out.stateCache[0].sourceId).toBe("src1");
    expect(out.stateCache[0].gridState.columnVisibility).toBeUndefined();
    expect(out.pTableParams.hiddenColIds).toBeNull();
    expect(out.pTableParams.shownColIds).toBeNull();
  });
});
