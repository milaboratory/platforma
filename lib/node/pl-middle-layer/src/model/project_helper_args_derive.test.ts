import { beforeAll, describe, expect, test } from "vitest";
import { getQuickJS } from "quickjs-emscripten";
import type { BlockConfig, ConfigRenderLambda } from "@platforma-sdk/model";
import { BlockStorageFacadeCallbacks } from "@platforma-sdk/model";
import { ProjectHelper } from "./project_helper";

// The model is hand-written: what is driven here is the boundary — what each result the model
// can return turns into once it has crossed out of the VM. What the SDK returns for given block
// code is covered by `sdk/model/src/args_validation.test.ts`.

const ARGS = BlockStorageFacadeCallbacks.ArgsDerive;
const PRERUN = BlockStorageFacadeCallbacks.PrerunArgsDerive;

let helper: ProjectHelper;

beforeAll(async () => {
  helper = new ProjectHelper(await getQuickJS());
});

describe("deriveArgsFromStorage", () => {
  test("ready args cross with their warnings", () => {
    const result = helper.deriveArgsFromStorage(
      configReturning(ARGS, {
        type: "ready",
        value: { n: 1, nested: { list: [1, "a"] } },
        issues: [{ severity: "warning", message: "Few samples" }],
      }),
      "{}",
    );

    expect(result).toEqual({
      type: "ready",
      value: { n: 1, nested: { list: [1, "a"] } },
      warnings: [{ severity: "warning", message: "Few samples" }],
    });
  });

  test("a not-ready result whose value is undefined crosses as not ready", () => {
    const result = helper.deriveArgsFromStorage(
      configReturningCode(ARGS, `({ type: "notReady", value: undefined })`),
      "{}",
    );

    expect(result).toEqual({ type: "notReady" });
  });

  test("blocked args cross with their draft and issues", () => {
    const result = helper.deriveArgsFromStorage(
      configReturning(ARGS, {
        type: "blocked",
        error: "Abundance is required",
        issues: [{ severity: "error", message: "Abundance is required" }],
        draft: { n: 1 },
      }),
      "{}",
    );

    expect(result).toEqual({
      type: "blocked",
      issues: [{ severity: "error", message: "Abundance is required" }],
      draft: { n: 1 },
    });
  });

  test("an older model's throw is one error without the prefix", () => {
    const result = helper.deriveArgsFromStorage(
      configReturning(ARGS, { error: "args() threw: boom" }),
      "{}",
    );

    expect(result).toEqual({
      type: "blocked",
      issues: [{ severity: "error", message: "boom" }],
      draft: undefined,
    });
  });

  test("an older model's undefined args cross as not ready", () => {
    const result = helper.deriveArgsFromStorage(
      configReturningCode(ARGS, `({ value: undefined })`),
      "{}",
    );

    expect(result).toEqual({ type: "notReady" });
  });

  test("the storage reaches the model as given", () => {
    const result = helper.deriveArgsFromStorage(
      configReturningCode(ARGS, `({ type: "ready", value: JSON.parse(storage), issues: [] })`),
      '{"a":[1,2]}',
    );

    expect(result).toEqual({ type: "ready", value: { a: [1, 2] }, warnings: [] });
  });

  test("a model that cannot run is a failure", () => {
    const result = helper.deriveArgsFromStorage(
      configReturningCode(ARGS, `(() => { throw new Error("vm"); })()`),
      "{}",
    );

    expect(result.type).toBe("failed");
  });
});

describe("derivePrerunArgsFromStorage", () => {
  test("a prerun held back by the block's args crosses as not ready", () => {
    const result = helper.derivePrerunArgsFromStorage(
      configReturningCode(PRERUN, `({ type: "notReady", value: undefined })`),
      "{}",
    );

    expect(result).toEqual({ type: "notReady" });
  });

  test("an older model's fallback throw gives the prerun no issues", () => {
    const result = helper.derivePrerunArgsFromStorage(
      configReturning(PRERUN, { error: "args() threw (fallback): boom" }),
      "{}",
    );

    expect(result).toEqual({ type: "notReady" });
  });

  test("an older model's prerunArgs() throw is one error without the prefix", () => {
    const result = helper.derivePrerunArgsFromStorage(
      configReturning(PRERUN, { error: "prerunArgs() threw: boom" }),
      "{}",
    );

    expect(result).toEqual({
      type: "blocked",
      issues: [{ severity: "error", message: "boom" }],
      draft: undefined,
    });
  });
});

// Internals

/** A config whose model answers `handle` with `result`, whatever storage it is given. */
function configReturning(handle: string, result: unknown): BlockConfig {
  return configReturningCode(handle, JSON.stringify(result));
}

/** A config whose model answers `handle` with the value of `expression`; `storage` is in scope. */
function configReturningCode(handle: string, expression: string): BlockConfig {
  // Registration mirrors what the SDK's `tryRegisterCallback` does inside a real bundle.
  const code = `globalThis.cfgRenderCtx.callbackRegistry[${JSON.stringify(handle)}] = (storage) => (${expression});`;
  return {
    configVersion: 4,
    modelAPIVersion: 2,
    sdkVersion: "1.0.0",
    renderingMode: "Heavy",
    sections: lambda("sections"),
    outputs: {},
    code: { type: "plain", content: code },
    blockLifecycleCallbacks: { [handle]: lambda(handle) },
  };
}

function lambda(handle: string): ConfigRenderLambda {
  return { __renderLambda: true, handle };
}
