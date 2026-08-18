import { describe, expect, test } from "vitest";
import { createPlRef } from "../ref";
import { expandTemplateRefs, isTemplatePlRef } from "./template_ref_form";

/**
 * The readable spelling of a reference, and what it becomes.
 *
 * `{ block, name }` exists so a person can write a reference without the `__isRef` marker. It
 * is input only, and it carries exactly what a `PlRef` carries — so expanding it is a rewrite
 * of spelling, needing nothing but the value itself.
 */

describe("isTemplatePlRef", () => {
  test("an entry id and an output name are the form", () => {
    expect(isTemplatePlRef({ block: "samples", name: "reads" })).toBe(true);
  });

  test("a PlRef is not this form, and cannot be mistaken for it", () => {
    // The two never overlap: one carries `__isRef` and a `blockId`, the other carries neither.
    expect(isTemplatePlRef(createPlRef("samples", "reads"))).toBe(false);
  });

  test("anything else is left for the kind to own", () => {
    // The shape sits inside params a kind declares, so it has to be narrow: an object with a
    // third key is the kind's own value, not a reference someone spelled loosely.
    expect(isTemplatePlRef({ block: "samples", name: "reads", extra: 1 })).toBe(false);
    expect(isTemplatePlRef({ block: "samples" })).toBe(false);
    expect(isTemplatePlRef({ name: "reads" })).toBe(false);
    expect(isTemplatePlRef({ block: 0, name: "reads" })).toBe(false);
    expect(isTemplatePlRef({ block: "samples", name: 1 })).toBe(false);
    expect(isTemplatePlRef([{ block: "samples", name: "reads" }])).toBe(false);
    expect(isTemplatePlRef(null)).toBe(false);
  });
});

describe("expandTemplateRefs", () => {
  test("a form is expanded as a whole, never descended into", () => {
    // The property the next readable form will rely on: recognition happens before the generic
    // object walk, so `{ block, name }` is replaced rather than having its fields rewritten.
    // A wrapper form that nests another reference needs exactly this, bottom-up.
    const params = { input: { block: "samples", name: "reads" } };

    expect(Object.keys(expandTemplateRefs(params).input)).toEqual(["__isRef", "blockId", "name"]);
  });

  test("becomes the PlRef it stands for, naming the same entry", () => {
    expect(expandTemplateRefs({ input: { block: "samples", name: "reads" } })).toEqual({
      input: createPlRef("samples", "reads"),
    });
  });

  test("an id naming no entry passes through, like a hand-written PlRef would", () => {
    // Not an error: an id naming nothing and an id naming an entry created later are the same
    // thing here, and both are meant to reach a block that reports missing references.
    expect(expandTemplateRefs({ input: { block: "ghost", name: "x" } })).toEqual({
      input: createPlRef("ghost", "x"),
    });
  });

  test("references are found in arrays and at depth", () => {
    const params = {
      sources: [
        { block: "a", name: "numbers" },
        { block: "b", name: "numbers" },
      ],
      nested: { deeper: { anchor: { block: "c", name: "table" } } },
    };

    expect(expandTemplateRefs(params)).toEqual({
      sources: [createPlRef("a", "numbers"), createPlRef("b", "numbers")],
      nested: { deeper: { anchor: createPlRef("c", "table") } },
    });
  });

  test("a PlRef already in long form is untouched", () => {
    const params = { input: createPlRef("samples", "reads") };

    expect(expandTemplateRefs(params)).toEqual(params);
  });

  test("params with nothing to expand come back unchanged", () => {
    const params = { numbers: [1, 2], label: "run", nothing: null, empty: {} };

    expect(expandTemplateRefs(params)).toEqual(params);
  });
});
