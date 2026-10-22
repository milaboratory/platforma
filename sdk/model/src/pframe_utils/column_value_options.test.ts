import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createColumnValueId,
  createGlobalPObjectId,
  type FullPTableColumnData,
  type PFrameHandle,
  type UniqueValuesResponse,
} from "@milaboratories/pl-model-common";
import type { PresentColumnValueOptionsModel } from "./column_value_options";
import { readColumnValueOptions } from "./column_value_options";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readColumnValueOptions", () => {
  test("offers the distinct values of the value column, without missing ones", async () => {
    const driver = stubDriver({
      unique: { values: { type: "String", data: ["R10", null, "R2"] }, overflow: false },
    });

    expect(await readColumnValueOptions(UNLABELLED)).toEqual([option("R2"), option("R10")]);
    expect(driver.getUniqueValues).toHaveBeenCalledWith(FRAME, {
      columnId: VALUE_ID,
      filters: [],
      limit: 100_000,
    });
  });

  test("reads a number column as decimal strings", async () => {
    stubDriver({
      unique: { values: { type: "Int", data: new Int32Array([2, 10]) }, overflow: false },
    });

    expect(await readColumnValueOptions(UNLABELLED)).toEqual([option("2"), option("10")]);
  });

  test("rejects a column with more distinct values than a picker offers", async () => {
    stubDriver({ unique: { values: { type: "String", data: [] }, overflow: true } });
    await expect(readColumnValueOptions(UNLABELLED)).rejects.toThrow("more than 100000");
  });

  test("labels each value by the label column in the same row", async () => {
    const driver = stubDriver({
      table: [
        columnData(VALUE_ID, ["s1", "s2", null, "s3"]),
        columnData(LABEL_ID, ["Donor 2", "Donor 10", "Nobody", null]),
      ],
    });

    expect(await readColumnValueOptions(LABELLED)).toEqual([
      option("s1", "Donor 2"),
      option("s2", "Donor 10"),
      option("s3"),
    ]);
    expect(driver.calculateTableData).toHaveBeenCalledWith(
      FRAME,
      {
        src: {
          type: "outer",
          primary: { type: "column", column: VALUE_ID },
          secondary: [{ type: "column", column: LABEL_ID }],
        },
        filters: [],
        sorting: [],
      },
      { offset: 0, length: 100_001 },
    );
  });

  test("rejects a labelled column with more rows than a picker reads", async () => {
    const values = Array.from({ length: 100_001 }, (_, i) => `s${i}`);
    stubDriver({ table: [columnData(VALUE_ID, values), columnData(LABEL_ID, values)] });
    await expect(readColumnValueOptions(LABELLED)).rejects.toThrow("more than 100000 rows");
  });
});

// Internals

const VALUE_ID = createGlobalPObjectId("samples", "pf.metadata.round");

const LABEL_ID = createGlobalPObjectId("samples", "pf.metadata.roundName");

const FRAME = "frame-of-round" as PFrameHandle;

const UNLABELLED: PresentColumnValueOptionsModel = {
  type: "present",
  valueColumn: VALUE_ID,
  frame: FRAME,
  frameColumns: { value: VALUE_ID, label: null },
};

const LABELLED: PresentColumnValueOptionsModel = {
  ...UNLABELLED,
  frameColumns: { value: VALUE_ID, label: LABEL_ID },
};

function option(value: string, label = value) {
  return { value: createColumnValueId({ column: VALUE_ID, value }), label };
}

function columnData(id: typeof VALUE_ID, data: (string | null)[]): FullPTableColumnData {
  return {
    spec: {
      type: "column",
      id,
      spec: {
        kind: "PColumn",
        name: "pl7.app/metadata",
        valueType: "String",
        axesSpec: [{ name: "pl7.app/sampleId", type: "String" }],
      },
    },
    data: { type: "String", data },
  };
}

/** A platforma whose frame driver answers value requests with `unique` and joins with `table`. */
function stubDriver(answers: { unique?: UniqueValuesResponse; table?: FullPTableColumnData[] }) {
  const driver = {
    getUniqueValues: vi.fn(async () => answers.unique),
    calculateTableData: vi.fn(async () => answers.table),
  };
  vi.stubGlobal("platforma", { pFrameDriver: driver });
  return driver;
}
