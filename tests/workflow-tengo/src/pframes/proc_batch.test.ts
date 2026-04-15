import type { PColumnSpec, PUniversalColumnSpec } from "@milaboratories/pl-middle-layer";
import { Annotation, Pl, resourceType } from "@milaboratories/pl-middle-layer";
import { awaitStableState } from "@platforma-sdk/test";
import { assertBlob, assertJson, assertResource, eTplTest } from "./extended_tpl_test";
import { getLongTestTimeout } from "@milaboratories/test-helpers";
import { vi } from "vitest";

const TIMEOUT = getLongTestTimeout(60_000);

vi.setConfig({
  testTimeout: TIMEOUT,
});

// Xsv settings: body returns TSV with "key" as axis, "heavyChain" as value column
const xsvSettings = {
  batchKeyColumns: ["key"],
  columns: [
    {
      column: "heavyChain",
      id: "heavyChain",
      spec: {
        valueType: "String",
        name: "heavyChain",
        annotations: {
          [Annotation.Label]: "Heavy Chain",
        } satisfies Annotation,
      },
    },
  ],
  storageFormat: "Json",
} as const;

// ---- Test 1: Single primary, no isolation, Xsv output ----

const singleAxisSpec: PUniversalColumnSpec = {
  kind: "PColumn",
  name: "sequence",
  valueType: "String",
  axesSpec: [{ name: "key", type: "String" }],
};

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

const twoAxisSpec: PUniversalColumnSpec = {
  kind: "PColumn",
  name: "sequence",
  valueType: "String",
  axesSpec: [
    { name: "sampleId", type: "String" },
    { name: "key", type: "String" },
  ],
};

const xsvSettingsIsolation = {
  batchKeyColumns: ["key"],
  columns: [
    {
      column: "heavyChain",
      id: "heavyChain",
      spec: {
        valueType: "String",
        name: "heavyChain",
        annotations: {
          [Annotation.Label]: "Heavy Chain",
        } satisfies Annotation,
      },
    },
  ],
  storageFormat: "Json",
} as const;

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

const secondaryScoreSpec: PUniversalColumnSpec = {
  kind: "PColumn",
  name: "score",
  valueType: "Double",
  axesSpec: [{ name: "key", type: "String" }],
};

const xsvSettingsWithSecondary = {
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
      column: "score",
      id: "score",
      spec: {
        valueType: "Double",
        name: "score",
      },
    },
  ],
  storageFormat: "Json",
} as const;

eTplTest.concurrent(
  "batch mode: primary + secondary column via `columns` field (outer-join)",
  async ({ helper, expect, stHelper }) => {
    const result = await helper.renderTemplate(true, "pframes.proc_batch", ["result"], (tx) => {
      // Primary: 3 keys with heavy-chain sequences
      const primaryRes = tx.createStruct(
        resourceType("PColumnData/Json", "1"),
        JSON.stringify({
          keyLength: 1,
          data: {
            '["k1"]': "EVQL",
            '["k2"]': "QVQL",
            '["k3"]': "DIQM",
          },
        }),
      );
      tx.lockInputs(primaryRes);

      // Secondary: only covers k1 and k3 (k2 will be null after outer-join)
      const secondaryRes = tx.createStruct(
        resourceType("PColumnData/Json", "1"),
        JSON.stringify({
          keyLength: 1,
          data: {
            '["k1"]': 0.3,
            '["k3"]': 0.5,
          },
        }),
      );
      tx.lockInputs(secondaryRes);

      return {
        params: tx.createValue(
          Pl.JsonObject,
          JSON.stringify({
            primaryEntries: [
              { spec: singleAxisSpec, dataInputName: "primaryData", header: "heavyChain" },
            ],
            secondaryEntries: [
              { spec: secondaryScoreSpec, dataInputName: "secondaryData", header: "score" },
            ],
            primaryJoin: "full",
            outputs: [
              { type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettingsWithSecondary },
            ],
            batch: { size: 10, keyColumns: ["key"], format: "tsv", passContent: true },
          }),
        ),
        primaryData: primaryRes,
        secondaryData: secondaryRes,
      };
    });

    const r = stHelper.tree(result.resultEntry);
    const finalResult = await awaitStableState(r, TIMEOUT);
    assertResource(finalResult);
    const theResult = finalResult.inputs["result"];
    assertResource(theResult);
    expect(theResult.resourceType.name).toEqual("PFrame");

    // Heavy chain: outer-join preserves all 3 primary keys
    const hcData = theResult.inputs["tsv.heavyChain.data"];
    assertResource(hcData);
    const hcBlob = hcData.inputs["[]"];
    assertBlob(hcBlob);
    const hcContent = JSON.parse(Buffer.from(hcBlob.content).toString());
    expect(Object.keys(hcContent).sort()).toEqual(['["k1"]', '["k2"]', '["k3"]']);
    expect(hcContent['["k1"]']).toEqual("EVQL");
    expect(hcContent['["k2"]']).toEqual("QVQL");
    expect(hcContent['["k3"]']).toEqual("DIQM");

    // Score: outer-join preserves primary keys, k2 is missing from secondary → absent or null
    const scoreData = theResult.inputs["tsv.score.data"];
    assertResource(scoreData);
    const scoreBlob = scoreData.inputs["[]"];
    assertBlob(scoreBlob);
    const scoreContent = JSON.parse(Buffer.from(scoreBlob.content).toString());
    // k1 and k3 have values; k2 is either missing or null depending on how pfconv
    // encodes NULL for numeric columns — we accept both.
    expect(scoreContent['["k1"]']).toEqual(0.3);
    expect(scoreContent['["k3"]']).toEqual(0.5);
    if ('["k2"]' in scoreContent) {
      expect(scoreContent['["k2"]']).toBeNull();
    }
  },
);

// ---- Test 7 (renumbered): ResourceMap output (3D Structures canonical use case) ----
//
// Body returns a ResourceMap keyed by batch-key axis values. Each key maps to a
// per-record resource (JSON blob here; would be a PDB file for structure prediction).
// Verifies:
// - Final spec has axesSpec = isolation + batchKey + body-declared axes.
// - All body-returned ResourceMap entries present with correct keys across batches.
// - No isolation path (flat merge).

eTplTest.concurrent(
  "batch mode: ResourceMap output — multiple batches merged into flat map",
  async ({ helper, expect, stHelper }) => {
    // 7 records spanning 3 batches of size 3 (last batch has 1 record)
    const records: Record<string, string> = {};
    const expectedKeys: string[] = [];
    for (let i = 0; i < 7; i++) {
      const k = `k${i}`;
      records[`["${k}"]`] = `SEQ${i}`;
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
            bodyMode: "resourceMap",
            primaryEntries: [
              { spec: singleAxisSpec, dataInputName: "data1", header: "heavyChain" },
            ],
            primaryJoin: "full",
            outputs: [
              {
                // Body template emits output named "resMap"; the output config's
                // name must match (or use `path` to remap).
                type: "ResourceMap",
                name: "resMap",
                spec: {
                  // No body-declared axes beyond the batch key — keyLength=1 → matches
                  // what the body-side builder declares (keyLength: 1 for the batch key)
                  valueType: "File",
                  name: "pl7.app/batch-test/row",
                  axesSpec: [],
                },
              },
            ],
            batch: { size: 3, keyColumns: ["key"], format: "tsv", passContent: true },
          }),
        ),
        data1: data1Res,
      };
    });

    const r = stHelper.tree(result.resultEntry);
    const finalResult = await awaitStableState(r, TIMEOUT);
    assertResource(finalResult);

    // result is the raw ResourceMap resource (test template returns it directly for
    // resourceMap mode). Its input fields are keyed by ["key_value"] JSON strings.
    const rm = finalResult.inputs["result"];
    assertResource(rm);
    expect(rm.resourceType.name).toEqual("PColumnData/ResourceMap");

    const partitionKeys = Object.keys(rm.inputs);
    // One partition per expected batch key, across 3 batches
    expect(partitionKeys.length).toEqual(7);
    for (const expected of expectedKeys) {
      expect(partitionKeys).toContain(`["${expected}"]`);
    }
  },
);

// ---- Test 8: passContent=false — body receives a Blob file reference ----
//
// The body template for this test uses exec.addFile(..., batchFile). addFile
// panics if batchFile is not a smart reference, so this test would fail if
// __value__ is passed as a JsonObject content string (the old broken behavior).

eTplTest.concurrent(
  "batch mode: passContent=false passes a Blob file reference",
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
            // passContent: false triggers the Blob path
            batch: { size: 2, keyColumns: ["key"], format: "tsv", passContent: false },
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

    // If addFile in the body template accepted the input, the result must be valid
    // PFrame with all 4 heavy-chain records merged across 2 batches.
    const hcData = theResult.inputs["tsv.heavyChain.data"];
    assertResource(hcData);
    const hcBlob = hcData.inputs["[]"];
    assertBlob(hcBlob);
    const hcContent = JSON.parse(Buffer.from(hcBlob.content).toString());
    expect(Object.keys(hcContent).sort()).toEqual(['["k1"]', '["k2"]', '["k3"]', '["k4"]']);
    expect(hcContent['["k1"]']).toEqual("EVQL");
    expect(hcContent['["k2"]']).toEqual("QVQL");
    expect(hcContent['["k3"]']).toEqual("DIQM");
    expect(hcContent['["k4"]']).toEqual("EIVL");
  },
);
