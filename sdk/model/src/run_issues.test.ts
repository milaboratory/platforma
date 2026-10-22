import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  checkBlockFlag,
  stringifyJson,
  type BlockConfigContainer,
  type RunIssue,
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
  name: "@platforma-open/milaboratories.run-issues-demo.kind",
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

const selectDataset: RunIssue = { severity: "error", message: "Select a dataset" };
const highThreshold: RunIssue = { severity: "warning", message: "Threshold is high" };

function checkData(input: { args: unknown; data: unknown }): RunIssue[] {
  return issuesOf(input.data);
}

function checkPrerunData(input: { prerunArgs: unknown; data: unknown }): RunIssue[] {
  return issuesOf(input.data);
}

describe("deriveArgsFromStorage", () => {
  test("without runIssues, args are runnable and carry no issues", () => {
    expect(
      deriveArgsFromStorage(unconfigured, { deriveArgs: argsOf, runIssues: undefined }),
    ).toEqual({ value: { threshold: 0.9 }, issues: [] });
  });

  test("warnings only leave the args runnable", () => {
    const storage = storageOf({ dataset: "ds-1", threshold: 0.9 });
    expect(deriveArgsFromStorage(storage, { deriveArgs: argsOf, runIssues: checkData })).toEqual({
      value: { dataset: "ds-1", threshold: 0.9 },
      issues: [highThreshold],
    });
  });

  test("nothing found leaves the args runnable with no issues", () => {
    expect(deriveArgsFromStorage(configured, { deriveArgs: argsOf, runIssues: checkData })).toEqual(
      { value: { dataset: "ds-1", threshold: 0.1 }, issues: [] },
    );
  });

  test("errors keep the args but put them under `args`, beside an `error`", () => {
    // A middle layer that reads only `error` and `value` sees an error and no value, which is
    // what it has always taken to mean "no args, cannot run".
    const selectReference: RunIssue = { severity: "error", message: "Select a reference" };
    const result = deriveArgsFromStorage(unconfigured, {
      deriveArgs: argsOf,
      runIssues: () => [selectDataset, highThreshold, selectReference],
    });
    expect(result).toEqual({
      error: "Select a dataset; Select a reference",
      args: { threshold: 0.9 },
      issues: [selectDataset, highThreshold, selectReference],
    });
    expect("value" in result).toBe(false);
  });

  test("a throw in args() means no args at all, and runIssues is not called", () => {
    let checked = false;
    const result = deriveArgsFromStorage(configured, {
      deriveArgs: () => {
        throw new Error("Numbers required");
      },
      runIssues: () => {
        checked = true;
        return [];
      },
    });
    expect(result).toEqual({ error: "args() threw: Numbers required" });
    expect(checked).toBe(false);
  });

  test("a throw in runIssues is one error with the thrown message", () => {
    expect(
      deriveArgsFromStorage(configured, {
        deriveArgs: argsOf,
        runIssues: () => {
          throw new Error("lookup failed");
        },
      }),
    ).toEqual({
      error: "lookup failed",
      args: { dataset: "ds-1", threshold: 0.1 },
      issues: [{ severity: "error", message: "lookup failed" }],
    });
  });

  test("runIssues gets the derived args and the data they came from", () => {
    let seen: unknown;
    deriveArgsFromStorage(configured, {
      deriveArgs: () => ({ derived: true }),
      runIssues: (input) => {
        seen = input;
        return [];
      },
    });
    expect(seen).toEqual({ args: { derived: true }, data: { dataset: "ds-1", threshold: 0.1 } });
  });
});

describe("derivePrerunArgsFromStorage", () => {
  test("without runIssues, falls back to args as before", () => {
    expect(
      derivePrerunArgsFromStorage(unconfigured, {
        deriveArgs: argsOf,
        runIssues: undefined,
        ownPrerunArgs: undefined,
      }),
    ).toEqual({ value: { threshold: 0.9 }, issues: [] });
  });

  test("falls back to args when runIssues finds only warnings", () => {
    const storage = storageOf({ dataset: "ds-1", threshold: 0.9 });
    expect(
      derivePrerunArgsFromStorage(storage, {
        deriveArgs: argsOf,
        runIssues: checkData,
        ownPrerunArgs: undefined,
      }),
    ).toEqual({ value: { dataset: "ds-1", threshold: 0.9 }, issues: [highThreshold] });
  });

  test("does not fall back to args runIssues finds errors in", () => {
    expect(
      derivePrerunArgsFromStorage(unconfigured, {
        deriveArgs: argsOf,
        runIssues: checkData,
        ownPrerunArgs: undefined,
      }),
    ).toEqual({
      error: "runIssues() found errors (fallback): Select a dataset",
      issues: [selectDataset, highThreshold],
    });
  });

  test("a throw in args() on the fallback is an error as before", () => {
    expect(
      derivePrerunArgsFromStorage(configured, {
        deriveArgs: () => {
          throw new Error("Numbers required");
        },
        runIssues: checkData,
        ownPrerunArgs: undefined,
      }),
    ).toEqual({ error: "args() threw (fallback): Numbers required" });
  });

  test("a block's own prerunArgs is not subject to runIssues", () => {
    let checked = false;
    expect(
      derivePrerunArgsFromStorage(unconfigured, {
        deriveArgs: argsOf,
        runIssues: () => {
          checked = true;
          return [selectDataset];
        },
        ownPrerunArgs: {
          derivePrerunArgs: (data) => ({ staged: data }),
          prerunIssues: undefined,
        },
      }),
    ).toEqual({ value: { staged: { threshold: 0.9 } }, issues: [] });
    expect(checked).toBe(false);
  });

  test("warnings of prerunIssues leave the block staged", () => {
    const storage = storageOf({ dataset: "ds-1", threshold: 0.9 });
    expect(
      derivePrerunArgsFromStorage(storage, {
        deriveArgs: argsOf,
        runIssues: undefined,
        ownPrerunArgs: { derivePrerunArgs: argsOf, prerunIssues: checkPrerunData },
      }),
    ).toEqual({ value: { dataset: "ds-1", threshold: 0.9 }, issues: [highThreshold] });
  });

  test("errors of prerunIssues skip staging, and an error-only reader sees no value", () => {
    const result = derivePrerunArgsFromStorage(unconfigured, {
      deriveArgs: argsOf,
      runIssues: undefined,
      ownPrerunArgs: { derivePrerunArgs: argsOf, prerunIssues: checkPrerunData },
    });
    expect(result).toEqual({
      error: "Select a dataset",
      issues: [selectDataset, highThreshold],
    });
    expect("value" in result).toBe(false);
  });

  test("a throw in prerunIssues is one error with the thrown message", () => {
    expect(
      derivePrerunArgsFromStorage(configured, {
        deriveArgs: argsOf,
        runIssues: undefined,
        ownPrerunArgs: {
          derivePrerunArgs: argsOf,
          prerunIssues: () => {
            throw new Error("lookup failed");
          },
        },
      }),
    ).toEqual({
      error: "lookup failed",
      issues: [{ severity: "error", message: "lookup failed" }],
    });
  });

  test("a throw in prerunArgs() is an error as before, and prerunIssues is not called", () => {
    let checked = false;
    expect(
      derivePrerunArgsFromStorage(configured, {
        deriveArgs: argsOf,
        runIssues: undefined,
        ownPrerunArgs: {
          derivePrerunArgs: () => {
            throw new Error("not ready");
          },
          prerunIssues: () => {
            checked = true;
            return [];
          },
        },
      }),
    ).toEqual({ error: "prerunArgs() threw: not ready" });
    expect(checked).toBe(false);
  });

  test("prerunArgs() returning undefined skips staging without calling prerunIssues", () => {
    let checked = false;
    expect(
      derivePrerunArgsFromStorage(configured, {
        deriveArgs: argsOf,
        runIssues: undefined,
        ownPrerunArgs: {
          derivePrerunArgs: () => undefined,
          prerunIssues: () => {
            checked = true;
            return [selectDataset];
          },
        },
      }),
    ).toEqual({ value: undefined, issues: [] });
    expect(checked).toBe(false);
  });

  test("prerunIssues gets the derived prerun args and the data they came from", () => {
    let seen: unknown;
    derivePrerunArgsFromStorage(configured, {
      deriveArgs: argsOf,
      runIssues: undefined,
      ownPrerunArgs: {
        derivePrerunArgs: () => ({ staged: true }),
        prerunIssues: (input) => {
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

describe("BlockModelV3.runIssues and prerunIssues", () => {
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

  test("a block without runIssues derives exactly as before", () => {
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

  test("runIssues gets the typed args and data", () => {
    base()
      .args((data) => ({ dataset: data.dataset }))
      .runIssues(({ args, data }) => {
        const issues: RunIssue[] = [];
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
      error: "runIssues() found errors (fallback): Select a dataset",
      issues: [selectDataset, highThreshold],
    });
  });

  test("an issue list the block's types cannot vouch for is parsed, unknown severity as error", () => {
    base()
      .args((data) => ({ dataset: data.dataset }))
      .runIssues(() => JSON.parse('[{ "severity": "fatal", "message": "Broken input" }]'))
      .done();

    expect(deriveArgs(configured)).toEqual({
      error: "Broken input",
      args: { dataset: "ds-1" },
      issues: [{ severity: "error", message: "Broken input" }],
    });
  });

  test("runIssues before args() throws", () => {
    expect(() => base().runIssues(() => [])).toThrow(/must be set after args\(\)/);
  });

  test("setting args() again drops runIssues", () => {
    base()
      .args((data) => ({ dataset: data.dataset }))
      .runIssues(() => [selectDataset])
      .args((data) => ({ threshold: data.threshold }))
      .done();

    expect(deriveArgs(unconfigured)).toEqual({ value: { threshold: 0.9 }, issues: [] });
    expect(derivePrerunArgs(unconfigured)).toEqual({ value: { threshold: 0.9 }, issues: [] });
  });

  test("a block with its own prerunArgs and no prerunIssues keeps staging while runIssues fails", () => {
    base()
      .args((data) => ({ dataset: data.dataset }))
      .runIssues(() => [selectDataset])
      .prerunArgs((data) => ({ threshold: data.threshold }))
      .done();

    expect(deriveArgs(unconfigured)).toEqual({
      error: "Select a dataset",
      args: {},
      issues: [selectDataset],
    });
    expect(derivePrerunArgs(unconfigured)).toEqual({ value: { threshold: 0.9 }, issues: [] });
  });

  test("prerunIssues gets the typed prerun args and data", () => {
    base()
      .args((data) => ({ dataset: data.dataset }))
      .prerunArgs((data) => ({ dataset: data.dataset, threshold: data.threshold }))
      .prerunIssues(({ prerunArgs, data }) => {
        const issues: RunIssue[] = [];
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
    // prerunIssues decides staging only; whether the block may run stays with runIssues.
    expect(deriveArgs(unconfigured)).toEqual({ value: {}, issues: [] });
  });

  test("a throw in prerunIssues skips staging with the thrown message", () => {
    base()
      .args((data) => ({ dataset: data.dataset }))
      .prerunArgs((data) => ({ dataset: data.dataset }))
      .prerunIssues(() => {
        throw new Error("lookup failed");
      })
      .done();

    expect(derivePrerunArgs(configured)).toEqual({
      error: "lookup failed",
      issues: [{ severity: "error", message: "lookup failed" }],
    });
  });

  test("a prerunIssues result that is not a list of issues skips staging with the parser message", () => {
    base()
      .args((data) => ({ dataset: data.dataset }))
      .prerunArgs((data) => ({ dataset: data.dataset }))
      .prerunIssues(() => JSON.parse('{ "severity": "error" }'))
      .done();

    expect(derivePrerunArgs(configured)).toEqual({
      error: "Run issues must be an array, got object",
      issues: [{ severity: "error", message: "Run issues must be an array, got object" }],
    });
  });

  test("prerunIssues without prerunArgs() throws, even after args()", () => {
    expect(() => base().prerunIssues(() => [])).toThrow(/must be set after prerunArgs\(\)/);
    expect(() =>
      base()
        .args((data) => ({ dataset: data.dataset }))
        .prerunIssues(() => []),
    ).toThrow(/must be set after prerunArgs\(\)/);
  });

  test("setting prerunArgs() again drops prerunIssues", () => {
    base()
      .args((data) => ({ dataset: data.dataset }))
      .prerunArgs((data) => ({ dataset: data.dataset }))
      .prerunIssues(() => [selectDataset])
      .prerunArgs((data) => ({ threshold: data.threshold }))
      .done();

    expect(derivePrerunArgs(unconfigured)).toEqual({ value: { threshold: 0.9 }, issues: [] });
  });

  test("setting args() again keeps prerunIssues", () => {
    base()
      .args((data) => ({ dataset: data.dataset }))
      .prerunArgs((data) => ({ dataset: data.dataset }))
      .prerunIssues(() => [selectDataset])
      .args((data) => ({ threshold: data.threshold }))
      .done();

    expect(derivePrerunArgs(configured)).toEqual({
      error: "Select a dataset",
      issues: [selectDataset],
    });
  });
});

describe("BlockModelV3 requiresRunIssues feature flag", () => {
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

  test("a block without runIssues still requires an app that gates Run with them", () => {
    expect(requiresRunIssues(base().done())).toBe(true);
  });
});

// Internals

/**
 * Whether the config `done()` returns outside a UI, the config container the block build writes,
 * sets the `requiresRunIssues` feature flag.
 */
function requiresRunIssues(model: unknown): boolean {
  if (typeof model !== "object" || model === null || !("config" in model)) {
    throw new Error("done() returned no block config");
  }
  const { featureFlags } = extractConfig(model.config as BlockConfigContainer);
  return checkBlockFlag(featureFlags, "requiresRunIssues");
}

function issuesOf(data: unknown): RunIssue[] {
  if (!isBlockData(data)) throw new Error("not block data");
  const issues: RunIssue[] = [];
  if (data.dataset === undefined) issues.push(selectDataset);
  if (data.threshold > 0.5) issues.push(highThreshold);
  return issues;
}

function isBlockData(value: unknown): value is BlockData {
  return typeof value === "object" && value !== null && "threshold" in value;
}
