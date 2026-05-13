import type { PColumnSpec, PUniversalColumnSpec } from "@milaboratories/pl-middle-layer";
import { assertJson, assertResource, eTplTest } from "./extended_tpl_test";
import { getLongTestTimeout } from "@milaboratories/test-helpers";
import { vi } from "vitest";
import {
  createJsonData,
  jsonParams,
  readJsonPartition,
  runBatch,
  singleAxisSpec,
  twoAxisSpec,
  xsvSettings,
  xsvSettingsIsolation,
} from "./proc_batch_common";

vi.setConfig({ testTimeout: getLongTestTimeout(60_000) });

eTplTest.concurrent(
  "batch mode: single primary, no isolation, Xsv output",
  async ({ helper, expect, stHelper }) => {
    const theResult = await runBatch(helper, stHelper, (tx) => ({
      params: jsonParams(tx, {
        primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data1", header: "heavyChain" }],
        primaryJoin: "full",
        outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettings }],
        batch: { size: 2, keyColumns: ["key"], format: "tsv", passContent: true },
      }),
      data1: createJsonData(tx, 1, {
        '["k1"]': "EVQL",
        '["k2"]': "QVQL",
        '["k3"]': "DIQM",
        '["k4"]': "EIVL",
      }),
    }));

    expect(theResult.resourceType.name).toEqual("PFrame");
    assertResource(theResult.inputs["tsv.heavyChain.data"]);

    const hcSpecRes = theResult.inputs["tsv.heavyChain.spec"];
    assertJson(hcSpecRes);
    const hcSpec = hcSpecRes.content as PColumnSpec;
    expect(hcSpec.name).toEqual("heavyChain");
    expect(hcSpec.valueType).toEqual("String");
    expect(hcSpec.axesSpec).toHaveLength(1);
    expect(hcSpec.axesSpec[0]).toMatchObject({ name: "key", type: "String" });
  },
);

eTplTest.concurrent(
  "batch mode: single primary with isolation axis",
  async ({ helper, expect, stHelper }) => {
    // 2 samples × 2 keys each = 4 records. Output must be super-partitioned by
    // sampleId (isolation), with both sampleId and key in the spec's axesSpec.
    const theResult = await runBatch(helper, stHelper, (tx) => ({
      params: jsonParams(tx, {
        primaryEntries: [{ spec: twoAxisSpec, dataInputName: "data1", header: "heavyChain" }],
        primaryJoin: "full",
        outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettingsIsolation }],
        batch: { size: 2, keyColumns: ["key"], format: "tsv", passContent: true },
      }),
      data1: createJsonData(tx, 2, {
        '["A","k1"]': "EVQL",
        '["A","k2"]': "QVQL",
        '["B","k1"]': "DIQM",
        '["B","k2"]': "EIVL",
      }),
    }));

    expect(theResult.resourceType.name).toEqual("PFrame");
    assertResource(theResult.inputs["tsv.heavyChain.data"]);

    const hcSpecRes = theResult.inputs["tsv.heavyChain.spec"];
    assertJson(hcSpecRes);
    const hcSpec = hcSpecRes.content as PColumnSpec;
    expect(hcSpec.axesSpec).toHaveLength(2);
    expect(hcSpec.axesSpec[0]).toMatchObject({ name: "sampleId", type: "String" });
    expect(hcSpec.axesSpec[1]).toMatchObject({ name: "key", type: "String" });
  },
);

eTplTest.concurrent(
  "batch mode: batch size larger than record count",
  async ({ helper, expect, stHelper }) => {
    // batch.size=100 > 2 records → a single batch.
    const theResult = await runBatch(helper, stHelper, (tx) => ({
      params: jsonParams(tx, {
        primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data1", header: "heavyChain" }],
        primaryJoin: "full",
        outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettings }],
        batch: { size: 100, keyColumns: ["key"], format: "tsv", passContent: true },
      }),
      data1: createJsonData(tx, 1, { '["k1"]': "EVQL", '["k2"]': "QVQL" }),
    }));

    expect(theResult.resourceType.name).toEqual("PFrame");
    assertResource(theResult.inputs["tsv.heavyChain.data"]);
  },
);

// Exercises the orchestrator finalize path that emits empty typed PColumn data
// when the sole scope has zero records (no isolation axis, no partitions to
// iterate). Must produce a well-formed but empty PFrame rather than erroring.
eTplTest.concurrent(
  "batch mode: empty input emits empty PColumn data (no isolation)",
  async ({ helper, expect, stHelper }) => {
    const theResult = await runBatch(helper, stHelper, (tx) => ({
      params: jsonParams(tx, {
        primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data1", header: "heavyChain" }],
        primaryJoin: "full",
        outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettings }],
        batch: { size: 2, keyColumns: ["key"], format: "tsv", passContent: true },
      }),
      data1: createJsonData(tx, 1, {}),
    }));

    expect(theResult.resourceType.name).toEqual("PFrame");
    const hcData = theResult.inputs["tsv.heavyChain.data"];
    assertResource(hcData);
    expect(hcData.resourceType.name).toEqual("PColumnData/JsonPartitioned");
  },
);

const singleAxisSpec2: PUniversalColumnSpec = {
  kind: "PColumn",
  name: "lightChain",
  valueType: "String",
  axesSpec: [{ name: "key", type: "String" }],
};

const xsvSettingsJoin = {
  batchKeyColumns: ["key"],
  columns: [
    { column: "heavyChain", id: "heavyChain", spec: { valueType: "String", name: "heavyChain" } },
    { column: "lightChain", id: "lightChain", spec: { valueType: "String", name: "lightChain" } },
  ],
  storageFormat: "Json",
} as const;

eTplTest.concurrent(
  "batch mode: two primary columns with full join",
  async ({ helper, expect, stHelper }) => {
    const theResult = await runBatch(helper, stHelper, (tx) => ({
      params: jsonParams(tx, {
        primaryEntries: [
          { spec: singleAxisSpec, dataInputName: "data1", header: "heavyChain" },
          { spec: singleAxisSpec2, dataInputName: "data2", header: "lightChain" },
        ],
        primaryJoin: "full",
        outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettingsJoin }],
        batch: { size: 10, keyColumns: ["key"], format: "tsv", passContent: true },
      }),
      data1: createJsonData(tx, 1, { '["k1"]': "EVQL", '["k2"]': "QVQL" }),
      data2: createJsonData(tx, 1, { '["k1"]': "DIVMT", '["k2"]': "EIVLT" }),
    }));

    expect(theResult.resourceType.name).toEqual("PFrame");
    assertResource(theResult.inputs["tsv.heavyChain.data"]);
    assertResource(theResult.inputs["tsv.lightChain.data"]);
  },
);

const manyBatchXsvSettings = {
  batchKeyColumns: ["key"],
  columns: [
    { column: "heavyChain", id: "heavyChain", spec: { valueType: "String", name: "heavyChain" } },
  ],
  storageFormat: "Json",
} as const;

eTplTest.concurrent(
  "batch mode: many batches — all partitions preserved",
  async ({ helper, expect, stHelper }) => {
    // 13 records with batch size 3 → 5 batches (3, 3, 3, 3, 1). After
    // concat+import the resource is JsonPartitioned with partitionKeyLength=0,
    // a single "[]" partition embedding all records as {axisKey: value}.
    const records: Record<string, string> = {};
    const expectedKeys: string[] = [];
    for (let i = 0; i < 13; i++) {
      const k = `k${i.toString().padStart(3, "0")}`;
      records[`["${k}"]`] = `SEQ${i}`;
      expectedKeys.push(k);
    }

    const theResult = await runBatch(helper, stHelper, (tx) => ({
      params: jsonParams(tx, {
        primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data1", header: "heavyChain" }],
        primaryJoin: "full",
        outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: manyBatchXsvSettings }],
        batch: { size: 3, keyColumns: ["key"], format: "tsv", passContent: true },
      }),
      data1: createJsonData(tx, 1, records),
    }));

    const hcData = theResult.inputs["tsv.heavyChain.data"];
    assertResource(hcData);
    expect(Object.keys(hcData.inputs)).toEqual(["[]"]);

    const blobContent = readJsonPartition(hcData);
    expect(Object.keys(blobContent).length).toEqual(13);
    for (const expected of expectedKeys) {
      expect(blobContent).toHaveProperty(`["${expected}"]`);
    }
  },
);
