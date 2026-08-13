import { beforeAll, describe, expect, test } from "vitest";
import { getQuickJS, type QuickJSWASMModule } from "quickjs-emscripten";
import { BlockStorageFacadeCallbacks } from "@platforma-sdk/model";
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
import { ProjectHelper } from "../model/project_helper";
import { createTemplateIdMap } from "../model/template_ids";
import type { BlockPackSpecPrepared } from "../model";
import type { Block } from "../model/project_model";
import type { NewBlockSpec } from "./project";
import type { PreparedTemplateEntry } from "./template_construct";
import { applyTemplateEntries } from "./template_construct";

/**
 * Applying a document against a recording placer.
 *
 * A real mutator would need a backend; the one method construction uses does not, so the
 * placer is faked and everything else here is real — a real `ProjectHelper`, a real model VM,
 * real block code. What is being checked is the seam between an entry and a block: which id
 * it got, which storage its params produced, what a rejection does, and how far an apply gets
 * before it stops.
 */

const HANDLE = BlockStorageFacadeCallbacks.StorageInitialFromParams;

/** A v4 block whose params-to-storage callback body is `body`. */
function preparedBlock(
  body: string,
  options: { declareCallback?: boolean } = {},
): BlockPackSpecPrepared {
  const { declareCallback = true } = options;
  return {
    type: "prepared",
    config: {
      code: {
        type: "plain",
        content: `globalThis.cfgRenderCtx.callbackRegistry[${JSON.stringify(HANDLE)}] = ${body};`,
      },
      v4: {
        sdkVersion: "1.0.0",
        renderingMode: "Heavy",
        outputs: {},
        sections: [],
        // A block that predates the params callback still declares the older ones, and
        // it has to: `extractConfig` fills every handle in for a v4 block whose set is
        // empty, which would hide this case entirely.
        blockLifecycleCallbacks: {
          [BlockStorageFacadeCallbacks.StorageInitial]: {
            handle: BlockStorageFacadeCallbacks.StorageInitial,
          },
          ...(declareCallback ? { [HANDLE]: { handle: HANDLE } } : {}),
        },
      },
    },
  } as unknown as BlockPackSpecPrepared;
}

/** A block on the previous model API, which cannot be initialized from params at all. */
function legacyPreparedBlock(): BlockPackSpecPrepared {
  return {
    type: "prepared",
    config: {
      code: { type: "plain", content: "" },
      v3: {
        sdkVersion: "1.0.0",
        renderingMode: "Heavy",
        outputs: {},
        sections: [],
        initialArgs: {},
        inputsValid: "inputsValid",
      },
    },
  } as unknown as BlockPackSpecPrepared;
}

/** Echoes its params back as the block's storage. */
const echoModel = "(paramsJson) => ({ storageJson: paramsJson })";

type Placement = { block: Block; spec: NewBlockSpec };

/**
 * @param throwOn Block label to refuse to place, as an exception — the mutator's way of
 *   failing
 */
function recordingPlacer(throwOn?: string) {
  const placements: Placement[] = [];
  return {
    placements,
    placer: {
      addBlock: (block: Block, spec: NewBlockSpec) => {
        if (block.label === throwOn) throw new Error("structure is broken");
        placements.push({ block, spec });
      },
    },
  };
}

function entryMap(
  entries: Record<string, BlockPackSpecPrepared>,
): Map<string, PreparedTemplateEntry> {
  return new Map(
    Object.entries(entries).map(([id, blockPack]) => [id, { blockPack, label: `Block ${id}` }]),
  );
}

/** The storage a placement carries, parsed. */
function storageOf(placement: Placement): unknown {
  if (placement.spec.storageMode !== "fromModel") throw new Error("expected fromModel");
  const { initialStorage } = placement.spec;
  if (initialStorage === undefined) throw new Error("expected seeded storage");
  return JSON.parse(initialStorage);
}

let quickJs: QuickJSWASMModule;

beforeAll(async () => {
  quickJs = await getQuickJS();
});

const KIND = "@platforma-open/milaboratories.demo.kind@^1.0.0" as BlockKindSelectorReference;

const entry = (id: string, params?: Record<string, unknown>): ProjectTemplateV1Entry => ({
  id,
  kind: KIND,
  ...(params !== undefined ? { params } : {}),
});

const documentOf = (...blocks: ProjectTemplateV1Entry[]): ProjectTemplateV1 => ({
  schema: PROJECT_TEMPLATE_SCHEMA_V1,
  blocks,
});

/** One apply, with ids named as a counter so the assertions can spell them out. */
function applyOver(
  entries: Map<string, PreparedTemplateEntry>,
  placer: { addBlock: (block: Block, spec: NewBlockSpec) => void },
  document: ProjectTemplateV1,
) {
  let n = 0;
  return applyTemplateEntries({
    document,
    placer,
    projectHelper: new ProjectHelper(quickJs),
    entries,
    ids: createTemplateIdMap(() => `block-${++n}`),
  });
}

describe("applyTemplateEntries", () => {
  test("an entry's params become the storage its block starts with", () => {
    // The whole reason a template can describe a configured block: the params go
    // through the block's own model, so what lands is what that block considers a
    // correctly initialized state.
    const { placer, placements } = recordingPlacer();

    const outcome = applyOver(
      entryMap({ a: preparedBlock(echoModel) }),
      placer,
      documentOf(entry("a", { numbers: [3, 1, 2] })),
    );

    expect(outcome).toEqual({ added: [{ templateLocalId: "a", blockId: "block-1" }] });
    expect(storageOf(placements[0])).toEqual({ numbers: [3, 1, 2] });
  });

  test("an entry with no params goes through the params path as `{}`", () => {
    // Not routed around it. The two produce the same block anyway — both reach the same
    // init factory — but only this way is the entry checked against its kind, so an
    // omitted key cannot be a way to apply params the contract would have rejected.
    const { placer, placements } = recordingPlacer();

    applyOver(entryMap({ a: preparedBlock(echoModel) }), placer, documentOf(entry("a")));

    expect(placements[0].spec).toEqual({
      storageMode: "fromModel",
      blockPack: expect.anything(),
      initialStorage: expect.anything(),
    });
    expect(storageOf(placements[0])).toEqual({});
  });

  test("references are redirected to the blocks already placed", () => {
    // The payoff of the whole import path: the second entry's params name a
    // template-local id in the file and reach the block as a reference to the id the
    // first block actually got.
    const { placer, placements } = recordingPlacer();
    const params = { input: toTemplateRef(createPlRef("samples", "reads")) };

    applyOver(
      entryMap({ samples: preparedBlock(echoModel), align: preparedBlock(echoModel) }),
      placer,
      documentOf(entry("samples"), entry("align", params)),
    );

    expect(placements[0].block.id).toBe("block-1");
    expect(storageOf(placements[1])).toEqual({ input: createPlRef("block-1", "reads") });
  });

  test("entries are created in file order, and each pairs with the id it got", () => {
    // File order is instantiation order, which is what makes one forward pass enough.
    const { placer, placements } = recordingPlacer();

    const outcome = applyOver(
      entryMap({
        a: preparedBlock(echoModel),
        b: preparedBlock(echoModel),
        c: preparedBlock(echoModel),
      }),
      placer,
      documentOf(entry("a"), entry("b"), entry("c")),
    );

    expect(placements.map((p) => p.block.id)).toEqual(["block-1", "block-2", "block-3"]);
    expect(outcome.added).toEqual([
      { templateLocalId: "a", blockId: "block-1" },
      { templateLocalId: "b", blockId: "block-2" },
      { templateLocalId: "c", blockId: "block-3" },
    ]);
  });

  test("an empty document is a successful apply that creates nothing", () => {
    // An exported empty project round-trips to an empty project, not to a failure.
    const { placer, placements } = recordingPlacer();

    expect(applyOver(entryMap({}), placer, documentOf())).toEqual({ added: [] });
    expect(placements).toHaveLength(0);
  });

  test("the block is placed under the caller's label, in the block's rendering mode", () => {
    const { placer, placements } = recordingPlacer();

    applyOver(entryMap({ a: preparedBlock(echoModel) }), placer, documentOf(entry("a")));

    expect(placements[0].block).toEqual({
      id: "block-1",
      label: "Block a",
      renderingMode: "Heavy",
    });
  });

  test("params the block declines are reported, and nothing is placed", () => {
    // The expected failure for a hand-written file. The message is the block's own.
    const { placer, placements } = recordingPlacer();

    const outcome = applyOver(
      entryMap({ a: preparedBlock('() => ({ error: "numbers must not be empty" })') }),
      placer,
      documentOf(entry("a", { numbers: [] })),
    );

    expect(outcome.problem).toEqual({ entryId: "a", error: "numbers must not be empty" });
    expect(placements).toHaveLength(0);
  });

  test("it stops at the first entry it cannot create, and keeps what landed", () => {
    // Everything after the failure may reference it, so continuing would place blocks whose
    // upstream is missing. What already landed is valid and is kept, and the report is the
    // only record of how far the apply got.
    const { placer, placements } = recordingPlacer();

    const outcome = applyOver(
      entryMap({
        a: preparedBlock(echoModel),
        b: preparedBlock('() => ({ error: "params rejected" })'),
        c: preparedBlock(echoModel),
      }),
      placer,
      documentOf(entry("a"), entry("b"), entry("c")),
    );

    expect(outcome.added).toEqual([{ templateLocalId: "a", blockId: "block-1" }]);
    expect(outcome.problem).toEqual({ entryId: "b", error: "params rejected" });
    expect(placements.map((p) => p.block.id)).toEqual(["block-1"]);
  });

  test("a reference to an entry with no block travels as written, and the block is placed", () => {
    // The engine cannot see that `b` names nothing yet, so the reference travels as written
    // and the block is created wired to it. Validation is what rejects such a document.
    const { placer, placements } = recordingPlacer();
    const params = { input: toTemplateRef(createPlRef("b", "out")) };

    const outcome = applyOver(
      entryMap({ a: preparedBlock(echoModel) }),
      placer,
      documentOf(entry("a", params)),
    );

    expect(outcome.problem).toBeUndefined();
    expect(placements).toHaveLength(1);
    expect(storageOf(placements[0])).toEqual({ input: createPlRef("b", "out") });
  });

  test("a block too old to be initialized from params is refused", () => {
    // It could be added — that is the danger. Creating it would ignore everything the
    // template said about it and still look like a successful apply.
    const { placer, placements } = recordingPlacer();

    const outcome = applyOver(
      entryMap({ a: legacyPreparedBlock() }),
      placer,
      documentOf(entry("a", { numbers: [1] })),
    );

    expect(outcome.problem).toEqual({
      entryId: "a",
      error:
        "This version of the block is too old to be created from a template. Use a newer " +
        "version of the block, or remove the pinned block version from this entry so a " +
        "supported one is chosen automatically.",
    });
    expect(placements).toHaveLength(0);
  });

  test("a block too old for kinds is refused even with no params of its own", () => {
    // Nothing to ignore here, and it would be created correctly — but every entry names
    // a kind, and a block predating the facade implements none, so it is not the block
    // the entry asked for.
    const { placer } = recordingPlacer();

    const outcome = applyOver(
      entryMap({ a: legacyPreparedBlock() }),
      placer,
      documentOf(entry("a")),
    );

    expect(outcome.problem?.entryId).toBe("a");
  });

  test("a current block whose model predates the callback reports the model's way out", () => {
    // A different failure from the one above: the block is on the current facade, its
    // model just has no params initializer. The message comes from the helper and must
    // reach the caller as-is.
    const { placer } = recordingPlacer();

    const outcome = applyOver(
      entryMap({ a: preparedBlock(echoModel, { declareCallback: false }) }),
      placer,
      documentOf(entry("a", { numbers: [1] })),
    );

    expect(outcome.problem).toEqual({
      entryId: "a",
      error:
        "This version of the block cannot be created from a template. Use a newer version " +
        "of the block, or remove the pinned block version from the template entry so a " +
        "supported one is chosen automatically.",
    });
  });

  test("an entry nothing was prepared for is reported", () => {
    // Resolution covers every entry or the apply never starts, so this is a caller error —
    // reported rather than thrown, so it reads like any other bad entry.
    const { placer } = recordingPlacer();

    const outcome = applyOver(
      entryMap({ a: preparedBlock(echoModel) }),
      placer,
      documentOf(entry("ghost")),
    );

    expect(outcome.problem).toEqual({
      entryId: "ghost",
      error: "No block was prepared for entry 'ghost'.",
    });
  });

  test("a failure to place a block is not swallowed", () => {
    // Deliberately unlike the failures above. By this point the mutator holds half a
    // change, so the only safe outcome is to lose the transaction — reporting it would
    // commit something no one wrote.
    const { placer } = recordingPlacer("Block a");

    expect(() =>
      applyOver(entryMap({ a: preparedBlock(echoModel) }), placer, documentOf(entry("a"))),
    ).toThrow("structure is broken");
  });

  test("a rejected entry does not become a redirect target", () => {
    // Its id was assigned but never recorded. The apply stops at the rejection, so the entry
    // that would have named it is never reached — which is the other half of why a
    // half-wired project cannot be produced here.
    const { placer, placements } = recordingPlacer();
    const params = { input: toTemplateRef(createPlRef("a", "out")) };

    const outcome = applyOver(
      entryMap({
        a: preparedBlock('() => ({ error: "no" })'),
        b: preparedBlock(echoModel),
      }),
      placer,
      documentOf(entry("a", {}), entry("b", params)),
    );

    expect(outcome.problem?.entryId).toBe("a");
    expect(placements).toHaveLength(0);
  });
});
