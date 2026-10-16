/*
  Backend-free harness for a block's model. A block's model registers its facade callbacks
  (args, prerun args, template params, initial storage, params validation) and its render
  lambdas into `globalThis.cfgRenderCtx.callbackRegistry` when its module loads; without that
  global it registers nothing. The harness installs a registry, loads the model through the
  importer it is given, and calls the callbacks the way the middle layer does, over JSON.

  Lambdas that read the block's tree, the result pool, blobs or PFrames need a rendered
  project; those calls throw here and belong in `blockTest` or `suiteTest`.
*/

import type { BlockConfigContainer } from "@platforma-sdk/model";
import {
  BlockStorageFacadeCallbacks,
  createBlockStorage,
  getStorageData,
  normalizeBlockStorage,
} from "@platforma-sdk/model";

type AnyFunction = (...args: any[]) => any;

/** What a render lambda may read of the block's state without a project. */
export type ModelRenderState<Data = unknown, Args = unknown> = {
  data?: Data;
  args?: Args;
  activeArgs?: Args;
};

type DeriveResult = { error: string } | { error?: undefined; value: unknown };

function unwrap<T>(what: string, result: DeriveResult): T {
  if (result.error !== undefined) throw new Error(`${what}: ${result.error}`);
  return result.value as T;
}

const storageJson = (data: unknown) => JSON.stringify(createBlockStorage(data));

export class BlockModelHarness<Data = unknown, Args = unknown, Params = unknown> {
  private constructor(
    readonly registry: Record<string, AnyFunction>,
    readonly config: BlockConfigContainer,
    private readonly stateRef: { current: ModelRenderState<Data, Args> },
  ) {}

  /**
   * Install a registry and load the model. Load the model only through the harness: a
   * module that was imported earlier in the same worker registered nothing.
   */
  static async load<Data = unknown, Args = unknown, Params = unknown>(
    importer: () => Promise<{ platforma: unknown }>,
  ): Promise<BlockModelHarness<Data, Args, Params>> {
    const g = globalThis as { cfgRenderCtx?: unknown };
    if (g.cfgRenderCtx !== undefined)
      throw new Error("A cfgRenderCtx is already installed; load one model per test file");
    const registry: Record<string, AnyFunction> = {};
    const stateRef: { current: ModelRenderState<Data, Args> } = { current: {} };
    const json = (v: unknown) => (v === undefined ? undefined : JSON.stringify(v));
    const target = {
      callbackRegistry: registry,
      args: () => json(stateRef.current.args),
      data: () => json(stateRef.current.data),
      activeArgs: () => json(stateRef.current.activeArgs),
      blockStorage: () => storageJson(stateRef.current.data),
    };
    g.cfgRenderCtx = new Proxy(target, {
      get(t, prop) {
        if (prop in t) return t[prop as keyof typeof t];
        return () => {
          throw new Error(
            `cfgRenderCtx.${String(prop)} needs a rendered project; run this lambda under blockTest or suiteTest`,
          );
        };
      },
    });
    try {
      const { platforma } = await importer();
      const config = (platforma as { config?: BlockConfigContainer }).config;
      if (config === undefined)
        throw new Error("The imported module's `platforma` carries no config; is it a V3 model?");
      if (Object.keys(registry).length === 0)
        throw new Error(
          "The model registered nothing: it was already loaded in this worker before the harness " +
            "installed its registry. Import the block only through the harness's importer; a " +
            "helper module that imports the block at its top level defeats it.",
        );
      return new BlockModelHarness<Data, Args, Params>(registry, config, stateRef);
    } catch (e) {
      delete g.cfgRenderCtx;
      throw e;
    }
  }

  /** Remove the registry so another model can load in this worker. */
  unload(): void {
    delete (globalThis as { cfgRenderCtx?: unknown }).cfgRenderCtx;
  }

  private callback(name: string): AnyFunction {
    const cb = this.registry[name];
    if (cb === undefined) throw new Error(`Model registered no callback ${name}`);
    return cb;
  }

  /** The workflow args the model derives from `data`; throws the model's own error. */
  args(data: Data): Args {
    return unwrap("args", this.callback(BlockStorageFacadeCallbacks.ArgsDerive)(storageJson(data)));
  }

  /** The staging args; the model's `prerunArgs` when declared, else its `args`. */
  prerunArgs(data: Data): unknown {
    return unwrap(
      "prerunArgs",
      this.callback(BlockStorageFacadeCallbacks.PrerunArgsDerive)(storageJson(data)),
    );
  }

  /** The kind params the model projects `data` back to for template export. */
  templateParams(data: Data): Params {
    return unwrap(
      "templateParams",
      this.callback(BlockStorageFacadeCallbacks.InitializationParamsDerive)(storageJson(data)),
    );
  }

  /** The data a fresh block starts with. */
  initialData(): Data {
    const storage = this.callback(BlockStorageFacadeCallbacks.StorageInitial)();
    return getStorageData<Data>(normalizeBlockStorage(JSON.parse(storage)));
  }

  /** The data a block starts with when a template supplies `params`. */
  dataFromParams(params: Params, blockIds: Record<string, string> = {}): Data {
    const result = this.callback(BlockStorageFacadeCallbacks.StorageInitialFromParams)(
      JSON.stringify(params),
      JSON.stringify(blockIds),
    ) as { error: string } | { error?: undefined; storageJson: string };
    if (result.error !== undefined) throw new Error(`dataFromParams: ${result.error}`);
    return getStorageData<Data>(normalizeBlockStorage(JSON.parse(result.storageJson)));
  }

  /** Why the kind rejects `params`, or undefined when it accepts them. */
  validateParams(params: unknown): string | undefined {
    const result = this.callback(BlockStorageFacadeCallbacks.InitializationParamsValidate)(
      JSON.stringify(params),
    ) as { error?: string };
    return result.error;
  }

  /**
   * Run a render lambda by name (`sections`, `title`, `subtitle`, `tags`, or an output name)
   * over `state`. Only lambdas that read `ctx.data`, `ctx.args` or `ctx.activeArgs`
   * finish here; one that touches the tree or the pool throws naming the method it needed.
   */
  render<T = unknown>(name: string, state: ModelRenderState<Data, Args> = {}): T {
    const lambda = this.registry[this.handleOf(name)];
    if (lambda === undefined) {
      const known = Object.keys(this.registry).filter((k) => !k.startsWith("__pl_"));
      throw new Error(`Model registered no lambda ${name}; known: ${known.join(", ")}`);
    }
    this.stateRef.current = state;
    return lambda() as T;
  }

  /** The registry key of an output or a top-level lambda (`sections`, `title`, ...). */
  private handleOf(name: string): string {
    const v4 = this.config.v4 as
      | { outputs?: Record<string, unknown>; [key: string]: unknown }
      | undefined;
    const handle = (x: unknown) =>
      typeof x === "object" && x !== null && (x as { __renderLambda?: boolean }).__renderLambda
        ? (x as { handle: string }).handle
        : undefined;
    return handle(v4?.outputs?.[name]) ?? handle(v4?.[name]) ?? name;
  }

  sections(state: ModelRenderState<Data, Args> = {}) {
    return this.render<unknown[]>("sections", state);
  }
}
