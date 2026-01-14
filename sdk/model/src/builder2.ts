import type {
  BlockRenderingMode,
  BlockSection,
  OutputWithStatus,
  AnyFunction,
  PlRef,
  BlockCodeKnownFeatureFlags,
  BlockConfigContainer,
  MigrationDescriptor,
} from '@milaboratories/pl-model-common';
import type { Checked, ConfigResult, TypedConfig } from './config';
import { getImmediate } from './config';
import { getPlatformaInstance, isInUI, tryRegisterCallback, tryAppendCallback } from './internal';
import type { PlatformaV3 } from './platforma';
import type { InferRenderFunctionReturn, RenderFunction } from './render';
import { RenderCtx } from './render';
import { PlatformaSDKVersion } from './version';
// Import storage VM integration (side-effect: registers internal callbacks)
import './block_storage_vm';
import type {
  TypedConfigOrConfigLambda,
  ConfigRenderLambda,
  StdCtxArgsOnly,
  DeriveHref,
  ResolveCfgType,
  ExtractFunctionHandleReturn,
  ConfigRenderLambdaFlags,
} from './bconfig';
import {
  downgradeCfgOrLambda,
  isConfigLambda,
} from './bconfig';
import type { PlatformaExtended } from './builder';

type SectionsExpectedType = readonly BlockSection[];

type SectionsCfgChecked<Cfg extends TypedConfig, Args, State> = Checked<
  Cfg,
  ConfigResult<Cfg, StdCtxArgsOnly<Args, State>> extends SectionsExpectedType ? true : false
>;

// For the type tests
export type Expect<T extends true> = T;

export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;

/** Merges two object types into a single flat object type (B overwrites A) */
export type Merge<A, B> = {
  [K in keyof A | keyof B]: K extends keyof B ? B[K] : K extends keyof A ? A[K] : never;
};

type NoOb = Record<string, never>;

interface BlockModelV3Config<
  Args,
  OutputsCfg extends Record<string, TypedConfigOrConfigLambda>,
  State,
> {
  renderingMode: BlockRenderingMode;
  initialState: State;
  outputs: OutputsCfg;
  inputsValid: TypedConfigOrConfigLambda;
  sections: TypedConfigOrConfigLambda;
  title: ConfigRenderLambda | undefined;
  subtitle: ConfigRenderLambda | undefined;
  tags: ConfigRenderLambda | undefined;
  enrichmentTargets: ConfigRenderLambda | undefined;
  featureFlags: BlockCodeKnownFeatureFlags;
  args: ConfigRenderLambda<Args> | undefined;
  preRunArgs: ConfigRenderLambda<unknown> | undefined;
  migrations: MigrationDescriptor[];
}

/** Main entry point that each block should use in it's "config" module. Don't forget
 * to call {@link done()} at the end of configuration. Value returned by this builder must be
 * exported as constant with name "platforma" from the "config" module.
 * API version is 3 (for UI) and 2 (for model) */
export class BlockModelV3<
  Args,
  OutputsCfg extends Record<string, TypedConfigOrConfigLambda>,
  State,
  Href extends `/${string}` = '/',
> {
  private constructor(
    private readonly config: BlockModelV3Config<Args, OutputsCfg, State>,
  ) {}

  public static readonly INITIAL_BLOCK_FEATURE_FLAGS: BlockCodeKnownFeatureFlags = {
    supportsLazyState: true,
    requiresUIAPIVersion: 3,
    requiresModelAPIVersion: 2,
  };

  /** Initiates configuration builder */
  public static create(renderingMode: BlockRenderingMode): BlockModelV3<NoOb, {}, NoOb>;
  /** Initiates configuration builder */
  public static create(): BlockModelV3<NoOb, {}, NoOb>;

  public static create(renderingMode: BlockRenderingMode = 'Heavy'): BlockModelV3<NoOb, {}, NoOb> {
    return new BlockModelV3<NoOb, {}, NoOb>({
      renderingMode,
      initialState: {},
      outputs: {},
      inputsValid: getImmediate(true),
      sections: getImmediate([]),
      title: undefined,
      subtitle: undefined,
      tags: undefined,
      enrichmentTargets: undefined,
      featureFlags: { ...BlockModelV3.INITIAL_BLOCK_FEATURE_FLAGS },
      args: undefined,
      preRunArgs: undefined,
      migrations: [],
    });
  }

  /**
   * Add output cell to the configuration
   *
   * @param key output cell name, that can be later used to retrieve the rendered value
   * @param cfg configuration describing how to render cell value from the blocks
   *            workflow outputs
   * @deprecated use lambda-based API
   * */
  public output<const Key extends string, const Cfg extends TypedConfig>(
    key: Key,
    cfg: Cfg
  ): BlockModelV3<Args, OutputsCfg & { [K in Key]: Cfg }, State, Href>;
  /**
   * Add output cell wrapped with additional status information to the configuration
   *
   * @param key output cell name, that can be later used to retrieve the rendered value
   * @param rf  callback calculating output value using context, that allows to access
   *            workflows outputs and interact with platforma drivers
   * @param flags additional flags that may alter lambda rendering procedure
   * */
  public output<const Key extends string, const RF extends RenderFunction<Args, State>>(
    key: Key,
    rf: RF,
    flags: ConfigRenderLambdaFlags & { withStatus: true }
  ): BlockModelV3<
    Args,
      OutputsCfg & { [K in Key]: ConfigRenderLambda<InferRenderFunctionReturn<RF>> & { withStatus: true } },
      State,
      Href
  >;
  /**
   * Add output cell to the configuration
   *
   * @param key output cell name, that can be later used to retrieve the rendered value
   * @param rf  callback calculating output value using context, that allows to access
   *            workflows outputs and interact with platforma drivers
   * @param flags additional flags that may alter lambda rendering procedure
   * */
  public output<const Key extends string, const RF extends RenderFunction<Args, State>>(
    key: Key,
    rf: RF,
    flags?: ConfigRenderLambdaFlags
  ): BlockModelV3<
    Args,
    OutputsCfg & { [K in Key]: ConfigRenderLambda<InferRenderFunctionReturn<RF>> },
    State,
    Href
  >;
  public output(
    key: string,
    cfgOrRf: TypedConfig | AnyFunction,
    flags: ConfigRenderLambdaFlags = {},
  ): BlockModelV3<Args, OutputsCfg, State, Href> {
    if (typeof cfgOrRf === 'function') {
      const handle = `output#${key}`;
      tryRegisterCallback(handle, () => cfgOrRf(new RenderCtx()));
      return new BlockModelV3({
        ...this.config,
        outputs: {
          ...this.config.outputs,
          [key]: {
            __renderLambda: true,
            handle,
            ...flags,
          } satisfies ConfigRenderLambda,
        },
      });
    } else
      return new BlockModelV3({
        ...this.config,
        outputs: {
          ...this.config.outputs,
          [key]: cfgOrRf,
        },
      });
  }

  /** Shortcut for {@link output} with retentive flag set to true. */
  public retentiveOutput<const Key extends string, const RF extends RenderFunction<Args, State>>(
    key: Key,
    rf: RF,
  ): BlockModelV3<
      Args,
    OutputsCfg & { [K in Key]: ConfigRenderLambda<InferRenderFunctionReturn<RF>> },
    State,
    Href
    > {
    return this.output(key, rf, { retentive: true });
  }

  /** Shortcut for {@link output} with withStatus flag set to true. */
  public outputWithStatus<const Key extends string, const RF extends RenderFunction<Args, State>>(
    key: Key,
    rf: RF,
  ) {
    return this.output(key, rf, { withStatus: true });
  }

  /**
   * Sets a function to derive block args from state.
   * This is called during setState to compute the args that will be used for block execution.
   *
   * @example
   * .args<BlockArgs>((state) => ({ numbers: state.numbers }))
   *
   * @example
   * .args<BlockArgs>((state) => {
   *   if (state.numbers.length === 0) throw new Error('Numbers required'); // block not ready
   *   return { numbers: state.numbers };
   * })
   */
  public args<Args>(fn: (state: State) => Args): BlockModelV3<Args, OutputsCfg, State, Href> {
    // Register the function directly - state will be passed as argument when called
    tryRegisterCallback('args', fn);
    return new BlockModelV3<Args, OutputsCfg, State, Href>({
      ...this.config,
      args: { __renderLambda: true, handle: 'args' } as ConfigRenderLambda<Args>,
    });
  }

  /**
   * Adds a migration function to transform state from a previous version to the next.
   * Migrations are applied in order when loading projects saved with older block versions.
   *
   * Each migration transforms state incrementally:
   * - migration[0]: v1 → v2
   * - migration[1]: v2 → v3
   * - etc.
   *
   * The final migration should return a state compatible with the current State type.
   *
   * @example
   * type StateV1 = { numbers: number[] };
   * type StateV2 = { numbers: number[], labels: string[] };
   * type StateV3 = { numbers: number[], labels: string[], description: string };
   *
   * .withState<StateV3>({ numbers: [], labels: [], description: '' })
   * .migration<StateV1>((state) => ({ ...state, labels: [] }))           // v1 → v2
   * .migration<StateV2>((state) => ({ ...state, description: '' }))      // v2 → v3
   *
   * @param fn - Function that transforms state from one version to the next
   * @returns The builder for chaining
   */
  public migration<PrevState = unknown>(fn: (state: PrevState) => unknown): BlockModelV3<Args, OutputsCfg, State, Href> {
    // Register the callback in the VM (may return undefined if not in render context)
    tryAppendCallback('migrations', fn);
    // Index is determined by array position, not callback registry
    const index = this.config.migrations.length;
    return new BlockModelV3<Args, OutputsCfg, State, Href>({
      ...this.config,
      migrations: [...this.config.migrations, { index }],
    });
  }

  /**
   * Sets a function to derive pre-run args from state (optional).
   * This is called during setState to compute the args that will be used for staging/pre-run phase.
   *
   * If not defined, defaults to using the args() function result.
   * If defined, uses its return value for the staging / pre-run phase.
   *
   * The staging / pre-run phase runs only if currentPreRunArgs differs from the executed
   * version of preRunArgs (same comparison logic as currentArgs vs prodArgs).
   *
   * @example
   * .preRunArgs((state) => ({ numbers: state.numbers }))
   *
   * @example
   * .preRunArgs((state) => {
   *   // Return undefined to skip staging for this block
   *   if (!state.isReady) return undefined;
   *   return { numbers: state.numbers };
   * })
   * TODO: generic inference for the return type
   */
  public preRunArgs(fn: (state: State) => unknown): BlockModelV3<Args, OutputsCfg, State, Href> {
    tryRegisterCallback('preRunArgs', fn);
    return new BlockModelV3<Args, OutputsCfg, State, Href>({
      ...this.config,
      preRunArgs: { __renderLambda: true, handle: 'preRunArgs' } as ConfigRenderLambda,
    });
  }

  /** Sets the config to generate list of section in the left block overviews panel
   * @deprecated use lambda-based API */
  public sections<const S extends SectionsExpectedType>(
    rf: S
  ): BlockModelV3<Args, OutputsCfg, State, DeriveHref<S>>;
  /** Sets the config to generate list of section in the left block overviews panel */
  public sections<
    const Ret extends SectionsExpectedType,
    const RF extends RenderFunction<Args, State, Ret>,
  >(rf: RF): BlockModelV3<Args, OutputsCfg, State, DeriveHref<ReturnType<RF>>>;
  public sections<const Cfg extends TypedConfig>(
    cfg: Cfg & SectionsCfgChecked<Cfg, Args, State>
  ): BlockModelV3<
    Args,
    OutputsCfg,
    State,
    DeriveHref<ConfigResult<Cfg, StdCtxArgsOnly<Args, State>>>
  >;
  public sections(
    arrOrCfgOrRf: SectionsExpectedType | TypedConfig | AnyFunction,
  ): BlockModelV3<Args, OutputsCfg, State, `/${string}`> {
    if (Array.isArray(arrOrCfgOrRf)) {
      return this.sections(getImmediate(arrOrCfgOrRf));
    } else if (typeof arrOrCfgOrRf === 'function') {
      tryRegisterCallback('sections', () => arrOrCfgOrRf(new RenderCtx()));
      return new BlockModelV3<Args, OutputsCfg, State>({
        ...this.config,
        sections: { __renderLambda: true, handle: 'sections' } as ConfigRenderLambda,
      });
    } else
      return new BlockModelV3<Args, OutputsCfg, State>({
        ...this.config,
        sections: arrOrCfgOrRf as TypedConfig,
      });
  }

  /** Sets a rendering function to derive block title, shown for the block in the left blocks-overview panel. */
  public title(
    rf: RenderFunction<Args, State, string>,
  ): BlockModelV3<Args, OutputsCfg, State, Href> {
    tryRegisterCallback('title', () => rf(new RenderCtx()));
    return new BlockModelV3<Args, OutputsCfg, State, Href>({
      ...this.config,
      title: { __renderLambda: true, handle: 'title' } as ConfigRenderLambda,
    });
  }

  public subtitle(
    rf: RenderFunction<Args, State, string>,
  ): BlockModelV3<Args, OutputsCfg, State, Href> {
    tryRegisterCallback('subtitle', () => rf(new RenderCtx()));
    return new BlockModelV3<Args, OutputsCfg, State, Href>({
      ...this.config,
      subtitle: {
        __renderLambda: true,
        handle: 'subtitle',
      },
    });
  }

  public tags(
    rf: RenderFunction<Args, State, string[]>,
  ): BlockModelV3<Args, OutputsCfg, State, Href> {
    tryRegisterCallback('tags', () => rf(new RenderCtx()));
    return new BlockModelV3<Args, OutputsCfg, State, Href>({
      ...this.config,
      tags: {
        __renderLambda: true,
        handle: 'tags',
      },
    });
  }

  /** Defines type and sets initial value for block UiState. */
  public withState<State>(initialValue: State): BlockModelV3<Args, OutputsCfg, State, Href> {
    return new BlockModelV3<Args, OutputsCfg, State, Href>({
      ...this.config,
      initialState: initialValue,
    });
  }

  /** Sets or overrides feature flags for the block. */
  public withFeatureFlags(flags: Partial<BlockCodeKnownFeatureFlags>): BlockModelV3<Args, OutputsCfg, State, Href> {
    return new BlockModelV3<Args, OutputsCfg, State, Href>({
      ...this.config,
      featureFlags: { ...this.config.featureFlags, ...flags },
    });
  }

  /**
   * Defines how to derive list of upstream references this block is meant to enrich with its exports from block args.
   * Influences dependency graph construction.
   */
  public enriches(
    lambda: (args: Args) => PlRef[],
  ): BlockModelV3<Args, OutputsCfg, State, Href> {
    tryRegisterCallback('enrichmentTargets', lambda);
    return new BlockModelV3<Args, OutputsCfg, State, Href>({
      ...this.config,
      enrichmentTargets: { __renderLambda: true, handle: 'enrichmentTargets' } as ConfigRenderLambda,
    });
  }

  /** Renders all provided block settings into a pre-configured platforma API
   * instance, that can be used in frontend to interact with block state, and
   * other features provided by the platforma to the block. */
  public done(): PlatformaExtended<PlatformaV3<
    Args,
    InferOutputsFromConfigs<Args, OutputsCfg, State>,
    State,
    Href
  >> {
    return this.withFeatureFlags({
      ...this.config.featureFlags,
      requiresUIAPIVersion: 3 as const,
    })._done();
  }

  public _done(): PlatformaExtended<PlatformaV3<
    Args,
    InferOutputsFromConfigs<Args, OutputsCfg, State>,
    State,
    Href
  >> {
    if (this.config.args === undefined) throw new Error('Args rendering function not set.');

    const apiVersion = 3;

    const blockConfig: BlockConfigContainer = {
      v4: {
        configVersion: 4,
        sdkVersion: PlatformaSDKVersion,
        renderingMode: this.config.renderingMode,
        args: this.config.args,
        preRunArgs: this.config.preRunArgs,
        initialState: this.config.initialState,
        inputsValid: this.config.inputsValid,
        sections: this.config.sections,
        title: this.config.title,
        outputs: this.config.outputs,
        enrichmentTargets: this.config.enrichmentTargets,
        featureFlags: this.config.featureFlags,
        migrations: this.config.migrations.length > 0 ? this.config.migrations : undefined,
      },

      // fields below are added to allow previous desktop versions read generated configs
      sdkVersion: PlatformaSDKVersion,
      renderingMode: this.config.renderingMode,
      inputsValid: downgradeCfgOrLambda(this.config.inputsValid),
      sections: downgradeCfgOrLambda(this.config.sections),
      outputs: Object.fromEntries(
        Object.entries(this.config.outputs).map(([key, value]) => [key, downgradeCfgOrLambda(value)]),
      ),
    };

    globalThis.platformaApiVersion = apiVersion;

    if (!isInUI())
    // we are in the configuration rendering routine, not in actual UI
      return { config: blockConfig } as any;
    // normal operation inside the UI
    else return {
      ...getPlatformaInstance({ sdkVersion: PlatformaSDKVersion, apiVersion }),
      blockModelInfo: {
        outputs: Object.fromEntries(
          Object.entries(this.config.outputs)
            .map(([key, value]) => [key, {
              withStatus: Boolean(isConfigLambda(value) && value.withStatus),
            }]),
        ),
      },
    } as any;
  }
}

export type InferOutputType<CfgOrFH, Args, State> = CfgOrFH extends TypedConfig
  ? ResolveCfgType<CfgOrFH, Args, State>
  : CfgOrFH extends ConfigRenderLambda
    ? ExtractFunctionHandleReturn<CfgOrFH>
    : never;

type InferOutputsFromConfigs<
  Args,
  OutputsCfg extends Record<string, TypedConfigOrConfigLambda>,
  UiState,
> = {
  [Key in keyof OutputsCfg]:
    & OutputWithStatus<InferOutputType<OutputsCfg[Key], Args, UiState>>
    & { __unwrap: (OutputsCfg[Key] extends { withStatus: true } ? false : true) };
};

// Type tests for BlockModelV3

// Helper types for testing
type _TestArgs = { inputFile: string; threshold: number };
type _TestState = { selectedTab: string };
type _TestOutputs = { result: ConfigRenderLambda<string>; count: ConfigRenderLambda<number> };

// Test: Merge type works correctly
type _MergeTest1 = Expect<Equal<Merge<{ a: 1 }, { b: 2 }>, { a: 1; b: 2 }>>;
type _MergeTest2 = Expect<Equal<Merge<{ a: 1 }, { a: 2 }>, { a: 2 }>>;
type _MergeTest3 = Expect<Equal<Merge<{ a: 1; b: 1 }, { b: 2; c: 3 }>, { a: 1; b: 2; c: 3 }>>;

// Test: create() returns a BlockModelV3 instance
// Note: Due to function overloads, ReturnType uses the last overload signature.
// We verify the structure is correct using a simpler assignability test.
type _CreateResult = ReturnType<typeof BlockModelV3.create>;
type _CreateIsBlockModelV3 = _CreateResult extends BlockModelV3<infer _A, infer _O, infer _S> ? true : false;
type _CreateTest = Expect<_CreateIsBlockModelV3>;

// Test: BlockModelV3Config interface structure
type _ConfigTest = Expect<Equal<
  BlockModelV3Config<_TestArgs, _TestOutputs, _TestState>,
  {
    renderingMode: BlockRenderingMode;
    args: ConfigRenderLambda<_TestArgs> | undefined;
    preRunArgs: ConfigRenderLambda<unknown> | undefined;
    initialState: _TestState;
    outputs: _TestOutputs;
    inputsValid: TypedConfigOrConfigLambda;
    sections: TypedConfigOrConfigLambda;
    title: ConfigRenderLambda | undefined;
    subtitle: ConfigRenderLambda | undefined;
    tags: ConfigRenderLambda | undefined;
    enrichmentTargets: ConfigRenderLambda | undefined;
    featureFlags: BlockCodeKnownFeatureFlags;
    migrations: MigrationDescriptor[];
  }
>>;

// Test: Default Href is '/'
type _HrefDefaultTest = BlockModelV3<_TestArgs, {}, _TestState> extends BlockModelV3<_TestArgs, {}, _TestState, '/'> ? true : false;
type _VerifyHrefDefault = Expect<_HrefDefaultTest>;

// Test: Custom Href can be specified
type _CustomHref = '/settings' | '/main';
type _HrefCustomBuilder = BlockModelV3<_TestArgs, {}, _TestState, _CustomHref>;
type _HrefCustomTest = _HrefCustomBuilder extends BlockModelV3<_TestArgs, {}, _TestState, _CustomHref> ? true : false;
type _VerifyHrefCustom = Expect<_HrefCustomTest>;

// Test: Output type accumulation with & intersection
type _OutputsAccumulation = { a: ConfigRenderLambda<string> } & { b: ConfigRenderLambda<number> };
type _VerifyOutputsHaveKeys = Expect<Equal<keyof _OutputsAccumulation, 'a' | 'b'>>;

// Test: Builder with all type parameters specified compiles
type _FullBuilder = BlockModelV3<_TestArgs, _TestOutputs, _TestState, '/main'>;
type _FullBuilderTest = _FullBuilder extends BlockModelV3<_TestArgs, _TestOutputs, _TestState, '/main'> ? true : false;
type _VerifyFullBuilder = Expect<_FullBuilderTest>;

// Test: InferOutputType extracts correct type from ConfigRenderLambda
type _InferLambdaTest = Expect<Equal<
  InferOutputType<ConfigRenderLambda<string>, _TestArgs, _TestState>,
  string
>>;

// Test: InferOutputsFromConfigs maps outputs correctly
type _InferOutputsTest = InferOutputsFromConfigs<_TestArgs, { myOutput: ConfigRenderLambda<number> }, _TestState>;
type _VerifyInferOutputs = Expect<Equal<
  _InferOutputsTest,
  { myOutput: OutputWithStatus<number> & { __unwrap: true } }
>>;
