/*
  Backend-free harness for a block's model. A block's model registers its facade callbacks
  (args, prerun args, template params, initial storage, params validation) and its render
  lambdas into `globalThis.cfgRenderCtx.callbackRegistry` when its module loads; without that
  global it registers nothing. The harness installs a registry, loads the model through the
  importer it is given, and calls the callbacks the way the middle layer does: found through
  the block config, fed JSON, and read back through JSON, as values cross the VM boundary.

  Lambdas that read the block's tree, the result pool, blobs or PFrames need a rendered
  project; those calls throw here and belong in `blockTest` or `suiteTest`.
*/

import type {
  BlockConfigContainer,
  BlockConfigV4,
  BlockStorage,
  BlockStorageFacade,
  StringifiedJson,
} from "@platforma-sdk/model";
import {
  BlockStorageFacadeCallbacks,
  createBlockStorage,
  extractConfig,
  getStorageData,
  isConfigLambda,
  normalizeBlockStorage,
} from "@platforma-sdk/model";
import type { GlobalCfgRenderCtx } from "@platforma-sdk/model/render/internal";

/**
 * The members of the render context the harness provides, typed by the model's own
 * definition so a change to them fails this package's type check. `args` is checked by name
 * only: the middle layer returns undefined when a block has no args, wider than its
 * declared type.
 */
type RenderCtxFake = Pick<
  GlobalCfgRenderCtx,
  "data" | "activeArgs" | "blockStorage" | "callbackRegistry"
> & { [K in Extract<keyof GlobalCfgRenderCtx, "args">]: () => string | undefined };

type Registry = GlobalCfgRenderCtx["callbackRegistry"];
type FacadeName = keyof BlockStorageFacade;

/**
 * What a render lambda may read of the block's state without a project: the block data, or
 * the whole block storage (plugin data included; `initialStorage()` gives a fresh one).
 * Plugin outputs read their data from the storage.
 */
export type ModelRenderState<Data = unknown, Args = unknown> = {
  args?: Args;
  activeArgs?: Args;
} & ({ data?: Data; storage?: never } | { storage: BlockStorage<Data>; data?: never });

const TOP_LEVEL_LAMBDAS = ["sections", "title", "subtitle", "tags", "enrichmentTargets"] as const;

/**
 * A value as the middle layer receives it from the VM: primitives as they are, anything else
 * through `JSON.stringify` and `JSON.parse` (so `undefined` keys drop, `NaN` in an object
 * becomes `null`, a `Date` becomes a string).
 */
function fromVm<T>(v: T): T {
  if (v === undefined || typeof v === "boolean" || typeof v === "number" || typeof v === "string")
    return v;
  const text = JSON.stringify(v);
  return text === undefined ? (undefined as T) : (JSON.parse(text) as T);
}

/** A value as JSON, in the branded form the facade callbacks take. */
const toJson = (v: unknown) => JSON.stringify(v) as StringifiedJson;

/** A derive callback's value as the caller's type; the model's error throws. */
function derived<T>(
  what: string,
  result: { error: string } | { error?: undefined; value: unknown },
) {
  const r = fromVm(result);
  if (r.error !== undefined) throw new Error(`${what}: ${r.error}`);
  return r.value as T;
}

/** The V4 config of an imported model module; throws for anything else. */
function modelConfig(module: { platforma: unknown }): BlockConfigV4 {
  const container = (module.platforma as { config?: BlockConfigContainer } | undefined)?.config;
  if (container === undefined)
    throw new Error("The imported module's `platforma` carries no config; is it a block model?");
  const config = extractConfig(container);
  if (config.configVersion !== 4)
    throw new Error(`The model has config version ${config.configVersion}; the harness needs V3`);
  return config;
}

const storageJson = (data: unknown) => toJson(createBlockStorage(data));

const renderGlobal = globalThis as { cfgRenderCtx?: unknown };

export class BlockModelHarness<Data = unknown, Args = unknown, Params = unknown> {
  private constructor(
    private readonly registry: Registry,
    private readonly config: BlockConfigV4,
    private readonly stateRef: { current: ModelRenderState<Data, Args> },
  ) {}

  /**
   * Install a registry and load the model, once per test file; `unload()` in `afterAll`
   * frees the global for another model in the same worker. Load the model only through the
   * harness: a module that was imported earlier in the same worker registered nothing.
   */
  static async load<Data = unknown, Args = unknown, Params = unknown>(
    importer: () => Promise<{ platforma: unknown }>,
  ): Promise<BlockModelHarness<Data, Args, Params>> {
    if (renderGlobal.cfgRenderCtx !== undefined)
      throw new Error("A cfgRenderCtx is already installed; unload the previous harness first");
    const registry: Registry = {};
    const stateRef: { current: ModelRenderState<Data, Args> } = { current: {} };
    const json = (v: unknown) => (v === undefined ? undefined : JSON.stringify(v));
    const state = () => stateRef.current;
    const target = {
      callbackRegistry: registry,
      args: () => json(state().args),
      activeArgs: () => json(state().activeArgs),
      // As the middle layer: absent data reads as "{}".
      data: () => {
        const { data, storage } = state();
        return json(storage === undefined ? data : getStorageData<Data>(storage)) ?? "{}";
      },
      blockStorage: () => {
        const { data, storage } = state();
        return storage === undefined ? storageJson(data) : toJson(storage);
      },
    } satisfies RenderCtxFake;
    renderGlobal.cfgRenderCtx = new Proxy(target, {
      get(t, prop) {
        if (typeof prop === "string" && prop in t) return Reflect.get(t, prop);
        return () => {
          throw new Error(
            `cfgRenderCtx.${String(prop)} needs a rendered project; run this lambda under blockTest or suiteTest`,
          );
        };
      },
    });
    try {
      const config = modelConfig(await importer());
      if (Object.keys(registry).length === 0)
        throw new Error(
          "The model registered no callbacks: its module was already loaded in this worker. " +
            "Load it only through BlockModelHarness.load, or call vi.resetModules() first.",
        );
      return new BlockModelHarness<Data, Args, Params>(registry, config, stateRef);
    } catch (e) {
      delete renderGlobal.cfgRenderCtx;
      throw e;
    }
  }

  /** Remove the registry so another model can load in this worker. */
  unload(): void {
    delete renderGlobal.cfgRenderCtx;
  }

  /** A facade callback, found through the block config as the middle layer finds it. */
  private facade<K extends FacadeName>(name: K): BlockStorageFacade[K] {
    const lambda = this.config.blockLifecycleCallbacks[name];
    const cb: BlockStorageFacade[K] | undefined =
      lambda === undefined ? undefined : this.registry[lambda.handle];
    if (cb === undefined) throw new Error(`Model registered no callback ${name}`);
    return cb;
  }

  /** The workflow args the model derives from `data`; throws the model's own error. */
  args(data: Data): Args {
    return derived<Args>(
      "args",
      this.facade(BlockStorageFacadeCallbacks.ArgsDerive)(storageJson(data)),
    );
  }

  /** The staging args; the model's `prerunArgs` when declared, else its `args`. */
  prerunArgs(data: Data): unknown {
    return derived(
      "prerunArgs",
      this.facade(BlockStorageFacadeCallbacks.PrerunArgsDerive)(storageJson(data)),
    );
  }

  /** The kind params the model projects `data` back to for template export. */
  templateParams(data: Data): Params {
    return derived<Params>(
      "templateParams",
      this.facade(BlockStorageFacadeCallbacks.InitializationParamsDerive)(storageJson(data)),
    );
  }

  /** The storage a fresh block starts with, plugin data included. */
  initialStorage(): BlockStorage<Data> {
    const storage = fromVm(this.facade(BlockStorageFacadeCallbacks.StorageInitial)());
    return normalizeBlockStorage<Data>(JSON.parse(storage));
  }

  /** The data a fresh block starts with. */
  initialData(): Data {
    return getStorageData<Data>(this.initialStorage());
  }

  /**
   * The data a block starts with when a template supplies `params`; absent params are `{}`,
   * as the middle layer sends them.
   */
  dataFromParams(params: Params, blockIds: Record<string, string> = {}): Data {
    const result = fromVm(
      this.facade(BlockStorageFacadeCallbacks.StorageInitialFromParams)(
        toJson(params ?? {}),
        toJson(blockIds),
      ),
    );
    if (result.error !== undefined) throw new Error(`dataFromParams: ${result.error}`);
    return getStorageData<Data>(normalizeBlockStorage(JSON.parse(result.storageJson)));
  }

  /** Why the kind rejects `params`, or undefined when it accepts them. */
  validateParams(params: unknown): string | undefined {
    return fromVm(
      this.facade(BlockStorageFacadeCallbacks.InitializationParamsValidate)(toJson(params ?? {})),
    ).error;
  }

  /**
   * Run a render lambda by name (`sections`, `title`, `subtitle`, `tags`, or an output name)
   * over `state`. Only lambdas that read `ctx.data`, `ctx.args` or `ctx.activeArgs`
   * finish here; one that touches the tree or the pool throws naming the method it needed.
   */
  render<T = unknown>(name: string, state: ModelRenderState<Data, Args> = {}): T {
    const top = TOP_LEVEL_LAMBDAS.find((k) => k === name);
    const cfg =
      name in this.config.outputs
        ? this.config.outputs[name]
        : top === undefined
          ? undefined
          : this.config[top];
    const lambda = cfg !== undefined && isConfigLambda(cfg) ? this.registry[cfg.handle] : undefined;
    if (lambda === undefined) {
      const known = [
        ...Object.keys(this.config.outputs),
        ...TOP_LEVEL_LAMBDAS.filter((k) => this.config[k] !== undefined),
      ];
      throw new Error(`Model has no render lambda ${name}; known: ${known.join(", ")}`);
    }
    this.stateRef.current = state;
    return fromVm(lambda()) as T;
  }
}
