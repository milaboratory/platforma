import type { PUniversalColumnSpec } from "@milaboratories/pl-middle-layer";
import { Pl, resourceType } from "@milaboratories/pl-middle-layer";
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
