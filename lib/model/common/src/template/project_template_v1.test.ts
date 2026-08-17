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
import { isTemplateRef, referencedBlockIds, toTemplateRef } from "./template_ref";
import {
  parseBlockPackLocation,
  parseBlockPackReference,
  parseProjectTemplateV1,
  readProjectTemplateV1,
  validateProjectTemplateV1References,
  type BlockPackLocationReference,
  type BlockPackReference,
  type ProjectTemplateV1,
} from "./project_template_v1";

//
// The reference example for the format, as the value a YAML reader hands back:
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
//         input: { $ref: { __isRef: true, blockId: samples, name: reads } }
//         species: human
//         preset: milab-human-tcr-rna
//     - id: browser
//       kind: "@platforma-open/milaboratories.clonotype-browser.kind@1.0.0"
//       block: "@platforma-open/milaboratories.clonotype-browser@2.4.1"
//       params:
//         clonotypes: { $ref: { __isRef: true, blockId: mixcr, name: clonotypes } }
//
// The YAML text <-> value step is not this package's job (no `yaml` dependency);
// byte-level round-tripping belongs to the middle-layer serializer.
//
const referenceExample = {
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
        input: toTemplateRef({ __isRef: true, blockId: "samples", name: "reads" }),
        species: "human",
        preset: "milab-human-tcr-rna",
      },
    },
    {
      id: "browser",
      kind: "@platforma-open/milaboratories.clonotype-browser.kind@1.0.0",
      block: "@platforma-open/milaboratories.clonotype-browser@2.4.1",
      params: {
        clonotypes: toTemplateRef({ __isRef: true, blockId: "mixcr", name: "clonotypes" }),
      },
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
    // The export direction: a block implements exactly one version.
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

describe("block pack location", () => {
  const location = (raw: string) => parseBlockPackLocation(raw as BlockPackLocationReference);

  test("reads the scheme, which is all this layer needs to know", () => {
    // Everything past the scheme belongs to whoever can reach it: this layer cannot
    // know which schemes a given environment serves, and must not decide for it.
    expect(location("file:///Users/dev/blocks/enter-numbers/block")).toEqual({ scheme: "file" });
    expect(location("https://blocks.internal/enter-numbers")).toEqual({ scheme: "https" });
  });

  test("the scheme is compared case-insensitively", () => {
    expect(location("FILE:///Users/dev/blocks/x")).toEqual({ scheme: "file" });
  });

  test("a bare path is rejected, because it would be read against the wrong directory", () => {
    // The whole point of a locator is removing the question "relative to what".
    expect(() => location("/Users/dev/blocks/enter-numbers/block")).toThrow(
      /absolute URI with a scheme/,
    );
    expect(() => location("./blocks/enter-numbers")).toThrow(/absolute URI with a scheme/);
  });

  test("a Windows path is rejected rather than read as a one-letter scheme", () => {
    // `C:\blocks\x` satisfies the URI scheme grammar with scheme `c`, so without the
    // two-character floor it would be accepted here and fail somewhere unrelated.
    expect(() => location("C:\\blocks\\enter-numbers")).toThrow(/absolute URI with a scheme/);
    expect(location("file:///C:/blocks/enter-numbers")).toEqual({ scheme: "file" });
  });
});

describe("reference wrappers", () => {
  test("recognized by the reserved $ref shape only", () => {
    expect(isTemplateRef(toTemplateRef({ __isRef: true }))).toBe(true);
    expect(isTemplateRef({ $ref: "anything at all" })).toBe(true);

    // A second key, no `$ref`, an array, null: not a wrapper. The shape is reserved inside
    // opaque params, so the narrowest recognizable one takes least away from kind authors.
    expect(isTemplateRef({ $ref: 1, as: "id" })).toBe(false);
    expect(isTemplateRef({ ref: 1 })).toBe(false);
    expect(isTemplateRef([1])).toBe(false);
    expect(isTemplateRef(null)).toBe(false);
  });

  test("an absent value is not wrapped", () => {
    expect(toTemplateRef(undefined)).toBeUndefined();
  });

  test("the payload is whatever the block wrapped, untouched", () => {
    const payload = [{ __isRef: true, blockId: "a", name: "x" }];

    expect(toTemplateRef(payload).$ref).toBe(payload);
  });

  test("referenced ids are found in any payload, at any depth", () => {
    const params = {
      input: toTemplateRef({ __isRef: true, blockId: "samples", name: "reads" }),
      nested: { list: [toTemplateRef('{"__isRef":true,"blockId":"mixcr","name":"clones"}')] },
      species: "human",
    };

    expect(referencedBlockIds(params, ["samples", "mixcr", "absent"])).toEqual([
      "samples",
      "mixcr",
    ]);
  });

  test("an id outside a wrapper is not a reference", () => {
    // Wrapping is the whole signal. What sits outside one is data as far as this layer is
    // concerned, and is rejected elsewhere — by the export guard and the import check.
    const params = { loose: { __isRef: true, blockId: "samples", name: "reads" } };

    expect(referencedBlockIds(params, ["samples"])).toEqual([]);
  });

  test("an id is matched as a whole JSON token, not as a substring", () => {
    // `a` must not match the `a` inside `"reads"`, or a rewrite would corrupt the payload.
    const params = { input: toTemplateRef({ __isRef: true, blockId: "b", name: "reads" }) };

    expect(referencedBlockIds(params, ["a"])).toEqual([]);
    expect(referencedBlockIds(params, ["b"])).toEqual(["b"]);
  });
});

describe("parseProjectTemplateV1", () => {
  test("parses the reference example unchanged", () => {
    const doc = parseProjectTemplateV1(referenceExample);

    expect(doc).toEqual(referenceExample);
    expect(doc.blocks.map((b) => b.id)).toEqual(["samples", "mixcr", "browser"]);
    expect(doc.blocks[2].block).toBe("@platforma-open/milaboratories.clonotype-browser@2.4.1");
    expect(validateProjectTemplateV1References(doc)).toEqual([]);
  });

  test("params may be omitted in the file, and reads as `{}`", () => {
    // The one field the parser fills in. Every reader past it gets a mapping, so none of
    // them carries a `?? {}` that one of them would eventually forget.
    const doc = parseProjectTemplateV1({
      schema: "template-v1",
      blocks: [{ id: "samples", kind: "@platforma-open/foo.kind@^1.0.0" }],
    });

    expect(doc.blocks[0].params).toEqual({});
  });

  test("kind is required — it carries the params contract", () => {
    expect(() =>
      parseProjectTemplateV1({
        schema: "template-v1",
        blocks: [{ id: "samples", params: { dataset: "bulk-rna" } }],
      }),
    ).toThrow(/kind/);
  });

  test("an entry may pin where its implementation comes from", () => {
    const doc = parseProjectTemplateV1({
      schema: "template-v1",
      blocks: [
        {
          id: "9f3c",
          kind: "@milaboratories/milaboratories.test-enter-numbers.kind@^1.0.0",
          location: "file:///Users/dev/blocks/enter-numbers/block",
          params: { numbers: [1, 2, 3] },
        },
      ],
    });

    expect(doc.blocks[0].location).toBe("file:///Users/dev/blocks/enter-numbers/block");
    // The kind stays required alongside it: the locator says where to get the
    // implementation, not what contract the params are written against.
    expect(doc.blocks[0].kind).toBe(
      "@milaboratories/milaboratories.test-enter-numbers.kind@^1.0.0",
    );
  });

  test("an entry cannot pin both a version and a place", () => {
    // Two different statements with nothing to reconcile them, so it is refused
    // rather than settled by precedence.
    const result = readProjectTemplateV1({
      schema: "template-v1",
      blocks: [
        {
          id: "a",
          kind: "@o/a.kind@1.0.0",
          block: "@o/a@1.0.0",
          location: "file:///blocks/a",
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].path).toEqual(["blocks", 0, "location"]);
    expect(result.issues[0].message).toMatch(/cannot carry both 'block' and 'location'/);
  });

  test("a malformed location is reported on its own path", () => {
    const result = readProjectTemplateV1({
      schema: "template-v1",
      blocks: [{ id: "a", kind: "@o/a.kind@1.0.0", location: "/blocks/a" }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].path).toEqual(["blocks", 0, "location"]);
    // The grammar's own message, reported as it comes rather than restated.
    expect(result.issues[0].message).toMatch(/absolute URI with a scheme/);
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
    const result = readProjectTemplateV1({
      schema: "template-v1",
      blocks: [{ id: "a", kind: "@o/a.kind@>=1.0.0" }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0].path).toEqual(["blocks", 0, "kind"]);
      expect(result.issues[0].message).toMatch(/Malformed kind version selector/);
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

  const reader = (id: string, referenced: string) => ({
    id,
    kind: "@o/m.kind@1.0.0",
    params: { input: toTemplateRef({ __isRef: true, blockId: referenced, name: "reads" }) },
  });

  test("flags a reference to an entry declared later", () => {
    const doc = docWith([reader("mixcr", "samples"), { id: "samples", kind: "@o/s.kind@1.0.0" }]);

    expect(validateProjectTemplateV1References(doc)).toEqual([
      "Entry 'mixcr' references entry 'samples', which is declared after it " +
        "(blocks order is the instantiation order)",
    ]);
  });

  test("flags a self-reference", () => {
    const doc = docWith([reader("mixcr", "mixcr")]);

    expect(validateProjectTemplateV1References(doc)).toEqual([
      "Entry 'mixcr' references its own output",
    ]);
  });

  test("says nothing about a reference to an id the file does not define", () => {
    // The documented gap of an engine that does not parse payloads: it can only ask which of
    // the ids this file defines appear in one, so an id naming no entry is indistinguishable
    // from the rest of the payload's text. Pinned so the gap stays visible.
    const doc = docWith([reader("mixcr", "ghost")]);

    expect(validateProjectTemplateV1References(doc)).toEqual([]);
  });

  test("finds a block id however deeply it is buried in the payload", () => {
    // The engine reads no structure, so depth, escaping and nesting cost it nothing.
    const doc = docWith([
      {
        id: "browser",
        kind: "@o/m.kind@1.0.0",
        params: {
          anchor: toTemplateRef(
            JSON.stringify({
              __isFiltered: true,
              source: JSON.stringify({ __isRef: true, blockId: "samples", name: "c" }),
            }),
          ),
        },
      },
      { id: "samples", kind: "@o/s.kind@1.0.0" },
    ]);

    expect(validateProjectTemplateV1References(doc)).toEqual([
      "Entry 'browser' references entry 'samples', which is declared after it " +
        "(blocks order is the instantiation order)",
    ]);
  });
});

test("the parser's output type is exactly ProjectTemplateV1", () => {
  // NOTE: vitest runs without `--typecheck` and tsconfig excludes *.test.ts, so this
  // assertion is authoring-time only; it is verified by running tsc over this file.
  expectTypeOf<ReturnType<typeof parseProjectTemplateV1>>().toEqualTypeOf<ProjectTemplateV1>();
});
