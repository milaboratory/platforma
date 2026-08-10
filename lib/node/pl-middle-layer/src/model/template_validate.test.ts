import { describe, expect, test } from "vitest";
import canonicalize from "canonicalize";
import type {
  BlockKindSelectorReference,
  ProjectTemplateV1,
  ProjectTemplateV1Entry,
} from "@milaboratories/pl-model-common";
import {
  PROJECT_TEMPLATE_SCHEMA_V1,
  createPlRef,
  createTemplateLocalRef,
} from "@milaboratories/pl-model-common";
import { validateTemplateV1ForApply } from "./template_validate";

/**
 * The checks that can be made from the file alone, before anything is created.
 */

const KIND = "@platforma-open/milaboratories.demo.kind@^1.0.0" as BlockKindSelectorReference;

const FOREIGN = "aaaaaaaa-0000-4000-8000-000000000001";

const entry = (id: string, params?: Record<string, unknown>): ProjectTemplateV1Entry => ({
  id,
  kind: KIND,
  ...(params !== undefined ? { params } : {}),
});

const documentOf = (...blocks: ProjectTemplateV1Entry[]): ProjectTemplateV1 => ({
  schema: PROJECT_TEMPLATE_SCHEMA_V1,
  blocks,
});

describe("validateTemplateV1ForApply", () => {
  test("a consistent document has nothing to report", () => {
    const document = documentOf(
      entry("a", { dataset: "bulk-rna" }),
      entry("b", { input: createTemplateLocalRef("a", "reads") }),
      entry("c", { input: createTemplateLocalRef("b", "clonotypes"), extra: {} }),
    );

    expect(validateTemplateV1ForApply(document)).toEqual([]);
  });

  test("an empty document is valid", () => {
    expect(validateTemplateV1ForApply(documentOf())).toEqual([]);
  });

  test("references at any depth are checked", () => {
    // The reference could be nested anywhere in opaque params, so a check that only
    // looked at the top level would pass files it cannot apply.
    const document = documentOf(
      entry("a", { steps: [{ from: createTemplateLocalRef("nope", "reads") }] }),
    );

    expect(validateTemplateV1ForApply(document)).toHaveLength(1);
  });

  test("an entry referencing itself is told what to do about it", () => {
    const problems = validateTemplateV1ForApply(
      documentOf(entry("a", { input: createTemplateLocalRef("a", "reads") })),
    );

    expect(problems[0].entryId).toBe("a");
    expect(problems[0].error).toContain("its own output 'reads'");
    expect(problems[0].error).toMatch(/Point it at another entry, or remove the reference/);
  });

  test("a reference to an entry the file does not define names the missing id", () => {
    const problems = validateTemplateV1ForApply(
      documentOf(entry("a"), entry("b", { input: createTemplateLocalRef("typo", "reads") })),
    );

    expect(problems[0].entryId).toBe("b");
    expect(problems[0].error).toContain("entry 'typo'");
    expect(problems[0].error).toMatch(/Add that entry, or correct the id/);
  });

  test("a reference to a later entry says to move it up", () => {
    // Order is not a formality: blocks are created top to bottom, so the upstream has
    // to exist before the block that reads it. The fix is a move, and the message says
    // so rather than only stating the rule.
    const problems = validateTemplateV1ForApply(
      documentOf(entry("a", { input: createTemplateLocalRef("b", "reads") }), entry("b")),
    );

    expect(problems[0].entryId).toBe("a");
    expect(problems[0].error).toContain("listed after it");
    expect(problems[0].error).toMatch(/move 'b' above this entry/);
  });

  test("every problem is reported, grouped by entry in file order", () => {
    // One pass to fix the file. Grouping by entry keeps the report readable next to the
    // file itself.
    const problems = validateTemplateV1ForApply(
      documentOf(
        entry("a", {
          self: createTemplateLocalRef("a", "x"),
          gone: createTemplateLocalRef("x", "y"),
        }),
        entry("b", { later: createTemplateLocalRef("c", "z") }),
        entry("c"),
      ),
    );

    expect(problems.map((p) => p.entryId)).toEqual(["a", "a", "b"]);
  });
});

describe("params carrying a block id from another project", () => {
  test("a live reference left in params is rejected", () => {
    // `{ __isRef: true, ... }` is a reference in a running project, not a template one.
    // Nothing can redirect it to a block this apply creates.
    const problems = validateTemplateV1ForApply(
      documentOf(entry("a", { input: createPlRef(FOREIGN, "reads") })),
    );

    expect(problems).toHaveLength(1);
    expect(problems[0].entryId).toBe("a");
    expect(problems[0].error).toContain(FOREIGN);
    expect(problems[0].error).toMatch(/remove it from the entry's params/);
  });

  test("a reference hidden inside a string is caught too", () => {
    // The case the whole check exists for: an enrichment's `hit` is a canonicalized
    // reference, so the id sits inside a string where a structural walk cannot see it.
    // Applied as-is, the params would look valid and be wired to nothing.
    const problems = validateTemplateV1ForApply(
      documentOf(
        entry("a", {
          enrichment: {
            __isEnrichment: "v1",
            hit: canonicalize({ __isRef: true, blockId: FOREIGN, name: "clonotypes" }),
          },
        }),
      ),
    );

    expect(problems).toHaveLength(1);
    expect(problems[0].error).toContain(FOREIGN);
  });

  test("a doubly-stringified reference is caught", () => {
    // Round-tripping params through JSON more than once nests the escaping; the
    // detector peels it, and a check written by hand would not have.
    const once = canonicalize({ __isRef: true, blockId: FOREIGN, name: "reads" })!;
    const problems = validateTemplateV1ForApply(
      documentOf(entry("a", { hit: JSON.stringify(JSON.stringify(once)) })),
    );

    expect(problems[0].error).toContain(FOREIGN);
  });

  test("every foreign id in one entry is named, sorted", () => {
    // Naming them all is what makes the file fixable in one pass.
    const other = "bbbbbbbb-0000-4000-8000-000000000002";
    const problems = validateTemplateV1ForApply(
      documentOf(entry("a", { second: createPlRef(other, "x"), first: createPlRef(FOREIGN, "y") })),
    );

    expect(problems).toHaveLength(1);
    expect(problems[0].error).toContain(`${FOREIGN}, ${other}`);
    expect(problems[0].error).toContain("block ids");
  });

  test("a proper template reference is not mistaken for a foreign one", () => {
    // The two shapes are what tells them apart: `{ block, output }` is the file form
    // and gets redirected on apply; `{ __isRef: true, blockId, name }` cannot be.
    const problems = validateTemplateV1ForApply(
      documentOf(entry("a"), entry("b", { input: createTemplateLocalRef("a", "reads") })),
    );

    expect(problems).toEqual([]);
  });

  test("an id-looking string that is not a reference is left alone", () => {
    // Params legitimately carry uuids as data — a sample id, a label. Only the
    // reference shape is a reference.
    const problems = validateTemplateV1ForApply(
      documentOf(entry("a", { sampleId: FOREIGN, note: `see ${FOREIGN}` })),
    );

    expect(problems).toEqual([]);
  });

  test("an entry with no params has nothing to check", () => {
    expect(validateTemplateV1ForApply(documentOf(entry("a")))).toEqual([]);
  });
});
