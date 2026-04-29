// Cross-checks tengo `pframes.build-query.buildQuery` against the wasm
// pf-spec-driver. Fixtures mirror the rust tests in
// pframes-rs/packages/spec/src/requests/build_query/{logic,request}.rs.

import { SpecDriver } from "@milaboratories/pf-spec-driver";
import { Pl } from "@milaboratories/pl-middle-layer";
import type { BuildQueryInput, PDataColumnSpec, PObjectId } from "@milaboratories/pl-model-common";
import { awaitStableState } from "@platforma-sdk/test";
import { getLongTestTimeout } from "@milaboratories/test-helpers";
import { vi } from "vitest";
import { assertJson, assertResource, eTplTest } from "./extended_tpl_test";

const TIMEOUT = getLongTestTimeout(30_000);

vi.setConfig({
  testTimeout: TIMEOUT,
});

const id = (s: string) => s as PObjectId;

// Spec content is irrelevant to buildQuery (only `columnId` is read), but
// the shape mirrors the rust fixtures.
const colIdAndSpec = (columnId: PObjectId) => ({
  columnId,
  spec: {
    kind: "PColumn",
    name: "c",
    valueType: "Int",
    axesSpec: [{ name: "a", type: "Int" }],
  } satisfies PDataColumnSpec,
});

const linkerStep = (columnId: PObjectId) => ({
  type: "linker" as const,
  linker: colIdAndSpec(columnId),
  qualifications: [],
});

const linkerStepWithQuals = (
  columnId: PObjectId,
  qualifications: { axis: { name: string }; contextDomain: Record<string, string> }[],
) => ({
  type: "linker" as const,
  linker: colIdAndSpec(columnId),
  qualifications,
});

const filterStep = (columnId: PObjectId) => ({
  type: "filter" as const,
  filter: colIdAndSpec(columnId),
});

const sampleQual = () => ({ axis: { name: "a" }, contextDomain: { d: "1" } });
const discardedQual = () => ({ axis: { name: "a" }, contextDomain: { discarded: "1" } });

type Fixture = { name: string; input: BuildQueryInput };

// Mirror of the cases in sdk/workflow-tengo/src/pframes/build-query.test.tengo.
const FIXTURES: Fixture[] = [
  { name: "direct column, no qualifications", input: { version: "v1", column: id("c") } },
  {
    name: "direct column, qualified",
    input: { version: "v1", column: id("c"), qualifications: [sampleQual()] },
  },
  {
    name: "single filter step",
    input: { version: "v1", column: id("c"), path: [filterStep(id("f"))] },
  },
  {
    name: "linker chain (two steps)",
    input: {
      version: "v1",
      column: id("h"),
      path: [linkerStep(id("l1")), linkerStep(id("l2"))],
    },
  },
  {
    name: "mixed: linker then filter",
    input: {
      version: "v1",
      column: id("c"),
      path: [linkerStep(id("l")), filterStep(id("f"))],
    },
  },
  {
    name: "qualifications attach to outermost only",
    input: {
      version: "v1",
      column: id("h"),
      path: [linkerStep(id("l"))],
      qualifications: [sampleQual()],
    },
  },
  {
    name: "step-level linker qualifications discarded",
    input: {
      version: "v1",
      column: id("h"),
      path: [linkerStepWithQuals(id("l"), [discardedQual()])],
    },
  },
  {
    name: "filter step emits unqualified entry",
    input: { version: "v1", column: id("c"), path: [filterStep(id("f"))] },
  },
  {
    name: "multi-filter path right-folds",
    input: {
      version: "v1",
      column: id("c"),
      path: [filterStep(id("f1")), filterStep(id("f2"))],
    },
  },
  {
    name: "filter then linker (reverse mix)",
    input: {
      version: "v1",
      column: id("c"),
      path: [filterStep(id("f")), linkerStep(id("l"))],
    },
  },
  {
    name: "three-step chain: linker, filter, linker",
    input: {
      version: "v1",
      column: id("c"),
      path: [linkerStep(id("l1")), filterStep(id("f")), linkerStep(id("l2"))],
    },
  },
];

for (const fixture of FIXTURES) {
  eTplTest.concurrent(`buildQuery: ${fixture.name}`, async ({ helper, expect, stHelper }) => {
    const result = await helper.renderTemplate(true, "pframes.build-query", ["result"], (tx) => ({
      params: tx.createValue(Pl.JsonObject, JSON.stringify(fixture.input)),
    }));

    const r = stHelper.tree(result.resultEntry);
    const finalResult = await awaitStableState(r, TIMEOUT);
    assertResource(finalResult);

    const tengoNode = finalResult.inputs["result"];
    assertJson(tengoNode);
    const tengoOutput = tengoNode.content;

    await using driver = new SpecDriver();
    const wasmOutput = driver.buildQuery(fixture.input);

    // JSON round-trip strips field-order quirks before comparison.
    expect(JSON.parse(JSON.stringify(tengoOutput))).toEqual(JSON.parse(JSON.stringify(wasmOutput)));
  });
}
