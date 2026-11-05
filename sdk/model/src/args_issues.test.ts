import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  checkBlockFlag,
  stringifyJson,
  type BlockConfigContainer,
  type ArgsIssue,
} from "@milaboratories/pl-model-common";
import { defineBlockKind } from "@platforma-sdk/block-kind";
import { createBlockStorage } from "./block_storage";
import { deriveArgsFromStorage, derivePrerunArgsFromStorage } from "./block_storage_callbacks";
import { BlockStorageFacadeCallbacks } from "./block_storage_facade";
import { BlockModelV3 } from "./block_model";
import { DataModelBuilder } from "./block_migrations";
import { extractConfig } from "./bconfig/normalization";

type BlockData = { dataset?: string; threshold: number };

const kind = defineBlockKind<{}>({
  name: "@platforma-open/milaboratories.args-issues-demo.kind",
  version: "1.0.0",
  parseInitializationParams: () => ({}),
});

const dataModel = new DataModelBuilder({ kind })
  .from<BlockData>("v1")
  .init(() => ({ threshold: 0 }));

const storageOf = (data: BlockData) => stringifyJson(createBlockStorage(data));

const configured = storageOf({ dataset: "ds-1", threshold: 0.1 });
const unconfigured = storageOf({ threshold: 0.9 });

const argsOf = (data: unknown) => data;

const selectDataset: ArgsIssue = { severity: "error", message: "Select a dataset" };
const highThreshold: ArgsIssue = { severity: "warning", message: "Threshold is high" };

function checkData(input: { args: unknown; data: unknown }): ArgsIssue[] {
  return issuesOf(input.data);
}

function checkPrerunData(input: { prerunArgs: unknown; data: unknown }): ArgsIssue[] {
  return issuesOf(input.data);
}

describe("deriveArgsFromStorage", () => {
  test("without argsIssues, args are runnable and carry no issues", () => {
    expect(
      deriveArgsFromStorage(unconfigured, { deriveArgs: argsOf, argsIssues: undefined }),
    ).toEqual({ value: { threshold: 0.9 }, issues: [] });
  });

  test("warnings only leave the args runnable", () => {
    const storage = storageOf({ dataset: "ds-1", threshold: 0.9 });
    expect(deriveArgsFromStorage(storage, { deriveArgs: argsOf, argsIssues: checkData })).toEqual({
      value: { dataset: "ds-1", threshold: 0.9 },
      issues: [highThreshold],
    });
  });

  test("nothing found leaves the args runnable with no issues", () => {
    expect(
      deriveArgsFromStorage(configured, { deriveArgs: argsOf, argsIssues: checkData }),
    ).toEqual({ value: { dataset: "ds-1", threshold: 0.1 }, issues: [] });
  });

  test("errors keep the args but put them under `args`, beside an `error`", () => {
    // A middle layer that reads only `error` and `value` sees an error and no value, which is
    // what it has always taken to mean "no args, cannot run".
    const selectReference: ArgsIssue = { severity: "error", message: "Select a reference" };
    const result = deriveArgsFromStorage(unconfigured, {
      deriveArgs: argsOf,
      argsIssues: () => [selectDataset, highThreshold, selectReference],
    });
    expect(result).toEqual({
      error: "Select a dataset; Select a reference",
      args: { threshold: 0.9 },
      issues: [selectDataset, highThreshold, selectReference],
    });
    expect("value" in result).toBe(false);
  });

  test("a throw in args() means no args at all, and argsIssues is not called", () => {
    let checked = false;
    const result = deriveArgsFromStorage(configured, {
      deriveArgs: () => {
        throw new Error("Numbers required");
      },
      argsIssues: () => {
        checked = true;
        return [];
      },
    });
    expect(result).toEqual({ error: "args() threw: Numbers required" });
    expect(checked).toBe(false);
  });

  test("a throw in argsIssues is one error with the thrown message", () => {
    expect(
      deriveArgsFromStorage(configured, {
        deriveArgs: argsOf,
        argsIssues: () => {
          throw new Error("lookup failed");
        },
      }),
    ).toEqual({
      error: "lookup failed",
      args: { dataset: "ds-1", threshold: 0.1 },
      issues: [{ severity: "error", message: "lookup failed" }],
    });
  });

  test("argsIssues gets the derived args and the data they came from", () => {
    let seen: unknown;
    deriveArgsFromStorage(configured, {
      deriveArgs: () => ({ derived: true }),
      argsIssues: (input) => {
        seen = input;
        return [];
      },
    });
    expect(seen).toEqual({ args: { derived: true }, data: { dataset: "ds-1", threshold: 0.1 } });
  });
});

describe("derivePrerunArgsFromStorage", () => {
  test("without argsIssues, falls back to args as before", () => {
    expect(
      derivePrerunArgsFromStorage(unconfigured, {
        deriveArgs: argsOf,
        argsIssues: undefined,
        ownPrerunArgs: undefined,
      }),
    ).toEqual({ value: { threshold: 0.9 }, issues: [] });
  });

  test("falls back to args when argsIssues finds only warnings", () => {
    const storage = storageOf({ dataset: "ds-1", threshold: 0.9 });
    expect(
      derivePrerunArgsFromStorage(storage, {
        deriveArgs: argsOf,
        argsIssues: checkData,
        ownPrerunArgs: undefined,
      }),
    ).toEqual({ value: { dataset: "ds-1", threshold: 0.9 }, issues: [highThreshold] });
  });

  test("does not fall back to args argsIssues finds errors in", () => {
    expect(
      derivePrerunArgsFromStorage(unconfigured, {
        deriveArgs: argsOf,
        argsIssues: checkData,
        ownPrerunArgs: undefined,
      }),
    ).toEqual({
      error: "argsIssues() found errors (fallback): Select a dataset",
      issues: [selectDataset, highThreshold],
    });
  });

  test("a throw in args() on the fallback is an error as before", () => {
    expect(
      derivePrerunArgsFromStorage(configured, {
        deriveArgs: () => {
          throw new Error("Numbers required");
        },
        argsIssues: checkData,
        ownPrerunArgs: undefined,
      }),
    ).toEqual({ error: "args() threw (fallback): Numbers required" });
  });

  test("a block's own prerunArgs is not subject to argsIssues", () => {
    let checked = false;
    expect(
      derivePrerunArgsFromStorage(unconfigured, {
        deriveArgs: argsOf,
        argsIssues: () => {
          checked = true;
          return [selectDataset];
        },
        ownPrerunArgs: {
          derivePrerunArgs: (data) => ({ staged: data }),
          prerunArgsIssues: undefined,
        },
      }),
    ).toEqual({ value: { staged: { threshold: 0.9 } }, issues: [] });
    expect(checked).toBe(false);
  });

  test("warnings of prerunArgsIssues leave the block staged", () => {
    const storage = storageOf({ dataset: "ds-1", threshold: 0.9 });
    expect(
      derivePrerunArgsFromStorage(storage, {
        deriveArgs: argsOf,
        argsIssues: undefined,
        ownPrerunArgs: { derivePrerunArgs: argsOf, prerunArgsIssues: checkPrerunData },
      }),
    ).toEqual({ value: { dataset: "ds-1", threshold: 0.9 }, issues: [highThreshold] });
  });

  test("errors of prerunArgsIssues skip staging, and an error-only reader sees no value", () => {
    const result = derivePrerunArgsFromStorage(unconfigured, {
      deriveArgs: argsOf,
      argsIssues: undefined,
      ownPrerunArgs: { derivePrerunArgs: argsOf, prerunArgsIssues: checkPrerunData },
    });
    expect(result).toEqual({
      error: "Select a dataset",
      issues: [selectDataset, highThreshold],
    });
    expect("value" in result).toBe(false);
  });

  test("a throw in prerunArgsIssues is one error with the thrown message", () => {
    expect(
      derivePrerunArgsFromStorage(configured, {
        deriveArgs: argsOf,
        argsIssues: undefined,
        ownPrerunArgs: {
          derivePrerunArgs: argsOf,
          prerunArgsIssues: () => {
            throw new Error("lookup failed");
          },
        },
      }),
    ).toEqual({
      error: "lookup failed",
      issues: [{ severity: "error", message: "lookup failed" }],
    });
  });

  test("a throw in prerunArgs() is an error as before, and prerunArgsIssues is not called", () => {
    let checked = false;
    expect(
      derivePrerunArgsFromStorage(configured, {
        deriveArgs: argsOf,
        argsIssues: undefined,
        ownPrerunArgs: {
          derivePrerunArgs: () => {
            throw new Error("not ready");
          },
          prerunArgsIssues: () => {
            checked = true;
            return [];
          },
        },
      }),
    ).toEqual({ error: "prerunArgs() threw: not ready" });
    expect(checked).toBe(false);
  });

  test("prerunArgs() returning undefined skips staging without calling prerunArgsIssues", () => {
    let checked = false;
    expect(
      derivePrerunArgsFromStorage(configured, {
        deriveArgs: argsOf,
        argsIssues: undefined,
        ownPrerunArgs: {
          derivePrerunArgs: () => undefined,
          prerunArgsIssues: () => {
            checked = true;
            return [selectDataset];
          },
        },
      }),
    ).toEqual({ value: undefined, issues: [] });
    expect(checked).toBe(false);
  });

  test("prerunArgsIssues gets the derived prerun args and the data they came from", () => {
    let seen: unknown;
    derivePrerunArgsFromStorage(configured, {
      deriveArgs: argsOf,
      argsIssues: undefined,
      ownPrerunArgs: {
        derivePrerunArgs: () => ({ staged: true }),
        prerunArgsIssues: (input) => {
          seen = input;
          return [];
        },
      },
    });
    expect(seen).toEqual({
      prerunArgs: { staged: true },
      data: { dataset: "ds-1", threshold: 0.1 },
    });
  });
});

describe("BlockModelV3.argsIssues and prerunArgsIssues", () => {
  let callbackRegistry: Record<string, (storageJson: string) => unknown>;

  beforeEach(() => {
    callbackRegistry = {};
    Object.assign(globalThis, { cfgRenderCtx: { callbackRegistry } });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "cfgRenderCtx");
  });

  function callback(name: string): (storageJson: string) => unknown {
    const registered = callbackRegistry[name];
    if (registered === undefined) throw new Error(`Callback ${name} is not registered`);
    return registered;
  }

  const deriveArgs = (storageJson: string) =>
    callback(BlockStorageFacadeCallbacks.ArgsDerive)(storageJson);
  const derivePrerunArgs = (storageJson: string) =>
    callback(BlockStorageFacadeCallbacks.PrerunArgsDerive)(storageJson);

  const base = () => BlockModelV3.create({ dataModel, kind }).templateParams(() => ({}));

  test("a block without argsIssues derives exactly as before", () => {
    base()
      .args((data) => {
        if (data.dataset === undefined) throw new Error("Select a dataset");
        return { dataset: data.dataset };
      })
      .done();

    expect(deriveArgs(configured)).toEqual({ value: { dataset: "ds-1" }, issues: [] });
    expect(deriveArgs(unconfigured)).toEqual({ error: "args() threw: Select a dataset" });
    expect(derivePrerunArgs(configured)).toEqual({ value: { dataset: "ds-1" }, issues: [] });
    expect(derivePrerunArgs(unconfigured)).toEqual({
      error: "args() threw (fallback): Select a dataset",
    });
  });

  test("argsIssues gets the typed args and data", () => {
    base()
      .args((data) => ({ dataset: data.dataset }))
      .argsIssues(({ args, data }) => {
        const issues: ArgsIssue[] = [];
        if (args.dataset === undefined) issues.push(selectDataset);
        if (data.threshold > 0.5) issues.push(highThreshold);
        return issues;
      })
      .done();

    expect(deriveArgs(configured)).toEqual({ value: { dataset: "ds-1" }, issues: [] });
    expect(deriveArgs(unconfigured)).toEqual({
      error: "Select a dataset",
      args: {},
      issues: [selectDataset, highThreshold],
    });
    expect(derivePrerunArgs(unconfigured)).toEqual({
      error: "argsIssues() found errors (fallback): Select a dataset",
      issues: [selectDataset, highThreshold],
    });
  });

  test("an issue list the block's types cannot vouch for is parsed, unknown severity as error", () => {
    base()
      .args((data) => ({ dataset: data.dataset }))
      .argsIssues(() => JSON.parse('[{ "severity": "fatal", "message": "Broken input" }]'))
      .done();

    expect(deriveArgs(configured)).toEqual({
      error: "Broken input",
      args: { dataset: "ds-1" },
      issues: [{ severity: "error", message: "Broken input" }],
    });
  });

  test("argsIssues before args() throws", () => {
    expect(() => base().argsIssues(() => [])).toThrow(/must be set after args\(\)/);
  });

  test("setting args() again drops argsIssues", () => {
    base()
      .args((data) => ({ dataset: data.dataset }))
      .argsIssues(() => [selectDataset])
      .args((data) => ({ threshold: data.threshold }))
      .done();

    expect(deriveArgs(unconfigured)).toEqual({ value: { threshold: 0.9 }, issues: [] });
    expect(derivePrerunArgs(unconfigured)).toEqual({ value: { threshold: 0.9 }, issues: [] });
  });

  test("a block with its own prerunArgs and no prerunArgsIssues keeps staging while argsIssues fails", () => {
    base()
      .args((data) => ({ dataset: data.dataset }))
      .argsIssues(() => [selectDataset])
      .prerunArgs((data) => ({ threshold: data.threshold }))
      .done();

    expect(deriveArgs(unconfigured)).toEqual({
      error: "Select a dataset",
      args: {},
      issues: [selectDataset],
    });
    expect(derivePrerunArgs(unconfigured)).toEqual({ value: { threshold: 0.9 }, issues: [] });
  });

  test("prerunArgsIssues gets the typed prerun args and data", () => {
    base()
      .args((data) => ({ dataset: data.dataset }))
      .prerunArgs((data) => ({ dataset: data.dataset, threshold: data.threshold }))
      .prerunArgsIssues(({ prerunArgs, data }) => {
        const issues: ArgsIssue[] = [];
        if (prerunArgs.dataset === undefined) issues.push(selectDataset);
        if (data.threshold > 0.5) issues.push(highThreshold);
        return issues;
      })
      .done();

    expect(derivePrerunArgs(configured)).toEqual({
      value: { dataset: "ds-1", threshold: 0.1 },
      issues: [],
    });
    expect(derivePrerunArgs(storageOf({ dataset: "ds-1", threshold: 0.9 }))).toEqual({
      value: { dataset: "ds-1", threshold: 0.9 },
      issues: [highThreshold],
    });
    expect(derivePrerunArgs(unconfigured)).toEqual({
      error: "Select a dataset",
      issues: [selectDataset, highThreshold],
    });
    // prerunArgsIssues decides staging only; whether the block may run stays with argsIssues.
    expect(deriveArgs(unconfigured)).toEqual({ value: {}, issues: [] });
  });

  test("a throw in prerunArgsIssues skips staging with the thrown message", () => {
    base()
      .args((data) => ({ dataset: data.dataset }))
      .prerunArgs((data) => ({ dataset: data.dataset }))
      .prerunArgsIssues(() => {
        throw new Error("lookup failed");
      })
      .done();

    expect(derivePrerunArgs(configured)).toEqual({
      error: "lookup failed",
      issues: [{ severity: "error", message: "lookup failed" }],
    });
  });

  test("a prerunArgsIssues result that is not a list of issues skips staging with the parser message", () => {
    base()
      .args((data) => ({ dataset: data.dataset }))
      .prerunArgs((data) => ({ dataset: data.dataset }))
      .prerunArgsIssues(() => JSON.parse('{ "severity": "error" }'))
      .done();

    expect(derivePrerunArgs(configured)).toEqual({
      error: "Args issues must be an array, got object",
      issues: [{ severity: "error", message: "Args issues must be an array, got object" }],
    });
  });

  test("prerunArgsIssues without prerunArgs() throws, even after args()", () => {
    expect(() => base().prerunArgsIssues(() => [])).toThrow(/must be set after prerunArgs\(\)/);
    expect(() =>
      base()
        .args((data) => ({ dataset: data.dataset }))
        .prerunArgsIssues(() => []),
    ).toThrow(/must be set after prerunArgs\(\)/);
  });

  test("setting prerunArgs() again drops prerunArgsIssues", () => {
    base()
      .args((data) => ({ dataset: data.dataset }))
      .prerunArgs((data) => ({ dataset: data.dataset }))
      .prerunArgsIssues(() => [selectDataset])
      .prerunArgs((data) => ({ threshold: data.threshold }))
      .done();

    expect(derivePrerunArgs(unconfigured)).toEqual({ value: { threshold: 0.9 }, issues: [] });
  });

  test("setting args() again keeps prerunArgsIssues", () => {
    base()
      .args((data) => ({ dataset: data.dataset }))
      .prerunArgs((data) => ({ dataset: data.dataset }))
      .prerunArgsIssues(() => [selectDataset])
      .args((data) => ({ threshold: data.threshold }))
      .done();

    expect(derivePrerunArgs(configured)).toEqual({
      error: "Select a dataset",
      issues: [selectDataset],
    });
  });
});

describe("BlockModelV3 requiresArgsIssues feature flag", () => {
  beforeEach(() => {
    Object.assign(globalThis, { cfgRenderCtx: { callbackRegistry: {} } });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "cfgRenderCtx");
  });

  const base = () =>
    BlockModelV3.create({ dataModel, kind })
      .templateParams(() => ({}))
      .args((data) => ({ dataset: data.dataset }));

  test("a block without argsIssues still requires an app that gates Run with them", () => {
    expect(requiresArgsIssues(base().done())).toBe(true);
  });
});

// Internals

/**
 * Whether the config `done()` returns outside a UI, the config container the block build writes,
 * sets the `requiresArgsIssues` feature flag.
 */
function requiresArgsIssues(model: unknown): boolean {
  if (typeof model !== "object" || model === null || !("config" in model)) {
    throw new Error("done() returned no block config");
  }
  const { featureFlags } = extractConfig(model.config as BlockConfigContainer);
  return checkBlockFlag(featureFlags, "requiresArgsIssues");
}

function issuesOf(data: unknown): ArgsIssue[] {
  if (!isBlockData(data)) throw new Error("not block data");
  const issues: ArgsIssue[] = [];
  if (data.dataset === undefined) issues.push(selectDataset);
  if (data.threshold > 0.5) issues.push(highThreshold);
  return issues;
}

function isBlockData(value: unknown): value is BlockData {
  return typeof value === "object" && value !== null && "threshold" in value;
}
