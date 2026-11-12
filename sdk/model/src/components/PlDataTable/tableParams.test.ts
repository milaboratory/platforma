import type {
  AxisSpec,
  ColumnUniversalId,
  PColumnSpec,
  PTableColumnId,
} from "@milaboratories/pl-model-common";
import { canonicalizeJson, getAxisId } from "@milaboratories/pl-model-common";
import { describe, expect, test } from "vitest";
import { upgradePlDataTableStateV2, type PlDataTableStateV2 } from "./state-migration";
import {
  collectSearchColumns,
  createSearchFilter,
  createSheetFilters,
  isSheetFixedToOneValue,
  joinFilters,
  joinSorting,
  readPlDataTableUserParams,
  type PlDataTableFilterNode,
  type PlDataTableSearchCandidate,
} from "./tableParams";
import type {
  PlDataTableFilterSpecLeaf,
  PlDataTableFiltersWithMeta,
  PlDataTableStateV2CacheEntry,
  PlDataTableStateV2Normalized,
} from "./typesV8";

describe("readPlDataTableUserParams", () => {
  test("reads the entry the stored state points at, not the most recent one", () => {
    const params = readPlDataTableUserParams(
      state("A", [entry("A", { searchString: " needle " }), entry("B", { searchString: "other" })]),
    );
    expect(params.sourceId).toBe("A");
    expect(params.searchString).toBe("needle");
  });

  test("reports an untouched state when the pointed-at source has no entry", () => {
    expect(readPlDataTableUserParams(state("B", [entry("A", { searchString: "x" })]))).toEqual({
      sourceId: "B",
      sheetsState: [],
      userFilters: null,
      defaultFilters: null,
      searchString: null,
      sorting: null,
      hiddenColIds: null,
    });
  });

  test("drops suppressed filters and keeps an all-suppressed default group as a group", () => {
    const params = readPlDataTableUserParams(
      state("A", [
        entry("A", {
          filtersState: group([leafMeta("kept"), leafMeta("dropped", { isSuppressed: true })]),
          defaultFiltersState: group([leafMeta("d", { isSuppressed: true })]),
        }),
      ]),
    );
    expect(params.userFilters).toEqual({
      type: "and",
      filters: [{ type: "and", filters: [isNA("kept")] }],
    });
    // An empty group, not null: null would bring the block's defaults back.
    expect(params.defaultFilters).toEqual({ type: "and", filters: [] });
  });

  test("reads sorting and hidden columns from the entry, never from the grid state", () => {
    const column: PTableColumnId = { type: "column", id: col("c1") };
    const sorting = [{ column, ascending: false, naAndAbsentAreLeastValues: false }];
    const params = readPlDataTableUserParams(
      state("A", [
        entry("A", {
          gridState: { sort: { sortModel: [{ colId: canonicalizeJson(column), sort: "asc" }] } },
          sorting,
          hiddenColIds: [column],
        }),
      ]),
    );
    expect(params.sorting).toEqual(sorting);
    expect(params.hiddenColIds).toEqual([column]);
  });
});

describe("upgradePlDataTableStateV2", () => {
  const column: PTableColumnId = { type: "column", id: col("c1") };
  const sorting = [{ column, ascending: true, naAndAbsentAreLeastValues: true }];

  test("moves the sorting and hidden columns earlier versions kept in pTableParams into the shown entry", () => {
    const { sorting: _a, hiddenColIds: _b, ...legacyA } = entry("A");
    const { sorting: _c, hiddenColIds: _d, ...legacyB } = entry("B");
    const upgraded = upgradePlDataTableStateV2(
      stored({
        version: 9,
        stateCache: [legacyA, legacyB],
        pTableParams: { ...nullParams("A"), sorting, hiddenColIds: [column] },
      }),
    );
    expect(upgraded.pTableParams).toEqual(nullParams("A"));
    expect(upgraded.stateCache).toEqual([
      entry("A", { sorting, hiddenColIds: [column] }),
      entry("B"),
    ]);
  });

  test("keeps an entry's own untouched sorting rather than the legacy one", () => {
    const upgraded = upgradePlDataTableStateV2(
      stored({
        version: 9,
        stateCache: [entry("A")],
        pTableParams: { ...nullParams("A"), sorting },
      }),
    );
    expect(upgraded.stateCache[0].sorting).toBeNull();
  });
});

describe("createSheetFilters", () => {
  test("selects the picked value on each sheet axis", () => {
    const sampleAxis = getAxisId(axis("sample"));
    const roundAxis = getAxisId(axis("round", "Int"));
    expect(
      createSheetFilters([
        { axisId: sampleAxis, value: "s1" },
        { axisId: roundAxis, value: 3 },
      ]),
    ).toEqual([
      { type: "patternEquals", column: { type: "axis", id: sampleAxis }, value: "s1" },
      { type: "equal", column: { type: "axis", id: roundAxis }, x: 3 },
    ]);
  });

  test("selects the values picked on a sheet showing several", () => {
    const column: PTableColumnId = { type: "axis", id: getAxisId(axis("sample")) };
    expect(createSheetFilters([{ axisId: column.id, values: ["s1", "s2", 3] }])).toEqual([
      {
        type: "or",
        filters: [
          { type: "inSet", column, value: ["s1", "s2"] },
          { type: "equal", column, x: 3 },
        ],
      },
    ]);
    expect(createSheetFilters([{ axisId: column.id, values: ["s1"] }])).toEqual([
      { type: "inSet", column, value: ["s1"] },
    ]);
  });

  test("filters nothing for a sheet taking all values or with none picked", () => {
    const column: PTableColumnId = { type: "axis", id: getAxisId(axis("sample")) };
    expect(createSheetFilters([{ axisId: column.id, allValues: true }])).toEqual([]);
    expect(createSheetFilters([{ axisId: column.id, values: [] }])).toEqual([]);
  });
});

describe("isSheetFixedToOneValue", () => {
  const axisId = getAxisId(axis("sample"));

  test("holds for a single value, also picked on a sheet showing several", () => {
    expect(isSheetFixedToOneValue({ axisId, value: "s1" })).toBe(true);
    expect(isSheetFixedToOneValue({ axisId, values: ["s1"] })).toBe(true);
  });

  test("does not hold for several values or all of them", () => {
    expect(isSheetFixedToOneValue({ axisId, values: ["s1", "s2"] })).toBe(false);
    expect(isSheetFixedToOneValue({ axisId, allValues: true })).toBe(false);
  });
});

describe("joinSorting", () => {
  const sample: PTableColumnId = { type: "axis", id: getAxisId(axis("sample")) };
  const count: PTableColumnId = { type: "column", id: col("count") };

  test("puts the fixed sorting first and drops the rest's entries on its columns", () => {
    expect(
      joinSorting(
        [{ column: sample, ascending: true, naAndAbsentAreLeastValues: true }],
        [
          { column: count, ascending: false, naAndAbsentAreLeastValues: false },
          { column: sample, ascending: false, naAndAbsentAreLeastValues: false },
        ],
      ),
    ).toEqual([
      { column: sample, ascending: true, naAndAbsentAreLeastValues: true },
      { column: count, ascending: false, naAndAbsentAreLeastValues: false },
    ]);
  });
});

describe("collectSearchColumns", () => {
  const sample = axis("sample");
  const clone = axis("clone");
  const columns: PlDataTableSearchCandidate[] = [
    candidate("label", { name: "pl7.app/label", axesSpec: [clone], valueType: "String" }),
    candidate("count", { axesSpec: [sample, clone], valueType: "Int" }),
    candidate("extra", { axesSpec: [sample, clone], valueType: "String" }, "optional"),
    candidate("secret", { axesSpec: [sample, clone], valueType: "String" }, "hidden"),
  ];

  test("searches visible columns, skipping sheet axes and optional columns", () => {
    const found = collectSearchColumns({
      columns,
      isAxisHidden: () => false,
      sheetAxes: [getAxisId(sample)],
      hiddenColIds: null,
    }).map((c) => c.id);
    expect(found).toEqual([
      { type: "column", id: col("label") },
      { type: "column", id: col("count") },
    ]);
  });

  test("searches the label column instead of the axis it names", () => {
    const found = collectSearchColumns({
      columns,
      isAxisHidden: () => false,
      sheetAxes: [],
      hiddenColIds: null,
    }).map((c) => c.id);
    expect(found).toContainEqual({ type: "axis", id: getAxisId(sample) });
    expect(found).toContainEqual({ type: "column", id: col("label") });
    expect(found).not.toContainEqual({ type: "axis", id: getAxisId(clone) });
  });

  test("skips the label column of an axis a sheet fixes to one value", () => {
    const found = collectSearchColumns({
      columns,
      isAxisHidden: () => false,
      sheetAxes: [getAxisId(clone)],
      hiddenColIds: null,
    }).map((c) => c.id);
    expect(found).toEqual([
      { type: "axis", id: getAxisId(sample) },
      { type: "column", id: col("count") },
    ]);
  });

  test("follows the user's hidden list instead of the optional defaults", () => {
    const found = collectSearchColumns({
      columns,
      isAxisHidden: () => false,
      sheetAxes: [],
      hiddenColIds: [{ type: "column", id: col("count") }],
    }).map((c) => c.id);
    expect(found).toEqual([
      { type: "axis", id: getAxisId(sample) },
      { type: "column", id: col("label") },
      { type: "column", id: col("extra") },
    ]);
  });
});

describe("createSearchFilter", () => {
  const text = { id: { type: "column", id: col("t") }, valueType: "String" } as const;
  const number = { id: { type: "column", id: col("n") }, valueType: "Int" } as const;

  test("matches text exactly in text columns, and numbers in numeric ones", () => {
    expect(createSearchFilter("42", [text, number])).toEqual({
      type: "or",
      filters: [
        { type: "patternEquals", column: text.id, value: "42" },
        { type: "equal", column: number.id, x: 42 },
      ],
    });
  });

  test("skips numeric columns for text that is not a number", () => {
    expect(createSearchFilter("abc", [number])).toBeNull();
  });

  test("is no filter without search text", () => {
    expect(createSearchFilter(null, [text])).toBeNull();
  });
});

describe("joinFilters", () => {
  test("is no filter when nothing is given", () => {
    expect(joinFilters([null, undefined])).toBeNull();
  });

  test("merges AND groups and keeps other nodes as single operands", () => {
    const or: PlDataTableFilterNode = { type: "or", filters: [isNA("o1"), isNA("o2")] };
    const not: PlDataTableFilterNode = { type: "not", filter: isNA("n") };
    expect(
      joinFilters([{ type: "and", filters: [isNA("a1"), isNA("a2")] }, isNA("leaf"), or, not]),
    ).toEqual({ type: "and", filters: [isNA("a1"), isNA("a2"), isNA("leaf"), or, not] });
  });

  test("an empty AND group contributes nothing", () => {
    expect(joinFilters([{ type: "and", filters: [] }, isNA("x")])).toEqual({
      type: "and",
      filters: [isNA("x")],
    });
  });
});

// Fixtures

function col(id: string): ColumnUniversalId {
  return id as ColumnUniversalId;
}

function axis(name: string, type: AxisSpec["type"] = "String"): AxisSpec {
  return { name, type };
}

function candidate(
  id: string,
  spec: Pick<PColumnSpec, "axesSpec" | "valueType"> & { name?: string },
  visibility: PlDataTableSearchCandidate["visibility"] = "default",
): PlDataTableSearchCandidate {
  return {
    id: col(id),
    spec: { kind: "PColumn", name: spec.name ?? id, ...spec },
    visibility,
  };
}

function isNA(id: string): PlDataTableFilterSpecLeaf {
  return { type: "isNA", column: { type: "column", id: col(id) } };
}

function leafMeta(id: string, meta: { isSuppressed?: boolean } = {}) {
  return { ...isNA(id), id: id.length, ...meta };
}

function group(
  filters: ReturnType<typeof leafMeta>[],
): NonNullable<PlDataTableStateV2CacheEntry["filtersState"]> {
  const inner: PlDataTableFiltersWithMeta = { id: 1, type: "and", filters };
  return { id: 0, type: "and", filters: [inner] };
}

function nullParams(sourceId: null | string): PlDataTableStateV2Normalized["pTableParams"] {
  return { sourceId, hiddenColIds: null, sorting: null, filters: null, defaultFilters: null };
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
  return { version: 9, stateCache, pTableParams: nullParams(sourceId) };
}

/** A state as it comes out of storage, in a shape the current types may no longer describe. */
function stored(value: unknown): PlDataTableStateV2 {
  return JSON.parse(JSON.stringify(value));
}
