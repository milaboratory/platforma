import type { PUniversalColumnSpec } from "@milaboratories/pl-middle-layer";
import type { TplTestHelpers } from "@platforma-sdk/test";
import { assertResource, eTplTest } from "./extended_tpl_test";
import type { SimpleTreeHelper } from "./extended_tpl_test";
import { getLongTestTimeout } from "@milaboratories/test-helpers";
import type { ExpectStatic } from "vitest";
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

// Most validation tests vary a single parameter on top of an otherwise-valid
// request. This wrapper builds the valid request, merges the override, and
// delegates to the shared expectPanic helper.
async function expectBatchPanic(
  helper: TplTestHelpers,
  stHelper: SimpleTreeHelper,
  expect: ExpectStatic,
  override: Record<string, unknown>,
  pattern: RegExp,
) {
  await expectPanic(
    helper,
    stHelper,
    expect,
    (tx) => ({
      params: jsonParams(tx, {
        primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data", header: "heavyChain" }],
        primaryJoin: "full",
        outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettings }],
        batch: { size: 2, keyColumns: ["key"], format: "tsv", passContent: true },
        ...override,
      }),
      data: createJsonData(tx, 1, { '["k1"]': "EVQL", '["k2"]': "QVQL" }),
    }),
    pattern,
  );
}

eTplTest.concurrent(
  "batch mode: aggregate + batch options are mutually exclusive",
  async ({ helper, stHelper, expect }) => {
    await expectBatchPanic(
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
    await expectBatchPanic(
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
    await expectBatchPanic(
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
    await expectBatchPanic(
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
    await expectBatchPanic(
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
    // Header "key" collides with the batch-key axis named "key".
    await expectBatchPanic(
      helper,
      stHelper,
      expect,
      { primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data", header: "key" }] },
      /header "key" collides with batch-key axis/,
    );
  },
);

eTplTest.concurrent(
  "batch mode: ndjson format with Xsv output missing xsvType is rejected",
  async ({ helper, stHelper, expect }) => {
    // xsvType omitted on the output; batch.format=ndjson is not importable.
    await expectBatchPanic(
      helper,
      stHelper,
      expect,
      {
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
    // File is non-primitive — batch mode routes through pt which only handles
    // primitive-valued PColumns.
    await expectBatchPanic(
      helper,
      stHelper,
      expect,
      {
        primaryEntries: [
          {
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

// batch.format=ndjson with passContent=true — body receives NDJSON content as a
// string, parses each row, and emits a ResourceMap. Verifies the end-to-end
// NDJSON delivery path across multiple batches.
eTplTest.concurrent(
  'batch mode: format="ndjson" with passContent delivers NDJSON content to body',
  async ({ helper, expect, stHelper }) => {
    // 5 records across 3 batches of size 2 (last batch holds 1).
    const records: Record<string, string> = {};
    const expectedKeys: string[] = [];
    for (let i = 0; i < 5; i++) {
      const k = `k${i}`;
      records[`["${k}"]`] = `SEQ${i}`;
      expectedKeys.push(k);
    }

    const rm = await runBatch(helper, stHelper, (tx) => ({
      params: jsonParams(tx, {
        bodyMode: "ndjson",
        primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data", header: "heavyChain" }],
        primaryJoin: "full",
        outputs: [
          {
            type: "ResourceMap",
            name: "resMap",
            spec: { valueType: "File", name: "pl7.app/batch-test/ndjson-row", axesSpec: [] },
          },
        ],
        batch: { size: 2, keyColumns: ["key"], format: "ndjson", passContent: true },
      }),
      data: createJsonData(tx, 1, records),
    }));

    expect(rm.resourceType.name).toEqual("PColumnData/ResourceMap");
    const partitionKeys = Object.keys(rm.inputs);
    expect(partitionKeys.length).toEqual(5);
    for (const expected of expectedKeys) {
      expect(partitionKeys).toContain(`["${expected}"]`);
    }
  },
);

// Entry without pl7.app/label annotation → deriveHeaderFromSpec falls back to
// spec.name. Covers the single-map overload of normalizeColumnEntries.
const labeledSpecNoLabel: PUniversalColumnSpec = {
  kind: "PColumn",
  name: "heavyChain",
  valueType: "String",
  axesSpec: [{ name: "key", type: "String" }],
};

eTplTest.concurrent(
  "batch mode: header derived from spec.name when label annotation absent",
  async ({ helper, expect, stHelper }) => {
    const theResult = await runBatch(helper, stHelper, (tx) => ({
      params: jsonParams(tx, {
        primaryEntries: [{ spec: labeledSpecNoLabel, dataInputName: "data" }],
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

eTplTest.concurrent(
  "batch mode: primary accepts a single bare { spec, data } without array wrapping",
  async ({ helper, stHelper }) => {
    // singlePrimary: true → the test template passes primaryEntries[0] alone
    // (a bare { src, header } map) rather than wrapping it in an array.
    const theResult = await runBatch(helper, stHelper, (tx) => ({
      params: jsonParams(tx, {
        singlePrimary: true,
        primaryEntries: [{ spec: singleAxisSpec, dataInputName: "data", header: "heavyChain" }],
        primaryJoin: "full",
        outputs: [{ type: "Xsv", name: "tsv", xsvType: "tsv", settings: xsvSettings }],
        batch: { size: 10, keyColumns: ["key"], format: "tsv", passContent: true },
      }),
      data: createJsonData(tx, 1, { '["k1"]': "EVQL", '["k2"]': "QVQL" }),
    }));

    assertResource(theResult.inputs["tsv.heavyChain.data"]);
  },
);
