import { describe, expect, test } from "vitest";
import {
  canonicalizeJson,
  createGlobalPObjectId,
  type ColumnUniversalId,
  type PTableColumnId,
} from "@milaboratories/pl-model-common";
import {
  type PlDataTableStateV2,
  type PlDataTableStateV2V8,
  upgradeLegacyColumnId,
  upgradePlDataTableStateV2,
} from "./state-migration";
import type { PlDataTableFilters, PlTableColumnIdJson, PTableParamsV2 } from "./typesV8";

// Leaf ids as a result-pool export names them; the form did not change in the rework.
const property = createGlobalPObjectId(
  "f9212394-932e-49ff-8366-017b840d47e9",
  "pf.chain_0/property_16",
);
const clusterLabel = createGlobalPObjectId(
  "d1efe0f6-9df0-43e4-8641-2777b88a5e7c",
  "pf.clusterLabel6",
);
const linker = createGlobalPObjectId("d1efe0f6-9df0-43e4-8641-2777b88a5e7c", "pf.link3");

// Discovered ids as saved before the column-access rework: no `__isDiscovered` marker.
const legacyDirect = JSON.stringify({ column: property }) as ColumnUniversalId;
const legacyLinked = JSON.stringify({
  column: clusterLabel,
  path: [{ column: linker, type: "linker" }],
}) as ColumnUniversalId;

// The same columns as the current recipes name them: a hit reached with no linker by
// its own id, a linked one wrapped with its path.
const currentDirect = property;
const currentLinked =
  `{"__isDiscovered":true,"column":${JSON.stringify(clusterLabel)},` +
  `"path":[{"column":${JSON.stringify(linker)},"type":"linker"}]}`;

// Pre-rework anchored and filtered ids: relative to an anchor the state does not hold.
const legacyAnchored = JSON.stringify({ anchor: "main", name: "x" }) as ColumnUniversalId;
const legacyFiltered = JSON.stringify({
  source: { anchor: "main", name: "x" },
  axisFilters: [[0, "a"]],
}) as ColumnUniversalId;

const col = (id: ColumnUniversalId): PTableColumnId => ({ type: "column", id });
const colIdJson = (id: ColumnUniversalId): PlTableColumnIdJson => canonicalizeJson(col(id));
const ROW_NUMBER: PlTableColumnIdJson = canonicalizeJson(
  "##RowNumberColumnId##",
) as PlTableColumnIdJson;

function params(over: Partial<Extract<PTableParamsV2, { sourceId: string }>>): PTableParamsV2 {
  return {
    sourceId: '"static"',
    hiddenColIds: null,
    sorting: null,
    filters: null,
    defaultFilters: null,
    ...over,
  };
}

function v8(
  pTableParams: PTableParamsV2,
  gridColIds: PlTableColumnIdJson[] = [],
): PlDataTableStateV2V8 {
  return {
    version: 8,
    stateCache: [
      {
        sourceId: '"static"',
        gridState: {
          columnOrder: { orderedColIds: gridColIds },
          sort: { sortModel: gridColIds.slice(1, 2).map((colId) => ({ colId, sort: "desc" })) },
          columnVisibility: { hiddenColIds: gridColIds.slice(1) },
        },
        sheetsState: [],
        filtersState: null,
        defaultFiltersState: null,
      },
    ],
    pTableParams,
  };
}

const sortingOf = (state: PlDataTableStateV2) => {
  const p = upgradePlDataTableStateV2(state).pTableParams;
  return p.sourceId === null ? undefined : p.sorting;
};

describe("upgradeLegacyColumnId", () => {
  test("a pre-rework direct hit takes its own id", () => {
    expect(upgradeLegacyColumnId(legacyDirect)).toBe(currentDirect);
  });

  test("a pre-rework direct hit with qualifications stays wrapped", () => {
    const columnQualifications = [
      { axis: { name: "pl7.app/sampleId" }, contextDomain: { a: "b" } },
    ];
    const legacy = JSON.stringify({ column: property, columnQualifications });
    expect(upgradeLegacyColumnId(legacy)).toBe(
      `{"__isDiscovered":true,"column":${JSON.stringify(property)},` +
        `"columnQualifications":${JSON.stringify(columnQualifications)}}`,
    );
  });

  test("its linker path is carried over", () => {
    expect(upgradeLegacyColumnId(legacyLinked)).toBe(currentLinked);
  });

  test("a current id is left as it is", () => {
    expect(upgradeLegacyColumnId(currentLinked)).toBe(currentLinked);
    expect(upgradeLegacyColumnId(property)).toBe(property);
  });

  test("ids relative to an unstored anchor cannot be carried over", () => {
    expect(upgradeLegacyColumnId(legacyAnchored)).toBeUndefined();
    expect(upgradeLegacyColumnId(legacyFiltered)).toBeUndefined();
  });

  test("a string that is no id at all cannot be carried over", () => {
    expect(upgradeLegacyColumnId("not json")).toBeUndefined();
  });
});

describe("v8 -> v9", () => {
  test("the user's sorting on a pre-rework id survives", () => {
    // The state that broke the lead-selection table: sorting saved before the rework.
    const state = v8(
      params({
        sorting: [
          { column: col(legacyDirect), ascending: false, naAndAbsentAreLeastValues: false },
        ],
      }),
    );
    const upgraded = upgradePlDataTableStateV2(state);
    expect(upgraded.version).toBe(9);
    expect(sortingOf(state)).toEqual([
      {
        column: col(currentDirect as ColumnUniversalId),
        ascending: false,
        naAndAbsentAreLeastValues: false,
      },
    ]);
  });

  test("a sorting left empty by dropped entries falls back to the default", () => {
    const state = v8(
      params({
        sorting: [
          { column: col(legacyAnchored), ascending: true, naAndAbsentAreLeastValues: false },
        ],
      }),
    );
    expect(sortingOf(state)).toBeNull();
  });

  test("a sorting the user cleared stays cleared", () => {
    expect(sortingOf(v8(params({ sorting: [] })))).toEqual([]);
  });

  test("hidden columns are rewritten and unconvertible ones dropped", () => {
    const state = v8(params({ hiddenColIds: [col(legacyLinked), col(legacyFiltered)] }));
    const p = upgradePlDataTableStateV2(state).pTableParams;
    expect(p.hiddenColIds).toEqual([col(currentLinked as ColumnUniversalId)]);
  });

  test("grid column ids are rewritten, the row-number column kept", () => {
    const state = v8(params({}), [ROW_NUMBER, colIdJson(legacyDirect), colIdJson(legacyAnchored)]);
    const grid = upgradePlDataTableStateV2(state).stateCache[0].gridState;
    const expected = colIdJson(currentDirect as ColumnUniversalId);
    expect(grid.columnOrder?.orderedColIds).toEqual([ROW_NUMBER, expected]);
    expect(grid.sort?.sortModel).toEqual([{ colId: expected, sort: "desc" }]);
    expect(grid.columnVisibility?.hiddenColIds).toEqual([expected]);
  });

  test("filter leaves are rewritten; a group emptied by dropped leaves goes", () => {
    const filters: PlDataTableFilters = {
      type: "and",
      filters: [
        { type: "isNA", column: col(legacyDirect) },
        { type: "or", filters: [{ type: "isNotNA", column: col(legacyAnchored) }] },
      ],
    };
    const p = upgradePlDataTableStateV2(v8(params({ filters }))).pTableParams;
    expect(p.filters).toEqual({
      type: "and",
      filters: [{ type: "isNA", column: col(currentDirect as ColumnUniversalId) }],
    });
  });

  test("a state with current ids comes through unchanged", () => {
    const state = v8(
      params({
        hiddenColIds: [col(currentLinked as ColumnUniversalId)],
        sorting: [{ column: col(property), ascending: true, naAndAbsentAreLeastValues: false }],
      }),
      [ROW_NUMBER, colIdJson(currentDirect as ColumnUniversalId)],
    );
    const { version: _, ...rest } = upgradePlDataTableStateV2(state);
    const { version: __, ...expected } = state;
    expect(rest).toEqual(expected);
  });

  test("a fresh state is already v9", () => {
    expect(upgradePlDataTableStateV2(undefined).version).toBe(9);
  });
});
