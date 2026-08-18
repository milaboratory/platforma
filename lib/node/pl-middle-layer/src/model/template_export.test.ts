import { describe, expect, test } from "vitest";
import canonicalize from "canonicalize";
import { createPlRef } from "@milaboratories/pl-model-common";
import type { ProjectStructure } from "./project_model";
import type { TemplateParamsResult } from "./template_export";
import { walkProjectForTemplateExport } from "./template_export";

function simpleStructure(...ids: string[]): ProjectStructure {
  return {
    groups: [
      {
        id: "g1",
        label: "G1",
        blocks: ids.map((id) => ({ id, label: id, renderingMode: "Heavy" })),
      },
    ],
  };
}

/** A provider backed by a plain map; blocks absent from it yield `undefined`. */
function providerFrom(params: Record<string, TemplateParamsResult>) {
  return (blockId: string): TemplateParamsResult | undefined => params[blockId];
}

const ok = (value: unknown): TemplateParamsResult => ({ value });

describe("order", () => {
  test("entries come out in structure order — no sort, none needed", () => {
    // The structure IS the topological order: a block can only legally reference
    // blocks above it, so emitting in this order gives a template file the ordering
    // it needs — every block after the blocks it references — for free.
    const walk = walkProjectForTemplateExport(
      simpleStructure("samples", "mixcr", "browser"),
      providerFrom({
        samples: ok({ dataset: "bulk-rna" }),
        mixcr: ok({ input: { block: "samples", output: "reads" } }),
        browser: ok({ clonotypes: { block: "mixcr", output: "clonotypes" } }),
      }),
    );

    expect(walk.problems).toEqual([]);
    expect(walk.entries.map((e) => e.blockId)).toEqual(["samples", "mixcr", "browser"]);
  });

  test("structure order wins over reference order", () => {
    // Same three blocks, structure reordered. The walk reports what the project
    // says, so a structure that violates the ordering rule produces a file that
    // reference validation rejects — it is not silently fixed here, because
    // reordering would change which references are even legal.
    const walk = walkProjectForTemplateExport(
      simpleStructure("browser", "samples", "mixcr"),
      providerFrom({ browser: ok({}), samples: ok({}), mixcr: ok({}) }),
    );

    expect(walk.entries.map((e) => e.blockId)).toEqual(["browser", "samples", "mixcr"]);
  });

  test("groups are flattened in order", () => {
    const structure: ProjectStructure = {
      groups: [
        { id: "g1", label: "G1", blocks: [{ id: "a", label: "a", renderingMode: "Heavy" }] },
        {
          id: "g2",
          label: "G2",
          blocks: [
            { id: "b", label: "b", renderingMode: "Heavy" },
            { id: "c", label: "c", renderingMode: "Heavy" },
          ],
        },
      ],
    };

    const walk = walkProjectForTemplateExport(
      structure,
      providerFrom({ a: ok({}), b: ok({}), c: ok({}) }),
    );

    expect(walk.entries.map((e) => e.blockId)).toEqual(["a", "b", "c"]);
  });

  test("an empty project walks to an empty template", () => {
    expect(walkProjectForTemplateExport(simpleStructure(), providerFrom({}))).toEqual({
      entries: [],
      problems: [],
    });
  });
});

describe("collecting each block's descriptor output", () => {
  test("params are carried through untouched", () => {
    // The walk does not reshape params — references were already rewritten into
    // template form on the SDK side, so there is nothing kind-specific to do here.
    const params = {
      species: "human",
      input: { block: "samples", output: "reads" },
      thresholds: [0.1, 0.2],
    };

    const walk = walkProjectForTemplateExport(
      simpleStructure("mixcr"),
      providerFrom({ mixcr: ok(params) }),
    );

    expect(walk.entries).toEqual([{ blockId: "mixcr", params }]);
  });

  test("a block with nothing to project yields empty params", () => {
    // Every block declares the lambda, so "no params at all" is not an outcome the walk
    // can produce. A block whose state carries nothing worth restoring returns `{}`.
    const walk = walkProjectForTemplateExport(
      simpleStructure("pool-explorer"),
      providerFrom({ "pool-explorer": ok({}) }),
    );

    expect(walk.entries).toEqual([{ blockId: "pool-explorer", params: {} }]);
    expect(walk.problems).toEqual([]);
  });
});

describe("what the walk does with params", () => {
  const UUID_A = "3f1b8c2e-5d4a-4c9f-8b17-2a6e0d9f4c31";
  const UUID_B = "9c7e4d10-2b83-4f6a-91d5-7e0c3a8b5f42";

  /** A canonical global-leaf identifier, i.e. a reference held as a string. */
  const leafId = (blockId: string, name: string) => canonicalize({ __isRef: true, blockId, name })!;

  test("params are written exactly as the block projected them", () => {
    // The walk parses nothing and rewrites nothing: a template-local entry id IS the block's
    // own id, so a wrapped reference already names the right entry.
    const params = { input: createPlRef(UUID_A, "reads"), species: "hsa" };
    const walk = walkProjectForTemplateExport(
      simpleStructure(UUID_A, UUID_B),
      providerFrom({ [UUID_A]: ok({}), [UUID_B]: ok(params) }),
    );

    expect(walk.problems).toEqual([]);
    expect(walk.entries[1].params).toBe(params);
  });

  test("a non-UUID id passes through unchanged too", () => {
    // `Project.addBlock` accepts an explicit id and only *defaults* it to a random UUID, so
    // "UUID" describes the common case, not a constraint.
    const walk = walkProjectForTemplateExport(
      simpleStructure("block1"),
      providerFrom({ block1: ok({}) }),
    );

    expect(walk.entries).toEqual([{ blockId: "block1", params: {} }]);
  });

  test("a wrapper's contents are never inspected, whatever they are", () => {
    // An identifier as a string, one under escape padding, a whole nested structure — all the
    // same to the walk, which is the property the wrapper exists to buy.
    const params = {
      asObject: createPlRef("a", "reads"),
      asString: leafId("a", "clones"),
      stringified: JSON.stringify(leafId("a", "clones")),
      nested: { deeper: [[createPlRef("a", "x")]] },
    };
    const walk = walkProjectForTemplateExport(
      simpleStructure("a", "b"),
      providerFrom({ a: ok({}), b: ok(params) }),
    );

    expect(walk.problems).toEqual([]);
    expect(walk.entries[1].params).toBe(params);
  });

  test("a reference the block did not wrap is written out as data, not refused", () => {
    // The engine exposes the wrapper mechanic and models nothing else, so it has no opinion
    // about an unwrapped `PlRef` — it is a value like any other. Wrapping the right things is
    // the block's statement to make, and getting it wrong yields a template that does not
    // work, the same way a wrong field name would. Pinned so the boundary stays deliberate.
    const params = { input: createPlRef("a", "reads") };
    const walk = walkProjectForTemplateExport(
      simpleStructure("a", "b"),
      providerFrom({ a: ok({}), b: ok(params) }),
    );

    expect(walk.problems).toEqual([]);
    expect(walk.entries[1].params).toBe(params);
  });

  test("a reference to a block outside the project is written out too", () => {
    // Same boundary from the other side: telling this apart would mean recognizing which
    // strings are identifiers, which is exactly the knowledge the engine does not hold. It
    // surfaces on apply, as a block wired to nothing.
    const params = { input: createPlRef("deleted", "reads") };
    const walk = walkProjectForTemplateExport(
      simpleStructure("b"),
      providerFrom({ b: ok(params) }),
    );

    expect(walk.problems).toEqual([]);
    expect(walk.entries[0].params).toBe(params);
  });
});

describe("problems", () => {
  test("a failed derivation is reported against its block, and the walk continues", () => {
    const walk = walkProjectForTemplateExport(
      simpleStructure("a", "b", "c"),
      providerFrom({
        a: ok({ x: 1 }),
        b: { error: "templateParams() threw: not exportable yet" },
        c: ok({ z: 3 }),
      }),
    );

    // Every offending block is reported at once rather than aborting on the
    // first, so the user fixes them in one pass.
    expect(walk.problems).toEqual([
      { blockId: "b", error: "templateParams() threw: not exportable yet" },
    ]);
    expect(walk.entries.map((e) => e.blockId)).toEqual(["a", "c"]);
  });

  test("a block with unreadable state is a problem, not a silent skip", () => {
    // `productionGraph` skips blocks it has no args for; export must not, because
    // a template that quietly omits a block does not describe the project — and
    // the surviving entries may still reference the omitted one.
    const walk = walkProjectForTemplateExport(
      simpleStructure("a", "ghost"),
      providerFrom({ a: ok({}) }),
    );

    expect(walk.entries.map((e) => e.blockId)).toEqual(["a"]);
    expect(walk.problems).toEqual([
      {
        blockId: "ghost",
        error: "Block state is unavailable, so its template params could not be derived",
      },
    ]);
  });

  test.each([
    { label: "a string", value: "not-params", expected: "a string" },
    { label: "a number", value: 42, expected: "a number" },
    { label: "null", value: null, expected: "null" },
    { label: "an array", value: [1, 2], expected: "an array" },
  ])("non-object params are rejected: $label", ({ value, expected }) => {
    // An entry's `params` must be a mapping. A block kind carries its params type
    // as a TypeScript type only, with no runtime schema, so nothing upstream
    // enforces this — the walk is the only place that can catch it.
    const walk = walkProjectForTemplateExport(
      simpleStructure("odd"),
      providerFrom({ odd: ok(value) }),
    );

    expect(walk.entries).toEqual([]);
    expect(walk.problems).toEqual([
      { blockId: "odd", error: `templateParams() must return an object, got ${expected}` },
    ]);
  });
});
