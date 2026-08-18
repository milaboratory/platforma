import { describe, expect, it, test } from "vitest";
import canonicalize from "canonicalize";
import type { ColumnUniversalId } from "@milaboratories/pl-model-common";
import { canonicalizeJson, createColumnDiscoveredId } from "@milaboratories/pl-model-common";
import { inferAllReferencedBlocks, outputRef } from "./args";

describe("inferAllReferencedBlocks", () => {
  it("finds __isRef inside nested PrimaryRef column and filter fields", () => {
    const primaryRef = {
      __isPrimaryRef: "v1",
      column: outputRef("block1", "col1", true),
      filter: outputRef("block2", "flt1"),
    };

    const result = inferAllReferencedBlocks({ dataset: primaryRef });

    expect(result.upstreams).toContain("block1");
    expect(result.upstreams).toContain("block2");
    expect(result.upstreams.size).toBe(2);
    expect(result.upstreamsRequiringEnrichments).toContain("block1");
    expect(result.missingReferences).toBe(false);
  });

  it("finds __isRef in PrimaryRef without filter", () => {
    const primaryRef = {
      __isPrimaryRef: "v1",
      column: outputRef("block1", "col1"),
    };

    const result = inferAllReferencedBlocks(primaryRef);

    expect(result.upstreams).toContain("block1");
    expect(result.upstreams.size).toBe(1);
  });

  it("extracts PlRef embedded as canonicalized JSON string (global-form PObjectId)", () => {
    const id = canonicalize(outputRef("blockA", "exportName"))!;

    const result = inferAllReferencedBlocks({ columnId: id });

    expect(result.upstreams).toContain("blockA");
    expect(result.upstreams.size).toBe(1);
    expect(result.upstreamsRequiringEnrichments.size).toBe(0);
    expect(result.missingReferences).toBe(false);
  });

  it("propagates requireEnrichments from canonicalized PlRef string", () => {
    const id = canonicalize(outputRef("blockA", "exportName", true))!;

    const result = inferAllReferencedBlocks(id);

    expect(result.upstreams).toContain("blockA");
    expect(result.upstreamsRequiringEnrichments).toContain("blockA");
  });

  it("finds multiple PlRef strings inside an args object", () => {
    const a = canonicalize(outputRef("blockA", "n1"))!;
    const b = canonicalize(outputRef("blockB", "n2", true))!;

    const result = inferAllReferencedBlocks({ first: a, second: b });

    expect(result.upstreams).toEqual(new Set(["blockA", "blockB"]));
    expect(result.upstreamsRequiringEnrichments).toEqual(new Set(["blockB"]));
  });

  it("respects allowed set for embedded refs", () => {
    const id = canonicalize(outputRef("blockX", "n"))!;

    const result = inferAllReferencedBlocks({ id }, new Set(["blockY"]));

    expect(result.upstreams.size).toBe(0);
    expect(result.missingReferences).toBe(true);
  });

  it("decodes JSON escapes inside blockId", () => {
    const id = canonicalize(outputRef('weird"id\\with\nescapes', "n"))!;

    const result = inferAllReferencedBlocks({ id });

    expect(result.upstreams).toContain('weird"id\\with\nescapes');
  });

  it("ignores strings without __isRef marker", () => {
    const result = inferAllReferencedBlocks({
      a: "plain text",
      b: '{"some":"json","without":"ref"}',
    });

    expect(result.upstreams.size).toBe(0);
    expect(result.missingReferences).toBe(false);
  });

  it("detects PlRef string regardless of JSON.stringify nesting depth (depth 0..10)", () => {
    const id = canonicalize(outputRef("blockA", "n", true))!;

    for (let depth = 0; depth <= 10; depth++) {
      let value: string = id;
      for (let i = 0; i < depth; i++) value = JSON.stringify(value);

      const result = inferAllReferencedBlocks({ raw: value });

      expect(result.upstreams, `depth=${depth}`).toContain("blockA");
      expect(result.upstreamsRequiringEnrichments, `depth=${depth}`).toContain("blockA");
    }
  });

  it("detects PlRef when the entire args container is stringified multiple times", () => {
    const ref = outputRef("blockZ", "n");
    const container: { col: unknown } = { col: ref };

    let value: unknown = container;
    for (let i = 0; i < 5; i++) value = JSON.stringify(value);

    const result = inferAllReferencedBlocks({ wrapper: value });

    expect(result.upstreams).toContain("blockZ");
  });

  it("detects PlRef when args itself is the multi-stringified ref string", () => {
    let value: string = canonicalize(outputRef("blockTop", "n"))!;
    for (let i = 0; i < 4; i++) value = JSON.stringify(value);

    const result = inferAllReferencedBlocks(value);

    expect(result.upstreams).toContain("blockTop");
  });

  it("ignores malformed __isRef occurrences", () => {
    const result = inferAllReferencedBlocks({
      a: '{"__isRef":true,"blockId"', // truncated
      b: '"__isRef":false', // wrong value
      c: "__isRef without quotes",
    });

    expect(result.upstreams.size).toBe(0);
  });
});

test("a block id in a map KEY is an upstream too", () => {
  // A discovered column's `queriesQualifications` is `Record<PObjectId, …>`, so the id sits in
  // the key. Walking values only lost that edge: the block depended on an upstream the graph
  // never knew about, and the loss was invisible because the rest of the id parsed fine.
  const qual = [{ axis: { name: "sampleId" }, contextDomain: {} }];
  const discovered = createColumnDiscoveredId({
    column: canonicalizeJson(outputRef("A", "clonotypes")) as ColumnUniversalId,
    path: [
      {
        type: "linker",
        column: canonicalizeJson(outputRef("B", "cell-to-clone")) as ColumnUniversalId,
      },
    ],
    queriesQualifications: {
      [canonicalizeJson(outputRef("D", "anchor")) as ColumnUniversalId]: qual,
    },
  });

  const result = inferAllReferencedBlocks({ anchor: discovered });

  expect([...result.upstreams].sort()).toEqual(["A", "B", "D"]);
});
