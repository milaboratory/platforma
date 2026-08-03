import { describe, expect, test } from "vitest";
import type { BlockConfigContainer } from "@milaboratories/pl-model-common";
import {
  ProjectTemplateV1EntrySchema,
  kindReferenceToSelectorReference,
} from "@milaboratories/pl-model-common";
import { extractConfig } from "./bconfig/normalization";
import { BlockModelV3 } from "./block_model";
import { DataModelBuilder } from "./block_migrations";
import { defineBlockKind } from "@platforma-sdk/block-kind";

// Template export needs one fact to hold at runtime: the kind reference a block
// declared at build time is still readable from its config, and reaches a
// template entry unchanged.
//
// No new code is needed for that read — `BlockConfigContainer.kind` is already
// typed `BlockKindReference | undefined`, so the middle layer's read is the
// property access `bp.info.config.kind`, and the widen to an entry's selector
// form already exists. What did not exist is proof that the path holds end to
// end, which is what this suite is: bake -> read -> widen -> entry, inside one
// package, with no backend.

type Params = { label: string };
type BlockData = { label: string };

const KIND_NAME = "@platforma-open/milaboratories.demo.kind";
const KIND_VERSION = "1.4.2";
const KIND_REF = `${KIND_NAME}@${KIND_VERSION}`;

const kind = defineBlockKind<Params>({ name: KIND_NAME, version: KIND_VERSION });

const dataModel = new DataModelBuilder({ kind })
  .from<BlockData>("v1")
  .init(({ params }) => ({ label: params?.label ?? "" }));

/**
 * The config container `build-model` serializes into model.json.
 *
 * `done()` returns it whenever the model is not running in a UI — `isInUI()`
 * checks for a `platforma` global, absent under vitest — which is exactly the
 * path the build takes.
 */
function containerOf(model: unknown): BlockConfigContainer {
  return (model as { config: BlockConfigContainer }).config;
}

const kindfulContainer = () =>
  containerOf(
    BlockModelV3.create({ dataModel, kind })
      .args((data) => ({ label: data.label }))
      .done(),
  );

describe("reading the kind reference back at runtime", () => {
  test("done() bakes the declared kind at the container level", () => {
    // Beside `code`, orthogonal to the render envelope — a future v5 envelope
    // would not move it.
    expect(kindfulContainer().kind).toBe(KIND_REF);
  });

  test("the NORMALIZED config does not carry it — the container is the read point", () => {
    // extractConfig normalizes the render envelope and returns only envelope
    // fields, so the `cfg` every getBlockPackInfo caller holds is kind-blind by
    // construction (lib/node/pl-middle-layer/src/middle_layer/util.ts). An
    // exporter that goes looking there finds nothing and must read
    // `info.config.kind` instead. Pinned so that stays true, or fails loudly.
    expect("kind" in extractConfig(kindfulContainer())).toBe(false);
  });

  test("a kind-less block reads back as undefined rather than throwing", () => {
    const kindlessDataModel = new DataModelBuilder().from<BlockData>("v1").init(() => ({
      label: "",
    }));

    const container = containerOf(
      BlockModelV3.create(kindlessDataModel)
        .args((data) => ({ label: data.label }))
        .done(),
    );

    // The deprecated kind-less overload is still legal, and every block
    // published before kinds existed is in this state — so this is the common
    // case today, not an edge one. What the exporter should DO with such a block
    // is undecided: a template entry's `kind` is required, so there is no legal
    // entry to write. Failing the export and naming every kind-less block is the
    // proposed answer; nothing implements a choice yet.
    expect(container.kind).toBeUndefined();
  });
});

describe("the reference as a template entry's kind", () => {
  test("it widens to the exact tier, string unchanged", () => {
    // An entry's kind is the exact version the block implements, `{name}@X.Y.Z`,
    // read from the model's embedded kind reference. Widening changes the brand,
    // not the string — export never loosens to a `~` or `^` tier.
    expect(kindReferenceToSelectorReference(kindfulContainer().kind!)).toBe(KIND_REF);
  });

  test("the org-scoped name survives the split", () => {
    // The kind name itself starts with `@`, so splitting on the FIRST `@` would
    // truncate it to the empty name. block_kind_ref.ts owns that rule by
    // splitting on the last `@`; this pins that a reference a real block
    // declares round-trips through it intact.
    const widened = kindReferenceToSelectorReference(kindfulContainer().kind!);
    expect(widened.startsWith("@platforma-open/")).toBe(true);
  });

  test("the widened reference is accepted as a template-v1 entry's kind", () => {
    const blockId = "3f1c2b7a-0000-4000-8000-000000000001";

    const entry = ProjectTemplateV1EntrySchema.parse({
      id: blockId,
      kind: kindReferenceToSelectorReference(kindfulContainer().kind!),
    });

    // The whole path, end to end: what the block declared is what the file
    // carries. `id` is the block's project-local UUID, reused verbatim.
    expect(entry).toEqual({ id: blockId, kind: KIND_REF });

    // No `block` override: a block implements exactly one kind version, so
    // export has nothing to pin.
    expect(entry.block).toBeUndefined();
  });
});
