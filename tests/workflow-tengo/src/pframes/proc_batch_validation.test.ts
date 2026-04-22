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
