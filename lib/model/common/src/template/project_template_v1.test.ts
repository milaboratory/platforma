import { describe, expect, expectTypeOf, test } from "vitest";
import type { BlockKindReference } from "../bmodel/block_kind_ref";
import { formatKindRef } from "../bmodel/block_kind_ref";
import {
  formatKindSelector,
  formatKindSelectorReference,
  isBlockKindSelectorReference,
  kindReferenceToSelectorReference,
  parseKindSelector,
  parseKindSelectorReference,
  type BlockKindSelectorReference,
} from "./kind_selector";
import {
  collectTemplateLocalRefs,
  createTemplateLocalRef,
  isTemplateLocalRef,
  parseBlockPackReference,
  parseProjectTemplateV1,
  ProjectTemplateV1Schema,
  validateProjectTemplateV1References,
  type BlockPackReference,
  type ProjectTemplateV1,
} from "./project_template_v1";

//
// The normative example from A-0036, as the value a YAML reader hands back:
//
//   schema: template-v1
//   blocks:
//     - id: samples
//       kind: "@platforma-open/milaboratories.samples-and-data.kind@^1.0.0"
//       params:
//         dataset: bulk-rna
//     - id: mixcr
//       kind: "@platforma-open/milaboratories.mixcr-clonotyping.kind@~1.2.0"
//       params:
//         input: { block: samples, output: reads }
//         species: human
//         preset: milab-human-tcr-rna
//     - id: browser
//       kind: "@platforma-open/milaboratories.clonotype-browser.kind@1.0.0"
//       block: "@platforma-open/milaboratories.clonotype-browser@2.4.1"
//       params:
//         clonotypes: { block: mixcr, output: clonotypes }
//
// The YAML text <-> value step is not this package's job (no `yaml` dependency);
// byte-level round-tripping belongs to the middle-layer serializer.
//
const a0036Example = {
  schema: "template-v1",
  blocks: [
    {
      id: "samples",
      kind: "@platforma-open/milaboratories.samples-and-data.kind@^1.0.0",
      params: { dataset: "bulk-rna" },
    },
    {
      id: "mixcr",
      kind: "@platforma-open/milaboratories.mixcr-clonotyping.kind@~1.2.0",
      params: {
        input: { block: "samples", output: "reads" },
        species: "human",
        preset: "milab-human-tcr-rna",
      },
    },
    {
      id: "browser",
      kind: "@platforma-open/milaboratories.clonotype-browser.kind@1.0.0",
      block: "@platforma-open/milaboratories.clonotype-browser@2.4.1",
      params: { clonotypes: { block: "mixcr", output: "clonotypes" } },
    },
  ],
};

describe("kind selector grammar", () => {
  test("the three tiers round-trip", () => {
    expect(parseKindSelector("1.2.0")).toEqual({ op: "exact", version: "1.2.0" });
    expect(parseKindSelector("~1.2.0")).toEqual({ op: "patch", version: "1.2.0" });
    expect(parseKindSelector("^1.2.0")).toEqual({ op: "minor", version: "1.2.0" });

    for (const raw of ["1.2.0", "~1.2.0", "^1.2.0"]) {
      expect(formatKindSelector(parseKindSelector(raw))).toBe(raw);
    }
  });

  test("prerelease and build metadata survive", () => {
    expect(parseKindSelector("~1.2.0-rc.1")).toEqual({ op: "patch", version: "1.2.0-rc.1" });
    expect(parseKindSelector("1.2.0+build.5")).toEqual({ op: "exact", version: "1.2.0+build.5" });
  });

  test("npm ranges outside the kind grammar are rejected", () => {
    for (const raw of [">=1.0.0", "1.x", "1.2", "latest", "*", ""]) {
      expect(() => parseKindSelector(raw)).toThrow(/Malformed kind version selector/);
    }
  });

  test("a scoped npm name keeps its leading @", () => {
    const ref = "@platforma-open/milaboratories.mixcr-clonotyping.kind@~1.2.0";
    expect(parseKindSelectorReference(ref as BlockKindSelectorReference)).toEqual({
      name: "@platforma-open/milaboratories.mixcr-clonotyping.kind",
      selector: { op: "patch", version: "1.2.0" },
    });
    expect(
      formatKindSelectorReference({
        name: "@platforma-open/milaboratories.mixcr-clonotyping.kind",
        selector: { op: "patch", version: "1.2.0" },
      }),
    ).toBe(ref);
  });

  test("a reference with no version segment is malformed", () => {
    expect(() =>
      parseKindSelectorReference("@platforma-open/foo.kind" as BlockKindSelectorReference),
    ).toThrow(/Malformed kind selector reference/);
    expect(isBlockKindSelectorReference("@platforma-open/foo.kind")).toBe(false);
    expect(isBlockKindSelectorReference(42)).toBe(false);
    expect(isBlockKindSelectorReference("@platforma-open/foo.kind@1.0.0")).toBe(true);
  });

  test("an exact kind reference widens to the exact selector tier", () => {
    // The export direction (A-0041): a block implements exactly one version.
    const resolved: BlockKindReference = formatKindRef({
      name: "@platforma-open/milaboratories.clonotype-browser.kind",
      version: "1.0.0",
    });
    const selector = kindReferenceToSelectorReference(resolved);

    expect(selector).toBe("@platforma-open/milaboratories.clonotype-browser.kind@1.0.0");
    expect(parseKindSelectorReference(selector).selector.op).toBe("exact");
  });
});

describe("block pack override", () => {
  test("parses an exact reference", () => {
    expect(
      parseBlockPackReference(
        "@platforma-open/milaboratories.clonotype-browser@2.4.1" as BlockPackReference,
      ),
    ).toEqual({
      name: "@platforma-open/milaboratories.clonotype-browser",
      version: "2.4.1",
    });
  });

  test("rejects a range — an override must pin", () => {
    expect(() =>
      parseBlockPackReference("@platforma-open/foo@^2.4.1" as BlockPackReference),
    ).toThrow(/must pin an exact version/);
  });
});

describe("template-local references", () => {
  test("recognized by the reserved two-key shape only", () => {
    expect(isTemplateLocalRef(createTemplateLocalRef("samples", "reads"))).toBe(true);
    expect(isTemplateLocalRef({ block: "samples", output: "reads" })).toBe(true);

    // A third key, a missing key, a non-string value, an array: not a reference.
    expect(isTemplateLocalRef({ block: "samples", output: "reads", extra: 1 })).toBe(false);
    expect(isTemplateLocalRef({ block: "samples" })).toBe(false);
    expect(isTemplateLocalRef({ block: "samples", output: 1 })).toBe(false);
    expect(isTemplateLocalRef(["samples", "reads"])).toBe(false);
    expect(isTemplateLocalRef(null)).toBe(false);
  });

  test("collected from anywhere inside params, including nesting", () => {
    const refs = collectTemplateLocalRefs({
      input: { block: "samples", output: "reads" },
      species: "human",
      nested: {
        list: [{ block: "mixcr", output: "clonotypes" }, { notARef: true }],
      },
    });

    expect(refs).toEqual([
      { block: "samples", output: "reads" },
      { block: "mixcr", output: "clonotypes" },
    ]);
  });

  test("undefined params yield no references", () => {
    expect(collectTemplateLocalRefs(undefined)).toEqual([]);
  });
});

describe("parseProjectTemplateV1", () => {
  test("parses the A-0036 example unchanged", () => {
    const doc = parseProjectTemplateV1(a0036Example);

    expect(doc).toEqual(a0036Example);
    expect(doc.blocks.map((b) => b.id)).toEqual(["samples", "mixcr", "browser"]);
    expect(doc.blocks[2].block).toBe("@platforma-open/milaboratories.clonotype-browser@2.4.1");
    expect(validateProjectTemplateV1References(doc)).toEqual([]);
  });

  test("params is optional — the block starts from its kind's defaults", () => {
    const doc = parseProjectTemplateV1({
      schema: "template-v1",
      blocks: [{ id: "samples", kind: "@platforma-open/foo.kind@^1.0.0" }],
    });

    expect(doc.blocks[0].params).toBeUndefined();
    expect("params" in doc.blocks[0]).toBe(false);
  });

  test("kind is required — it carries the params contract", () => {
    expect(() =>
      parseProjectTemplateV1({
        schema: "template-v1",
        blocks: [{ id: "samples", params: { dataset: "bulk-rna" } }],
      }),
    ).toThrow(/kind/);
  });

  test("the format marker is checked", () => {
    expect(() => parseProjectTemplateV1({ schema: "template-v2", blocks: [] })).toThrow();
    expect(() => parseProjectTemplateV1({ blocks: [] })).toThrow();
  });

  test("unknown fields are rejected at both levels", () => {
    // No `label` field: a template does not name block instances for display.
    expect(() =>
      parseProjectTemplateV1({
        schema: "template-v1",
        blocks: [{ id: "a", kind: "@o/a.kind@1.0.0", label: "Samples" }],
      }),
    ).toThrow(/label/);

    expect(() =>
      parseProjectTemplateV1({ schema: "template-v1", blocks: [], metadata: {} }),
    ).toThrow(/metadata/);
  });

  test("a malformed kind selector is reported on its own path", () => {
    const result = ProjectTemplateV1Schema.safeParse({
      schema: "template-v1",
      blocks: [{ id: "a", kind: "@o/a.kind@>=1.0.0" }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["blocks", 0, "kind"]);
      expect(result.error.issues[0].message).toMatch(/Malformed kind version selector/);
    }
  });

  test("duplicate template-local ids are rejected", () => {
    expect(() =>
      parseProjectTemplateV1({
        schema: "template-v1",
        blocks: [
          { id: "a", kind: "@o/a.kind@1.0.0" },
          { id: "a", kind: "@o/b.kind@1.0.0" },
        ],
      }),
    ).toThrow(/Duplicate template-local id: a/);
  });
});

describe("validateProjectTemplateV1References", () => {
  const docWith = (blocks: unknown[]) => parseProjectTemplateV1({ schema: "template-v1", blocks });

  test("flags a reference to an entry declared later", () => {
    const doc = docWith([
      {
        id: "mixcr",
        kind: "@o/m.kind@1.0.0",
        params: { input: { block: "samples", output: "reads" } },
      },
      { id: "samples", kind: "@o/s.kind@1.0.0" },
    ]);

    expect(validateProjectTemplateV1References(doc)).toEqual([
      "Entry 'mixcr' references entry 'samples', which is declared after it " +
        "(blocks order is the instantiation order)",
    ]);
  });

  test("flags a reference to an id that is not in the file", () => {
    const doc = docWith([
      {
        id: "mixcr",
        kind: "@o/m.kind@1.0.0",
        params: { input: { block: "ghost", output: "reads" } },
      },
    ]);

    expect(validateProjectTemplateV1References(doc)).toEqual([
      "Entry 'mixcr' references output 'reads' of unknown entry 'ghost'",
    ]);
  });

  test("flags a self-reference", () => {
    const doc = docWith([
      {
        id: "mixcr",
        kind: "@o/m.kind@1.0.0",
        params: { input: { block: "mixcr", output: "reads" } },
      },
    ]);

    expect(validateProjectTemplateV1References(doc)).toEqual([
      "Entry 'mixcr' references its own output 'reads'",
    ]);
  });
});

test("the parser's output type is exactly ProjectTemplateV1", () => {
  // `satisfies` only checks one direction — a parser narrower than the type
  // still passes it — so pin exactness here. NOTE: vitest runs without
  // `--typecheck` and tsconfig excludes *.test.ts, so this assertion is
  // authoring-time only; it is verified by running tsc over this file.
  expectTypeOf<ReturnType<typeof parseProjectTemplateV1>>().toEqualTypeOf<ProjectTemplateV1>();
  expectTypeOf<typeof ProjectTemplateV1Schema._output>().toEqualTypeOf<ProjectTemplateV1>();
});
