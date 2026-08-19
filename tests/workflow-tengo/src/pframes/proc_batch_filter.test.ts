import type { PUniversalColumnSpec } from "@milaboratories/pl-middle-layer";
import { assertResource, eTplTest } from "./extended_tpl_test";
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

// Xsv output for the batchTag body: the batch-key axis "key" plus a "batchTag"
// value column carrying the first key of the batch each row came from.
const xsvSettingsBatchTag = {
  batchKeyColumns: ["key"],
  columns: [
    { column: "batchTag", id: "batchTag", spec: { valueType: "String", name: "batchTag" } },
  ],
  storageFormat: "Json",
} as const;

// Same column, Parquet storage — xsvType="parquet" rejects Json storage
// (pframes.xsv-import-file). Used for the parquet output of the blob-path test.
const xsvSettingsBatchTagParquet = {
  ...xsvSettingsBatchTag,
  storageFormat: "Parquet",
} as const;

eTplTest.concurrent(
  "batch mode: maxBatches step 4 — inflated batch count and boundaries are observable",
  async ({ helper, expect, stHelper }) => {
    // Companion to the test above, which can only see that no records were lost:
    // it passes even if maxBatches is ignored entirely, because merging erases
    // the batch decomposition. Here the body tags every row with its batch's
    // first key, so the decomposition is readable from the merged output.
    //
    // 12 records at size=1 would be 12 batches. maxBatches=3 forces
    // effectiveBatchSize = ceil(12/3) = 4, and slicing is contiguous over the
    // batch-key sort, so exactly 3 batches must run: k00-k03 / k04-k07 / k08-k11.
    const records: Record<string, string> = {};
    for (let i = 0; i < 12; i++) {
      records[`["k${i.toString().padStart(2, "0")}"]`] = `SEQ${i}`;
    }

    const theResult = await runBatch(helper, stHelper, (tx) => ({
      params: jsonParams(tx, {
        bodyMode: "batchTag",
        primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data1", header: "heavyChain" }],
        primaryJoin: "full",
        outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettingsBatchTag }],
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

    const tags = readJsonPartition(theResult.inputs["tsv.batchTag.data"]);
    expect(Object.keys(tags)).toHaveLength(12);

    // Group keys by their batch tag → the batch decomposition that actually ran.
    const batches = new Map<string, string[]>();
    for (const [rawKey, tag] of Object.entries(tags)) {
      const key = (JSON.parse(rawKey) as string[])[0];
      const members = batches.get(tag as string);
      if (members) members.push(key);
      else batches.set(tag as string, [key]);
    }
    for (const members of batches.values()) members.sort();

    // The assertion the losslessness test cannot make: the cap was applied.
    // Ignoring maxBatches yields 12 batches here, not 3.
    expect(batches.size).toEqual(3);

    // Boundaries are the deterministic contiguous runs of the inflated size —
    // this is the property that keeps dedup safe across reruns.
    expect([...batches.keys()].sort()).toEqual(["k00", "k04", "k08"]);
    expect(batches.get("k00")).toEqual(["k00", "k01", "k02", "k03"]);
    expect(batches.get("k04")).toEqual(["k04", "k05", "k06", "k07"]);
    expect(batches.get("k08")).toEqual(["k08", "k09", "k10", "k11"]);
  },
);

eTplTest.concurrent(
  "batch mode: maxBatches inflation on the parquet blob path (passContent=false)",
  async ({ helper, expect, stHelper }) => {
    // Same measurement as the test above, on the other splitting path. With
    // passContent=false the orchestrator hands the body one joined file plus a
    // row count, and the split template recomputes batchCount from that *actual*
    // count (process-pcolumn-batch-split.tpl.tengo:156) instead of reusing the
    // orchestrator's partition-count upper bound — so the inflated batch size
    // reaches a genuinely different code path than the passContent=true test.
    //
    // format="parquet" requires passContent=false, and the body emits parquet for
    // an xsvType="parquet" Xsv output: parquet in, parquet out. That output can
    // only be checked structurally — xsvType="parquet" forces
    // storageFormat="Parquet" and these tests have no parquet reader — so the
    // body emits the same table as tsv too, and the twin tsv output carries the
    // batch decomposition in readable form. Same body invocations, same batches.
    const records: Record<string, string> = {};
    for (let i = 0; i < 12; i++) {
      records[`["k${i.toString().padStart(2, "0")}"]`] = `SEQ${i}`;
    }

    const theResult = await runBatch(helper, stHelper, (tx) => ({
      params: jsonParams(tx, {
        bodyMode: "batchTagBlob",
        primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data1", header: "heavyChain" }],
        primaryJoin: "full",
        outputs: [
          { type: "Xsv", name: "pq", xsvType: "parquet", settings: xsvSettingsBatchTagParquet },
          { type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettingsBatchTag },
        ],
        batch: {
          size: 1,
          keyColumns: ["key"],
          format: "parquet",
          passContent: false,
          maxBatches: 3,
        },
      }),
      data1: createJsonData(tx, 1, records),
    }));

    // The parquet output imported end-to-end (slice → parquet → merge → import).
    const pqData = theResult.inputs["pq.batchTag.data"];
    assertResource(pqData);
    expect(pqData.resourceType.name).toContain("Parquet");

    const tags = readJsonPartition(theResult.inputs["tsv.batchTag.data"]);
    expect(Object.keys(tags)).toHaveLength(12);

    const batches = new Map<string, string[]>();
    for (const [rawKey, tag] of Object.entries(tags)) {
      const key = (JSON.parse(rawKey) as string[])[0];
      const members = batches.get(tag as string);
      if (members) members.push(key);
      else batches.set(tag as string, [key]);
    }
    for (const members of batches.values()) members.sort();

    expect(batches.size).toEqual(3);
    expect([...batches.keys()].sort()).toEqual(["k00", "k04", "k08"]);
    expect(batches.get("k00")).toEqual(["k00", "k01", "k02", "k03"]);
    expect(batches.get("k04")).toEqual(["k04", "k05", "k06", "k07"]);
    expect(batches.get("k08")).toEqual(["k08", "k09", "k10", "k11"]);
  },
);
