import { describe, expect, test } from "vitest";
import canonicalize from "canonicalize";
import { createPlRef, createTemplateLocalRef } from "@milaboratories/pl-model-common";
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

  test("a block declaring no templateParams yields an entry with no params", () => {
    // Legal, and means "re-initialize this block from its kind's defaults".
    const walk = walkProjectForTemplateExport(
      simpleStructure("pool-explorer"),
      providerFrom({ "pool-explorer": ok(undefined) }),
    );

    expect(walk.entries).toEqual([{ blockId: "pool-explorer", params: undefined }]);
    expect(walk.problems).toEqual([]);
  });

  test("empty params are kept distinct from absent params", () => {
    const walk = walkProjectForTemplateExport(
      simpleStructure("empty", "absent"),
      providerFrom({ empty: ok({}), absent: ok(undefined) }),
    );

    // `{}` is written out and used as-is by `init`; no `params` re-initializes
    // from defaults. The two are not interchangeable.
    expect(walk.entries).toEqual([
      { blockId: "empty", params: {} },
      { blockId: "absent", params: undefined },
    ]);
  });
});

describe("template-local ids", () => {
  const UUID_A = "3f1b8c2e-5d4a-4c9f-8b17-2a6e0d9f4c31";
  const UUID_B = "9c7e4d10-2b83-4f6a-91d5-7e0c3a8b5f42";

  test("the project-local id is the template-local id, verbatim", () => {
    // A template has no id namespace of its own, so there is no remap step:
    // whatever the project calls a block is what the file calls it, which is why
    // references already stored in params need no translation.
    const walk = walkProjectForTemplateExport(
      simpleStructure(UUID_A, UUID_B),
      providerFrom({
        [UUID_A]: ok({}),
        [UUID_B]: ok({ input: createTemplateLocalRef(UUID_A, "reads") }),
      }),
    );

    expect(walk.problems).toEqual([]);
    expect(walk.entries.map((e) => e.blockId)).toEqual([UUID_A, UUID_B]);
    // The id inside the reference is the same string as the entry id it names —
    // this identity is the whole content of "no remap".
    expect(walk.entries[1].params).toEqual({ input: { block: UUID_A, output: "reads" } });
  });

  test("a non-UUID id passes through unchanged too", () => {
    // `Project.addBlock` accepts an explicit id and only *defaults* it to a random
    // UUID, so "UUID" describes the common case, not a constraint — and an entry id
    // is any non-empty string.
    const walk = walkProjectForTemplateExport(
      simpleStructure("block1"),
      providerFrom({ block1: ok({}) }),
    );

    expect(walk.entries).toEqual([{ blockId: "block1", params: {} }]);
  });

  test("a rewritten reference is not mistaken for an un-rewritten one", () => {
    // `TemplateLocalRef` carries no `__isRef` marker, so the detector cannot see
    // it — otherwise every correct export would be reported as a problem.
    const walk = walkProjectForTemplateExport(
      simpleStructure("a", "b"),
      providerFrom({
        a: ok({}),
        b: ok({
          input: createTemplateLocalRef("a", "reads"),
          nested: { list: [createTemplateLocalRef("a", "spec")] },
        }),
      }),
    );

    expect(walk.problems).toEqual([]);
  });

  test("a PlRef the codec failed to rewrite is caught", () => {
    // Guards against `toTemplateForm` being skipped or regressing: a live `PlRef`
    // reaching the walk means a project-local id is about to be written into a file
    // that has no way to resolve it.
    const walk = walkProjectForTemplateExport(
      simpleStructure("a", "b"),
      providerFrom({ a: ok({}), b: ok({ input: createPlRef(UUID_A, "reads") }) }),
    );

    expect(walk.entries.map((e) => e.blockId)).toEqual(["a"]);
    expect(walk.problems).toHaveLength(1);
    expect(walk.problems[0].blockId).toBe("b");
    expect(walk.problems[0].error).toContain(UUID_A);
  });

  test("a reference carried inside a string is caught — the EnrichmentRef case", () => {
    // An `EnrichmentRef`'s `hit` and each of its linker steps are global-form
    // `PObjectId`s: a canonicalized-JSON string of `{ __isRef: true, blockId, name }`.
    // `toTemplateForm` walks structurally and sees only a string, so the block id
    // survives the rewrite; `inferAllReferencedBlocks` unwraps it. That asymmetry is
    // what the guard exists for.
    const hit = canonicalize({ __isRef: true, blockId: UUID_A, name: "clones" })!;
    const walk = walkProjectForTemplateExport(
      simpleStructure("b"),
      providerFrom({ b: ok({ enrichment: { __isEnrichment: "v1", hit } }) }),
    );

    expect(walk.entries).toEqual([]);
    expect(walk.problems).toHaveLength(1);
    expect(walk.problems[0].error).toContain(UUID_A);
  });

  test("a doubly-stringified reference is caught", () => {
    // The detector peels one `JSON.stringify` pass per call and recurses, so extra
    // escape padding does not hide the id.
    const once = canonicalize({ __isRef: true, blockId: UUID_B, name: "clones" })!;
    const walk = walkProjectForTemplateExport(
      simpleStructure("b"),
      providerFrom({ b: ok({ nested: JSON.stringify(once) }) }),
    );

    expect(walk.problems).toHaveLength(1);
    expect(walk.problems[0].error).toContain(UUID_B);
  });

  test("every un-rewritten id is named at once, sorted", () => {
    const walk = walkProjectForTemplateExport(
      simpleStructure("b"),
      providerFrom({
        b: ok({ one: createPlRef(UUID_B, "x"), two: createPlRef(UUID_A, "y") }),
      }),
    );

    expect(walk.problems[0].error).toContain(`${UUID_A}, ${UUID_B}`);
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
