import type { PColumnSpec, PUniversalColumnSpec } from "@milaboratories/pl-middle-layer";
import { Pl, resourceType } from "@milaboratories/pl-middle-layer";
import { awaitStableState } from "@platforma-sdk/test";
import { assertBlob, assertJson, assertResource, eTplTest } from "./extended_tpl_test";
import { getLongTestTimeout } from "@milaboratories/test-helpers";
import { vi } from "vitest";
import {
  singleAxisSpec,
  twoAxisSpec,
  xsvSettings,
  xsvSettingsIsolation,
} from "./proc_batch_common";

const TIMEOUT = getLongTestTimeout(60_000);

vi.setConfig({
  testTimeout: TIMEOUT,
});

// ---- Test 1: Single primary, no isolation, Xsv output ----

eTplTest.concurrent(
  "batch mode: single primary, no isolation, Xsv output",
  async ({ helper, expect, stHelper }) => {
    const result = await helper.renderTemplate(true, "pframes.proc_batch", ["result"], (tx) => {
      const data1Res = tx.createStruct(
        resourceType("PColumnData/Json", "1"),
        JSON.stringify({
          keyLength: 1,
          data: {
            '["k1"]': "EVQL",
            '["k2"]': "QVQL",
            '["k3"]': "DIQM",
            '["k4"]': "EIVL",
          },
        }),
      );
      tx.lockInputs(data1Res);

      return {
        params: tx.createValue(
          Pl.JsonObject,
          JSON.stringify({
            primaryEntries: [
              { spec: singleAxisSpec, dataInputName: "data1", header: "heavyChain" },
            ],
            primaryJoin: "full",
            outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettings }],
            batch: { size: 2, keyColumns: ["key"], format: "tsv", passContent: true },
          }),
        ),
        data1: data1Res,
      };
    });

    const r = stHelper.tree(result.resultEntry);
    const finalResult = await awaitStableState(r, TIMEOUT);
    assertResource(finalResult);
    const theResult = finalResult.inputs["result"];
    assertResource(theResult);
    expect(theResult.resourceType.name).toEqual("PFrame");

    // Check data resource
    const hcData = theResult.inputs["tsv.heavyChain.data"];
    assertResource(hcData);

    // Check spec
    const hcSpecRes = theResult.inputs["tsv.heavyChain.spec"];
    assertJson(hcSpecRes);
    const hcSpec = hcSpecRes.content as PColumnSpec;
    expect(hcSpec.name).toEqual("heavyChain");
    expect(hcSpec.valueType).toEqual("String");
    expect(hcSpec.axesSpec).toHaveLength(1);
    expect(hcSpec.axesSpec[0]).toMatchObject({ name: "key", type: "String" });
  },
);

// ---- Test 2: Single primary with isolation (2 axes: sampleId + key) ----

eTplTest.concurrent(
  "batch mode: single primary with isolation axis",
  async ({ helper, expect, stHelper }) => {
    const result = await helper.renderTemplate(true, "pframes.proc_batch", ["result"], (tx) => {
      // 2 samples x 2 keys each = 4 records
      const data1Res = tx.createStruct(
        resourceType("PColumnData/Json", "1"),
        JSON.stringify({
          keyLength: 2,
          data: {
            '["A","k1"]': "EVQL",
            '["A","k2"]': "QVQL",
            '["B","k1"]': "DIQM",
            '["B","k2"]': "EIVL",
          },
        }),
      );
      tx.lockInputs(data1Res);

      return {
        params: tx.createValue(
          Pl.JsonObject,
          JSON.stringify({
            primaryEntries: [{ spec: twoAxisSpec, dataInputName: "data1", header: "heavyChain" }],
            primaryJoin: "full",
            outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettingsIsolation }],
            batch: { size: 2, keyColumns: ["key"], format: "tsv", passContent: true },
          }),
        ),
        data1: data1Res,
      };
    });

    const r = stHelper.tree(result.resultEntry);
    const finalResult = await awaitStableState(r, TIMEOUT);
    assertResource(finalResult);
    const theResult = finalResult.inputs["result"];
    assertResource(theResult);
    expect(theResult.resourceType.name).toEqual("PFrame");

    // With isolation, the data should be super-partitioned by sampleId
    const hcData = theResult.inputs["tsv.heavyChain.data"];
    assertResource(hcData);

    // Check spec has both axes: sampleId (isolation) + key (batch)
    const hcSpecRes = theResult.inputs["tsv.heavyChain.spec"];
    assertJson(hcSpecRes);
    const hcSpec = hcSpecRes.content as PColumnSpec;
    expect(hcSpec.axesSpec).toHaveLength(2);
    expect(hcSpec.axesSpec[0]).toMatchObject({ name: "sampleId", type: "String" });
    expect(hcSpec.axesSpec[1]).toMatchObject({ name: "key", type: "String" });
  },
);

// ---- Test 3: Batch size larger than total records (single batch) ----

eTplTest.concurrent(
  "batch mode: batch size larger than record count",
  async ({ helper, expect, stHelper }) => {
    const result = await helper.renderTemplate(true, "pframes.proc_batch", ["result"], (tx) => {
      const data1Res = tx.createStruct(
        resourceType("PColumnData/Json", "1"),
        JSON.stringify({
          keyLength: 1,
          data: {
            '["k1"]': "EVQL",
            '["k2"]': "QVQL",
          },
        }),
      );
      tx.lockInputs(data1Res);

      return {
        params: tx.createValue(
          Pl.JsonObject,
          JSON.stringify({
            primaryEntries: [
              { spec: singleAxisSpec, dataInputName: "data1", header: "heavyChain" },
            ],
            primaryJoin: "full",
            outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettings }],
            // batch size 100 > 2 records → single batch
            batch: { size: 100, keyColumns: ["key"], format: "tsv", passContent: true },
          }),
        ),
        data1: data1Res,
      };
    });

    const r = stHelper.tree(result.resultEntry);
    const finalResult = await awaitStableState(r, TIMEOUT);
    assertResource(finalResult);
    const theResult = finalResult.inputs["result"];
    assertResource(theResult);
    expect(theResult.resourceType.name).toEqual("PFrame");

    const hcData = theResult.inputs["tsv.heavyChain.data"];
    assertResource(hcData);
  },
);

// ---- Test: empty input (no records) — non-isolation fallback ----
//
// Exercises the orchestrator finalize path that emits empty typed PColumn data
// when the sole scope has zero records (no isolation axis, no partitions to
// iterate). Must produce a well-formed but empty PFrame rather than erroring.

eTplTest.concurrent(
  "batch mode: empty input emits empty PColumn data (no isolation)",
  async ({ helper, expect, stHelper }) => {
    const result = await helper.renderTemplate(true, "pframes.proc_batch", ["result"], (tx) => {
      const empty = tx.createStruct(
        resourceType("PColumnData/Json", "1"),
        JSON.stringify({ keyLength: 1, data: {} }),
      );
      tx.lockInputs(empty);

      return {
        params: tx.createValue(
          Pl.JsonObject,
          JSON.stringify({
            primaryEntries: [
              { spec: singleAxisSpec, dataInputName: "data1", header: "heavyChain" },
            ],
            primaryJoin: "full",
            outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettings }],
            batch: { size: 2, keyColumns: ["key"], format: "tsv", passContent: true },
          }),
        ),
        data1: empty,
      };
    });

    const r = stHelper.tree(result.resultEntry);
    const finalResult = await awaitStableState(r, TIMEOUT);
    assertResource(finalResult);
    const theResult = finalResult.inputs["result"];
    assertResource(theResult);
    expect(theResult.resourceType.name).toEqual("PFrame");

    // Data resource exists (empty, but well-formed PColumnData/JsonPartitioned).
    const hcData = theResult.inputs["tsv.heavyChain.data"];
    assertResource(hcData);
    expect(hcData.resourceType.name).toEqual("PColumnData/JsonPartitioned");
  },
);

// ---- Test 4: Two primary columns joined ----

const singleAxisSpec2: PUniversalColumnSpec = {
  kind: "PColumn",
  name: "lightChain",
  valueType: "String",
  axesSpec: [{ name: "key", type: "String" }],
};

const xsvSettingsJoin = {
  batchKeyColumns: ["key"],
  columns: [
    {
      column: "heavyChain",
      id: "heavyChain",
      spec: {
        valueType: "String",
        name: "heavyChain",
      },
    },
    {
      column: "lightChain",
      id: "lightChain",
      spec: {
        valueType: "String",
        name: "lightChain",
      },
    },
  ],
  storageFormat: "Json",
} as const;

eTplTest.concurrent(
  "batch mode: two primary columns with full join",
  async ({ helper, expect, stHelper }) => {
    const result = await helper.renderTemplate(true, "pframes.proc_batch", ["result"], (tx) => {
      const data1Res = tx.createStruct(
        resourceType("PColumnData/Json", "1"),
        JSON.stringify({
          keyLength: 1,
          data: { '["k1"]': "EVQL", '["k2"]': "QVQL" },
        }),
      );
      tx.lockInputs(data1Res);

      const data2Res = tx.createStruct(
        resourceType("PColumnData/Json", "1"),
        JSON.stringify({
          keyLength: 1,
          data: { '["k1"]': "DIVMT", '["k2"]': "EIVLT" },
        }),
      );
      tx.lockInputs(data2Res);

      return {
        params: tx.createValue(
          Pl.JsonObject,
          JSON.stringify({
            primaryEntries: [
              { spec: singleAxisSpec, dataInputName: "data1", header: "heavyChain" },
              { spec: singleAxisSpec2, dataInputName: "data2", header: "lightChain" },
            ],
            primaryJoin: "full",
            outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettingsJoin }],
            batch: { size: 10, keyColumns: ["key"], format: "tsv", passContent: true },
          }),
        ),
        data1: data1Res,
        data2: data2Res,
      };
    });

    const r = stHelper.tree(result.resultEntry);
    const finalResult = await awaitStableState(r, TIMEOUT);
    assertResource(finalResult);
    const theResult = finalResult.inputs["result"];
    assertResource(theResult);
    expect(theResult.resourceType.name).toEqual("PFrame");

    // Both columns should be in the output
    const hcData = theResult.inputs["tsv.heavyChain.data"];
    assertResource(hcData);
    const lcData = theResult.inputs["tsv.lightChain.data"];
    assertResource(lcData);
  },
);

// ---- Test 5: Many batches (5+) — verify all partitions are preserved ----

const manyBatchXsvSettings = {
  batchKeyColumns: ["key"],
  columns: [
    {
      column: "heavyChain",
      id: "heavyChain",
      spec: {
        valueType: "String",
        name: "heavyChain",
      },
    },
  ],
  storageFormat: "Json",
} as const;

eTplTest.concurrent(
  "batch mode: many batches — all partitions preserved",
  async ({ helper, expect, stHelper }) => {
    // Build input with 12 records → 5 batches of 3 (last batch 0 if exact)
    // Use batch size 3, so 12 records = 4 batches of 3. Use 13 to get 5 batches (3,3,3,3,1).
    const records: Record<string, string> = {};
    const expectedKeys: string[] = [];
    for (let i = 0; i < 13; i++) {
      const k = `k${i.toString().padStart(3, "0")}`;
      const key = `["${k}"]`;
      records[key] = `SEQ${i}`;
      expectedKeys.push(k);
    }

    const result = await helper.renderTemplate(true, "pframes.proc_batch", ["result"], (tx) => {
      const data1Res = tx.createStruct(
        resourceType("PColumnData/Json", "1"),
        JSON.stringify({
          keyLength: 1,
          data: records,
        }),
      );
      tx.lockInputs(data1Res);

      return {
        params: tx.createValue(
          Pl.JsonObject,
          JSON.stringify({
            primaryEntries: [
              { spec: singleAxisSpec, dataInputName: "data1", header: "heavyChain" },
            ],
            primaryJoin: "full",
            outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: manyBatchXsvSettings }],
            batch: { size: 3, keyColumns: ["key"], format: "tsv", passContent: true },
          }),
        ),
        data1: data1Res,
      };
    });

    const r = stHelper.tree(result.resultEntry);
    const finalResult = await awaitStableState(r, TIMEOUT);
    assertResource(finalResult);
    const theResult = finalResult.inputs["result"];
    assertResource(theResult);

    const hcData = theResult.inputs["tsv.heavyChain.data"];
    assertResource(hcData);
    // After concat+import the structure is PColumnData/JsonPartitioned with partitionKeyLength=0,
    // so there's a single "[]" partition containing all 13 records embedded as {axisKey: value}.
    const partitionKeys = Object.keys(hcData.inputs);
    expect(partitionKeys.length).toEqual(1);
    expect(partitionKeys[0]).toEqual("[]");

    // Read the embedded JSON blob and verify all expected axis keys are present
    const blob = hcData.inputs["[]"];
    assertBlob(blob);
    const blobContent = JSON.parse(Buffer.from(blob.content).toString());
    const keysInBlob = Object.keys(blobContent);
    expect(keysInBlob.length).toEqual(13);
    for (const expected of expectedKeys) {
      expect(keysInBlob).toContain(`["${expected}"]`);
    }
  },
);

// ---- Test 6: Primary + secondary (outer-joined) column via `columns` input ----
//
// Verifies:
// - New spec field name `columns` (renamed from `enrichments`) is picked up.
// - Non-primary column is outer-joined to primary key space.
// - Body template's __value__ TSV contains both the primary and the secondary column.
// - When secondary doesn't cover all primary keys, missing rows get null — the batch
//   still contains every primary key.
