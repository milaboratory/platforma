import { describe, expect, test } from "vitest";
import YAML from "yaml";
import type { BlockKindReference } from "@milaboratories/pl-model-common";
import {
  createPlRef,
  toTemplateRef,
  kindReferenceToSelectorReference,
  parseProjectTemplateV1,
} from "@milaboratories/pl-model-common";
import type { BlockPackSpec } from "@milaboratories/pl-model-middle-layer";
import type { ProjectStructure } from "./project_model";
import type { TemplateParamsResult } from "./template_export";
import {
  assembleProjectTemplateV1,
  exportProjectAsTemplateV1,
  locationOf,
  stringifyProjectTemplateV1,
} from "./template_serializer";

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

const ok = (value: unknown): TemplateParamsResult => ({ value });

const kindOf = (name: string, version = "1.4.2") =>
  `@platforma-open/milaboratories.${name}.kind@${version}` as BlockKindReference;

/** Every block gets a kind derived from its own id. */
const kindPerBlock = (blockId: string) => kindOf(blockId);

/** A registry-installed block: found by name, so it needs no locator. */
const registrySpec: BlockPackSpec = {
  type: "from-registry-v2",
  registryUrl: "https://block.registry.platforma.bio/releases",
  id: { organization: "milaboratories", name: "demo", version: "1.4.2" },
  channel: "stable",
};

const devSpec = (folder: string): BlockPackSpec => ({ type: "dev-v2", folder });

function exportOf(
  structure: ProjectStructure,
  params: Record<string, TemplateParamsResult>,
  kinds: (blockId: string) => BlockKindReference | undefined = kindPerBlock,
  specs: (blockId: string) => BlockPackSpec | undefined = () => registrySpec,
) {
  return exportProjectAsTemplateV1(structure, (id) => params[id], kinds, specs);
}

describe("the document", () => {
  test("an entry is the block id, its exact kind, and its params", () => {
    const result = exportOf(simpleStructure("samples"), {
      samples: ok({ dataset: "bulk-rna" }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document).toEqual({
      schema: "template-v1",
      blocks: [
        {
          id: "samples",
          kind: "@platforma-open/milaboratories.samples.kind@1.4.2",
          params: { dataset: "bulk-rna" },
        },
      ],
    });
  });

  test("the kind is emitted at the exact tier, never widened to a range", () => {
    // A block implements exactly one kind version, so pinning it is the whole
    // point; a `~` or `^` tier would let apply pick a different params contract.
    const result = exportOf(simpleStructure("a"), { a: ok({}) });

    expect(result.ok && result.document.blocks[0].kind).toBe(
      "@platforma-open/milaboratories.a.kind@1.4.2",
    );
  });

  test("no `block` override is emitted", () => {
    // The override pins an implementation against a kind version *range*. Export
    // writes the exact version, so there is nothing left for it to pin.
    const result = exportOf(simpleStructure("a"), { a: ok({}) });

    expect(result.ok && "block" in result.document.blocks[0]).toBe(false);
  });

  test("empty params are written as `params: {}`, never as `params: null`", () => {
    // Every entry carries a `params` key, because every block projects one. `null` would
    // be a third thing the schema does not define, and a reader would have to guess.
    const result = exportOf(simpleStructure("empty"), { empty: ok({}) });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.blocks[0].params).toEqual({});
    expect(result.yaml).toContain("params: {}");
    expect(result.yaml).not.toContain("params: null");
  });

  test("entry order is structure order", () => {
    const result = exportOf(simpleStructure("samples", "mixcr", "browser"), {
      samples: ok({}),
      mixcr: ok({ input: toTemplateRef(createPlRef("samples", "reads")) }),
      browser: ok({ clones: toTemplateRef(createPlRef("mixcr", "clonotypes")) }),
    });

    expect(result.ok && result.document.blocks.map((b) => b.id)).toEqual([
      "samples",
      "mixcr",
      "browser",
    ]);
  });
});

describe("the YAML", () => {
  test("round-trips through the import-side parser unchanged", () => {
    // The one property that matters: export emits exactly what import parses.
    const result = exportOf(simpleStructure("samples", "mixcr"), {
      samples: ok({ dataset: "bulk-rna", replicates: [1, 2, 3] }),
      mixcr: ok({
        input: toTemplateRef(createPlRef("samples", "reads")),
        species: "hsa",
        nested: { deep: { flag: true, absent: null } },
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(parseProjectTemplateV1(YAML.parse(result.yaml))).toEqual(result.document);
  });

  test("opens with the schema marker", () => {
    const result = exportOf(simpleStructure("a"), { a: ok({}) });

    expect(result.ok && result.yaml.startsWith("schema: template-v1\n")).toBe(true);
  });

  test("nothing is line-folded", () => {
    // A folded scalar still parses, but it makes a diff between two exported
    // templates unreadable, which is most of the reason to emit YAML at all.
    const long = "x".repeat(400);
    const yaml = stringifyProjectTemplateV1({
      schema: "template-v1",
      blocks: [
        {
          id: "a",
          kind: kindReferenceToSelectorReference(kindOf("a")),
          params: { note: long },
        },
      ],
    });

    expect(yaml).toContain(long);
  });

  test("a reference is written as the block wrapped it, contents untouched", () => {
    // How the engine finds a reference on apply, so the wrapper's presence in the file is
    // part of the contract rather than a rendering detail. What is inside it is the block's
    // own value, written verbatim.
    const result = exportOf(simpleStructure("samples", "mixcr"), {
      samples: ok({}),
      mixcr: ok({ input: toTemplateRef(createPlRef("samples", "reads")) }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.yaml).toContain("$ref:");
    expect(result.yaml).toContain("__isRef: true");
    expect(result.yaml).toContain("blockId: samples");
    expect(result.document.blocks[1].params).toEqual({
      input: { $ref: createPlRef("samples", "reads") },
    });
  });
});

describe("problems", () => {
  test("a kind-less block fails the export and is named", () => {
    // Every block published before kinds existed is in this state, so this is the
    // common case today rather than an edge one.
    const result = exportOf(
      simpleStructure("modern", "legacy"),
      { modern: ok({}), legacy: ok({}) },
      (id) => (id === "legacy" ? undefined : kindOf(id)),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0].blockId).toBe("legacy");
    expect(result.problems[0].error).toContain("declares no kind");
  });

  test("a malformed stored kind reference is a problem, not a throw", () => {
    const result = exportOf(
      simpleStructure("a"),
      { a: ok({}) },
      () => "no-version-here" as BlockKindReference,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0].blockId).toBe("a");
    expect(result.problems[0].error).toContain("malformed");
  });

  test("a reference to a block that is not in the project is NOT caught", () => {
    // Deleting a block only removes it from the structure and does not rewrite downstream
    // args, so a live project holds such references routinely. Recognizing one would mean
    // knowing which values are identifiers, which the engine deliberately does not — so the
    // reference is written out and surfaces on apply as a block wired to nothing.
    const result = exportOf(simpleStructure("survivor"), {
      survivor: ok({ input: toTemplateRef(createPlRef("deleted-upstream", "reads")) }),
    });

    expect(result.ok).toBe(true);
  });

  test("a forward reference is caught, and named as one", () => {
    const result = exportOf(simpleStructure("downstream", "upstream"), {
      downstream: ok({ input: toTemplateRef(createPlRef("upstream", "reads")) }),
      upstream: ok({}),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0].error).toContain("declared after it");
  });

  test("walk problems and assembly problems are reported together, in one pass", () => {
    // Fixing an export should take one round, not one round per broken block.
    const result = exportOf(
      simpleStructure("unreadable", "kindless", "fine"),
      { kindless: ok({}), fine: ok({}) },
      (id) => (id === "kindless" ? undefined : kindOf(id)),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.map((p) => p.blockId).sort()).toEqual(["kindless", "unreadable"]);
  });

  test("no partial YAML is produced when anything is wrong", () => {
    // All-or-nothing: a template missing blocks the user never chose to leave out
    // would still look like a successful export.
    const result = exportOf(simpleStructure("a", "b"), { a: ok({}), b: ok({}) }, (id) =>
      id === "b" ? undefined : kindOf(id),
    );

    expect(result).not.toHaveProperty("yaml");
  });

  test("an empty project exports an empty template", () => {
    const result = exportOf(simpleStructure(), {});

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.blocks).toEqual([]);
    expect(parseProjectTemplateV1(YAML.parse(result.yaml))).toEqual(result.document);
  });
});

describe("locationOf", () => {
  test("a dev block's folder becomes a file URL", () => {
    expect(locationOf(devSpec("/Users/dev/blocks/enter-numbers/block"))).toBe(
      "file:///Users/dev/blocks/enter-numbers/block",
    );
  });

  test("a path with a space is encoded, not written raw", () => {
    // A raw space makes the value not a URI at all, so it would be rejected by the
    // document parser on the way back in.
    expect(locationOf(devSpec("/Users/dev/my blocks/x"))).toBe("file:///Users/dev/my%20blocks/x");
  });

  test("an npm-consumed pack's own URL is passed through untouched", () => {
    // The block emitted this locator itself; rebuilding one from it could only lose
    // information, and the pack directory is not derivable from the package root.
    expect(
      locationOf({
        type: "from-pack-v2",
        packUrl: "file:///repo/node_modules/@o/x/block-pack",
        rootUrl: "file:///repo/node_modules/@o/x",
      }),
    ).toBe("file:///repo/node_modules/@o/x/block-pack");
  });

  test("a registry block gets no locator, which is what keeps it portable", () => {
    expect(locationOf(registrySpec)).toBeUndefined();
    expect(
      locationOf({
        type: "from-registry-v1",
        registryUrl: "https://old",
        id: { organization: "o", name: "n", version: "1.0.0" },
      }),
    ).toBeUndefined();
  });

  test("a legacy dev block gets none either", () => {
    // It predates kinds, so it has no kind reference and the assembler refuses it
    // before a locator would matter.
    expect(locationOf({ type: "dev-v1", folder: "/Users/dev/old" })).toBeUndefined();
  });
});

describe("locating a block installed from a folder", () => {
  test("the entry carries the folder, and keeps the kind alongside it", () => {
    const result = exportOf(
      simpleStructure("samples"),
      { samples: ok({ dataset: "bulk-rna" }) },
      kindPerBlock,
      () => devSpec("/Users/dev/blocks/samples/block"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.blocks[0].location).toBe("file:///Users/dev/blocks/samples/block");
    // The kind stays alongside: it is the params contract, not the locator.
    expect(result.document.blocks[0].kind).toBe(
      kindReferenceToSelectorReference(kindOf("samples")),
    );
  });

  test("what is written survives the round trip through YAML", () => {
    const result = exportOf(simpleStructure("samples"), { samples: ok({}) }, kindPerBlock, () =>
      devSpec("/Users/dev/blocks/samples/block"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(parseProjectTemplateV1(YAML.parse(result.yaml))).toEqual(result.document);
  });

  test("a registry-only project is portable and says nothing", () => {
    const result = exportOf(simpleStructure("samples"), { samples: ok({}) });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect("location" in result.document.blocks[0]).toBe(false);
  });

  test("a block whose origin is unknown is written without a locator", () => {
    // Not a failure: an entry with no locator is the normal, portable form, and the
    // kind is what the importer resolves.
    const result = exportOf(
      simpleStructure("samples"),
      { samples: ok({}) },
      kindPerBlock,
      () => undefined,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect("location" in result.document.blocks[0]).toBe(false);
  });

  test("a locator is written per block, and only for the located ones", () => {
    const result = exportOf(
      simpleStructure("a", "b", "c"),
      { a: ok({}), b: ok({}), c: ok({}) },
      kindPerBlock,
      (id) => (id === "b" ? registrySpec : devSpec(`/Users/dev/blocks/${id}/block`)),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.blocks.map((e) => e.location)).toEqual([
      "file:///Users/dev/blocks/a/block",
      undefined,
      "file:///Users/dev/blocks/c/block",
    ]);
  });
});

describe("assembleProjectTemplateV1", () => {
  test("carries the walk's problems through unchanged", () => {
    const { document, problems } = assembleProjectTemplateV1(
      {
        entries: [{ blockId: "a", params: {} }],
        problems: [{ blockId: "ghost", error: "state unavailable" }],
      },
      kindPerBlock,
      () => registrySpec,
    );

    expect(problems).toEqual([{ blockId: "ghost", error: "state unavailable" }]);
    expect(document.blocks.map((b) => b.id)).toEqual(["a"]);
  });
});
