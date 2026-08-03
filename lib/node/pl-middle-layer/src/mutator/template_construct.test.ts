import { beforeAll, describe, expect, test } from "vitest";
import { getQuickJS, type QuickJSWASMModule } from "quickjs-emscripten";
import { BlockStorageFacadeCallbacks } from "@platforma-sdk/model";
import { createPlRef, createTemplateLocalRef } from "@milaboratories/pl-model-common";
import { ProjectHelper } from "../model/project_helper";
import { createTemplateIdMap } from "../model/template_ids";
import type { BlockPackSpecPrepared } from "../model";
import type { Block } from "../model/project_model";
import type { NewBlockSpec } from "./project";
import type { PreparedTemplateEntry } from "./template_construct";
import { createTemplateApplyApi } from "./template_construct";

/**
 * The project-backed `TemplateApplyApi`, driven against a recording placer.
 *
 * A real mutator would need a backend; the one method construction uses does not, so
 * the placer is faked and everything else here is real — a real `ProjectHelper`, a real
 * model VM, real block code. What is being checked is the seam between an entry and a
 * block: which id it got, which storage its params produced, and what a rejection does.
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

function apiOver(
  entries: Map<string, PreparedTemplateEntry>,
  placer: { addBlock: (block: Block, spec: NewBlockSpec) => void },
) {
  let n = 0;
  return createTemplateApplyApi({
    placer,
    projectHelper: new ProjectHelper(quickJs),
    entries,
    ids: createTemplateIdMap(() => `block-${++n}`),
  });
}

describe("createTemplateApplyApi", () => {
  test("an entry's params become the storage its block starts with", () => {
    // The whole reason a template can describe a configured block: the params go
    // through the block's own model, so what lands is what that block considers a
    // correctly initialized state.
    const { placer, placements } = recordingPlacer();
    const api = apiOver(entryMap({ a: preparedBlock(echoModel) }), placer);

    const outcome = api.addBlock({ id: "a", params: { numbers: [3, 1, 2] } });

    expect(outcome).toEqual({ ok: true, blockId: "block-1" });
    expect(storageOf(placements[0])).toEqual({ numbers: [3, 1, 2] });
  });

  test("an entry with no params leaves the block's own default alone", () => {
    // No `initialStorage` at all, not an empty one: the mutator's default path asks the
    // model what it starts as, and `{}` handed to the params initializer is a different
    // thing entirely.
    const { placer, placements } = recordingPlacer();
    const api = apiOver(entryMap({ a: preparedBlock(echoModel) }), placer);

    api.addBlock({ id: "a" });

    expect(placements[0].spec).toEqual({
      storageMode: "fromModel",
      blockPack: expect.anything(),
    });
  });

  test("references are resolved to the blocks already placed", () => {
    // The payoff of the whole import path: the second entry's params name a
    // template-local id in the file and reach the block as a reference to the id the
    // first block actually got.
    const { placer, placements } = recordingPlacer();
    const api = apiOver(
      entryMap({ samples: preparedBlock(echoModel), align: preparedBlock(echoModel) }),
      placer,
    );

    api.addBlock({ id: "samples" });
    api.addBlock({ id: "align", params: { input: createTemplateLocalRef("samples", "reads") } });

    expect(placements[0].block.id).toBe("block-1");
    expect(storageOf(placements[1])).toEqual({ input: createPlRef("block-1", "reads") });
  });

  test("the block is placed under the caller's label, in the block's rendering mode", () => {
    const { placer, placements } = recordingPlacer();
    const api = apiOver(entryMap({ a: preparedBlock(echoModel) }), placer);

    api.addBlock({ id: "a" });

    expect(placements[0].block).toEqual({
      id: "block-1",
      label: "Block a",
      renderingMode: "Heavy",
    });
  });

  test("params the block declines are reported, and nothing is placed", () => {
    // The expected failure for a hand-written file. The message is the block's own.
    const { placer, placements } = recordingPlacer();
    const api = apiOver(
      entryMap({ a: preparedBlock('() => ({ error: "numbers must not be empty" })') }),
      placer,
    );

    const outcome = api.addBlock({ id: "a", params: { numbers: [] } });

    expect(outcome).toEqual({ ok: false, error: "numbers must not be empty" });
    expect(placements).toHaveLength(0);
  });

  test("a reference to an entry with no block is reported, and nothing is placed", () => {
    const { placer, placements } = recordingPlacer();
    const api = apiOver(entryMap({ a: preparedBlock(echoModel) }), placer);

    const outcome = api.addBlock({
      id: "a",
      params: { input: createTemplateLocalRef("b", "out") },
    });

    expect(outcome.ok).toBe(false);
    expect(placements).toHaveLength(0);
  });

  test("a block too old to be initialized from params is refused", () => {
    // It could be added — that is the danger. Creating it would ignore everything the
    // template said about it and still look like a successful apply.
    const { placer, placements } = recordingPlacer();
    const api = apiOver(entryMap({ a: legacyPreparedBlock() }), placer);

    const outcome = api.addBlock({ id: "a", params: { numbers: [1] } });

    expect(outcome).toEqual({
      ok: false,
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
    const api = apiOver(entryMap({ a: legacyPreparedBlock() }), placer);

    expect(api.addBlock({ id: "a" }).ok).toBe(false);
  });

  test("a current block whose model predates the callback reports the model's way out", () => {
    // A different failure from the one above: the block is on the current facade, its
    // model just has no params initializer. The message comes from the helper and must
    // reach the caller as-is.
    const { placer } = recordingPlacer();
    const api = apiOver(
      entryMap({ a: preparedBlock(echoModel, { declareCallback: false }) }),
      placer,
    );

    const outcome = api.addBlock({ id: "a", params: { numbers: [1] } });

    expect(outcome).toEqual({
      ok: false,
      error:
        "This version of the block cannot be created from a template. Use a newer version " +
        "of the block, or remove the pinned block version from the template entry so a " +
        "supported one is chosen automatically.",
    });
  });

  test("an entry nothing was prepared for is reported", () => {
    // Resolution covers every entry or the apply never starts, so this is a caller
    // error — reported rather than thrown, because the contract has no throws for
    // anything an orchestrator can cause.
    const { placer } = recordingPlacer();
    const api = apiOver(entryMap({ a: preparedBlock(echoModel) }), placer);

    expect(api.addBlock({ id: "ghost" })).toEqual({
      ok: false,
      error: "No block was prepared for entry 'ghost'.",
    });
  });

  test("a failure to place a block is not swallowed", () => {
    // Deliberately unlike the failures above. By this point the mutator holds half a
    // change, so the only safe outcome is to lose the transaction — reporting it would
    // commit something no one wrote.
    const { placer } = recordingPlacer("Block a");
    const api = apiOver(entryMap({ a: preparedBlock(echoModel) }), placer);

    expect(() => api.addBlock({ id: "a" })).toThrow("structure is broken");
  });

  test("a rejected entry does not become a reference target", () => {
    // Its id was assigned but never recorded, so a later entry naming it fails instead
    // of pointing at a block that was never created.
    const { placer } = recordingPlacer();
    const api = apiOver(
      entryMap({
        a: preparedBlock('() => ({ error: "no" })'),
        b: preparedBlock(echoModel),
      }),
      placer,
    );

    api.addBlock({ id: "a", params: {} });
    const outcome = api.addBlock({
      id: "b",
      params: { input: createTemplateLocalRef("a", "out") },
    });

    expect(outcome.ok).toBe(false);
  });

  test("every block gets its own id", () => {
    const { placer, placements } = recordingPlacer();
    const api = apiOver(
      entryMap({
        a: preparedBlock(echoModel),
        b: preparedBlock(echoModel),
        c: preparedBlock(echoModel),
      }),
      placer,
    );

    for (const id of ["a", "b", "c"]) api.addBlock({ id });

    expect(placements.map((p) => p.block.id)).toEqual(["block-1", "block-2", "block-3"]);
  });
});
