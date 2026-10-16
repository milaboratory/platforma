import { afterEach, describe, expect, test } from "vitest";
import {
  createColumnValueId,
  createGlobalPObjectId,
  type PColumnSpec,
} from "@milaboratories/pl-model-common";
import { TreeNodeAccessor } from "../render";
import { DataColumn } from "./data_column";
import { deriveColumnValueOptions, readColumnValues } from "./column_values";

type Resource = { type: string; ready: boolean; content?: unknown };

afterEach(() => {
  delete (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx;
});

describe("readColumnValues", () => {
  test("reads every non-empty cell of inline JSON data, keyed and id-valued", () => {
    const column = metadataColumn({
      type: "PColumnData/Json",
      ready: true,
      content: {
        keyLength: 1,
        data: { '["s1"]': "R1", '["s2"]': "", '["s3"]': 2, '["s4"]': null },
      },
    });

    expect(readColumnValues(column)).toEqual([
      { key: ["s1"], value: "R1", id: createColumnValueId({ column: column.id, value: "R1" }) },
      { key: ["s3"], value: 2, id: createColumnValueId({ column: column.id, value: 2 }) },
    ]);
  });

  test("is undefined while the data is not ready", () => {
    const column = metadataColumn({ type: "PColumnData/Json", ready: false });
    expect(readColumnValues(column)).toBeUndefined();
  });

  test("is undefined for data that is not stored inline", () => {
    const column = metadataColumn({ type: "PColumnData/ParquetPartitioned", ready: true });
    expect(readColumnValues(column)).toBeUndefined();
  });
});

describe("deriveColumnValueOptions", () => {
  test("offers each distinct value once, in natural order of labels", () => {
    const column = metadataColumn({
      type: "PColumnData/Json",
      ready: true,
      content: {
        keyLength: 1,
        data: { '["s1"]': "R10", '["s2"]': "R2", '["s3"]': "R10", '["s4"]': "Library" },
      },
    });
    const entries = readColumnValues(column) ?? [];

    expect(deriveColumnValueOptions(entries)).toEqual([
      { value: createColumnValueId({ column: column.id, value: "Library" }), label: "Library" },
      { value: createColumnValueId({ column: column.id, value: "R2" }), label: "R2" },
      { value: createColumnValueId({ column: column.id, value: "R10" }), label: "R10" },
    ]);
  });
});

// Internals

const HANDLE = "metadata-data";

const SPEC: PColumnSpec = {
  kind: "PColumn",
  name: "pl7.app/metadata",
  valueType: "String",
  axesSpec: [{ name: "pl7.app/sampleId", type: "String" }],
};

/** A leaf metadata column whose data is the given resource, served by a stub render ctx. */
function metadataColumn(resource: Resource) {
  (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx = {
    getResourceType: () => ({ name: resource.type, version: "1" }),
    getIsReadyOrError: () => resource.ready,
    getError: () => undefined,
    getDataAsString: () =>
      resource.content === undefined ? undefined : JSON.stringify(resource.content),
  };
  return DataColumn.fromColumn({
    id: createGlobalPObjectId("samples", "pf.metadata.round"),
    spec: SPEC,
    data: new TreeNodeAccessor(HANDLE, []),
  });
}
