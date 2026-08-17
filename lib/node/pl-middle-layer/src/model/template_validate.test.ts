import { describe, expect, test } from "vitest";
import type {
  BlockKindSelectorReference,
  ProjectTemplateV1,
  ProjectTemplateV1Entry,
} from "@milaboratories/pl-model-common";
import {
  PROJECT_TEMPLATE_SCHEMA_V1,
  createPlRef,
  toTemplateRef,
} from "@milaboratories/pl-model-common";
import { validateTemplateV1ForApply } from "./template_validate";

/**
 * The one check that can be made from the file alone, before anything is created: a reference
 * must name an entry declared earlier.
 *
 * The second describe below is the other half of the contract — what this stage deliberately
 * says nothing about — written as tests so the gaps read as decisions rather than oversights.
 */

const KIND = "@platforma-open/milaboratories.demo.kind@^1.0.0" as BlockKindSelectorReference;

const FOREIGN = "aaaaaaaa-0000-4000-8000-000000000001";

/** An entry as the parser hands it over: `params` settled, absent read as `{}`. */
const entry = (id: string, params: Record<string, unknown> = {}): ProjectTemplateV1Entry => ({
  id,
  kind: KIND,
  params,
});

const documentOf = (...blocks: ProjectTemplateV1Entry[]): ProjectTemplateV1 => ({
  schema: PROJECT_TEMPLATE_SCHEMA_V1,
  blocks,
});

/**
 * A document whose references are wrapped, as a block that projected them writes it.
 *
 * The unwrapped builder above stays for the opposite checks — params that carry a block id
 * where the engine will never look for one.
 */
const wiredDocumentOf = (
  ...live: readonly { id: string; params?: Record<string, unknown> }[]
): ProjectTemplateV1 => ({
  schema: PROJECT_TEMPLATE_SCHEMA_V1,
  blocks: live.map((e) =>
    entry(
      e.id,
      e.params === undefined
        ? undefined
        : Object.fromEntries(Object.entries(e.params).map(([k, v]) => [k, toTemplateRef(v)])),
    ),
  ),
});

describe("validateTemplateV1ForApply", () => {
  test("a consistent document has nothing to report", () => {
    const document = wiredDocumentOf(
      { id: "a", params: { dataset: "bulk-rna" } },
      { id: "b", params: { input: createPlRef("a", "reads") } },
      { id: "c", params: { input: createPlRef("b", "clonotypes"), extra: {} } },
    );

    expect(validateTemplateV1ForApply(document)).toEqual([]);
  });

  test("an empty document is valid", () => {
    expect(validateTemplateV1ForApply(documentOf())).toEqual([]);
  });

  test("references at any depth are checked", () => {
    // A wrapper can sit anywhere in opaque params, so a check that only looked at the top
    // level would pass files it cannot apply.
    const document = wiredDocumentOf(
      { id: "a" },
      { id: "b", params: { steps: [{ from: toTemplateRef(createPlRef("later", "reads")) }] } },
      { id: "later" },
    );

    expect(validateTemplateV1ForApply(document)).toHaveLength(1);
  });

  test("an entry referencing itself is told what to do about it", () => {
    const problems = validateTemplateV1ForApply(
      wiredDocumentOf({ id: "a", params: { input: createPlRef("a", "reads") } }),
    );

    expect(problems[0].entryId).toBe("a");
    expect(problems[0].error).toContain("its own output");
    expect(problems[0].error).toMatch(/Point it at another entry, or remove the reference/);
  });

  test("a reference to an entry the file does not define is NOT reported", () => {
    // The documented cost of an engine that does not parse reference payloads: it can only
    // ask which of the ids this file defines appear in there, so an id naming no entry is
    // indistinguishable from any other text. Such a reference surfaces as an applied block
    // wired to nothing. Pinned as a test so the gap is visible rather than folklore.
    const problems = validateTemplateV1ForApply(
      wiredDocumentOf({ id: "a" }, { id: "b", params: { input: createPlRef("typo", "reads") } }),
    );

    expect(problems).toEqual([]);
  });

  test("a reference to a later entry says to move it up", () => {
    // Order is not a formality: blocks are created top to bottom, so the upstream has
    // to exist before the block that reads it. The fix is a move, and the message says
    // so rather than only stating the rule.
    const problems = validateTemplateV1ForApply(
      wiredDocumentOf({ id: "a", params: { input: createPlRef("b", "reads") } }, { id: "b" }),
    );

    expect(problems[0].entryId).toBe("a");
    expect(problems[0].error).toContain("listed after it");
    expect(problems[0].error).toMatch(/move 'b' above this entry/);
  });

  test("every problem is reported, grouped by entry in file order", () => {
    // One pass to fix the file. Grouping by entry keeps the report readable next to the
    // file itself.
    const problems = validateTemplateV1ForApply(
      wiredDocumentOf(
        { id: "a", params: { self: createPlRef("a", "x"), later: createPlRef("b", "y") } },
        { id: "b", params: { later: createPlRef("c", "z") } },
        { id: "c" },
      ),
    );

    expect(problems.map((p) => p.entryId)).toEqual(["a", "a", "b"]);
  });
});

describe("what the check does not look at", () => {
  test("a block id outside a wrapper is not the engine's business", () => {
    // `{ __isRef: true, … }` written straight into params is a reference in a running
    // project, and applying it would wire the block to nothing. The engine still says
    // nothing: it exposes the `{ $ref: … }` mechanic and models no other notion of a
    // reference, so it cannot tell this from data. Pinned so the boundary is deliberate.
    const problems = validateTemplateV1ForApply(
      documentOf(entry("a", { input: createPlRef(FOREIGN, "reads") })),
    );

    expect(problems).toEqual([]);
  });

  test("an id-looking string is not a reference either", () => {
    // Params legitimately carry uuids as data — a sample id, a label.
    const problems = validateTemplateV1ForApply(
      documentOf(entry("a", { sampleId: FOREIGN, note: `see ${FOREIGN}` })),
    );

    expect(problems).toEqual([]);
  });

  test("an entry with no params has nothing to check", () => {
    expect(validateTemplateV1ForApply(documentOf(entry("a")))).toEqual([]);
  });
});
