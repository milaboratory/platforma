import { eTplTest } from "./extended_tpl_test";
import { getLongTestTimeout } from "@milaboratories/test-helpers";
import { vi } from "vitest";
import { jsonParams, readJsonPartition, runBatch, singleAxisSpec } from "./proc_batch_common";

vi.setConfig({ testTimeout: getLongTestTimeout(60_000) });

// batch.maxBatches on PARTITIONED input.
//
// The orchestrator estimates batch count with recordsInGroup(), which is exact
// only for inline PColumnData/Json — for JsonPartitioned / ParquetPartitioned it
// returns the PARTITION count and for BinaryPartitioned partitions/2. A
// single-partition column therefore reports 1 record no matter how many rows it
// holds, the inflation gate `totalBatches > maxBatches` never fires, and the cap
// silently does nothing. That is the shape every real block input has, so the
// cap used to be a no-op exactly when it was needed (sequence-embeddings:
// 553789 sequences, maxBatches 50, got ~185 batches of 3000).
//
// `partitionedTsv` makes the harness build a real single-partition
// JsonPartitioned primary (write tsv -> xsv.importFile with
// partitionKeyLength=0) instead of an inline column.
const PARTITIONED_TSV = (() => {
  const lines = ["key\theavyChain"];
  for (let i = 0; i < 12; i++) lines.push(`k${i.toString().padStart(2, "0")}\tSEQ${i}`);
  return lines.join("\n") + "\n";
})();

// 12 rows, size=1, maxBatches=3, one isolation scope => scopeMaxBatches=3,
// inflated size ceil(12/3)=4, contiguous over the batch-key sort.
const EXPECTED_BATCHES: Record<string, string[]> = {
  k00: ["k00", "k01", "k02", "k03"],
  k04: ["k04", "k05", "k06", "k07"],
  k08: ["k08", "k09", "k10", "k11"],
};

const xsvSettingsBatchTag = {
  batchKeyColumns: ["key"],
  columns: [
    { column: "batchTag", id: "batchTag", spec: { valueType: "String", name: "batchTag" } },
  ],
  storageFormat: "Json",
} as const;

/** Groups keys by their batch tag — the decomposition that actually ran. */
function batchesFrom(tags: Record<string, unknown>): Map<string, string[]> {
  const batches = new Map<string, string[]>();
  for (const [rawKey, tag] of Object.entries(tags)) {
    const key = (JSON.parse(rawKey) as string[])[0];
    const members = batches.get(tag as string);
    if (members) members.push(key);
    else batches.set(tag as string, [key]);
  }
  for (const members of batches.values()) members.sort();
  return batches;
}

eTplTest.concurrent(
  "batch mode: maxBatches caps batch count on partitioned input (passContent=false)",
  async ({ helper, expect, stHelper }) => {
    // The sequence-embeddings configuration: format="tsv", passContent=false.
    // Before the fix this produced 12 batches of 1 — the cap was computed
    // against a partition count of 1, so it never engaged.
    const theResult = await runBatch(helper, stHelper, (tx) => ({
      params: jsonParams(tx, {
        bodyMode: "batchTagBlobTsv",
        partitionedTsv: PARTITIONED_TSV,
        primaryEntries: [{ spec: singleAxisSpec, dataInputName: "unused", header: "heavyChain" }],
        primaryJoin: "full",
        outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettingsBatchTag }],
        batch: {
          size: 1,
          keyColumns: ["key"],
          format: "tsv",
          passContent: false,
          maxBatches: 3,
        },
      }),
    }));

    const tags = readJsonPartition(theResult.inputs["tsv.batchTag.data"]);
    expect(Object.keys(tags)).toHaveLength(12);

    const batches = batchesFrom(tags);
    expect(batches.size).toEqual(3);
    expect(Object.fromEntries(batches)).toEqual(EXPECTED_BATCHES);
  },
);

eTplTest.concurrent(
  "batch mode: maxBatches caps batch count on partitioned input (passContent=true)",
  async ({ helper, expect, stHelper }) => {
    // The passContent=true path never recomputed batchCount at all, so it took
    // the undercounted value straight from the orchestrator: 1 batch of 1 row,
    // with the remaining 11 rows silently dropped (the slice loop clamps
    // endLine but never extends batchCount). Asserting all 12 keys survive is
    // the data-loss regression guard; the batch grouping is the cap check.
    const theResult = await runBatch(helper, stHelper, (tx) => ({
      params: jsonParams(tx, {
        bodyMode: "batchTag",
        partitionedTsv: PARTITIONED_TSV,
        primaryEntries: [{ spec: singleAxisSpec, dataInputName: "unused", header: "heavyChain" }],
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
    }));

    const tags = readJsonPartition(theResult.inputs["tsv.batchTag.data"]);
    expect(Object.keys(tags)).toHaveLength(12);

    const batches = batchesFrom(tags);
    expect(batches.size).toEqual(3);
    expect(Object.fromEntries(batches)).toEqual(EXPECTED_BATCHES);
  },
);
