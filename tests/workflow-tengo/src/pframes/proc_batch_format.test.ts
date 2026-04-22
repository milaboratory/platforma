import type { PUniversalColumnSpec } from "@milaboratories/pl-middle-layer";
import { Annotation, Pl, resourceType } from "@milaboratories/pl-middle-layer";
import { awaitStableState } from "@platforma-sdk/test";
import { assertBlob, assertResource, eTplTest } from "./extended_tpl_test";
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
