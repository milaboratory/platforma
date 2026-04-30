import type { PUniversalColumnSpec } from "@milaboratories/pl-middle-layer";
import { eTplTest } from "./extended_tpl_test";
import { getLongTestTimeout } from "@milaboratories/test-helpers";
import { vi } from "vitest";
import {
  createJsonData,
  expectPanic,
  jsonParams,
  readJsonPartition,
  runBatch,
  singleAxisSpec,
  xsvSettings,
} from "./proc_batch_common";

vi.setConfig({ testTimeout: getLongTestTimeout(60_000) });

const secondaryScoreSpec: PUniversalColumnSpec = {
  kind: "PColumn",
  name: "score",
  valueType: "Double",
  axesSpec: [{ name: "key", type: "String" }],
};

const xsvSettingsWithSecondary = {
  batchKeyColumns: ["key"],
  columns: [
    { column: "heavyChain", id: "heavyChain", spec: { valueType: "String", name: "heavyChain" } },
    { column: "score", id: "score", spec: { valueType: "Double", name: "score" } },
  ],
  storageFormat: "Json",
} as const;

eTplTest.concurrent(
  "batch mode: primary + secondary column via `columns` field (outer-join)",
  async ({ helper, expect, stHelper }) => {
    // Secondary only covers k1 and k3; k2 is absent from the secondary input.
    const theResult = await runBatch(helper, stHelper, (tx) => ({
      params: jsonParams(tx, {
        primaryEntries: [
          { spec: singleAxisSpec, dataInputName: "primaryData", header: "heavyChain" },
        ],
        secondaryEntries: [
          { spec: secondaryScoreSpec, dataInputName: "secondaryData", header: "score" },
        ],
        primaryJoin: "full",
        outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettingsWithSecondary }],
        batch: { size: 10, keyColumns: ["key"], format: "tsv", passContent: true },
      }),
      primaryData: createJsonData(tx, 1, {
        '["k1"]': "EVQL",
        '["k2"]': "QVQL",
        '["k3"]': "DIQM",
      }),
      secondaryData: createJsonData(tx, 1, { '["k1"]': 0.3, '["k3"]': 0.5 }),
    }));

    expect(theResult.resourceType.name).toEqual("PFrame");

    // Heavy chain: outer-join preserves all 3 primary keys.
    const hcContent = readJsonPartition(theResult.inputs["tsv.heavyChain.data"]);
    expect(Object.keys(hcContent).sort()).toEqual(['["k1"]', '["k2"]', '["k3"]']);
    expect(hcContent).toMatchObject({ '["k1"]': "EVQL", '["k2"]': "QVQL", '["k3"]': "DIQM" });

    // Score: k2 is either missing or null depending on how pfconv encodes NULL
    // for numeric columns — accept both.
    const scoreContent = readJsonPartition(theResult.inputs["tsv.score.data"]);
    expect(scoreContent['["k1"]']).toEqual(0.3);
    expect(scoreContent['["k3"]']).toEqual(0.5);
    if ('["k2"]' in scoreContent) {
      expect(scoreContent['["k2"]']).toBeNull();
    }
  },
);

// Body returns a ResourceMap keyed by batch-key axis values — canonical shape
// for per-record outputs (PDB files, images, etc.). Verifies all entries are
// present with correct keys across batches.
eTplTest.concurrent(
  "batch mode: ResourceMap output — multiple batches merged into flat map",
  async ({ helper, expect, stHelper }) => {
    // 7 records spanning 3 batches of size 3 (last batch holds 1 record).
    const records: Record<string, string> = {};
    const expectedKeys: string[] = [];
    for (let i = 0; i < 7; i++) {
      const k = `k${i}`;
      records[`["${k}"]`] = `SEQ${i}`;
      expectedKeys.push(k);
    }

    const rm = await runBatch(helper, stHelper, (tx) => ({
      params: jsonParams(tx, {
        bodyMode: "resourceMap",
        primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data1", header: "heavyChain" }],
        primaryJoin: "full",
        outputs: [
          {
            // Body template emits output named "resMap"; name must match (or
            // use `path` to remap). keyLength=0 on the spec axesSpec matches
            // what the body-side builder declares (keyLength=1 for the batch key).
            type: "ResourceMap",
            name: "resMap",
            spec: { valueType: "File", name: "pl7.app/batch-test/row", axesSpec: [] },
          },
        ],
        batch: { size: 3, keyColumns: ["key"], format: "tsv", passContent: true },
      }),
      data1: createJsonData(tx, 1, records),
    }));

    expect(rm.resourceType.name).toEqual("PColumnData/ResourceMap");
    const partitionKeys = Object.keys(rm.inputs);
    expect(partitionKeys.length).toEqual(7);
    for (const expected of expectedKeys) {
      expect(partitionKeys).toContain(`["${expected}"]`);
    }
  },
);

// The body template for this test uses exec.addFile(..., batchFile). addFile
// panics if batchFile isn't a smart reference, so this test would fail if
// __value__ arrived as a JsonObject content string (the old broken behavior).
eTplTest.concurrent(
  "batch mode: passContent=false passes a Blob file reference",
  async ({ helper, expect, stHelper }) => {
    const theResult = await runBatch(helper, stHelper, (tx) => ({
      params: jsonParams(tx, {
        primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data1", header: "heavyChain" }],
        primaryJoin: "full",
        outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettings }],
        batch: { size: 2, keyColumns: ["key"], format: "tsv", passContent: false },
      }),
      data1: createJsonData(tx, 1, {
        '["k1"]': "EVQL",
        '["k2"]': "QVQL",
        '["k3"]': "DIQM",
        '["k4"]': "EIVL",
      }),
    }));

    expect(theResult.resourceType.name).toEqual("PFrame");
    const hcContent = readJsonPartition(theResult.inputs["tsv.heavyChain.data"]);
    expect(Object.keys(hcContent).sort()).toEqual(['["k1"]', '["k2"]', '["k3"]', '["k4"]']);
    expect(hcContent).toMatchObject({
      '["k1"]': "EVQL",
      '["k2"]': "QVQL",
      '["k3"]': "DIQM",
      '["k4"]': "EIVL",
    });
  },
);

// Parquet is binary; there's no meaningful string to hand to the body when
// passContent=true, so the combination must be rejected.
eTplTest.concurrent(
  "batch mode: parquet format with passContent=true is rejected",
  async ({ helper, expect, stHelper }) => {
    await expectPanic(
      helper,
      stHelper,
      expect,
      (tx) => ({
        params: jsonParams(tx, {
          primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data1", header: "heavyChain" }],
          primaryJoin: "full",
          outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettings }],
          batch: { size: 2, keyColumns: ["key"], format: "parquet", passContent: true },
        }),
        data1: createJsonData(tx, 1, { '["k1"]': "EVQL", '["k2"]': "QVQL" }),
      }),
      /passContent=true is not applicable to batch\.format="parquet"/,
    );
  },
);
