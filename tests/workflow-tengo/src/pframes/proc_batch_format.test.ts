import type { PUniversalColumnSpec } from "@milaboratories/pl-middle-layer";
import { Annotation } from "@milaboratories/pl-middle-layer";
import { assertBlob, assertResource, eTplTest } from "./extended_tpl_test";
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
    // A: k1, k2, k3; B: k2, k3, k4. Inner join → k2, k3 only.
    const theResult = await runBatch(helper, stHelper, (tx) => ({
      params: jsonParams(tx, {
        primaryEntries: [
          { spec: singleAxisSpec, dataInputName: "a", header: "heavyChain" },
          { spec: secondaryPrimarySpec, dataInputName: "b", header: "lightChain" },
        ],
        primaryJoin: "inner",
        outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettingsTwoCols }],
        batch: { size: 10, keyColumns: ["key"], format: "tsv", passContent: true },
      }),
      a: createJsonData(tx, 1, { '["k1"]': "A1", '["k2"]': "A2", '["k3"]': "A3" }),
      b: createJsonData(tx, 1, { '["k2"]': "B2", '["k3"]': "B3", '["k4"]': "B4" }),
    }));

    const hcContent = readJsonPartition(theResult.inputs["tsv.heavyChain.data"]);
    expect(Object.keys(hcContent).sort()).toEqual(['["k2"]', '["k3"]']);
  },
);

// When an entry omits `header`, processColumn derives it from the spec:
// prefers the "pl7.app/label" annotation, falls back to spec.name. Success is
// implied by pfconv import succeeding (the TSV column is named "heavyChain").
const labeledSpec: PUniversalColumnSpec = {
  kind: "PColumn",
  name: "heavyChain",
  valueType: "String",
  axesSpec: [{ name: "key", type: "String" }],
  annotations: { "pl7.app/label": "heavyChain" },
};

eTplTest.concurrent(
  "batch mode: header derived from spec when entry.header omitted",
  async ({ helper, expect, stHelper }) => {
    const theResult = await runBatch(helper, stHelper, (tx) => ({
      params: jsonParams(tx, {
        // No `header` field — processColumn derives it from the spec.
        primaryEntries: [{ spec: labeledSpec, dataInputName: "data" }],
        primaryJoin: "full",
        outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettings }],
        batch: { size: 10, keyColumns: ["key"], format: "tsv", passContent: true },
      }),
      data: createJsonData(tx, 1, { '["k1"]': "EVQL", '["k2"]': "QVQL" }),
    }));

    const hcContent = readJsonPartition(theResult.inputs["tsv.heavyChain.data"]);
    expect(Object.keys(hcContent).sort()).toEqual(['["k1"]', '["k2"]']);
  },
);

eTplTest.concurrent('batch mode: format="csv"', async ({ helper, expect, stHelper }) => {
  const theResult = await runBatch(helper, stHelper, (tx) => ({
    params: jsonParams(tx, {
      primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data", header: "heavyChain" }],
      primaryJoin: "full",
      outputs: [{ type: "Xsv", name: "tsv", xsvType: "csv", settings: xsvSettings }],
      batch: { size: 2, keyColumns: ["key"], format: "csv", passContent: true },
    }),
    data: createJsonData(tx, 1, { '["k1"]': "EVQL", '["k2"]': "QVQL", '["k3"]': "DIQM" }),
  }));

  const hcContent = readJsonPartition(theResult.inputs["tsv.heavyChain.data"]);
  expect(Object.keys(hcContent).sort()).toEqual(['["k1"]', '["k2"]', '["k3"]']);
});

// Smoke test: opts.stepCache threads through processColumnBatch →
// orchestrator → split template → body render without breaking anything. The
// test harness can't observe the setCache metadata, so we assert the output
// still carries the expected records.
eTplTest.concurrent(
  "batch mode: opts.stepCache threads through without regressing output",
  async ({ helper, expect, stHelper }) => {
    const theResult = await runBatch(helper, stHelper, (tx) => ({
      params: jsonParams(tx, {
        primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data", header: "heavyChain" }],
        primaryJoin: "full",
        outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettings }],
        batch: { size: 2, keyColumns: ["key"], format: "tsv", passContent: true },
        stepCache: 60_000_000_000, // 60 seconds in nanoseconds.
      }),
      data: createJsonData(tx, 1, { '["k1"]': "EVQL", '["k2"]': "QVQL", '["k3"]': "DIQM" }),
    }));

    const hcContent = readJsonPartition(theResult.inputs["tsv.heavyChain.data"]);
    expect(Object.keys(hcContent).sort()).toEqual(['["k1"]', '["k2"]', '["k3"]']);
  },
);

// Parquet batch export uses ptabler's slice+write_parquet. The body receives a
// Blob file reference and passes it through; the final Xsv import reads the
// merged parquet into a Parquet-storage PColumn. storageFormat="Parquet" is
// required — Json storage is incompatible with parquet xsvType.
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
  const theResult = await runBatch(helper, stHelper, (tx) => ({
    params: jsonParams(tx, {
      primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data", header: "heavyChain" }],
      primaryJoin: "full",
      outputs: [{ type: "Xsv", name: "tsv", xsvType: "parquet", settings: parquetXsvSettings }],
      batch: { size: 2, keyColumns: ["key"], format: "parquet", passContent: false },
    }),
    data: createJsonData(tx, 1, {
      '["k1"]': "EVQL",
      '["k2"]': "QVQL",
      '["k3"]': "DIQM",
      '["k4"]': "EIVL",
    }),
  }));

  // Parquet blobs aren't JSON; the structural assertion that the resource exists
  // is enough to verify the end-to-end slice → parquet → merge → import path.
  assertResource(theResult.inputs["tsv.heavyChain.data"]);
});

// Each isolation scope produces multiple batches that must be merged per-scope
// (existing isolation tests only cover 1 batch per scope).
eTplTest.concurrent(
  "batch mode: isolation + multiple batches per scope",
  async ({ helper, expect, stHelper }) => {
    // 2 isolation scopes (A, B) × 6 records each = 12 records total.
    // batch.size=2 → 3 batches per scope.
    const recs: Record<string, string> = {};
    for (const sample of ["A", "B"]) {
      for (let i = 0; i < 6; i++) {
        recs[`["${sample}","k${i}"]`] = `${sample}${i}`;
      }
    }

    const theResult = await runBatch(helper, stHelper, (tx) => ({
      params: jsonParams(tx, {
        primaryEntries: [{ spec: twoAxisSpec, dataInputName: "data", header: "heavyChain" }],
        primaryJoin: "full",
        outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettingsIsolation }],
        batch: { size: 2, keyColumns: ["key"], format: "tsv", passContent: true },
      }),
      data: createJsonData(tx, 2, recs),
    }));

    // Output is super-partitioned by sampleId; each super-partition's inner
    // resource is JsonPartitioned(partitionKeyLength=0) with a single "[]"
    // containing all records for that sample merged across batches.
    const hcData = theResult.inputs["tsv.heavyChain.data"];
    assertResource(hcData);
    const superKeys = Object.keys(hcData.inputs);
    expect(superKeys.sort()).toEqual(['["A"]', '["B"]']);
    for (const sk of superKeys) {
      const inner = hcData.inputs[sk];
      assertResource(inner);
      expect(Object.keys(inner.inputs)).toEqual(["[]"]);
      const blob = inner.inputs["[]"];
      assertBlob(blob);
      const content = JSON.parse(Buffer.from(blob.content).toString());
      expect(Object.keys(content).length).toEqual(6);
    }
  },
);
