import { afterEach, describe, expect, expectTypeOf, test } from "vitest";
import { stringifyJson, type ArgsIssue } from "@milaboratories/pl-model-common";
import { defineBlockKind } from "@platforma-sdk/block-kind";
import { createBlockStorage } from "./block_storage";
import {
  deriveArgsFromStorage,
  derivePrerunArgsFromStorage,
  type ArgsChannel,
} from "./block_storage_callbacks";
import { BlockStorageFacadeCallbacks } from "./block_storage_facade";
import { BlockModelV3 } from "./block_model";
import { DataModelBuilder } from "./block_migrations";
import type { BlockModelInfo } from "./platforma";

type BlockData = { numbers: number[]; label: string };

const kind = defineBlockKind<Record<string, never>>({
  name: "@platforma-open/milaboratories.args-validation.kind",
  version: "1.0.0",
  parseInitializationParams: () => ({}),
});

const dataModel = new DataModelBuilder({ kind })
  .from<BlockData>("v1")
  .init(() => ({ numbers: [], label: "" }));

const storageOf = (data: BlockData) => stringifyJson(createBlockStorage(data));

const error = (message: string): ArgsIssue => ({ severity: "error", message });
const warning = (message: string): ArgsIssue => ({ severity: "warning", message });

const channel = (
  derive: (data: BlockData) => unknown,
  validate?: (input: { args: unknown; data: BlockData }) => unknown,
): ArgsChannel => ({
  derive: (data) => derive(parseData(data)),
  validate:
    validate === undefined
      ? undefined
      : ({ args, data }) => validate({ args, data: parseData(data) }),
});

const numbersOf = (data: BlockData) => ({ numbers: data.numbers });
const requireNumbers = ({ data }: { data: BlockData }): ArgsIssue[] =>
  data.numbers.length === 0 ? [error("Numbers are required")] : [];

afterEach(() => {
  Reflect.deleteProperty(globalThis, "cfgRenderCtx");
  Reflect.deleteProperty(globalThis, "platforma");
});

describe("deriveArgsFromStorage", () => {
  const filled = storageOf({ numbers: [1], label: "" });
  const empty = storageOf({ numbers: [], label: "" });

  test("args without validation are ready with no issues", () => {
    expect(deriveArgsFromStorage(filled, channel(numbersOf))).toEqual({
      type: "ready",
      value: { numbers: [1] },
      issues: [],
    });
  });

  test("warnings leave the args ready and travel with them", () => {
    const result = deriveArgsFromStorage(
      filled,
      channel(numbersOf, () => [warning("Only one number")]),
    );

    expect(result).toEqual({
      type: "ready",
      value: { numbers: [1] },
      issues: [warning("Only one number")],
    });
  });

  test("errors hold the args back as a draft, with every issue found", () => {
    const result = deriveArgsFromStorage(
      empty,
      channel(numbersOf, (input) => [warning("Label is empty"), ...requireNumbers(input)]),
    );

    expect(result).toEqual({
      type: "blocked",
      error: "Numbers are required",
      issues: [warning("Label is empty"), error("Numbers are required")],
      draft: { numbers: [] },
    });
  });

  test("the error text joins every error message", () => {
    const result = deriveArgsFromStorage(
      empty,
      channel(numbersOf, () => [error("A"), warning("W"), error("B")]),
    );

    expect(result.error).toBe("A; B");
  });

  test("a throwing args function is one error with no draft, prefixed in the error text only", () => {
    const result = deriveArgsFromStorage(
      filled,
      channel(() => {
        throw new Error("Numbers required");
      }, requireNumbers),
    );

    expect(result).toEqual({
      type: "blocked",
      error: "args() threw: Numbers required",
      issues: [error("Numbers required")],
      draft: undefined,
    });
  });

  test("args derived as undefined are not ready, without validation", () => {
    const result = deriveArgsFromStorage(
      filled,
      channel(
        () => undefined,
        () => {
          throw new Error("must not run");
        },
      ),
    );

    expect(result).toEqual({ type: "notReady", value: undefined });
  });

  test("a throwing validation is one error, and the args are a draft", () => {
    const result = deriveArgsFromStorage(
      filled,
      channel(numbersOf, () => {
        throw new Error("validation failed");
      }),
    );

    expect(result).toMatchObject({
      type: "blocked",
      issues: [error("validation failed")],
      draft: { numbers: [1] },
    });
  });

  test("a validation result that is not a list is an error", () => {
    const result = deriveArgsFromStorage(
      filled,
      channel(numbersOf, () => "fine"),
    );

    expect(result).toMatchObject({
      type: "blocked",
      issues: [error("Args validation returned string instead of a list of issues")],
    });
  });

  test("an issue of unknown severity is an error", () => {
    const result = deriveArgsFromStorage(
      filled,
      channel(numbersOf, () => [{ severity: "notice", message: "N" }]),
    );

    expect(result).toMatchObject({ type: "blocked", issues: [error("N")] });
  });
});

describe("derivePrerunArgsFromStorage", () => {
  const filled = storageOf({ numbers: [1], label: "x" });
  const empty = storageOf({ numbers: [], label: "x" });
  const labelOf = (data: BlockData) => ({ label: data.label });

  describe("a block with its own prerun args", () => {
    test("uses the prerun channel and ignores args validation", () => {
      const result = derivePrerunArgsFromStorage(empty, {
        args: channel(numbersOf, requireNumbers),
        prerun: channel(labelOf, undefined),
      });

      expect(result).toEqual({ type: "ready", value: { label: "x" }, issues: [] });
    });

    test("prerun validation errors hold the prerun args back as a draft", () => {
      const result = derivePrerunArgsFromStorage(filled, {
        args: channel(numbersOf, undefined),
        prerun: channel(labelOf, () => [error("Label is too short")]),
      });

      expect(result).toEqual({
        type: "blocked",
        error: "Label is too short",
        issues: [error("Label is too short")],
        draft: { label: "x" },
      });
    });

    test("prerun warnings leave the prerun ready", () => {
      const result = derivePrerunArgsFromStorage(filled, {
        args: channel(numbersOf, undefined),
        prerun: channel(labelOf, () => [warning("Short label")]),
      });

      expect(result).toEqual({
        type: "ready",
        value: { label: "x" },
        issues: [warning("Short label")],
      });
    });

    test("prerun args derived as undefined skip the prerun", () => {
      const result = derivePrerunArgsFromStorage(filled, {
        args: channel(numbersOf, undefined),
        prerun: channel(() => undefined, undefined),
      });

      expect(result).toEqual({ type: "notReady", value: undefined });
    });

    test("a throwing prerun args function is one error with no draft", () => {
      const result = derivePrerunArgsFromStorage(filled, {
        args: channel(numbersOf, undefined),
        prerun: channel(() => {
          throw new Error("not ready");
        }, undefined),
      });

      expect(result).toEqual({
        type: "blocked",
        error: "prerunArgs() threw: not ready",
        issues: [error("not ready")],
        draft: undefined,
      });
    });
  });

  describe("a block without prerun args", () => {
    test("runs prerun on ready args, leaving their warnings to the args", () => {
      const result = derivePrerunArgsFromStorage(filled, {
        args: channel(numbersOf, () => [warning("Only one number")]),
        prerun: undefined,
      });

      expect(result).toEqual({ type: "ready", value: { numbers: [1] }, issues: [] });
    });

    test("skips prerun while args validation finds errors", () => {
      const result = derivePrerunArgsFromStorage(empty, {
        args: channel(numbersOf, requireNumbers),
        prerun: undefined,
      });

      expect(result).toEqual({ type: "notReady", value: undefined });
    });

    test("skips prerun when the args function throws", () => {
      const result = derivePrerunArgsFromStorage(filled, {
        args: channel(() => {
          throw new Error("broken");
        }, undefined),
        prerun: undefined,
      });

      expect(result).toEqual({ type: "notReady", value: undefined });
    });

    test("skips prerun when args are derived as undefined", () => {
      const result = derivePrerunArgsFromStorage(filled, {
        args: channel(() => undefined, undefined),
        prerun: undefined,
      });

      expect(result).toEqual({ type: "notReady", value: undefined });
    });
  });
});

describe("BlockModelV3 args validation", () => {
  const base = () => BlockModelV3.create({ dataModel, kind }).templateParams(() => ({}));

  test("argsValidation() before args() throws", () => {
    expect(() => base().argsValidation(() => [])).toThrow(/must follow args\(\)/);
  });

  test("prerunArgsValidation() before prerunArgs() throws", () => {
    expect(() =>
      base()
        .args(numbersOf)
        .prerunArgsValidation(() => []),
    ).toThrow(/must follow prerunArgs\(\)/);
  });

  test("validation callbacks receive the types of the args they check", () => {
    const model = base()
      .args((data) => ({ numbers: data.numbers }))
      .prerunArgs((data) => (data.label === "" ? undefined : { label: data.label }));

    expectTypeOf(model.argsValidation)
      .parameter(0)
      .toEqualTypeOf<
        (input: { args: { numbers: number[] }; data: BlockData }) => readonly ArgsIssue[]
      >();
    expectTypeOf(model.prerunArgsValidation)
      .parameter(0)
      .toEqualTypeOf<
        (input: { prerunArgs: { label: string }; data: BlockData }) => readonly ArgsIssue[]
      >();
  });

  test("done() hands both validations to the derive callbacks", () => {
    const registry = installRenderCtx();
    base()
      .args(numbersOf)
      .argsValidation(requireNumbers)
      .prerunArgs((data) => ({ label: data.label }))
      .prerunArgsValidation(({ prerunArgs }) =>
        prerunArgs.label === "" ? [error("Label is required")] : [],
      )
      .done();

    const storage = storageOf({ numbers: [], label: "" });
    expect(registry[BlockStorageFacadeCallbacks.ArgsDerive](storage)).toMatchObject({
      type: "blocked",
      issues: [error("Numbers are required")],
    });
    expect(registry[BlockStorageFacadeCallbacks.PrerunArgsDerive](storage)).toMatchObject({
      type: "blocked",
      issues: [error("Label is required")],
    });
  });

  test("args() set again drops the validation of the args it replaces", () => {
    const registry = installRenderCtx();
    base()
      .args(numbersOf)
      .argsValidation(() => [error("stale")])
      .args(numbersOf)
      .done();

    expect(
      registry[BlockStorageFacadeCallbacks.ArgsDerive](storageOf({ numbers: [], label: "" })),
    ).toMatchObject({ type: "ready", issues: [] });
  });

  test("prerunArgs() set again drops the validation of the prerun args it replaces", () => {
    const registry = installRenderCtx();
    base()
      .args(numbersOf)
      .prerunArgs(numbersOf)
      .prerunArgsValidation(() => [error("stale")])
      .prerunArgs(numbersOf)
      .done();

    expect(
      registry[BlockStorageFacadeCallbacks.PrerunArgsDerive](storageOf({ numbers: [], label: "" })),
    ).toMatchObject({ type: "ready", issues: [] });
  });

  test("the block UI computes the issues of both channels", () => {
    const info = blockModelInfoOf(
      base()
        .args(numbersOf)
        .argsValidation((input) => [warning("Check numbers"), ...requireNumbers(input)])
        .prerunArgs((data) => ({ label: data.label }))
        .prerunArgsValidation(() => [warning("Prerun warning")]),
    );

    const data: BlockData = { numbers: [], label: "" };
    expect(info.argsIssues?.(data)).toEqual([
      warning("Check numbers"),
      error("Numbers are required"),
    ]);
    expect(info.prerunArgsIssues?.(data)).toEqual([warning("Prerun warning")]);
  });

  test("the block UI reports a throwing args function as one error", () => {
    const info = blockModelInfoOf(
      base().args(() => {
        throw new Error("Numbers required");
      }),
    );

    expect(info.argsIssues?.({ numbers: [], label: "" })).toEqual([error("Numbers required")]);
  });

  test("the block UI reports no prerun issues for a block without prerun args", () => {
    const info = blockModelInfoOf(base().args(numbersOf).argsValidation(requireNumbers));

    expect(info.prerunArgsIssues?.({ numbers: [], label: "" })).toEqual([]);
  });
});

function parseData(data: unknown): BlockData {
  return data as BlockData;
}

/** Installs a model render context and returns the callbacks the model registers in it. */
function installRenderCtx(): Record<string, (...args: unknown[]) => unknown> {
  const callbackRegistry: Record<string, (...args: unknown[]) => unknown> = {};
  Object.assign(globalThis, { cfgRenderCtx: { callbackRegistry } });
  return callbackRegistry;
}

/** What `done()` hands the block UI, read the way it runs inside a UI. */
function blockModelInfoOf(model: { done: () => unknown }): BlockModelInfo {
  Object.assign(globalThis, { platforma: {} });
  const done = model.done();
  if (typeof done !== "object" || done === null || !("blockModelInfo" in done)) {
    throw new Error("done() returned no block model info");
  }
  return done.blockModelInfo as BlockModelInfo;
}
