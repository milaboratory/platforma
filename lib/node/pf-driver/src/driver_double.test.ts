import {
  pTableValue,
  canonicalizeJson,
  filterSpecToExpr,
  type CalculateTableDataResponse,
  type PFrameDriver,
  type PObjectId,
  type PTableColumnId,
  type SpecQuery,
  type SpecQueryExpression,
  SpecQueryBooleanExpression,
} from "@platforma-sdk/model";
import { readJson, PFrameInternal } from "@milaboratories/pl-model-middle-layer";
import { test } from "vitest";
import { join } from "node:path";
import { createPFrameDriverDouble, makeFolderPath } from "./driver_double";

test("inline column support", async ({ expect }) => {
  // Model context

  await using driver = await createPFrameDriverDouble({});
  using pFrame = driver.createPFrame([
    {
      id: "column1" as PObjectId,
      spec: {
        kind: "PColumn",
        axesSpec: [
          {
            name: "axis1",
            type: "String",
          },
        ],
        name: "column1",
        valueType: "Int",
      },
      data: [
        {
          key: ["axis1"],
          val: 1,
        },
      ],
    },
  ]);

  // UI context

  const uiDriver: PFrameDriver = driver;
  const pFrameHandle = pFrame.key;

  const data = await uiDriver.calculateTableData(pFrameHandle, {
    src: {
      type: "column",
      column: "column1" as PObjectId,
    },
    filters: [],
    sorting: [],
  });

  expect(data).toEqual([
    {
      spec: {
        type: "axis",
        id: {
          name: "axis1",
          type: "String",
        },
        spec: {
          name: "axis1",
          type: "String",
        },
      },
      data: {
        type: "String",
        data: ["axis1"],
        isNA: new Uint8Array(),
        absent: new Uint8Array(),
      },
    },
    {
      spec: {
        type: "column",
        id: "column1" as PObjectId,
        spec: {
          kind: "PColumn",
          axesSpec: [
            {
              name: "axis1",
              type: "String",
            },
          ],
          name: "column1",
          valueType: "Int",
        },
      },
      data: {
        type: "Int",
        data: new Int32Array([1]),
        isNA: new Uint8Array(),
        absent: new Uint8Array(),
      },
    },
  ] satisfies CalculateTableDataResponse);
});

test.for([{ testCase: "01_json" }, { testCase: "02_binary" }, { testCase: "03_parquet" }])(
  `stored column support - $testCase`,
  async ({ testCase }, { expect }) => {
    const dataFolder = makeFolderPath(join(__dirname, "..", "assets", testCase));

    // Model context

    await using driver = await createPFrameDriverDouble({ dataFolder });
    const pFrame = driver.createPFrame([
      {
        id: "column" as PObjectId,
        spec: await readJson(join(dataFolder, `column${PFrameInternal.SpecExtension}`)),
        data: await readJson(join(dataFolder, `column${PFrameInternal.DataInfoExtension}`)),
      },
    ]);

    // UI context

    const uiDriver: PFrameDriver = driver;
    const pFrameHandle = pFrame.key;

    const data = await uiDriver.calculateTableData(pFrameHandle, {
      src: {
        type: "column",
        column: "column" as PObjectId,
      },
      filters: [],
      sorting: [],
    });
    const result = {
      spec: data.map((d) => d.spec),
      data: data
        .map((d) => d.data)
        .map((d) =>
          [...d.data.keys()].map((i) =>
            pTableValue(d, i, {
              absent: "|~|",
              na: null,
            }),
          ),
        ),
    };
    const expected = await readJson(join(dataFolder, "response.json"));
    expect(result).toEqual(expected);
  },
);

test("createTableV2 support", async ({ expect }) => {
  await using driver = await createPFrameDriverDouble({});

  const columnId = "column1" as PObjectId;
  const columnSpec = {
    kind: "PColumn" as const,
    axesSpec: [
      {
        name: "axis1",
        type: "String" as const,
      },
    ],
    name: "column1",
    valueType: "Int" as const,
  };

  const axisColumnStr = canonicalizeJson<PTableColumnId>({
    type: "axis",
    id: { name: "axis1", type: "String" },
  }) as string;

  const valueColumnStr = canonicalizeJson<PTableColumnId>({
    type: "column",
    id: columnId,
  }) as string;

  const inlineData = [
    { key: ["a"], val: 10 },
    { key: ["b"], val: 20 },
    { key: ["c"], val: 30 },
    { key: ["d"], val: 5 },
  ];

  const column = { id: columnId, spec: columnSpec, data: inlineData };

  const columnRef: SpecQueryExpression = { type: "columnRef", value: columnId };

  const baseQuery: SpecQuery<typeof column> = { type: "column", column };

  const uiDriver: PFrameDriver = driver;

  // --- No filters, no sorting ---
  {
    using pTable = driver.createPTableV2({
      query: baseQuery,
    });

    const shape = await uiDriver.getShape(pTable.key);
    expect(shape.rows).toBe(4);
    expect(shape.columns).toBe(2); // 1 axis + 1 value column

    const data = await uiDriver.getData(pTable.key, [0, 1]);
    expect(data[0].type).toBe("String");
    expect([...data[0].data]).toEqual(["a", "b", "c", "d"]);
    expect(data[1].type).toBe("Int");
    expect([...data[1].data]).toEqual([10, 20, 30, 5]);
  }

  // --- With patternEquals filter on axis ---
  {
    using pTable = driver.createPTableV2({
      query: {
        type: "filter",
        input: baseQuery,
        predicate: filterSpecToExpr({
          type: "patternEquals",
          column: axisColumnStr,
          value: "b",
        }) as SpecQueryBooleanExpression,
      },
    });

    const shape = await uiDriver.getShape(pTable.key);
    expect(shape.rows).toBe(1);

    const data = await uiDriver.getData(pTable.key, [0, 1]);
    expect([...data[0].data]).toEqual(["b"]);
    expect([...data[1].data]).toEqual([20]);
  }

  // --- With greaterThan filter on value column ---
  {
    using pTable = driver.createPTableV2({
      query: {
        type: "filter",
        input: baseQuery,
        predicate: filterSpecToExpr({
          type: "greaterThan",
          column: valueColumnStr,
          x: 15,
        }) as SpecQueryBooleanExpression,
      },
    });

    const shape = await uiDriver.getShape(pTable.key);
    expect(shape.rows).toBe(2);

    const data = await uiDriver.getData(pTable.key, [0, 1]);
    expect([...data[0].data]).toEqual(["b", "c"]);
    expect([...data[1].data]).toEqual([20, 30]);
  }

  // --- With sorting descending by value column ---
  {
    using pTable = driver.createPTableV2({
      query: {
        type: "sort",
        input: baseQuery,
        sortBy: [
          {
            expression: columnRef,
            ascending: false,
            nullsFirst: true,
          },
        ],
      },
    });

    const data = await uiDriver.getData(pTable.key, [0, 1]);
    expect([...data[0].data]).toEqual(["c", "b", "a", "d"]);
    expect([...data[1].data]).toEqual([30, 20, 10, 5]);
  }

  // --- With combined filter + sorting ---
  {
    using pTable = driver.createPTableV2({
      query: {
        type: "sort",
        input: {
          type: "filter",
          input: baseQuery,
          predicate: filterSpecToExpr({
            type: "and",
            filters: [
              { type: "greaterThan", column: valueColumnStr, x: 5 },
              { type: "patternNotEquals", column: axisColumnStr, value: "c" },
            ],
          }) as SpecQueryBooleanExpression,
        },
        sortBy: [
          {
            expression: columnRef,
            ascending: false,
            nullsFirst: true,
          },
        ],
      },
    });

    const shape = await uiDriver.getShape(pTable.key);
    expect(shape.rows).toBe(2);

    const data = await uiDriver.getData(pTable.key, [0, 1]);
    expect([...data[0].data]).toEqual(["b", "a"]);
    expect([...data[1].data]).toEqual([20, 10]);
  }
});
