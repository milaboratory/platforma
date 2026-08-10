import { describe, expect, test } from "vitest";
import { createPlRef, createTemplateLocalRef } from "@milaboratories/pl-model-common";
import type { TemplateIdMap, TemplateParamsRewrite } from "./template_ids";
import { createTemplateIdMap, liveParamsForCheck } from "./template_ids";

/**
 * The id map, exercised the way an apply uses it: assign, rewrite, create, record.
 *
 * Ids are injected as a counter so the assertions can name them. Nothing here needs a
 * project — the map's whole job is to be the part of construction that does not.
 */

function counterMap(): TemplateIdMap {
  let n = 0;
  return createTemplateIdMap(() => `block-${++n}`);
}

/** One forward pass over entries, as the construction loop will run it. */
function applyPass(entries: readonly { id: string; params?: Record<string, unknown> }[]): {
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

  test("an assigned id is not yet a reference target", () => {
    // Only `record` publishes it. This is what keeps an entry from resolving a reference
    // to itself while its own params are being rewritten.
    const ids = counterMap();
    ids.assign("a");

    const rewrite = ids.liveParams({ input: createTemplateLocalRef("a", "reads") });

    expect(rewrite.ok).toBe(false);
  });
});

describe("liveParams", () => {
  test("a reference becomes a PlRef naming the recorded block", () => {
    const ids = counterMap();
    ids.record("samples", ids.assign("samples"));

    const params = paramsFrom(
      ids.liveParams({ input: createTemplateLocalRef("samples", "reads") }),
    );

    expect(params).toEqual({ input: createPlRef("block-1", "reads") });
  });

  test("rewrites references wherever they sit, and touches nothing else", () => {
    // The rewrite is structural and kind-agnostic: params are opaque, so it cannot know
    // where a reference will be.
    const ids = counterMap();
    ids.record("a", ids.assign("a"));

    const params = paramsFrom(
      ids.liveParams({
        input: createTemplateLocalRef("a", "reads"),
        nested: { deeper: [createTemplateLocalRef("a", "spec"), { n: 1 }] },
        species: "hsa",
        threshold: null,
      }),
    );

    expect(params).toEqual({
      input: createPlRef("block-1", "reads"),
      nested: { deeper: [createPlRef("block-1", "spec"), { n: 1 }] },
      species: "hsa",
      threshold: null,
    });
  });

  test("params with no references come back unchanged", () => {
    const ids = counterMap();

    expect(paramsFrom(ids.liveParams({ numbers: [3, 1, 2] }))).toEqual({ numbers: [3, 1, 2] });
    expect(paramsFrom(ids.liveParams({}))).toEqual({});
  });

  test("reports an unresolvable reference instead of throwing", () => {
    // Unreachable for a validated document — but by this point earlier blocks are already
    // in the project, and the failure policy is to keep them and report.
    const ids = counterMap();

    const rewrite = ids.liveParams({ input: createTemplateLocalRef("ghost", "reads") });

    expect(rewrite.ok).toBe(false);
    if (!rewrite.ok) {
      expect(rewrite.error).toContain("'ghost'");
      expect(rewrite.error).toContain("listed above it");
    }
  });

  test("leaves the caller's params object alone", () => {
    // Params come from the parsed document, which the caller may still report against.
    const ids = counterMap();
    ids.record("a", ids.assign("a"));
    const original = { input: createTemplateLocalRef("a", "reads") };

    ids.liveParams(original);

    expect(original).toEqual({ input: createTemplateLocalRef("a", "reads") });
  });
});

describe("liveParamsForCheck", () => {
  test("a reference takes the live shape, keeping the id the file used", () => {
    // What the pre-flight check needs: a kind describing this param as a reference must
    // see a reference, even though no block exists to point at yet.
    expect(liveParamsForCheck({ input: createTemplateLocalRef("samples", "reads") })).toEqual({
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
      { id: "align", params: { input: createTemplateLocalRef("samples", "reads") } },
      { id: "report", params: { from: createTemplateLocalRef("align", "clones") } },
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
      { id: "x", params: { input: createTemplateLocalRef("samples", "reads") } },
      { id: "y", params: { input: createTemplateLocalRef("samples", "reads") } },
    ]);

    expect(outcome.added[1].params).toEqual(outcome.added[2].params);
  });

  test("a forward reference stops the pass and keeps what landed", () => {
    // Validation rejects this before an apply starts; if it ever gets through, the
    // reference is reported rather than silently dropped.
    const outcome = applyPass([
      { id: "a", params: { input: createTemplateLocalRef("later", "reads") } },
      { id: "later" },
    ]);

    expect(outcome.added).toEqual([]);
    expect(outcome.problem).toContain("'later'");
  });

  test("a self-reference is reported, not connected", () => {
    const outcome = applyPass([{ id: "a", params: { input: createTemplateLocalRef("a", "out") } }]);

    expect(outcome.problem).toContain("'a'");
  });

  test("ids are unique across an apply by default", () => {
    // The default generator is what `Project.addBlock` would have used itself.
    const ids = createTemplateIdMap();

    const generated = ["a", "b", "c"].map((id) => ids.assign(id));

    expect(new Set(generated).size).toBe(3);
  });
});
