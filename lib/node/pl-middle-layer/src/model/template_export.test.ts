import { describe, expect, test } from "vitest";
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
    // blocks above it, so emitting in this order satisfies A-0036's "every block
    // must appear after the blocks it references" for free.
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
    // `validateProjectTemplateV1References` rejects — it is not silently fixed
    // here, because reordering would change which references are even legal.
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
    // A-0041: legal, and means "re-initialize from the kind's defaults".
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
    // An entry's `params` is a mapping (A-0036). A kind carries `Params` as a
    // type only (A-0019), so nothing upstream enforces this at runtime — this
    // walk is the only place that can catch it.
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
