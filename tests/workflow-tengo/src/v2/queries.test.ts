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
const ref = (block: string, name: string) => ({ block, workflow: "main", name });

/** The render failure of a single lookup that finds nothing, and of one that finds more than one. */
const MISSING = /single resolve has 0 results/;
const AMBIGUOUS = /single resolve has 2 or more results/;

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
  "wf.query finds every value a producer exports, each ref decoded as {block, workflow, name}, with data where the producer has data",
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
  "the table builder fails the table run for a spec-only primary or a spec-only column, beside a table built from a column with data",
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

    const noData = /unsupported p-column data type: \{[^}]*BResolveSingleNoResult/;
    for (const [args, blockId] of [
      [{ primary: specOnlyRef }, "table-speconly-primary"],
      [{ primary: scoreRef, column: specOnlyRef }, "table-speconly-column"],
    ] as const) {
      const render = await renderWorkflowV2(helper, "v2.table", { blockId, args, upstream });
      await expect(resultFileContent(render, "table", driverKit, TIMEOUT)).rejects.toThrow(noData);
    }
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
  "a ref a query returned resolves again directly and as a table builder primary, and a resolved column made from the hit is a table primary",
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
    const content = await resultFileContent(consumer, "table", driverKit, TIMEOUT);
    expect(content.trim().split("\n")).toStrictEqual(["ID\tScore", "A\t10", "B\t20", "C\t30"]);
    const hitContent = await resultFileContent(consumer, "hitTable", driverKit, TIMEOUT);
    expect(hitContent.trim().split("\n")).toStrictEqual(["ID\tScore", "A\t10", "B\t20", "C\t30"]);
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
    // a family-1 ref keeps the backend's form {blockId, name}
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

tplTest.concurrent(
  "family 1 resolve leaves the caller's options map unchanged",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const render = await renderFamilies(helper, "opts");
    expect(await resultJson(render, "resolve1WithOptsData", TIMEOUT)).toStrictEqual(["a", "b"]);
    expect(await resultJson(render, "opts1After", TIMEOUT)).toStrictEqual({
      spec: true,
      data: true,
    });
  },
);

// ---------------------------------------------------------------------------------------------
// Refs, single lookups and options of the v2 query API.

const numbersQuery = (block: string) => ({
  type: "And",
  operands: [
    { type: "Name", name: "pl7.app/test/numbers" },
    { type: "Domain", domain: { "pl7.app/test/set": block } },
  ],
});

const nothingQuery = { type: "Name", name: "pl7.app/test/nothing" };

/** Renders v2.query with `calls` over one pool `block`. */
const renderCalls = (
  helper: Parameters<typeof renderWorkflowV2>[0],
  blockId: string,
  pool: { block: string; render: V2Render },
  calls: Record<string, unknown>,
) => renderWorkflowV2(helper, "v2.query", { blockId, args: { calls }, upstream: [pool] });

tplTest.concurrent(
  "a decoded ref is exactly {block, workflow, name} through query and resolve, and it resolves again to the same value",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const block = "exactref-pool";
    const pool = { block, render: await renderPool(helper, block, [21, 22]) };
    const consumer = await renderCalls(helper, "exactref-consumer", pool, {
      resolved: { resolve: ref(block, "numbers") },
      queried: { query: numbersQuery(block) },
    });
    const decoded = await json<{ resolved: Described; queried: Described[] }>(consumer, "decoded");
    expect(decoded.resolved.ref).toStrictEqual({ block, workflow: "main", name: "numbers" });
    expect(decoded.queried).toHaveLength(1);
    expect(decoded.queried[0].ref).toStrictEqual({ block, workflow: "main", name: "numbers" });

    const again = await renderWorkflowV2(helper, "v2.resolve-again", {
      blockId: "exactref-again",
      args: { query: numbersQuery(block) },
      upstream: [pool],
    });
    expect(await json(again, "hitCount")).eq(1);
    expect(await json(again, "hitRef")).toStrictEqual({ block, workflow: "main", name: "numbers" });
    const againDecoded = await json<{ again: Described }>(again, "decoded");
    expect(againDecoded.again.ref).toStrictEqual({ block, workflow: "main", name: "numbers" });
    expect(againDecoded.again.data).toStrictEqual({ state: "value", value: [21, 22] });
  },
);

tplTest.concurrent(
  "wf.resolve of a ref that matches nothing fails the render, beside a ref that finds its value",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const block = "missing-pool";
    const pool = { block, render: await renderPool(helper, block, [23]) };
    const found = await renderCalls(helper, "missing-control", pool, {
      found: { resolve: ref(block, "numbers") },
    });
    const decoded = await json<{ found: Described }>(found, "decoded");
    expect(decoded.found.data).toStrictEqual({ state: "value", value: [23] });

    const missing = await renderCalls(helper, "missing-consumer", pool, {
      missing: { resolve: ref(block, "nothing") },
    });
    await expect(json(missing, "decoded")).rejects.toThrow(MISSING);
  },
);

tplTest.concurrent(
  "wf.query with single gives the one match as an item, and fails the render on zero matches and on two",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const a = { block: "single-pool-a", render: await renderPool(helper, "single-pool-a", [24]) };
    const b = { block: "single-pool-b", render: await renderPool(helper, "single-pool-b", [25]) };
    const upstream = [a, b];
    const single = { single: true };

    const one = await renderWorkflowV2(helper, "v2.query", {
      blockId: "single-one",
      args: { calls: { one: { query: numbersQuery("single-pool-a"), options: single } } },
      upstream,
    });
    const decoded = await json<{ one: Described }>(one, "decoded");
    expect(decoded.one.ref).toStrictEqual({
      block: "single-pool-a",
      workflow: "main",
      name: "numbers",
    });
    expect(decoded.one.data).toStrictEqual({ state: "value", value: [24] });

    const zero = await renderWorkflowV2(helper, "v2.query", {
      blockId: "single-zero",
      args: { calls: { zero: { query: nothingQuery, options: single } } },
      upstream,
    });
    await expect(json(zero, "decoded")).rejects.toThrow(MISSING);

    // both producers export a value named "numbers" with this column name
    const two = await renderWorkflowV2(helper, "v2.query", {
      blockId: "single-two",
      args: {
        calls: { two: { query: { type: "Name", name: "pl7.app/test/numbers" }, options: single } },
      },
      upstream,
    });
    await expect(json(two, "decoded")).rejects.toThrow(AMBIGUOUS);
  },
);

tplTest.concurrent(
  "wf.query without single and with zero matches is an empty list, beside a query that finds its value",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const block = "empty-pool";
    const pool = { block, render: await renderPool(helper, block, [26]) };
    const consumer = await renderCalls(helper, "empty-consumer", pool, {
      none: { query: nothingQuery },
      found: { query: numbersQuery(block) },
    });
    const decoded = await json<{ none: Described[]; found: Described[] }>(consumer, "decoded");
    expect(decoded.none).toStrictEqual([]);
    expect(decoded.found.map((d) => d.data)).toStrictEqual([{ state: "value", value: [26] }]);
  },
);

tplTest.concurrent.for([
  {
    kind: "errIfMissing",
    call: (r: unknown) => ({ resolve: r, options: { errIfMissing: true } }),
    message: /query option "errIfMissing" is not allowed in the v2 query API/,
  },
  {
    kind: "first",
    call: () => ({ query: nothingQuery, options: { first: true } }),
    message: /query option "first" is not allowed in the v2 query API/,
  },
  {
    kind: "unknown",
    call: () => ({ query: nothingQuery, options: { color: true } }),
    message: /query option "color" is not allowed in the v2 query API/,
  },
  {
    kind: "nonBoolean",
    call: (r: unknown) => ({ resolve: r, options: { data: "yes" } }),
    message: /query option "data" must be a boolean/,
  },
  {
    kind: "nonBooleanSingle",
    call: () => ({ query: nothingQuery, options: { single: "yes" } }),
    message: /query option "single" must be a boolean/,
  },
])(
  "a v2 query option $kind fails the render",
  async ({ kind, call, message }, { helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const block = `option-pool-${kind}`;
    const pool = { block, render: await renderPool(helper, block, [27]) };
    const render = await renderCalls(helper, `option-consumer-${kind}`, pool, {
      x: call(ref(block, "numbers")),
    });
    await expect(json(render, "decoded")).rejects.toThrow(message);
  },
);

tplTest.concurrent.for([
  { kind: "extraKey", malformed: { block: "b", workflow: "main", name: "numbers", extra: "x" } },
  { kind: "missingField", malformed: { block: "b", name: "numbers" } },
  { kind: "slashInBlock", malformed: { block: "b/c", workflow: "main", name: "numbers" } },
  { kind: "slashInWorkflow", malformed: { block: "b", workflow: "main/x", name: "numbers" } },
])(
  "wf.resolve of a ref with $kind fails the render",
  async ({ kind, malformed }, { helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const render = await renderWorkflowV2(helper, "v2.query", {
      blockId: `malformed-${kind}`,
      args: { calls: { x: { resolve: malformed } } },
    });
    await expect(json(render, "decoded")).rejects.toThrow(/a ref is \{block, workflow, name\}/);
  },
);

tplTest.concurrent(
  "an anchored item that is not expectMultiple fails the render on zero matches and on two, beside one that finds its value",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const block = "anchored-single-pool";
    const upstream = [{ block, render: await renderPool(helper, block, [28]) }];
    const byAnchor = (name: string) => ({
      name,
      domain: { "pl7.app/test/set": { anchor: "main" } },
    });
    const anchoredItem = (blockId: string, item: unknown) =>
      renderWorkflowV2(helper, "v2.anchored-item", {
        blockId,
        args: { anchor: ref(block, "numbers"), item },
        upstream,
      });

    const found = await anchoredItem("anchored-single-found", byAnchor("pl7.app/test/label"));
    expect(await json(found, "spec")).toMatchObject({ name: "pl7.app/test/label" });

    const zero = await anchoredItem("anchored-single-zero", byAnchor("pl7.app/test/nothing"));
    await expect(json(zero, "spec")).rejects.toThrow(MISSING);

    // the pool exports two "counts" values, for species human and mouse
    const two = await anchoredItem("anchored-single-two", byAnchor("pl7.app/test/counts"));
    await expect(json(two, "spec")).rejects.toThrow(AMBIGUOUS);
  },
);

tplTest.concurrent(
  "a value exported by a workflow other than main decodes with that workflow in its ref, and resolves by it",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const block = "otherwf-pool";
    const pool = { block, workflow: "preview", render: await renderPool(helper, block, [31]) };
    const numbers = { block, workflow: "preview", name: "numbers" };
    const consumer = await renderWorkflowV2(helper, "v2.query", {
      blockId: "otherwf-consumer",
      args: { calls: { resolved: { resolve: numbers }, queried: { query: numbersQuery(block) } } },
      upstream: [pool],
    });
    const decoded = await json<{ resolved: Described; queried: Described[] }>(consumer, "decoded");
    expect(decoded.resolved.ref).toStrictEqual(numbers);
    expect(decoded.resolved.data).toStrictEqual({ state: "value", value: [31] });
    expect(decoded.queried.map((d) => d.ref)).toStrictEqual([numbers]);
  },
);

tplTest.concurrent(
  "family 1 resolve of an address nothing exports decodes to nothing, without failing the render",
  async ({ helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const render = await renderFamilies(helper, "missing", {
      missing1: { blockId: "families-v1-missing", name: "absent" },
    });
    const decoded = (await resultJson(render, "decoded", TIMEOUT)) as Record<string, unknown>;
    expect(decoded.missing1).eq("none");
    expect((decoded.resolve1 as Described).data).toStrictEqual({
      state: "value",
      value: ["a", "b"],
    });
  },
);

tplTest.concurrent(
  "a v2 table with a ref primary and a column query anchored to it finds the query's columns",
  async ({ helper, pl, expect, skip, driverKit }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const tablePool = await renderTablePool(helper, "table-query-pool");
    const render = await renderWorkflowV2(helper, "v2.table", {
      blockId: "table-query-consumer",
      args: {
        primary: ref("table-query-pool", "score"),
        column: { name: "pl7.app/score", axes: [{ anchor: "main", name: "pl7.app/id" }] },
        columnHeader: "Score again",
      },
      upstream: [{ block: "table-query-pool", render: tablePool }],
    });
    const content = await resultFileContent(render, "table", driverKit, TIMEOUT);
    expect(content.trim().split("\n")).toStrictEqual([
      "ID\tScore\tScore again",
      "A\t10\t10",
      "B\t20\t20",
      "C\t30\t30",
    ]);
  },
);

const serializedId = JSON.stringify({ __isRef: true, blockId: "nowhere/main", name: "x" });

tplTest.concurrent.for([
  {
    kind: "a table enrichment column's hit",
    template: "v2.table",
    args: {
      primary: ref("nowhere", "score"),
      column: { __isEnrichment: "v1", hit: serializedId, path: [] },
    },
  },
  { kind: "a bundle's single", template: "v2.bundle", args: { single: serializedId } },
])(
  "a serialized value id given as $kind fails the render under the v2 query API",
  async ({ kind, template, args }, { helper, pl, expect, skip }) => {
    if (!hasValuesTree(pl)) skip("the backend has no BContext/2 family");

    const render = await renderWorkflowV2(helper, template, {
      blockId: `serialized-${kind.replace(/\W+/g, "-")}`,
      args,
    });
    const output = template === "v2.table" ? "table" : "decoded";
    await expect(json(render, output)).rejects.toThrow(
      /serialized value ids are not supported by this query API/,
    );
  },
);
