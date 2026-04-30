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
  twoAxisSpec,
  xsvSettings,
  xsvSettingsIsolation,
} from "./proc_batch_common";

vi.setConfig({ testTimeout: getLongTestTimeout(60_000) });

// Sets both batchKeyColumns and axes on one Xsv output — must be rejected as
// mutually exclusive.
const xsvSettingsBadBoth = {
  batchKeyColumns: ["key"],
  axes: [{ column: "key", spec: { name: "key", type: "String" } }],
  columns: [
    { column: "heavyChain", id: "heavyChain", spec: { valueType: "String", name: "heavyChain" } },
  ],
  storageFormat: "Json",
} as const;

eTplTest.concurrent(
  "batch mode: Xsv output with both batchKeyColumns and axes is rejected",
  async ({ helper, expect, stHelper }) => {
    await expectPanic(
      helper,
      stHelper,
      expect,
      (tx) => ({
        params: jsonParams(tx, {
          primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data1", header: "heavyChain" }],
          primaryJoin: "full",
          outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettingsBadBoth }],
          batch: { size: 2, keyColumns: ["key"], format: "tsv", passContent: true },
        }),
        data1: createJsonData(tx, 1, { '["k1"]': "EVQL", '["k2"]': "QVQL" }),
      }),
      /cannot set both batchKeyColumns and axes/,
    );
  },
);

eTplTest.concurrent(
  "batch mode: maxBatches step 2 — too many isolation scopes panics",
  async ({ helper, expect, stHelper }) => {
    // Input with 2 isolation scopes (A, B) and maxBatches=1 → panic.
    await expectPanic(
      helper,
      stHelper,
      expect,
      (tx) => ({
        params: jsonParams(tx, {
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
        data1: createJsonData(tx, 2, { '["A","k1"]': "EVQL", '["B","k1"]': "DIQM" }),
      }),
      /isolation scope count \(2\) exceeds batch\.maxBatches \(1\)/,
    );
  },
);

// When a primary entry's `src` is a ResolvedPrimaryRef carrying a filter,
// processColumn inner-joins the filter to reduce the key space before batching.
// Only keys present in the filter column must reach the body.
const filterSpec: PUniversalColumnSpec = {
  kind: "PColumn",
  name: "filter",
  valueType: "String",
  axesSpec: [{ name: "key", type: "String" }],
};

eTplTest.concurrent(
  "batch mode: ResolvedPrimaryRef filter narrows the key space (inner-join)",
  async ({ helper, expect, stHelper }) => {
    // Primary has 5 keys. Filter covers only k2 and k4 — output is restricted
    // to those two; k1, k3, k5 are dropped.
    const theResult = await runBatch(helper, stHelper, (tx) => ({
      params: jsonParams(tx, {
        primaryEntries: [
          {
            spec: singleAxisSpec,
            dataInputName: "primaryData",
            filterSpec,
            filterDataInputName: "filterData",
            header: "heavyChain",
          },
        ],
        primaryJoin: "full",
        outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettings }],
        batch: { size: 10, keyColumns: ["key"], format: "tsv", passContent: true },
      }),
      primaryData: createJsonData(tx, 1, {
        '["k1"]': "EVQL",
        '["k2"]': "QVQL",
        '["k3"]': "DIQM",
        '["k4"]': "EIVL",
        '["k5"]': "DVQL",
      }),
      filterData: createJsonData(tx, 1, { '["k2"]': "keep", '["k4"]': "keep" }),
    }));

    const hcContent = readJsonPartition(theResult.inputs["tsv.heavyChain.data"]);
    expect(Object.keys(hcContent).sort()).toEqual(['["k2"]', '["k4"]']);
    expect(hcContent).toMatchObject({ '["k2"]': "QVQL", '["k4"]': "EIVL" });
  },
);

eTplTest.concurrent(
  "batch mode: maxBatches step 4 — batch size inflates when total batch count exceeds limit",
  async ({ helper, expect, stHelper }) => {
    // 12 records, size=1 → would normally produce 12 batches. maxBatches=3
    // caps that to 3, so effective batch size inflates to ceil(12/3)=4. All 12
    // records must still appear — inflation is graceful, not lossy.
    const records: Record<string, string> = {};
    const expectedKeys: string[] = [];
    for (let i = 0; i < 12; i++) {
      const k = `k${i.toString().padStart(2, "0")}`;
      records[`["${k}"]`] = `SEQ${i}`;
      expectedKeys.push(k);
    }

    const theResult = await runBatch(helper, stHelper, (tx) => ({
      params: jsonParams(tx, {
        primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data1", header: "heavyChain" }],
        primaryJoin: "full",
        outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettings }],
        batch: {
          size: 1,
          keyColumns: ["key"],
          format: "tsv",
          passContent: true,
          maxBatches: 3,
        },
      }),
      data1: createJsonData(tx, 1, records),
    }));

    const hcContent = readJsonPartition(theResult.inputs["tsv.heavyChain.data"]);
    expect(Object.keys(hcContent).length).toEqual(12);
    for (const expected of expectedKeys) {
      expect(hcContent).toHaveProperty(`["${expected}"]`);
    }
  },
);
