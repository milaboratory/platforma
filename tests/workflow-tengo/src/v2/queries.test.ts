import { Annotation, Pl } from "@milaboratories/pl-middle-layer";
import { awaitStableState, tplTest } from "@platforma-sdk/test";
import dedent from "dedent";
import { vi } from "vitest";
import {
  contextChain,
  hasValuesTree,
  renderWorkflowV2,
  resultFileContent,
  resultJson,
  type V2Render,
} from "./render-v2";

const TIMEOUT = 60_000;
vi.setConfig({ testTimeout: 4 * TIMEOUT });

/** A ref to a value a v2 block's main workflow exports. */
const ref = (block: string, name: string) => ({
  __isRef: true,
  blockId: `${block}/main`,
  name,
});

/** What v2.describe reports for one decoded item. */
type Described = {
  keys: string[];
  ref?: Record<string, unknown>;
  specName?: string;
  data: { state: string; value?: unknown; type?: string; isSet?: boolean };
};

const json = async <T>(render: V2Render, name: string): Promise<T> =>
  (await resultJson(render, name, TIMEOUT)) as T;

const sortedKeys = (d: Described) => [...d.keys].sort();

const byRefName = (items: Described[]) =>
  [...items].sort((a, b) => String(a.ref?.name).localeCompare(String(b.ref?.name)));

/** Renders the pool producer (v2.pool) as block `block`. */
const renderPool = (
  helper: Parameters<typeof renderWorkflowV2>[0],
  block: string,
  numbers: number[],
  withPending = false,
) => renderWorkflowV2(helper, "v2.pool", { blockId: block, args: { numbers, withPending } });

// ---------------------------------------------------------------------------------------------
// Table builder inputs: one CSV imported by v2.table-pool into real PColumns.

const scoreCsv = dedent`
  id,score
  A,10
  B,20
  C,30
`;

const scoreImportSpec = {
  axes: [
    {
      column: "id",
      spec: {
        name: "pl7.app/id",
        type: "String",
        annotations: { [Annotation.Label]: "ID" } satisfies Annotation,
      },
    },
  ],
  columns: [
    {
      column: "score",
      id: "score",
      spec: {
        valueType: "Int",
        name: "pl7.app/score",
        annotations: { [Annotation.Label]: "Score" } satisfies Annotation,
      },
    },
  ],
  storageFormat: "Json",
  partitionKeyLength: 0,
};

const specOnlyColumnSpec = {
  kind: "PColumn",
  name: "pl7.app/test/specOnlyScore",
  valueType: "Int",
  axesSpec: [{ name: "pl7.app/id", type: "String", annotations: { "pl7.app/label": "ID" } }],
  annotations: { "pl7.app/label": "SpecOnlyScore" },
};

const renderTablePool = (helper: Parameters<typeof renderWorkflowV2>[0], block: string) =>
  renderWorkflowV2(helper, "v2.table-pool", {
    blockId: block,
    args: { csv: scoreCsv, spec: scoreImportSpec, specOnlySpec: specOnlyColumnSpec },
  });

// ---------------------------------------------------------------------------------------------

tplTest.concurrent(
  "an anchored query under the v2 workflow finds the anchor, a spec-only value by the anchor's domain and a value by a context-domain criterion",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const pool = await renderPool(helper, "anchored-pool", [4, 5]);
    const consumer = await renderWorkflowV2(helper, "v2.anchored", {
      blockId: "anchored-consumer",
      args: { anchor: ref("anchored-pool", "numbers") },
      upstream: [{ block: "anchored-pool", render: pool }],
    });

    expect(await json(consumer, "anchorSpec")).toMatchObject({
      name: "pl7.app/test/numbers",
      domain: { "pl7.app/test/set": "anchored-pool" },
    });
    expect(await json(consumer, "anchorData")).toStrictEqual([4, 5]);
    expect(await json(consumer, "labelSpec")).toMatchObject({ name: "pl7.app/test/label" });
    expect(await json(consumer, "mouseCountsData")).toStrictEqual([2]);

    const decoded = await json<Record<string, Described>>(consumer, "decoded");
    expect(decoded.anchor).toMatchObject({
      specName: "pl7.app/test/numbers",
      ref: ref("anchored-pool", "numbers"),
      data: { state: "value", value: [4, 5] },
    });
    // queried with specOnly: data not requested, so no data key
    expect(decoded.label).toMatchObject({
      specName: "pl7.app/test/label",
      ref: ref("anchored-pool", "label"),
      data: { state: "absent" },
    });
    expect(decoded.mouseCounts).toMatchObject({
      specName: "pl7.app/test/counts",
      ref: ref("anchored-pool", "mouseCounts"),
      data: { state: "value", value: [2] },
    });
  },
);

tplTest.concurrent(
  "wf.query finds every value a producer exports, each ref marked as a ref, with data where the producer has data",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const pool = await renderPool(helper, "choice-pool", [6, 7]);
    const consumer = await renderWorkflowV2(helper, "v2.query", {
      blockId: "choice-consumer",
      args: {
        calls: {
          all: { query: { type: "Domain", domain: { "pl7.app/test/set": "choice-pool" } } },
        },
      },
      upstream: [{ block: "choice-pool", render: pool }],
    });

    const decoded = await json<Record<string, Described[]>>(consumer, "decoded");
    const all = byRefName(decoded.all);
    expect(all.map((d) => d.ref)).toStrictEqual([
      ref("choice-pool", "humanCounts"),
      ref("choice-pool", "label"),
      ref("choice-pool", "mouseCounts"),
      ref("choice-pool", "numbers"),
    ]);
    expect(all.map((d) => d.specName)).toStrictEqual([
      "pl7.app/test/counts",
      "pl7.app/test/label",
      "pl7.app/test/counts",
      "pl7.app/test/numbers",
    ]);
    expect(all.map((d) => d.data)).toStrictEqual([
      { state: "value", value: [1] },
      { state: "absent" },
      { state: "value", value: [2] },
      { state: "value", value: [6, 7] },
    ]);
  },
);

tplTest.concurrent(
  "a spec-only value decodes with no data key through resolve and through query, beside a value with data",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const pool = await renderPool(helper, "speconly-pool", [11, 12]);
    const consumer = await renderWorkflowV2(helper, "v2.query", {
      blockId: "speconly-consumer",
      args: {
        calls: {
          numbers: { resolve: ref("speconly-pool", "numbers") },
          label: { resolve: ref("speconly-pool", "label") },
          labelByQuery: {
            query: {
              type: "And",
              operands: [
                { type: "Name", name: "pl7.app/test/label" },
                { type: "Domain", domain: { "pl7.app/test/set": "speconly-pool" } },
              ],
            },
          },
        },
      },
      upstream: [{ block: "speconly-pool", render: pool }],
    });

    const decoded = await json<{
      numbers: Described;
      label: Described;
      labelByQuery: Described[];
    }>(consumer, "decoded");

    expect(decoded.numbers).toMatchObject({
      specName: "pl7.app/test/numbers",
      ref: ref("speconly-pool", "numbers"),
      data: { state: "value", value: [11, 12] },
    });
    expect(sortedKeys(decoded.numbers)).toStrictEqual(["data", "ref", "spec"]);

    expect(decoded.label).toMatchObject({
      specName: "pl7.app/test/label",
      ref: ref("speconly-pool", "label"),
    });
    expect(sortedKeys(decoded.label)).toStrictEqual(["ref", "spec"]);

    expect(decoded.labelByQuery).toHaveLength(1);
    expect(decoded.labelByQuery[0]).toMatchObject({
      specName: "pl7.app/test/label",
      ref: ref("speconly-pool", "label"),
    });
    expect(sortedKeys(decoded.labelByQuery[0])).toStrictEqual(["ref", "spec"]);
  },
);

tplTest.concurrent(
  "a spec-only value in a PColumn bundle has no data, added as a ref and found by an anchored query, beside the anchor's data",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const pool = await renderPool(helper, "bundle-speconly-pool", [13]);
    const consumer = await renderWorkflowV2(helper, "v2.bundle", {
      blockId: "bundle-speconly-consumer",
      args: {
        anchor: ref("bundle-speconly-pool", "numbers"),
        ref: ref("bundle-speconly-pool", "label"),
        single: {
          name: "pl7.app/test/label",
          domain: { "pl7.app/test/set": { anchor: "main" } },
        },
      },
      upstream: [{ block: "bundle-speconly-pool", render: pool }],
    });

    const decoded = await json<Record<string, Described>>(consumer, "decoded");
    expect(decoded.anchor).toMatchObject({
      specName: "pl7.app/test/numbers",
      data: { state: "value", value: [13] },
    });
    // the bundle's accessor always builds { key, spec, data }; an item without data has data undefined
    console.log(
      "bundle, spec-only data state: added as a ref:",
      decoded.ref.data.state,
      "; found by an anchored query:",
      decoded.single.data.state,
    );
    expect(decoded.ref.specName).eq("pl7.app/test/label");
    expect(["absent", "undefined"]).toContain(decoded.ref.data.state);
    expect(decoded.single.specName).eq("pl7.app/test/label");
    expect(["absent", "undefined"]).toContain(decoded.single.data.state);
  },
);

tplTest.concurrent(
  "the table builder over a spec-only primary or a spec-only column: what happens is recorded beside a table built from a column with data",
  async ({ helper, pl, expect, skip, driverKit }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const tablePool = await renderTablePool(helper, "table-speconly-pool");
    const upstream = [{ block: "table-speconly-pool", render: tablePool }];
    const scoreRef = ref("table-speconly-pool", "score");
    const specOnlyRef = ref("table-speconly-pool", "specOnly");

    const control = await renderWorkflowV2(helper, "v2.table", {
      blockId: "table-speconly-control",
      args: { primary: scoreRef },
      upstream,
    });
    const content = await resultFileContent(control, "table", driverKit, TIMEOUT);
    expect(content.trim().split("\n")).toStrictEqual(["ID\tScore", "A\t10", "B\t20", "C\t30"]);

    const outcome = async (args: Record<string, unknown>, blockId: string) => {
      const render = await renderWorkflowV2(helper, "v2.table", { blockId, args, upstream });
      try {
        return { content: await resultFileContent(render, "table", driverKit, TIMEOUT) };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    };

    const specOnlyPrimary = await outcome({ primary: specOnlyRef }, "table-speconly-primary");
    const specOnlyColumn = await outcome(
      { primary: scoreRef, column: specOnlyRef },
      "table-speconly-column",
    );
    console.log(
      "table builder, spec-only primary:",
      JSON.stringify(specOnlyPrimary),
      "\ntable builder, spec-only column:",
      JSON.stringify(specOnlyColumn),
    );
    expect(specOnlyPrimary).toBeDefined();
    expect(specOnlyColumn).toBeDefined();
  },
);

tplTest.concurrent(
  "not requested, absent and pending data are three distinct decoded states on one chain, each beside a found value",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const pool = await renderPool(helper, "states-pool", [14, 15], true);
    const domainQuery = { type: "Domain", domain: { "pl7.app/test/set": "states-pool" } };
    const consumer = await renderWorkflowV2(helper, "v2.query", {
      blockId: "states-consumer",
      args: {
        calls: {
          found: { resolve: ref("states-pool", "numbers") },
          notRequested: { resolve: ref("states-pool", "numbers"), options: { data: false } },
          absent: { resolve: ref("states-pool", "label") },
          pending: { resolve: ref("states-pool", "pending") },
          choice: { query: domainQuery },
          choiceNotRequested: { query: domainQuery, options: { data: false } },
        },
      },
      upstream: [{ block: "states-pool", render: pool }],
    });

    const decoded = await json<{
      found: Described;
      notRequested: Described;
      absent: Described;
      pending: Described;
      choice: Described[];
      choiceNotRequested: Described[];
    }>(consumer, "decoded");

    // through resolve (single)
    expect(decoded.found).toMatchObject({
      specName: "pl7.app/test/numbers",
      data: { state: "value", value: [14, 15] },
    });
    expect(decoded.notRequested.specName).eq("pl7.app/test/numbers");
    expect(sortedKeys(decoded.notRequested)).toStrictEqual(["ref", "spec"]);
    expect(decoded.absent.specName).eq("pl7.app/test/label");
    expect(sortedKeys(decoded.absent)).toStrictEqual(["ref", "spec"]);
    expect(decoded.pending.specName).eq("pl7.app/test/pending");
    expect(decoded.pending.data).toStrictEqual({ state: "field", isSet: false });

    // through query (choice)
    const choice = Object.fromEntries(decoded.choice.map((d) => [String(d.ref?.name), d]));
    expect(Object.keys(choice).sort()).toStrictEqual([
      "humanCounts",
      "label",
      "mouseCounts",
      "numbers",
      "pending",
    ]);
    expect(choice.numbers.data).toStrictEqual({ state: "value", value: [14, 15] });
    expect(sortedKeys(choice.label)).toStrictEqual(["ref", "spec"]);
    expect(choice.pending.data).toStrictEqual({ state: "field", isSet: false });

    expect(decoded.choiceNotRequested).toHaveLength(5);
    for (const d of decoded.choiceNotRequested) {
      expect(sortedKeys(d)).toStrictEqual(["ref", "spec"]);
    }
  },
);

tplTest.concurrent(
  "a ref a query returned resolves again directly, nested in a map and as a table builder primary",
  async ({ helper, pl, expect, skip, driverKit }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const pool = await renderPool(helper, "reuse-pool", [8, 9]);
    const tablePool = await renderTablePool(helper, "reuse-table-pool");
    const consumer = await renderWorkflowV2(helper, "v2.reuse", {
      blockId: "reuse-consumer",
      upstream: [
        { block: "reuse-pool", render: pool },
        { block: "reuse-table-pool", render: tablePool },
      ],
    });

    expect(await json(consumer, "numbersHitCount")).eq(1);
    expect(await json(consumer, "scoreHitCount")).eq(1);
    expect(await json(consumer, "numbersRef")).toStrictEqual(ref("reuse-pool", "numbers"));
    expect(await json(consumer, "directSpec")).toMatchObject({ name: "pl7.app/test/numbers" });
    expect(await json(consumer, "directData")).toStrictEqual([8, 9]);
    expect(await json(consumer, "nestedData")).toStrictEqual([8, 9]);
    const content = await resultFileContent(consumer, "table", driverKit, TIMEOUT);
    expect(content.trim().split("\n")).toStrictEqual(["ID\tScore", "A\t10", "B\t20", "C\t30"]);
  },
);

/** Renders v2.families over a BContext/1 chain (from a V1 workflow) and a BContext/2 chain. */
async function renderFamilies(
  helper: Parameters<typeof renderWorkflowV2>[0],
  suffix: string,
  extra: Record<string, unknown> = {},
) {
  const v1 = await helper.renderWorkflow(
    "workflow.exports.wf1",
    false,
    { a: "a", b: "b" },
    { blockId: `families-v1-${suffix}` },
  );
  const ctx1 = await awaitStableState(v1.context(), TIMEOUT);
  const pool = await renderPool(helper, `families-v2-${suffix}`, [16, 17]);

  const request = {
    ref1: { blockId: `families-v1-${suffix}`, name: "e1" },
    ref2: ref(`families-v2-${suffix}`, "numbers"),
    query1: { type: "Name", name: "pl7.app/test1" },
    query2: { type: "Name", name: "pl7.app/test/label" },
    ...extra,
  };
  return await helper.renderTemplate(true, "v2.families", ["result"], (tx) => ({
    ctx1,
    ctx2: contextChain(tx, [{ block: `families-v2-${suffix}`, render: pool }]),
    request: tx.createValue(Pl.JsonObject, JSON.stringify(request)),
  }));
}

tplTest.concurrent(
  "both resolver families in one template, interleaved, each find their own value over their own chain",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const render = await renderFamilies(helper, "both");

    expect(await resultJson(render, "resolve1Data", TIMEOUT)).toStrictEqual(["a", "b"]);
    expect(await resultJson(render, "resolve2Data", TIMEOUT)).toStrictEqual([16, 17]);

    const decoded = (await resultJson(render, "decoded", TIMEOUT)) as {
      resolve1: Described;
      resolve2: Described;
      query1: Described[];
      query2: Described[];
    };
    // family 1 decodes as it always did: no __isRef on the ref
    expect(decoded.resolve1.ref).toStrictEqual({ blockId: "families-v1-both", name: "e1" });
    expect(decoded.resolve1.data).toStrictEqual({ state: "value", value: ["a", "b"] });
    expect(decoded.resolve2).toMatchObject({
      specName: "pl7.app/test/numbers",
      ref: ref("families-v2-both", "numbers"),
      data: { state: "value", value: [16, 17] },
    });
    expect(decoded.query1.map((d) => d.specName)).toStrictEqual(["pl7.app/test1"]);
    expect(decoded.query1[0].ref).toStrictEqual({ blockId: "families-v1-both", name: "e2" });
    expect(decoded.query2).toHaveLength(1);
    expect(decoded.query2[0]).toMatchObject({
      specName: "pl7.app/test/label",
      ref: ref("families-v2-both", "label"),
    });
    expect(sortedKeys(decoded.query2[0])).toStrictEqual(["ref", "spec"]);
  },
);

tplTest.concurrent(
  "asking for a resolver family other than 1 or 2 stops the render",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const render = await renderFamilies(helper, "unknown", { unknownFamily: true });
    await expect(resultJson(render, "resolve2Data", TIMEOUT)).rejects.toThrow(
      /unknown resolver family/,
    );
  },
);

tplTest.concurrent(
  "an auto workflow applies prepare: the resolved value reaches the body and isProduction is false",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const pool = await renderPool(helper, "auto-pool", [10]);
    const auto = await renderWorkflowV2(helper, "v2.auto", {
      blockId: "auto-consumer",
      isProduction: false,
      args: { source: ref("auto-pool", "numbers") },
      upstream: [{ block: "auto-pool", render: pool }],
    });

    expect(await json(auto, "isProduction")).eq(false);
    expect(await json(auto, "preparedSpecName")).eq("pl7.app/test/numbers");
    expect(await json(auto, "preparedData")).toStrictEqual([10]);
    expect(await json(auto, "preparedRef")).toStrictEqual(ref("auto-pool", "numbers"));
  },
);

tplTest.concurrent(
  "a PColumn bundle with an anchor, a ref and an anchored query under the v2 workflow finds each value",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const pool = await renderPool(helper, "bundle-pool", [18, 19]);
    const consumer = await renderWorkflowV2(helper, "v2.bundle", {
      blockId: "bundle-consumer",
      args: {
        anchor: ref("bundle-pool", "numbers"),
        ref: ref("bundle-pool", "mouseCounts"),
        multi: {
          name: "pl7.app/test/counts",
          domain: { "pl7.app/test/set": { anchor: "main" } },
        },
      },
      upstream: [{ block: "bundle-pool", render: pool }],
    });

    const decoded = (await json<Record<string, unknown>>(consumer, "decoded")) as {
      anchor: Described;
      ref: Described;
      multi: Described[];
    };
    expect(decoded.anchor).toMatchObject({
      specName: "pl7.app/test/numbers",
      data: { state: "value", value: [18, 19] },
    });
    expect(decoded.ref).toMatchObject({
      specName: "pl7.app/test/counts",
      data: { state: "value", value: [2] },
    });
    expect(decoded.multi.map((d) => d.specName)).toStrictEqual([
      "pl7.app/test/counts",
      "pl7.app/test/counts",
    ]);
    expect(
      decoded.multi
        .map((d) => d.data)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    ).toStrictEqual([
      { state: "value", value: [1] },
      { state: "value", value: [2] },
    ]);
  },
);
