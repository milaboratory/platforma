import type {
  BlockRenderingMode,
  BlockSection,
  OutputWithStatus,
  PlRef,
  BlockCodeKnownFeatureFlags,
  BlockConfigContainer,
  MigrationDescriptor,
} from '@milaboratories/pl-model-common';
import { getPlatformaInstance, isInUI, tryAppendCallback, createAndRegisterRenderLambda } from './internal';
import type { PlatformaV3 } from './platforma';
import type { InferRenderFunctionReturn, RenderFunction } from './render';
import { RenderCtx } from './render';
import { PlatformaSDKVersion } from './version';
// Import storage VM integration (side-effect: registers internal callbacks)
import './block_storage_vm';
import type {
  ConfigRenderLambda,
  DeriveHref,
  ConfigRenderLambdaFlags,
  InferOutputsFromLambdas,
} from './bconfig';
import {
  downgradeCfgOrLambda,
  isConfigLambda,
} from './bconfig';
import type { PlatformaExtended } from './platforma';

type SectionsExpectedType = readonly BlockSection[];

type NoOb = Record<string, never>;

interface BlockModelV3Config<
  Args,
  OutputsCfg extends Record<string, ConfigRenderLambda>,
  Data,
> {
  renderingMode: BlockRenderingMode;
  initialData: Data;
  outputs: OutputsCfg;
  sections: ConfigRenderLambda;
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
  OutputsCfg extends Record<string, ConfigRenderLambda>,
  Data extends Record<string, unknown> = Record<string, unknown>,
  Href extends `/${string}` = '/',
> {
  private constructor(
    private readonly config: BlockModelV3Config<Args, OutputsCfg, Data>,
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
      initialData: {},
      outputs: {},
      // Register default sections callback (returns empty array)
      sections: createAndRegisterRenderLambda({ handle: 'sections', lambda: () => [] }, true),
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
   * Add output cell wrapped with additional status information to the configuration
   *
   * @param key output cell name, that can be later used to retrieve the rendered value
   * @param rf  callback calculating output value using context, that allows to access
   *            workflows outputs and interact with platforma drivers
   * @param flags additional flags that may alter lambda rendering procedure
   * */
  public output<const Key extends string, const RF extends RenderFunction<Args, Data>>(
    key: Key,
    rf: RF,
    flags: ConfigRenderLambdaFlags & { withStatus: true }
  ): BlockModelV3<
    Args,
      OutputsCfg & { [K in Key]: ConfigRenderLambda<InferRenderFunctionReturn<RF>> & { withStatus: true } },
      Data,
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
  public output<const Key extends string, const RF extends RenderFunction<Args, Data>>(
    key: Key,
    rf: RF,
    flags?: ConfigRenderLambdaFlags
  ): BlockModelV3<
    Args,
    OutputsCfg & { [K in Key]: ConfigRenderLambda<InferRenderFunctionReturn<RF>> },
    Data,
    Href
  >;
  public output(
    key: string,
    cfgOrRf: RenderFunction<Args, Data>,
    flags: ConfigRenderLambdaFlags = {},
  ): BlockModelV3<Args, OutputsCfg, Data, Href> {
    return new BlockModelV3({
      ...this.config,
      outputs: {
        ...this.config.outputs,
        [key]: createAndRegisterRenderLambda({ handle: `output#${key}`, lambda: () => cfgOrRf(new RenderCtx()), ...flags }),
      },
    });
  }

  /** Shortcut for {@link output} with retentive flag set to true. */
  public retentiveOutput<const Key extends string, const RF extends RenderFunction<Args, Data>>(
    key: Key,
    rf: RF,
  ): BlockModelV3<
      Args,
    OutputsCfg & { [K in Key]: ConfigRenderLambda<InferRenderFunctionReturn<RF>> },
    Data,
    Href
    > {
    return this.output(key, rf, { retentive: true });
  }

  /** Shortcut for {@link output} with withStatus flag set to true. */
  public outputWithStatus<const Key extends string, const RF extends RenderFunction<Args, Data>>(
    key: Key,
    rf: RF,
  ) {
    return this.output(key, rf, { withStatus: true });
  }

  /**
   * Sets a function to derive block args from data.
   * This is called during setData to compute the args that will be used for block execution.
   *
   * @example
   * .args<BlockArgs>((data) => ({ numbers: data.numbers }))
   *
   * @example
   * .args<BlockArgs>((data) => {
   *   if (data.numbers.length === 0) throw new Error('Numbers required'); // block not ready
   *   return { numbers: data.numbers };
   * })
   */
  public args<Args>(lambda: (data: Data) => Args): BlockModelV3<Args, OutputsCfg, Data, Href> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href>({
      ...this.config,
      args: createAndRegisterRenderLambda<Args>({ handle: 'args', lambda }),
    });
  }

  /**
   * Adds a migration function to transform data from a previous version to the next.
   * Migrations are applied in order when loading projects saved with older block versions.
   *
   * Each migration transforms data incrementally:
   * - migration[0]: v1 → v2
   * - migration[1]: v2 → v3
   * - etc.
   *
   * The final migration should return a data compatible with the current Data type.
   *
   * @example
   * type DataV1 = { numbers: number[] };
   * type DataV2 = { numbers: number[], labels: string[] };
   * type DataV3 = { numbers: number[], labels: string[], description: string };
   *
   * .withData<DataV3>({ numbers: [], labels: [], description: '' })
   * .migration<DataV1>((data) => ({ ...data, labels: [] }))           // v1 → v2
   * .migration<DataV2>((data) => ({ ...data, description: '' }))      // v2 → v3
   *
   * @param fn - Function that transforms data from one version to the next
   * @returns The builder for chaining
   */
  public migration<PrevData = unknown>(fn: (data: PrevData) => unknown): BlockModelV3<Args, OutputsCfg, Data, Href> {
    // Register the callback in the VM (may return undefined if not in render context)
    tryAppendCallback('migrations', fn);
    // Index is determined by array position, not callback registry
    const index = this.config.migrations.length;
    return new BlockModelV3<Args, OutputsCfg, Data, Href>({
      ...this.config,
      migrations: [...this.config.migrations, { index }],
    });
  }

  /**
   * Sets a function to derive pre-run args from data (optional).
   * This is called during setData to compute the args that will be used for staging/pre-run phase.
   *
   * If not defined, defaults to using the args() function result.
   * If defined, uses its return value for the staging / pre-run phase.
   *
   * The staging / pre-run phase runs only if currentPreRunArgs differs from the executed
   * version of preRunArgs (same comparison logic as currentArgs vs prodArgs).
   *
   * @example
   * .preRunArgs((data) => ({ numbers: data.numbers }))
   *
   * @example
   * .preRunArgs((data) => {
   *   // Return undefined to skip staging for this block
   *   if (!data.isReady) return undefined;
   *   return { numbers: data.numbers };
   * })
   * TODO: generic inference for the return type
   */
  public preRunArgs(fn: (data: Data) => unknown): BlockModelV3<Args, OutputsCfg, Data, Href> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href>({
      ...this.config,
      preRunArgs: createAndRegisterRenderLambda({ handle: 'preRunArgs', lambda: fn }),
    });
  }

  /** Sets the lambda to generate list of sections in the left block overviews panel. */
  public sections<
    const Ret extends SectionsExpectedType,
    const RF extends RenderFunction<Args, Data, Ret>,
  >(rf: RF): BlockModelV3<Args, OutputsCfg, Data, DeriveHref<ReturnType<RF>>> {
    return new BlockModelV3<Args, OutputsCfg, Data, DeriveHref<ReturnType<RF>>>({
      ...this.config,
      // Replace the default sections callback with the user-provided one
      sections: createAndRegisterRenderLambda({ handle: 'sections', lambda: () => rf(new RenderCtx()) }, true),
    });
  }

  /** Sets a rendering function to derive block title, shown for the block in the left blocks-overview panel. */
  public title(
    rf: RenderFunction<Args, Data, string>,
  ): BlockModelV3<Args, OutputsCfg, Data, Href> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href>({
      ...this.config,
      title: createAndRegisterRenderLambda({ handle: 'title', lambda: () => rf(new RenderCtx()) }),
    });
  }

  public subtitle(
    rf: RenderFunction<Args, Data, string>,
  ): BlockModelV3<Args, OutputsCfg, Data, Href> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href>({
      ...this.config,
      subtitle: createAndRegisterRenderLambda({ handle: 'subtitle', lambda: () => rf(new RenderCtx()) }),
    });
  }

  public tags(
    rf: RenderFunction<Args, Data, string[]>,
  ): BlockModelV3<Args, OutputsCfg, Data, Href> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href>({
      ...this.config,
      tags: createAndRegisterRenderLambda({ handle: 'tags', lambda: () => rf(new RenderCtx()) }),
    });
  }

  /** Defines type and sets initial value for block UiData. */
  public withData<Data extends Record<string, unknown>>(initialValue: Data): BlockModelV3<Args, OutputsCfg, Data, Href> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href>({
      ...this.config,
      initialData: initialValue,
    });
  }

  /** Sets or overrides feature flags for the block. */
  public withFeatureFlags(flags: Partial<BlockCodeKnownFeatureFlags>): BlockModelV3<Args, OutputsCfg, Data, Href> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href>({
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
  ): BlockModelV3<Args, OutputsCfg, Data, Href> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href>({
      ...this.config,
      enrichmentTargets: createAndRegisterRenderLambda({ handle: 'enrichmentTargets', lambda: lambda }),
    });
  }

  /** Renders all provided block settings into a pre-configured platforma API
   * instance, that can be used in frontend to interact with block data, and
   * other features provided by the platforma to the block. */
  public done(): PlatformaExtended<PlatformaV3<
    Args,
    InferOutputsFromLambdas<OutputsCfg>,
    Data,
    Href
  >> {
    return this.withFeatureFlags({
      ...this.config.featureFlags,
    })._done();
  }

  public _done(): PlatformaExtended<PlatformaV3<
    Args,
    InferOutputsFromLambdas<OutputsCfg>,
    Data,
    Href
  >> {
    if (this.config.args === undefined) throw new Error('Args rendering function not set.');

    const apiVersion = 3;

    const blockConfig: BlockConfigContainer = {
      v4: {
        configVersion: 4,
        modelAPIVersion: 2,
        sdkVersion: PlatformaSDKVersion,
        renderingMode: this.config.renderingMode,
        args: this.config.args,
        preRunArgs: this.config.preRunArgs,
        initialData: this.config.initialData,
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
      sections: this.config.sections,
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

// Type tests for BlockModelV3

export type Expect<T extends true> = T;

export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;

export type Merge<A, B> = {
  [K in keyof A | keyof B]: K extends keyof B ? B[K] : K extends keyof A ? A[K] : never;
};

// Helper types for testing
type _TestArgs = { inputFile: string; threshold: number };
type _TestData = { selectedTab: string };
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
  BlockModelV3Config<_TestArgs, _TestOutputs, _TestData>,
  {
    renderingMode: BlockRenderingMode;
    args: ConfigRenderLambda<_TestArgs> | undefined;
    preRunArgs: ConfigRenderLambda<unknown> | undefined;
    initialData: _TestData;
    outputs: _TestOutputs;
    sections: ConfigRenderLambda;
    title: ConfigRenderLambda | undefined;
    subtitle: ConfigRenderLambda | undefined;
    tags: ConfigRenderLambda | undefined;
    enrichmentTargets: ConfigRenderLambda | undefined;
    featureFlags: BlockCodeKnownFeatureFlags;
    migrations: MigrationDescriptor[];
  }
>>;

// Test: Default Href is '/'
type _HrefDefaultTest = BlockModelV3<_TestArgs, {}, _TestData> extends BlockModelV3<_TestArgs, {}, _TestData, '/'> ? true : false;
type _VerifyHrefDefault = Expect<_HrefDefaultTest>;

// Test: Custom Href can be specified
type _CustomHref = '/settings' | '/main';
type _HrefCustomBuilder = BlockModelV3<_TestArgs, {}, _TestData, _CustomHref>;
type _HrefCustomTest = _HrefCustomBuilder extends BlockModelV3<_TestArgs, {}, _TestData, _CustomHref> ? true : false;
type _VerifyHrefCustom = Expect<_HrefCustomTest>;

// Test: Output type accumulation with & intersection
type _OutputsAccumulation = { a: ConfigRenderLambda<string> } & { b: ConfigRenderLambda<number> };
type _VerifyOutputsHaveKeys = Expect<Equal<keyof _OutputsAccumulation, 'a' | 'b'>>;

// Test: Builder with all type parameters specified compiles
type _FullBuilder = BlockModelV3<_TestArgs, _TestOutputs, _TestData, '/main'>;
type _FullBuilderTest = _FullBuilder extends BlockModelV3<_TestArgs, _TestOutputs, _TestData, '/main'> ? true : false;
type _VerifyFullBuilder = Expect<_FullBuilderTest>;

// Test: InferOutputsFromLambdas maps outputs correctly
type _InferOutputsTest = InferOutputsFromLambdas<{ myOutput: ConfigRenderLambda<number> }>;
type _VerifyInferOutputs = Expect<Equal<
  _InferOutputsTest,
  { myOutput: OutputWithStatus<number> & { __unwrap: true } }
>>;
