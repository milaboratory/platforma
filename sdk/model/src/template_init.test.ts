import { describe, expect, test } from "vitest";
import type { PlRef } from "@milaboratories/pl-model-common";
import { createPlRef, stringifyJson } from "@milaboratories/pl-model-common";
import type { PluginHandle } from "./plugin_handle";
import type { PluginName } from "./block_storage";
import { BLOCK_STORAGE_KEY, createBlockStorage, isBlockStorage } from "./block_storage";
import {
  createInitialStorage,
  createInitialStorageFromParams,
  deriveTemplateParamsFromStorage,
} from "./block_storage_callbacks";
import { DataModelBuilder } from "./block_migrations";
import { defineBlockKind } from "@platforma-sdk/block-kind";

/**
 * The apply half of the template contract: params in, storage out.
 *
 * `template_params.test.ts` covers the export direction. These cover the inverse,
 * plus the one property that ties the two together — params that survive a round
 * trip through storage.
 */

type Params = { sources?: PlRef[]; label: string };

const kind = defineBlockKind<Params>({
  name: "@platforma-open/milaboratories.demo.kind",
  version: "1.0.0",
});

type BlockData = { sources: PlRef[]; label: string; scratch: number };

const dataModel = new DataModelBuilder({ kind }).from<BlockData>("v1").init(({ params }) => ({
  sources: params?.sources ?? [],
  label: params?.label ?? "",
  // Runtime state, not part of the params contract.
  scratch: 0,
}));

const upstream = "3f1c2b7a-0000-4000-8000-000000000001";

/** Hooks for a block with no plugins — the common case. */
const noPlugins = {
  getPluginRegistry: () => ({}),
  createPluginData: () => {
    throw new Error("no plugins registered");
  },
};

const fromParams = (params: unknown) =>
  createInitialStorageFromParams(JSON.stringify(params), {
    getBlockDataFromParams: (p) => dataModel.getDataFromParams(p),
    ...noPlugins,
  });

/** Storage the callback produced, parsed back. Fails the test if it errored. */
function storageOf(result: ReturnType<typeof fromParams>) {
  if (result.error !== undefined) throw new Error(`expected storage, got: ${result.error}`);
  return JSON.parse(result.storageJson) as Record<string, unknown>;
}

describe("createInitialStorageFromParams", () => {
  test("the block's init factory receives the entry's params", () => {
    const storage = storageOf(fromParams({ label: "run 1" }));

    expect(storage.__data).toEqual({ sources: [], label: "run 1", scratch: 0 });
  });

  test("references arrive as PlRefs and land in data untouched", () => {
    // The engine resolves template-local references before this point, so what the
    // factory sees is an ordinary live reference to a block that already exists.
    const ref = createPlRef(upstream, "reads");
    const storage = storageOf(fromParams({ label: "wired", sources: [ref] }));

    expect((storage.__data as BlockData).sources).toEqual([ref]);
  });

  test("the result is well-formed storage at the current data version", () => {
    const storage = storageOf(fromParams({ label: "x" }));

    expect(isBlockStorage(storage)).toBe(true);
    expect(storage[BLOCK_STORAGE_KEY]).toBeDefined();
    expect(storage.__dataVersion).toBe(dataModel.version);
  });

  test("a block created from params is shaped exactly like one created from defaults", () => {
    // Same envelope, only `__data` differs — which is what lets an applied block be
    // read, migrated and edited by every path that never heard of templates.
    const fromDefaults = JSON.parse(
      createInitialStorage({
        getDefaultBlockData: () => dataModel.getDefaultData(),
        getPluginRegistry: noPlugins.getPluginRegistry,
        createPluginData: noPlugins.createPluginData,
      }),
    ) as Record<string, unknown>;
    const applied = storageOf(fromParams({ label: "x" }));

    expect(Object.keys(applied).sort()).toEqual(Object.keys(fromDefaults).sort());
    expect({ ...applied, __data: null }).toEqual({ ...fromDefaults, __data: null });
  });

  test("empty params are used as-is, not treated as absent", () => {
    // An entry with `params: {}` says "initialize from nothing in particular";
    // the factory's own fallbacks fill in, and the applier never substitutes
    // defaults on the block's behalf.
    expect(storageOf(fromParams({})).__data).toEqual({ sources: [], label: "", scratch: 0 });
  });

  test("params that are not valid JSON are reported", () => {
    const result = createInitialStorageFromParams("{not json", {
      getBlockDataFromParams: (p) => dataModel.getDataFromParams(p),
      ...noPlugins,
    });

    expect(result.error).toMatch(/params are not valid JSON/);
  });

  test("a factory that rejects the params is reported, not propagated", () => {
    // The expected failure mode for a hand-written template file: params the block
    // cannot make sense of. It must come back as a problem the applier can attach
    // to an entry, not as a throw that aborts the whole apply.
    const result = createInitialStorageFromParams(JSON.stringify({ label: "" }), {
      getBlockDataFromParams: () => {
        throw new Error("label must not be empty");
      },
      ...noPlugins,
    });

    expect(result).toEqual({ error: "init() threw on the given params: label must not be empty" });
  });

  test("plugins are created at their defaults, never from params", () => {
    // Params belong to the block's kind; a plugin has no params channel, so it is
    // initialized the same way whether the block came from a template or the UI.
    const handle = "p1" as PluginHandle;
    const result = createInitialStorageFromParams(JSON.stringify({ label: "x" }), {
      getBlockDataFromParams: (p) => dataModel.getDataFromParams(p),
      getPluginRegistry: () => ({ [handle]: "demoPlugin" as PluginName }),
      createPluginData: (h) => {
        expect(h).toBe(handle);
        return { version: "v1", data: { items: [] } };
      },
    });

    expect(storageOf(result).__plugins).toEqual({
      [handle]: { __dataVersion: "v1", __data: { items: [] } },
    });
  });
});

describe("DataModel.getDataFromParams", () => {
  test("a factory that ignores params matches getDefaultData", () => {
    const paramless = new DataModelBuilder().from<{ n: number }>("v1").init(() => ({ n: 7 }));

    expect(paramless.getDataFromParams({ n: 99 })).toEqual(paramless.getDefaultData());
  });

  test("undefined params are what a factory sees from getDefaultData", () => {
    // The two entry points must not diverge on the "no params" case: an entry
    // without params goes through StorageInitial, and a factory written against
    // `params?.x ?? default` has to behave identically either way.
    expect(dataModel.getDataFromParams(undefined)).toEqual(dataModel.getDefaultData());
  });
});

describe("params round trip", () => {
  test("init then templateParams returns the params it started from", () => {
    // The closest thing to an export→import round trip available without the
    // engine: params → storage → params. References come back in template form,
    // since that is what the export side writes to the file.
    const params = { label: "run 1", sources: [createPlRef(upstream, "reads")] };

    const storageJson = stringifyJson(
      createBlockStorage(storageOf(fromParams(params)).__data as BlockData),
    );
    const derived = deriveTemplateParamsFromStorage(storageJson, (data) => {
      const d = data as BlockData;
      return { sources: d.sources, label: d.label };
    });

    expect(derived).toEqual({
      value: { label: "run 1", sources: [{ block: upstream, output: "reads" }] },
    });
  });
});
