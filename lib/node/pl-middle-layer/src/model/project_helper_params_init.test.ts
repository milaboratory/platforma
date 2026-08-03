import { beforeAll, describe, expect, test } from "vitest";
import { getQuickJS, type QuickJSWASMModule } from "quickjs-emscripten";
import type { BlockConfig, ResultOrError } from "@platforma-sdk/model";
import { BlockStorageFacadeCallbacks } from "@platforma-sdk/model";
import { ProjectHelper } from "./project_helper";

/**
 * `ProjectHelper.getInitialStorageFromParamsInVM` — the middle layer's side of the
 * params-to-storage callback.
 *
 * The block model is hand-written here rather than loaded from a built block: the
 * method's whole job is the boundary (does the callback exist, what crosses it as
 * text, how each failure is reported), and a hand-written model is the only way to
 * drive every failure branch on purpose. What the SDK puts behind the callback is
 * covered by `sdk/model/src/template_init.test.ts`.
 */

const HANDLE = BlockStorageFacadeCallbacks.StorageInitialFromParams;

/**
 * A block model whose params callback body is `body`.
 *
 * Registration mirrors what the SDK's `tryRegisterCallback` does inside a real
 * bundle: write the function into the render context's callback registry, which is
 * where the invoker looks it up by handle.
 */
function modelCode(body: string): string {
  return `globalThis.cfgRenderCtx.callbackRegistry[${JSON.stringify(HANDLE)}] = ${body};`;
}

/**
 * A config carrying `code` and declaring the callback.
 *
 * Only three fields are read on this path — `modelAPIVersion`, the callback handle,
 * and `code` — so the rest of `BlockConfig` (outputs, sections, inputsValid) is left
 * out and the cast stands in for it.
 */
function configWith(
  code: string,
  options: { declareCallback?: boolean; modelAPIVersion?: number } = {},
): BlockConfig {
  const { declareCallback = true, modelAPIVersion = 2 } = options;
  return {
    modelAPIVersion,
    sdkVersion: "1.0.0",
    code: { type: "plain", content: code },
    blockLifecycleCallbacks: declareCallback ? { [HANDLE]: { handle: HANDLE } } : {},
  } as unknown as BlockConfig;
}

/** The storage the callback produced, parsed. Fails the test if it errored instead. */
function storageFrom(result: ResultOrError<string>): unknown {
  if (result.error !== undefined) throw new Error(`expected storage, got: ${result.error.message}`);
  return JSON.parse(result.value);
}

let helper: ProjectHelper;
let quickJs: QuickJSWASMModule;

beforeAll(async () => {
  quickJs = await getQuickJS();
  helper = new ProjectHelper(quickJs);
});

describe("getInitialStorageFromParamsInVM", () => {
  test("params reach the block's callback and its storage comes back", () => {
    // The model echoes what it was given, so this asserts both directions of the
    // boundary at once: the params arrived as text, the storage came back as text.
    const result = helper.getInitialStorageFromParamsInVM(
      configWith(modelCode("(paramsJson) => ({ storageJson: paramsJson })")),
      { numbers: [3, 1, 2], label: "run 1" },
    );

    expect(storageFrom(result)).toEqual({ numbers: [3, 1, 2], label: "run 1" });
  });

  test("a reference in params survives the crossing unchanged", () => {
    // References are resolved before this call, so the concrete ids the applier
    // just assigned must arrive byte-identical — a mangled `__isRef` object would
    // produce a block wired to nothing.
    const ref = { __isRef: true, blockId: "11111111-1111-4111-8111-111111111111", name: "reads" };

    const result = helper.getInitialStorageFromParamsInVM(
      configWith(modelCode("(paramsJson) => ({ storageJson: paramsJson })")),
      { source: ref },
    );

    expect(storageFrom(result)).toEqual({ source: ref });
  });

  test("absent params arrive as an empty object, never as the literal undefined", () => {
    // `JSON.stringify(undefined)` is not a string at all, so the callback would be
    // handed nothing and fail to parse. An entry with no params is supposed to go
    // through the params-less initializer instead; this is the safety net.
    const result = helper.getInitialStorageFromParamsInVM(
      configWith(modelCode("(paramsJson) => ({ storageJson: paramsJson })")),
      undefined,
    );

    expect(storageFrom(result)).toEqual({});
  });

  test("a block that does not support params is reported, with the way out", () => {
    // The load-bearing case: the old block CAN be added to a project, so silently
    // falling back to default initialization would produce a block that looks
    // applied but ignores everything the template said about it.
    //
    // The wording is asserted because it is the whole value of this branch. Whoever
    // applied the file did not build the block and cannot rebuild it, so a message
    // about SDKs or callbacks would leave them with nothing to do.
    const result = helper.getInitialStorageFromParamsInVM(
      configWith(modelCode("(paramsJson) => ({ storageJson: paramsJson })"), {
        declareCallback: false,
      }),
      { numbers: [1] },
    );

    expect(result.error?.message).toBe(
      "This version of the block cannot be created from a template. Use a newer version " +
        "of the block, or remove the pinned block version from the template entry so a " +
        "supported one is chosen automatically.",
    );
  });

  test("the callback's own error is passed through verbatim", () => {
    // Params the block rejects — the expected failure for a hand-written template.
    // The message is the block's, so it must not be wrapped or reworded.
    const result = helper.getInitialStorageFromParamsInVM(
      configWith(modelCode('() => ({ error: "numbers must not be empty" })')),
      { numbers: [] },
    );

    expect(result.error?.message).toBe("numbers must not be empty");
  });

  test("a throwing model is reported with its reason in the message", () => {
    // Not the same as the case above: this is the model failing rather than
    // declining. The reason has to reach `message`, since that is all the layers
    // between here and the user carry.
    const result = helper.getInitialStorageFromParamsInVM(
      configWith(modelCode('() => { throw new Error("boom"); }')),
      { numbers: [1] },
    );

    expect(result.error?.message).toContain("Initial storage creation from params failed");
    expect(result.error?.message).toContain("boom");
  });

  test("a v1 block is rejected outright", () => {
    const result = helper.getInitialStorageFromParamsInVM(
      configWith(modelCode("(paramsJson) => ({ storageJson: paramsJson })"), {
        modelAPIVersion: 1,
      }),
      { numbers: [1] },
    );

    expect(result.error?.message).toMatch(/only supported for model API version 2/);
  });
});
