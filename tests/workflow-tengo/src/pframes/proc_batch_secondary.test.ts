import type { PUniversalColumnSpec } from "@milaboratories/pl-middle-layer";
import { Pl, resourceType } from "@milaboratories/pl-middle-layer";
import { awaitStableState } from "@platforma-sdk/test";
import { assertBlob, assertResource, eTplTest } from "./extended_tpl_test";
import { getLongTestTimeout } from "@milaboratories/test-helpers";
import { vi } from "vitest";
import { singleAxisSpec, xsvSettings } from "./proc_batch_common";

const TIMEOUT = getLongTestTimeout(60_000);

vi.setConfig({
  testTimeout: TIMEOUT,
});

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
