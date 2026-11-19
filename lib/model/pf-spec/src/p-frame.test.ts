import type { PColumnSpec, PObjectId } from "@milaboratories/pl-model-common";
import { expect, test } from "vitest";
import { buildQuery, rewriteLegacyFilters } from "./index.ts";
import { PFrame } from "./p-frame.ts";

const column1Spec: PColumnSpec = {
  kind: "PColumn",
  name: "column1",
  valueType: "Int",
  axesSpec: [{ type: "Int", name: "a1" }],
};

const column2Spec: PColumnSpec = {
  kind: "PColumn",
  name: "column2",
  valueType: "Int",
  axesSpec: [{ type: "Int", name: "a1" }],
};

test("findColumns", () => {
  using pframe = new PFrame({ column1: column1Spec });

  const response = pframe.findColumns({
    columnFilter: {},
    compatibleWith: [],
    strictlyCompatible: false,
  });

  expect(response).toEqual({
    hits: [
      {
        hit: { columnId: "column1", spec: column1Spec },
        mappingVariants: [],
      },
    ],
  });
});

test("discoverColumns", () => {
  using pframe = new PFrame({
    column1: column1Spec,
    column2: column2Spec,
  });

  const request = {
    axes: [],
    includeColumns: [],
    constraints: {
      allowFloatingSourceAxes: true,
      allowFloatingHitAxes: true,
      allowSourceQualifications: true,
      allowHitQualifications: true,
    },
  };

  const response = pframe.discoverColumns(request);

  expect(response).toEqual({
    hits: [
      {
        hit: { columnId: "column1", spec: column1Spec },
        mappingVariants: [],
        path: [],
      },
      {
        hit: { columnId: "column2", spec: column2Spec },
        mappingVariants: [],
        path: [],
      },
    ],
  });
});

test("deleteColumns", () => {
  using pframe = new PFrame({});

  const response = pframe.deleteColumns({
    columns: [
      { axesSpec: [{ type: "Int", name: "a1" }], qualifications: [] },
      {
        axesSpec: [
          { type: "Int", name: "a1" },
          { type: "Int", name: "a2" },
        ],
        qualifications: [],
      },
    ],
    delete: 1,
  });

  expect(response).toEqual({
    columns: [{ axesSpec: [{ type: "Int", name: "a1" }], qualifications: [] }],
  });
});

test("evaluateQuery", () => {
  using pframe = new PFrame({ column1: column1Spec });

  const response = pframe.evaluateQuery({
    type: "column",
    column: "column1" as PObjectId,
  });

  expect(response.tableSpec).toEqual([
    {
      type: "axis",
      id: { name: "a1", type: "Int" },
      spec: { name: "a1", type: "Int" },
    },
    {
      type: "column",
      id: "column1",
      spec: column1Spec,
    },
  ]);
  expect(response.dataQuery).toEqual({
    type: "column",
    column: "column1",
  });
});

test("listColumns", () => {
  using pframe = new PFrame({
    column1: column1Spec,
    column2: column2Spec,
  });

  const columns = pframe.listColumns();

  expect(columns).toEqual([
    { columnId: "column1", spec: column1Spec },
    { columnId: "column2", spec: column2Spec },
  ]);
});

test("getColumn", () => {
  using pframe = new PFrame({
    column1: column1Spec,
    column2: column2Spec,
  });

  expect(pframe.getColumn("column1" as PObjectId)).toEqual({
    columnId: "column1",
    spec: column1Spec,
  });
  expect(pframe.getColumn("missing" as PObjectId)).toBeNull();
});

test("buildQuery (top-level, no frame needed)", () => {
  const columnId = "c1" as PObjectId;

  const entry = buildQuery({ version: "v1", column: columnId });

  expect(entry.entry).toEqual({ type: "column", column: columnId });
});

test("discoverColumns: parallel linkers with cd-disambiguated one-side axes yield 4 variants", () => {
  // This test mirrors case 42 in pframes-rs-spec. Two sibling linkers each
  // expose two `a2` axes on the one-side, and a context domain makes the two
  // axes different. A hit with an `a2` axis that has no context domain
  // matches both axes. Therefore there are 2 paths x 2 context domain
  // choices, and the result has 4 variants.
  const linkerAxes = [
    { type: "Int", name: "a3" },
    { type: "Int", name: "a2", parentAxes: [0], contextDomain: { d: "1" } },
    { type: "Int", name: "a2", parentAxes: [0], contextDomain: { d: "2" } },
    { type: "Int", name: "a1" },
  ];
  const lClosest: PColumnSpec = {
    kind: "PColumn",
    name: "linker",
    valueType: "Int",
    axesSpec: linkerAxes,
    domain: { algo: "closest" },
    annotations: { "pl7.app/isLinkerColumn": "true" },
  } as PColumnSpec;
  const lFuel: PColumnSpec = {
    kind: "PColumn",
    name: "linker",
    valueType: "Int",
    axesSpec: linkerAxes,
    domain: { algo: "fuelOpt" },
    annotations: { "pl7.app/isLinkerColumn": "true" },
  } as PColumnSpec;
  const hitSpec: PColumnSpec = {
    kind: "PColumn",
    name: "hit",
    valueType: "Int",
    axesSpec: [
      { type: "Int", name: "a3" },
      { type: "Int", name: "a2", parentAxes: [0] },
    ],
  };

  using pframe = new PFrame({
    l_closest: lClosest,
    l_fuel: lFuel,
    hit: hitSpec,
  });

  const response = pframe.discoverColumns({
    axes: [{ axesSpec: [{ type: "Int", name: "a1" }], qualifications: [] }],
    maxHops: 1,
    constraints: {
      allowFloatingSourceAxes: true,
      allowFloatingHitAxes: false,
      allowSourceQualifications: false,
      allowHitQualifications: true,
    },
  });

  expect(response.hits).toHaveLength(2);
  const paths = response.hits
    .map((h) => h.path.map((s) => (s.type === "linker" ? s.linker.columnId : s.filter.columnId)))
    .sort();
  expect(paths).toEqual([["l_closest"], ["l_fuel"]]);
  for (const hit of response.hits) {
    expect(hit.hit.columnId).toBe("hit");
    expect(hit.mappingVariants).toHaveLength(2);
    const cdValues = hit.mappingVariants
      .map((v) => v.qualifications.forHit[0]?.contextDomain?.d)
      .sort();
    expect(cdValues).toEqual(["1", "2"]);
  }
});

test("rewriteLegacyQuery", () => {
  using pframe = new PFrame({ column1: column1Spec });

  const response = pframe.rewriteLegacyQuery({
    src: { type: "column", column: "column1" as PObjectId },
    filters: [],
  });

  expect(response).toEqual({
    type: "column",
    column: "column1",
  });
});

test("rewriteLegacyFilters", () => {
  const response = rewriteLegacyFilters({
    tableSpec: [
      { type: "axis", id: { type: "Int", name: "a1" }, spec: { type: "Int", name: "a1" } },
      { type: "column", id: "column1" as PObjectId, spec: column1Spec },
    ],
    filters: [
      {
        type: "bySingleColumnV2",
        column: { type: "column", id: "column1" as PObjectId },
        predicate: { operator: "Equal", reference: 30 },
      },
    ],
  });

  // Selectors resolve to indices. The column value is `columnRef` 0.
  expect(response).toEqual([
    {
      type: "numericComparison",
      operand: "eq",
      left: { type: "columnRef", value: 0 },
      right: { type: "constant", value: 30 },
    },
  ]);
});
