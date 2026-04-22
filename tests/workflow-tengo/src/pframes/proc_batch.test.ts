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

// ---- Test 9: batch.format="parquet" with passContent=true must be rejected ----
//
// Parquet is binary; there's no meaningful string to hand to the body template.
// Spec line 186 mandates this constraint.

eTplTest.concurrent(
  "batch mode: parquet format with passContent=true is rejected",
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

      return {
        params: tx.createValue(
          Pl.JsonObject,
          JSON.stringify({
            primaryEntries: [
              { spec: singleAxisSpec, dataInputName: "data1", header: "heavyChain" },
            ],
            primaryJoin: "full",
            outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettings }],
            batch: { size: 2, keyColumns: ["key"], format: "parquet", passContent: true },
          }),
        ),
        data1: data1Res,
      };
    });

    const r = stHelper.tree(result.resultEntry);
    await expect(awaitStableState(r, TIMEOUT)).rejects.toThrow(
      /passContent=true is not applicable to batch\.format="parquet"/,
    );
  },
);

// ---- Test 10: Xsv output cannot set both batchKeyColumns and axes ----
//
// Spec line 210: "batchKeyColumns and axes are mutually exclusive within one
// output." Verifies the check panics with a clear message.

const xsvSettingsBadBoth = {
  // Both set — invalid per spec
  batchKeyColumns: ["key"],
  axes: [{ column: "key", spec: { name: "key", type: "String" } }],
  columns: [
    {
      column: "heavyChain",
      id: "heavyChain",
      spec: { valueType: "String", name: "heavyChain" },
    },
  ],
  storageFormat: "Json",
} as const;

eTplTest.concurrent(
  "batch mode: Xsv output with both batchKeyColumns and axes is rejected",
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

      return {
        params: tx.createValue(
          Pl.JsonObject,
          JSON.stringify({
            primaryEntries: [
              { spec: singleAxisSpec, dataInputName: "data1", header: "heavyChain" },
            ],
            primaryJoin: "full",
            outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettingsBadBoth }],
            batch: { size: 2, keyColumns: ["key"], format: "tsv", passContent: true },
          }),
        ),
        data1: data1Res,
      };
    });

    const r = stHelper.tree(result.resultEntry);
    await expect(awaitStableState(r, TIMEOUT)).rejects.toThrow(
      /cannot set both batchKeyColumns and axes/,
    );
  },
);

// ---- Test 11: maxBatches step 2 — isolation scope count > maxBatches panics ----

eTplTest.concurrent(
  "batch mode: maxBatches step 2 — too many isolation scopes panics",
  async ({ helper, expect, stHelper }) => {
    // Input with 2 isolation scopes. Set maxBatches=1 → panic.
    const result = await helper.renderTemplate(true, "pframes.proc_batch", ["result"], (tx) => {
      const data1Res = tx.createStruct(
        resourceType("PColumnData/Json", "1"),
        JSON.stringify({
          keyLength: 2,
          data: {
            '["A","k1"]': "EVQL",
            '["B","k1"]': "DIQM",
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
            batch: {
              size: 10,
              keyColumns: ["key"],
              format: "tsv",
              passContent: true,
              maxBatches: 1,
            },
          }),
        ),
        data1: data1Res,
      };
    });

    const r = stHelper.tree(result.resultEntry);
    await expect(awaitStableState(r, TIMEOUT)).rejects.toThrow(
      /isolation scope count \(2\) exceeds batch\.maxBatches \(1\)/,
    );
  },
);

// ---- Test: ResolvedPrimaryRef filter narrows the key space ----
//
// Spec line 182: when a primary entry's `src` is a ResolvedPrimaryRef carrying a
// filter, processColumn inner-joins the filter to reduce the key space before
// batching. Verifies that only keys present in the filter column reach the body.

const filterSpec: PUniversalColumnSpec = {
  kind: "PColumn",
  name: "filter",
  valueType: "String",
  axesSpec: [{ name: "key", type: "String" }],
};

eTplTest.concurrent(
  "batch mode: ResolvedPrimaryRef filter narrows the key space (inner-join)",
  async ({ helper, expect, stHelper }) => {
    const result = await helper.renderTemplate(true, "pframes.proc_batch", ["result"], (tx) => {
      // Primary has 5 keys.
      const primary = tx.createStruct(
        resourceType("PColumnData/Json", "1"),
        JSON.stringify({
          keyLength: 1,
          data: {
            '["k1"]': "EVQL",
            '["k2"]': "QVQL",
            '["k3"]': "DIQM",
            '["k4"]': "EIVL",
            '["k5"]': "DVQL",
          },
        }),
      );
      tx.lockInputs(primary);

      // Filter covers only k2 and k4 → output must be restricted to those two.
      const filter = tx.createStruct(
        resourceType("PColumnData/Json", "1"),
        JSON.stringify({
          keyLength: 1,
          data: {
            '["k2"]': "keep",
            '["k4"]': "keep",
          },
        }),
      );
      tx.lockInputs(filter);

      return {
        params: tx.createValue(
          Pl.JsonObject,
          JSON.stringify({
            primaryEntries: [
              {
                spec: singleAxisSpec,
                dataInputName: "primaryData",
                filterSpec: filterSpec,
                filterDataInputName: "filterData",
                header: "heavyChain",
              },
            ],
            primaryJoin: "full",
            outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettings }],
            batch: { size: 10, keyColumns: ["key"], format: "tsv", passContent: true },
          }),
        ),
        primaryData: primary,
        filterData: filter,
      };
    });

    const r = stHelper.tree(result.resultEntry);
    const finalResult = await awaitStableState(r, TIMEOUT);
    assertResource(finalResult);
    const theResult = finalResult.inputs["result"];
    assertResource(theResult);

    const hcData = theResult.inputs["tsv.heavyChain.data"];
    assertResource(hcData);
    const hcBlob = hcData.inputs["[]"];
    assertBlob(hcBlob);
    const hcContent = JSON.parse(Buffer.from(hcBlob.content).toString());

    // Only the 2 keys present in the filter should appear — k1, k3, k5 are dropped.
    expect(Object.keys(hcContent).sort()).toEqual(['["k2"]', '["k4"]']);
    expect(hcContent['["k2"]']).toEqual("QVQL");
    expect(hcContent['["k4"]']).toEqual("EIVL");
  },
);

// ---- Test 12: maxBatches step 4 — totalBatches > maxBatches inflates batch size ----

eTplTest.concurrent(
  "batch mode: maxBatches step 4 — batch size inflates when total batch count exceeds limit",
  async ({ helper, expect, stHelper }) => {
    // 12 records, size=1 would give 12 batches. maxBatches=3 → effective size
    // must inflate to ceil(12/3)=4, yielding 3 batches. All 12 records must still
    // appear in the merged output (algorithm is degradation, not data loss).
    const records: Record<string, string> = {};
    const expectedKeys: string[] = [];
    for (let i = 0; i < 12; i++) {
      const k = `k${i.toString().padStart(2, "0")}`;
      records[`["${k}"]`] = `SEQ${i}`;
      expectedKeys.push(k);
    }

    const result = await helper.renderTemplate(true, "pframes.proc_batch", ["result"], (tx) => {
      const data1Res = tx.createStruct(
        resourceType("PColumnData/Json", "1"),
        JSON.stringify({ keyLength: 1, data: records }),
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
            batch: {
              size: 1, // would normally produce 12 batches …
              keyColumns: ["key"],
              format: "tsv",
              passContent: true,
              maxBatches: 3, // … but cap is 3, so effective size inflates to 4
            },
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

    // All 12 records still present — inflation is graceful, not lossy.
    const hcData = theResult.inputs["tsv.heavyChain.data"];
    assertResource(hcData);
    const hcBlob = hcData.inputs["[]"];
    assertBlob(hcBlob);
    const hcContent = JSON.parse(Buffer.from(hcBlob.content).toString());
    expect(Object.keys(hcContent).length).toEqual(12);
    for (const expected of expectedKeys) {
      expect(hcContent).toHaveProperty(`["${expected}"]`);
    }
  },
);

// ---- Test: primaryJoin: "inner" ----
//
// Two primary columns with partially overlapping keys. Inner join must keep only
// the intersection; "full" would keep the union.

const secondaryPrimarySpec: PUniversalColumnSpec = {
  kind: "PColumn",
  name: "lightChain",
  valueType: "String",
  axesSpec: [{ name: "key", type: "String" }],
};

const xsvSettingsTwoCols = {
  batchKeyColumns: ["key"],
  columns: [
    { column: "heavyChain", id: "heavyChain", spec: { valueType: "String", name: "heavyChain" } },
    { column: "lightChain", id: "lightChain", spec: { valueType: "String", name: "lightChain" } },
  ],
  storageFormat: "Json",
} as const;

eTplTest.concurrent(
  'batch mode: primaryJoin="inner" keeps only key intersection',
  async ({ helper, expect, stHelper }) => {
    const result = await helper.renderTemplate(true, "pframes.proc_batch", ["result"], (tx) => {
      // Primary A: k1, k2, k3
      // Primary B: k2, k3, k4
      // Inner join → only k2, k3 survive.
      const a = tx.createStruct(
        resourceType("PColumnData/Json", "1"),
        JSON.stringify({
          keyLength: 1,
          data: { '["k1"]': "A1", '["k2"]': "A2", '["k3"]': "A3" },
        }),
      );
      tx.lockInputs(a);
      const b = tx.createStruct(
        resourceType("PColumnData/Json", "1"),
        JSON.stringify({
          keyLength: 1,
          data: { '["k2"]': "B2", '["k3"]': "B3", '["k4"]': "B4" },
        }),
      );
      tx.lockInputs(b);

      return {
        params: tx.createValue(
          Pl.JsonObject,
          JSON.stringify({
            primaryEntries: [
              { spec: singleAxisSpec, dataInputName: "a", header: "heavyChain" },
              { spec: secondaryPrimarySpec, dataInputName: "b", header: "lightChain" },
            ],
            primaryJoin: "inner",
            outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettingsTwoCols }],
            batch: { size: 10, keyColumns: ["key"], format: "tsv", passContent: true },
          }),
        ),
        a: a,
        b: b,
      };
    });

    const r = stHelper.tree(result.resultEntry);
    const finalResult = await awaitStableState(r, TIMEOUT);
    assertResource(finalResult);
    const theResult = finalResult.inputs["result"];
    assertResource(theResult);

    const hcData = theResult.inputs["tsv.heavyChain.data"];
    assertResource(hcData);
    const hcBlob = hcData.inputs["[]"];
    assertBlob(hcBlob);
    const hcContent = JSON.parse(Buffer.from(hcBlob.content).toString());
    // Only intersection (k2, k3). k1 and k4 must be dropped.
    expect(Object.keys(hcContent).sort()).toEqual(['["k2"]', '["k3"]']);
  },
);

// ---- Test: header derivation from spec label ----
//
// When an entry omits `header`, processColumn derives it from the PColumn spec:
// prefers the "pl7.app/label" annotation, falls back to spec.name. Verifies by
// checking that the resulting Xsv output's pfconv import (which uses the header
// as the TSV column name) succeeded — if it didn't, the import would fail.

const labeledSpec: PUniversalColumnSpec = {
  kind: "PColumn",
  name: "heavyChain", // used as fallback header
  valueType: "String",
  axesSpec: [{ name: "key", type: "String" }],
  annotations: {
    "pl7.app/label": "heavyChain", // preferred header source
  },
};

eTplTest.concurrent(
  "batch mode: header derived from spec when entry.header omitted",
  async ({ helper, expect, stHelper }) => {
    const result = await helper.renderTemplate(true, "pframes.proc_batch", ["result"], (tx) => {
      const data = tx.createStruct(
        resourceType("PColumnData/Json", "1"),
        JSON.stringify({
          keyLength: 1,
          data: { '["k1"]': "EVQL", '["k2"]': "QVQL" },
        }),
      );
      tx.lockInputs(data);

      return {
        params: tx.createValue(
          Pl.JsonObject,
          JSON.stringify({
            primaryEntries: [
              // NOTE: no `header` field — processColumn must derive it from spec.
              { spec: labeledSpec, dataInputName: "data" },
            ],
            primaryJoin: "full",
            outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettings }],
            batch: { size: 10, keyColumns: ["key"], format: "tsv", passContent: true },
          }),
        ),
        data: data,
      };
    });

    const r = stHelper.tree(result.resultEntry);
    const finalResult = await awaitStableState(r, TIMEOUT);
    assertResource(finalResult);
    const theResult = finalResult.inputs["result"];
    assertResource(theResult);

    // If derivation worked, the TSV column is named "heavyChain" and pfconv
    // import succeeds — giving us tsv.heavyChain.data with 2 entries.
    const hcData = theResult.inputs["tsv.heavyChain.data"];
    assertResource(hcData);
    const hcBlob = hcData.inputs["[]"];
    assertBlob(hcBlob);
    const hcContent = JSON.parse(Buffer.from(hcBlob.content).toString());
    expect(Object.keys(hcContent).sort()).toEqual(['["k1"]', '["k2"]']);
  },
);

// ---- Test: CSV format ----

eTplTest.concurrent('batch mode: format="csv"', async ({ helper, expect, stHelper }) => {
  const result = await helper.renderTemplate(true, "pframes.proc_batch", ["result"], (tx) => {
    const data = tx.createStruct(
      resourceType("PColumnData/Json", "1"),
      JSON.stringify({
        keyLength: 1,
        data: { '["k1"]': "EVQL", '["k2"]': "QVQL", '["k3"]': "DIQM" },
      }),
    );
    tx.lockInputs(data);

    return {
      params: tx.createValue(
        Pl.JsonObject,
        JSON.stringify({
          primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data", header: "heavyChain" }],
          primaryJoin: "full",
          // Note: xsvType "csv" — body template receives CSV content.
          outputs: [{ type: "Xsv", name: "tsv", xsvType: "csv", settings: xsvSettings }],
          batch: { size: 2, keyColumns: ["key"], format: "csv", passContent: true },
        }),
      ),
      data: data,
    };
  });

  const r = stHelper.tree(result.resultEntry);
  const finalResult = await awaitStableState(r, TIMEOUT);
  assertResource(finalResult);
  const theResult = finalResult.inputs["result"];
  assertResource(theResult);

  const hcData = theResult.inputs["tsv.heavyChain.data"];
  assertResource(hcData);
  const hcBlob = hcData.inputs["[]"];
  assertBlob(hcBlob);
  const hcContent = JSON.parse(Buffer.from(hcBlob.content).toString());
  expect(Object.keys(hcContent).sort()).toEqual(['["k1"]', '["k2"]', '["k3"]']);
});

// ---- Test: opts.stepCache is accepted and workflow completes ----
//
// We can't easily observe the setCache metadata on a rendered field from the
// test harness, so this is a smoke test: verifies opts.stepCache threads
// through `_processColumnBatch` → orchestrator → split template → body render
// without breaking anything. A positive stepCache triggers render.output(name,
// stepCache); this test asserts the final output still carries the expected
// records.

eTplTest.concurrent(
  "batch mode: opts.stepCache threads through without regressing output",
  async ({ helper, expect, stHelper }) => {
    const result = await helper.renderTemplate(true, "pframes.proc_batch", ["result"], (tx) => {
      const data = tx.createStruct(
        resourceType("PColumnData/Json", "1"),
        JSON.stringify({
          keyLength: 1,
          data: { '["k1"]': "EVQL", '["k2"]': "QVQL", '["k3"]': "DIQM" },
        }),
      );
      tx.lockInputs(data);

      return {
        params: tx.createValue(
          Pl.JsonObject,
          JSON.stringify({
            primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data", header: "heavyChain" }],
            primaryJoin: "full",
            outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettings }],
            batch: { size: 2, keyColumns: ["key"], format: "tsv", passContent: true },
            // 60 seconds in nanoseconds (tengo `times` durations are nanoseconds).
            stepCache: 60_000_000_000,
          }),
        ),
        data: data,
      };
    });

    const r = stHelper.tree(result.resultEntry);
    const finalResult = await awaitStableState(r, TIMEOUT);
    assertResource(finalResult);
    const theResult = finalResult.inputs["result"];
    assertResource(theResult);

    const hcData = theResult.inputs["tsv.heavyChain.data"];
    assertResource(hcData);
    const hcBlob = hcData.inputs["[]"];
    assertBlob(hcBlob);
    const hcContent = JSON.parse(Buffer.from(hcBlob.content).toString());
    expect(Object.keys(hcContent).sort()).toEqual(['["k1"]', '["k2"]', '["k3"]']);
  },
);

// ---- Test: format="parquet" (binary) with passContent=false ----
//
// Parquet batch export uses ptabler's slice+write_parquet. The body receives a
// Blob file reference to a parquet batch and passes it through; the final Xsv
// import reads the merged parquet into a Parquet-storage PColumn. `storageFormat:
// "Parquet"` is required — Json storage is incompatible with parquet xsvType.

const parquetXsvSettings = {
  batchKeyColumns: ["key"],
  columns: [
    {
      column: "heavyChain",
      id: "heavyChain",
      spec: {
        valueType: "String",
        name: "heavyChain",
        annotations: { [Annotation.Label]: "Heavy Chain" } satisfies Annotation,
      },
    },
  ],
  storageFormat: "Parquet",
} as const;

eTplTest.concurrent('batch mode: format="parquet"', async ({ helper, stHelper }) => {
  const result = await helper.renderTemplate(true, "pframes.proc_batch", ["result"], (tx) => {
    const data = tx.createStruct(
      resourceType("PColumnData/Json", "1"),
      JSON.stringify({
        keyLength: 1,
        data: { '["k1"]': "EVQL", '["k2"]': "QVQL", '["k3"]': "DIQM", '["k4"]': "EIVL" },
      }),
    );
    tx.lockInputs(data);

    return {
      params: tx.createValue(
        Pl.JsonObject,
        JSON.stringify({
          primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data", header: "heavyChain" }],
          primaryJoin: "full",
          outputs: [{ type: "Xsv", name: "tsv", xsvType: "parquet", settings: parquetXsvSettings }],
          batch: { size: 2, keyColumns: ["key"], format: "parquet", passContent: false },
        }),
      ),
      data: data,
    };
  });

  const r = stHelper.tree(result.resultEntry);
  const finalResult = await awaitStableState(r, TIMEOUT);
  assertResource(finalResult);
  const theResult = finalResult.inputs["result"];
  assertResource(theResult);

  // With Parquet storage we can't parse the blob as JSON. Structural assertion
  // that the PColumn data resource was created for the heavyChain column is
  // enough to verify the end-to-end slice → parquet → merge → import path.
  const hcData = theResult.inputs["tsv.heavyChain.data"];
  assertResource(hcData);
});

// ---- Test: multi-batch within a single isolation scope ----
//
// Existing isolation tests have 1 batch per scope. This one exercises the path
// where each scope produces multiple batches that must be merged per-scope.

eTplTest.concurrent(
  "batch mode: isolation + multiple batches per scope",
  async ({ helper, expect, stHelper }) => {
    // 2 isolation scopes (A, B) × 6 records each = 12 records total.
    // batch.size=2 → 3 batches per scope → 6 total batches.
    const recs: Record<string, string> = {};
    for (const sample of ["A", "B"]) {
      for (let i = 0; i < 6; i++) {
        const k = `k${i}`;
        recs[`["${sample}","${k}"]`] = `${sample}${i}`;
      }
    }

    const result = await helper.renderTemplate(true, "pframes.proc_batch", ["result"], (tx) => {
      const data = tx.createStruct(
        resourceType("PColumnData/Json", "1"),
        JSON.stringify({ keyLength: 2, data: recs }),
      );
      tx.lockInputs(data);

      return {
        params: tx.createValue(
          Pl.JsonObject,
          JSON.stringify({
            primaryEntries: [{ spec: twoAxisSpec, dataInputName: "data", header: "heavyChain" }],
            primaryJoin: "full",
            outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettingsIsolation }],
            batch: { size: 2, keyColumns: ["key"], format: "tsv", passContent: true },
          }),
        ),
        data: data,
      };
    });

    const r = stHelper.tree(result.resultEntry);
    const finalResult = await awaitStableState(r, TIMEOUT);
    assertResource(finalResult);
    const theResult = finalResult.inputs["result"];
    assertResource(theResult);

    // Output is super-partitioned by sampleId (isolation axis). Each sample's
    // partition is the inner merged data from 3 batches (6 records).
    const hcData = theResult.inputs["tsv.heavyChain.data"];
    assertResource(hcData);
    // Super-partitions: one entry per isolation key
    const superKeys = Object.keys(hcData.inputs);
    expect(superKeys.sort()).toEqual(['["A"]', '["B"]']);
    for (const sk of superKeys) {
      const inner = hcData.inputs[sk];
      assertResource(inner);
      // Inner resource is JsonPartitioned(partitionKeyLength=0) with a single "[]"
      // containing all the records for this sample merged across batches.
      const innerKeys = Object.keys(inner.inputs);
      expect(innerKeys).toEqual(["[]"]);
      const innerBlob = inner.inputs["[]"];
      assertBlob(innerBlob);
      const content = JSON.parse(Buffer.from(innerBlob.content).toString());
      expect(Object.keys(content).length).toEqual(6);
    }
  },
);

// ---- Validation panics: invalid batch options ----
//
// These lock in error-message contracts for misuse. The orchestrator validates
// batch options up-front in _processColumnBatch — a regression here would
// silently degrade into runtime failures deep in pt or the split template.

async function expectPanic(
  helper: Parameters<Parameters<typeof eTplTest.concurrent>[1]>[0]["helper"],
  stHelper: Parameters<Parameters<typeof eTplTest.concurrent>[1]>[0]["stHelper"],
  expect: Parameters<Parameters<typeof eTplTest.concurrent>[1]>[0]["expect"],
  paramsOverride: Record<string, unknown>,
  pattern: RegExp,
) {
  const result = await helper.renderTemplate(true, "pframes.proc_batch", ["result"], (tx) => {
    const data = tx.createStruct(
      resourceType("PColumnData/Json", "1"),
      JSON.stringify({ keyLength: 1, data: { '["k1"]': "EVQL", '["k2"]': "QVQL" } }),
    );
    tx.lockInputs(data);
    return {
      params: tx.createValue(
        Pl.JsonObject,
        JSON.stringify({
          primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data", header: "heavyChain" }],
          primaryJoin: "full",
          outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettings }],
          batch: { size: 2, keyColumns: ["key"], format: "tsv", passContent: true },
          ...paramsOverride,
        }),
      ),
      data,
    };
  });
  const r = stHelper.tree(result.resultEntry);
  await expect(awaitStableState(r, TIMEOUT)).rejects.toThrow(pattern);
}

eTplTest.concurrent(
  "batch mode: aggregate + batch options are mutually exclusive",
  async ({ helper, stHelper, expect }) => {
    await expectPanic(
      helper,
      stHelper,
      expect,
      { opts: { aggregate: ["key"] } },
      /aggregate and batch options are mutually exclusive/,
    );
  },
);

eTplTest.concurrent(
  "batch mode: empty keyColumns is rejected",
  async ({ helper, stHelper, expect }) => {
    await expectPanic(
      helper,
      stHelper,
      expect,
      { batch: { size: 2, keyColumns: [], format: "tsv", passContent: true } },
      /keyColumns is required and must be a non-empty array/,
    );
  },
);

eTplTest.concurrent(
  "batch mode: invalid batch.format value is rejected",
  async ({ helper, stHelper, expect }) => {
    await expectPanic(
      helper,
      stHelper,
      expect,
      { batch: { size: 2, keyColumns: ["key"], format: "xml", passContent: true } },
      /batch\.format must be one of/,
    );
  },
);

eTplTest.concurrent(
  "batch mode: non-positive batch.size is rejected",
  async ({ helper, stHelper, expect }) => {
    await expectPanic(
      helper,
      stHelper,
      expect,
      { batch: { size: 0, keyColumns: ["key"], format: "tsv", passContent: true } },
      /batch\.size must be a positive integer/,
    );
  },
);

eTplTest.concurrent(
  "batch mode: Resource output type is rejected",
  async ({ helper, stHelper, expect }) => {
    await expectPanic(
      helper,
      stHelper,
      expect,
      {
        outputs: [
          {
            type: "Resource",
            name: "r",
            spec: { valueType: "File", name: "foo", axesSpec: [] },
          },
        ],
      },
      /Resource output type is not supported in batch mode/,
    );
  },
);

eTplTest.concurrent(
  "batch mode: primary header colliding with batch-key axis name is rejected",
  async ({ helper, stHelper, expect }) => {
    await expectPanic(
      helper,
      stHelper,
      expect,
      {
        // Header "key" collides with the batch-key axis named "key".
        primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data", header: "key" }],
      },
      /header "key" collides with batch-key axis/,
    );
  },
);

eTplTest.concurrent(
  "batch mode: ndjson format with Xsv output missing xsvType is rejected",
  async ({ helper, stHelper, expect }) => {
    await expectPanic(
      helper,
      stHelper,
      expect,
      {
        // xsvType omitted on the output; batch.format=ndjson is not importable.
        outputs: [{ type: "Xsv", name: "tsv", settings: xsvSettings }],
        batch: { size: 2, keyColumns: ["key"], format: "ndjson", passContent: true },
      },
      /requires explicit xsvType when batch\.format="ndjson"/,
    );
  },
);

eTplTest.concurrent(
  "batch mode: non-primitive primary valueType is rejected",
  async ({ helper, stHelper, expect }) => {
    await expectPanic(
      helper,
      stHelper,
      expect,
      {
        primaryEntries: [
          {
            // File is non-primitive — batch mode routes through pt which only
            // handles primitive-valued PColumns.
            spec: {
              kind: "PColumn",
              name: "sequence",
              valueType: "File",
              axesSpec: [{ name: "key", type: "String" }],
            },
            dataInputName: "data",
            header: "heavyChain",
          },
        ],
      },
      /non-primitive valueType/,
    );
  },
);

// ---- Test: ndjson positive smoke test ----
//
// batch.format=ndjson with passContent=true — body receives NDJSON content as
// a string, parses each row, and emits a ResourceMap. Verifies the end-to-end
// NDJSON delivery path across multiple batches.

eTplTest.concurrent(
  'batch mode: format="ndjson" with passContent delivers NDJSON content to body',
  async ({ helper, expect, stHelper }) => {
    // 5 records across 3 batches of size 2 (last batch has 1) — exercises
    // cross-batch merge on the NDJSON path.
    const records: Record<string, string> = {};
    const expectedKeys: string[] = [];
    for (let i = 0; i < 5; i++) {
      const k = `k${i}`;
      records[`["${k}"]`] = `SEQ${i}`;
      expectedKeys.push(k);
    }

    const result = await helper.renderTemplate(true, "pframes.proc_batch", ["result"], (tx) => {
      const data = tx.createStruct(
        resourceType("PColumnData/Json", "1"),
        JSON.stringify({ keyLength: 1, data: records }),
      );
      tx.lockInputs(data);
      return {
        params: tx.createValue(
          Pl.JsonObject,
          JSON.stringify({
            bodyMode: "ndjson",
            primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data", header: "heavyChain" }],
            primaryJoin: "full",
            outputs: [
              {
                type: "ResourceMap",
                name: "resMap",
                spec: {
                  valueType: "File",
                  name: "pl7.app/batch-test/ndjson-row",
                  axesSpec: [],
                },
              },
            ],
            batch: { size: 2, keyColumns: ["key"], format: "ndjson", passContent: true },
          }),
        ),
        data,
      };
    });

    const r = stHelper.tree(result.resultEntry);
    const finalResult = await awaitStableState(r, TIMEOUT);
    assertResource(finalResult);
    const rm = finalResult.inputs["result"];
    assertResource(rm);
    expect(rm.resourceType.name).toEqual("PColumnData/ResourceMap");
    const partitionKeys = Object.keys(rm.inputs);
    expect(partitionKeys.length).toEqual(5);
    for (const expected of expectedKeys) {
      expect(partitionKeys).toContain(`["${expected}"]`);
    }
  },
);

// ---- Test: primary overloads — bare { spec, data } without header ----
//
// Spec lines 166-179: `primary` accepts a single column without array wrapping
// and without an explicit header (derived from spec label/name). Exercises the
// normalizeColumnEntries single-map branch.

const labeledSpecNoLabel: PUniversalColumnSpec = {
  kind: "PColumn",
  name: "heavyChain",
  valueType: "String",
  axesSpec: [{ name: "key", type: "String" }],
  // No pl7.app/label annotation → deriveHeaderFromSpec must fall back to spec.name.
};

eTplTest.concurrent(
  "batch mode: header derived from spec.name when label annotation absent",
  async ({ helper, expect, stHelper }) => {
    const result = await helper.renderTemplate(true, "pframes.proc_batch", ["result"], (tx) => {
      const data = tx.createStruct(
        resourceType("PColumnData/Json", "1"),
        JSON.stringify({ keyLength: 1, data: { '["k1"]': "EVQL", '["k2"]': "QVQL" } }),
      );
      tx.lockInputs(data);
      return {
        params: tx.createValue(
          Pl.JsonObject,
          JSON.stringify({
            primaryEntries: [{ spec: labeledSpecNoLabel, dataInputName: "data" }],
            primaryJoin: "full",
            outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettings }],
            batch: { size: 10, keyColumns: ["key"], format: "tsv", passContent: true },
          }),
        ),
        data,
      };
    });

    const r = stHelper.tree(result.resultEntry);
    const finalResult = await awaitStableState(r, TIMEOUT);
    assertResource(finalResult);
    const theResult = finalResult.inputs["result"];
    assertResource(theResult);
    const hcData = theResult.inputs["tsv.heavyChain.data"];
    assertResource(hcData);
    const hcBlob = hcData.inputs["[]"];
    assertBlob(hcBlob);
    const hcContent = JSON.parse(Buffer.from(hcBlob.content).toString());
    expect(Object.keys(hcContent).sort()).toEqual(['["k1"]', '["k2"]']);
  },
);

// ---- Test: primary single-object overload (not wrapped in array) ----

eTplTest.concurrent(
  "batch mode: primary accepts a single bare { spec, data } without array wrapping",
  async ({ helper, stHelper }) => {
    const result = await helper.renderTemplate(true, "pframes.proc_batch", ["result"], (tx) => {
      const data = tx.createStruct(
        resourceType("PColumnData/Json", "1"),
        JSON.stringify({ keyLength: 1, data: { '["k1"]': "EVQL", '["k2"]': "QVQL" } }),
      );
      tx.lockInputs(data);
      return {
        params: tx.createValue(
          Pl.JsonObject,
          JSON.stringify({
            // singlePrimary: true → test template passes primaryEntries[0] alone
            // (a bare { src, header } map) rather than wrapping in an array.
            singlePrimary: true,
            primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data", header: "heavyChain" }],
            primaryJoin: "full",
            outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettings }],
            batch: { size: 10, keyColumns: ["key"], format: "tsv", passContent: true },
          }),
        ),
        data,
      };
    });

    const r = stHelper.tree(result.resultEntry);
    const finalResult = await awaitStableState(r, TIMEOUT);
    assertResource(finalResult);
    const theResult = finalResult.inputs["result"];
    assertResource(theResult);
    const hcData = theResult.inputs["tsv.heavyChain.data"];
    assertResource(hcData);
  },
);
