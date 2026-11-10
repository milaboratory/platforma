import type {
  AxisSpec,
  ColumnUniversalId,
  PColumnSpec,
  PTableColumnId,
} from "@milaboratories/pl-model-common";
import { canonicalizeJson, getAxisId } from "@milaboratories/pl-model-common";
import { describe, expect, test } from "vitest";
import { upgradePlDataTableStateV2 } from "./state-migration";
import {
  collectSearchColumns,
  convertAgSortingToPTableSorting,
  createSearchFilter,
  createSheetFilters,
  joinFilters,
  readPlDataTableSheetsState,
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

  test("reads sorting and hidden columns from the grid state", () => {
    const column: PTableColumnId = { type: "column", id: col("c1") };
    const params = readPlDataTableUserParams(
      state("A", [
        entry("A", {
          gridState: {
            sort: { sortModel: [{ colId: canonicalizeJson(column), sort: "desc" }] },
            columnVisibility: { hiddenColIds: [canonicalizeJson(column)] },
          },
        }),
      ]),
    );
    expect(params.sorting).toEqual([
      { column, ascending: false, naAndAbsentAreLeastValues: false },
    ]);
    expect(params.hiddenColIds).toEqual([column]);
  });
});

describe("convertAgSortingToPTableSorting", () => {
  test("an absent sort state is untouched, so the model keeps its default sorting", () => {
    expect(convertAgSortingToPTableSorting(undefined)).toBeNull();
  });

  test("an empty sort model is explicitly cleared, which suppresses the default", () => {
    expect(convertAgSortingToPTableSorting({ sortModel: [] })).toEqual([]);
  });
});

describe("readPlDataTableSheetsState", () => {
  test("returns the sheet values of the pointed-at source", () => {
    const sheetsState = [{ axisId: getAxisId(axis("sample")), value: "s2" }];
    expect(
      readPlDataTableSheetsState(
        state("A", [entry("A", { sheetsState }), entry("B", { sheetsState: [] })]),
      ),
    ).toEqual(sheetsState);
  });

  test("returns nothing for a table that has never been shown", () => {
    expect(readPlDataTableSheetsState(undefined)).toEqual([]);
  });
});

describe("upgradePlDataTableStateV2", () => {
  test("keeps only the pointer of what earlier SDK versions stored in pTableParams", () => {
    const legacy = {
      version: 8 as const,
      stateCache: [],
      pTableParams: { ...nullParams("A"), sorting: [] },
    };
    // A legacy value the current types no longer allow; the parser must clear it.
    expect(upgradePlDataTableStateV2(legacy as PlDataTableStateV2Normalized).pTableParams).toEqual(
      nullParams("A"),
    );
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

  test("searches shown columns and axes, skipping labeled, sheet and optional ones", () => {
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
  return { version: 8, stateCache, pTableParams: nullParams(sourceId) };
}
