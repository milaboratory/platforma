import { describe, expect, test } from "vitest";
import { createPlRef, toTemplateRef } from "@milaboratories/pl-model-common";
import type { TemplateIdMap, TemplateParamsRewrite } from "./template_ids";
import { createTemplateIdMap, liveParamsForCheck } from "./template_ids";

/**
 * The id map, exercised the way an apply uses it: assign, rewrite, create, record.
 *
 * Ids are injected as a counter so the assertions can name them. Nothing here needs a
 * project — the map's whole job is to be the part of construction that does not.
 *
 * A reference is written the way a block writes one: the value wrapped in `toTemplateRef`.
 * The engine never looks inside that wrapper, so the tests do not have to describe what is
 * in there beyond what the assertion is about.
 */

type LiveEntry = { readonly id: string; readonly params?: Record<string, unknown> };

/** Every field of `live` wrapped, as a block that projected references would write it. */
function wrapped(live: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(live).map(([k, v]) => [k, toTemplateRef(v)]));
}

function counterMap(): TemplateIdMap {
  let n = 0;
  return createTemplateIdMap(() => `block-${++n}`);
}

/** One forward pass over entries, as the construction loop will run it. */
function applyPass(entries: readonly LiveEntry[]): {
  added: Record<string, unknown>[];
  problem?: string;
} {
  const ids = counterMap();
  const added: Record<string, unknown>[] = [];

  for (const entry of entries) {
    const blockId = ids.assign(entry.id);

    let params: Record<string, unknown> | undefined;
    if (entry.params !== undefined) {
      const rewritten = ids.liveParams(entry.params);
      if (!rewritten.ok) return { added, problem: rewritten.error };
      params = rewritten.params;
    }

    added.push({ blockId, params });
    ids.record(entry.id, blockId);
  }

  return { added };
}

function paramsFrom(rewrite: TemplateParamsRewrite): Record<string, unknown> {
  if (!rewrite.ok) throw new Error(`expected a rewrite, got: ${rewrite.error}`);
  return rewrite.params;
}

describe("assign", () => {
  test("gives every entry its own id", () => {
    const ids = counterMap();

    expect([ids.assign("a"), ids.assign("b"), ids.assign("c")]).toEqual([
      "block-1",
      "block-2",
      "block-3",
    ]);
  });

  test("refuses to assign the same entry twice", () => {
    // Entry ids are unique by the document schema, so this means the document never went
    // through the parser — and the first block would be silently orphaned.
    const ids = counterMap();
    ids.assign("a");

    expect(() => ids.assign("a")).toThrow("already assigned");
  });

  test("an assigned id is not yet a redirect target", () => {
    // Only `record` publishes it, so an entry's own id is still absent from the map while
    // its params are rewritten — which is what keeps it from being wired to itself.
    const params = wrapped({ input: createPlRef("a", "reads") });
    const ids = counterMap();
    ids.assign("a");

    // Left as the file wrote it rather than reported: the engine does not parse a payload,
    // so it cannot tell an id it was not asked to redirect from any other text in there.
    // Validation is what rejects such a document, before an apply begins.
    expect(paramsFrom(ids.liveParams(params))).toEqual({ input: createPlRef("a", "reads") });
  });
});

describe("liveParams", () => {
  test("a reference becomes a PlRef naming the recorded block", () => {
    const params = wrapped({ input: createPlRef("samples", "reads") });
    const ids = counterMap();
    ids.record("samples", ids.assign("samples"));

    expect(paramsFrom(ids.liveParams(params))).toEqual({ input: createPlRef("block-1", "reads") });
  });

  test("rewrites references wherever they sit, and touches nothing else", () => {
    // The rewrite is structural and kind-agnostic: params are opaque, so it cannot know
    // where a reference will be.
    const params = wrapped({
      input: createPlRef("a", "reads"),
      nested: { deeper: [createPlRef("a", "spec"), { n: 1 }] },
      species: "hsa",
      threshold: null,
    });
    const ids = counterMap();
    ids.record("a", ids.assign("a"));

    expect(paramsFrom(ids.liveParams(params))).toEqual({
      input: createPlRef("block-1", "reads"),
      nested: { deeper: [createPlRef("block-1", "spec"), { n: 1 }] },
      species: "hsa",
      threshold: null,
    });
  });

  test("keeps requireEnrichments, which is part of the identifier", () => {
    // Nothing is stripped from an identifier on the way through a template: the flag is
    // carried by the dictionary entry and comes back with it.
    const params = wrapped({ input: createPlRef("a", "reads", true) });
    const ids = counterMap();
    ids.record("a", ids.assign("a"));

    expect(paramsFrom(ids.liveParams(params))).toEqual({
      input: createPlRef("block-1", "reads", true),
    });
  });

  test("params with no references come back unchanged", () => {
    const ids = counterMap();

    expect(paramsFrom(ids.liveParams({ numbers: [3, 1, 2] }))).toEqual({ numbers: [3, 1, 2] });
    expect(paramsFrom(ids.liveParams({}))).toEqual({});
  });

  test("an id the map does not cover is left exactly as it was", () => {
    // The cost of an engine that does not parse payloads, stated as a test: a dangling
    // reference cannot be distinguished here, so it survives into the applied block. The
    // document is rejected earlier — this pins where the responsibility sits.
    const params = wrapped({ input: createPlRef("ghost", "reads") });
    const ids = counterMap();

    expect(paramsFrom(ids.liveParams(params))).toEqual({ input: createPlRef("ghost", "reads") });
  });

  test("leaves the caller's params object alone", () => {
    // Params come from the parsed document, which the caller may still report against.
    const params = wrapped({ input: createPlRef("a", "reads") });
    const before = structuredClone(params);
    const ids = counterMap();
    ids.record("a", ids.assign("a"));

    ids.liveParams(params);

    expect(params).toEqual(before);
  });
});

describe("liveParamsForCheck", () => {
  test("a reference takes the live shape, keeping the id the file used", () => {
    // What the pre-flight check needs: a kind describing this param as a reference must
    // see a reference, even though no block exists to point at yet.
    const params = wrapped({ input: createPlRef("samples", "reads") });

    expect(liveParamsForCheck(params)).toEqual({
      input: createPlRef("samples", "reads"),
    });
  });

  test("everything else is left as it is", () => {
    expect(liveParamsForCheck({ numbers: [3, 1, 2], species: "hsa" })).toEqual({
      numbers: [3, 1, 2],
      species: "hsa",
    });
  });
});

describe("the forward pass", () => {
  test("each entry's references point at the blocks created before it", () => {
    // File order is instantiation order, which is what makes one pass enough: no
    // deferred references, no patching a block after the fact.
    const outcome = applyPass([
      { id: "samples" },
      { id: "align", params: wrapped({ input: createPlRef("samples", "reads") }) },
      { id: "report", params: wrapped({ from: createPlRef("align", "clones") }) },
    ]);

    expect(outcome.added).toEqual([
      { blockId: "block-1", params: undefined },
      { blockId: "block-2", params: { input: createPlRef("block-1", "reads") } },
      { blockId: "block-3", params: { from: createPlRef("block-2", "clones") } },
    ]);
  });

  test("two entries referencing the same upstream get the same block id", () => {
    const outcome = applyPass([
      { id: "samples" },
      { id: "x", params: wrapped({ input: createPlRef("samples", "reads") }) },
      { id: "y", params: wrapped({ input: createPlRef("samples", "reads") }) },
    ]);

    expect(outcome.added[1].params).toEqual(outcome.added[2].params);
  });

  test("ids are unique across an apply by default", () => {
    // The default generator is what `Project.addBlock` would have used itself.
    const ids = createTemplateIdMap();

    const generated = ["a", "b", "c"].map((id) => ids.assign(id));

    expect(new Set(generated).size).toBe(3);
  });
});
