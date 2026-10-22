import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createColumnValueId,
  createGlobalPObjectId,
  type PColumnIdAndSpec,
  type PFrameHandle,
  type PObjectId,
  type UniqueValuesResponse,
} from "@milaboratories/pl-model-common";
import { readColumnValueOptions } from "./column_value_options";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readColumnValueOptions", () => {
  test("offers the distinct values of the frame's column, without missing ones", async () => {
    const driver = stubDriver({
      columns: [frameColumn("c1")],
      response: {
        values: { type: "String", data: ["R10", null, "R2"] },
        overflow: false,
      },
    });

    expect(await readColumnValueOptions(SOURCE)).toEqual([option("R2"), option("R10")]);
    expect(driver.getUniqueValues).toHaveBeenCalledWith(FRAME, {
      columnId: "c1",
      filters: [],
      limit: 100_000,
    });
  });

  test("reads a number column as decimal strings", async () => {
    stubDriver({
      columns: [frameColumn("c1")],
      response: { values: { type: "Int", data: new Int32Array([2, 10]) }, overflow: false },
    });

    expect(await readColumnValueOptions(SOURCE)).toEqual([option("2"), option("10")]);
  });

  test("rejects a frame that does not hold one column", async () => {
    stubDriver({ columns: [], response: EMPTY });
    await expect(readColumnValueOptions(SOURCE)).rejects.toThrow("it holds 0");
  });

  test("rejects a column with more distinct values than a picker offers", async () => {
    stubDriver({ columns: [frameColumn("c1")], response: { ...EMPTY, overflow: true } });
    await expect(readColumnValueOptions(SOURCE)).rejects.toThrow("more than 100000");
  });
});

// Internals

const COLUMN_ID = createGlobalPObjectId("samples", "pf.metadata.round");

const FRAME = "frame-of-round" as PFrameHandle;

const SOURCE = { type: "present", column: COLUMN_ID, frame: FRAME } as const;

const EMPTY: UniqueValuesResponse = { values: { type: "String", data: [] }, overflow: false };

function option(value: string) {
  return { value: createColumnValueId({ column: COLUMN_ID, value }), label: value };
}

function frameColumn(columnId: string): PColumnIdAndSpec {
  return {
    columnId: columnId as PObjectId,
    spec: {
      kind: "PColumn",
      name: "pl7.app/metadata",
      valueType: "String",
      axesSpec: [{ name: "pl7.app/sampleId", type: "String" }],
    },
  };
}

/** A platforma whose frame driver lists `columns` and answers every value request with `response`. */
function stubDriver(opts: { columns: PColumnIdAndSpec[]; response: UniqueValuesResponse }) {
  const driver = {
    listColumns: vi.fn(async () => opts.columns),
    getUniqueValues: vi.fn(async () => opts.response),
  };
  vi.stubGlobal("platforma", { pFrameDriver: driver });
  return driver;
}
