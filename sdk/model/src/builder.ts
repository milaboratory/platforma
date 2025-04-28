import type { BlockRenderingMode, BlockSection, ValueOrErrors, AnyFunction, PlRef } from '@milaboratories/pl-model-common';
import type { Checked, ConfigResult, TypedConfig } from './config';
import { getImmediate } from './config';
import { getPlatformaInstance, isInUI, tryRegisterCallback } from './internal';
import type { Platforma } from './platforma';
import type { InferRenderFunctionReturn, RenderFunction } from './render';
import { RenderCtx } from './render';
import { PlatformaSDKVersion } from './version';
import type {
  TypedConfigOrConfigLambda,
  ConfigRenderLambda,
  StdCtxArgsOnly,
  DeriveHref,
  ResolveCfgType,
  ExtractFunctionHandleReturn,
  BlockConfigContainer,
  ConfigRenderLambdaFlags,
} from './bconfig';
import {
  downgradeCfgOrLambda,
} from './bconfig';

type SectionsExpectedType = readonly BlockSection[];

type SectionsCfgChecked<Cfg extends TypedConfig, Args, UiState> = Checked<
  Cfg,
  ConfigResult<Cfg, StdCtxArgsOnly<Args, UiState>> extends SectionsExpectedType ? true : false
>;

// TODO (Unused type in code)
// type SectionsRFChecked<RF extends Function> = Checked<
//   RF,
//   InferRenderFunctionReturn<RF> extends SectionsExpectedType ? true : false
// >;

type InputsValidExpectedType = boolean;

type InputsValidCfgChecked<Cfg extends TypedConfig, Args, UiState> = Checked<
  Cfg,
  ConfigResult<Cfg, StdCtxArgsOnly<Args, UiState>> extends InputsValidExpectedType ? true : false
>;

// TODO (Unused type in code)
// type InputsValidRFChecked<RF extends Function> = Checked<
//   RF,
//   InferRenderFunctionReturn<RF> extends InputsValidExpectedType ? true : false
// >;

type NoOb = Record<string, never>;

/** Main entry point that each block should use in it's "config" module. Don't forget
 * to call {@link done()} at the end of configuration. Value returned by this builder must be
 * exported as constant with name "platforma" from the "config" module. */
export class BlockModel<
  Args,
  OutputsCfg extends Record<string, TypedConfigOrConfigLambda>,
  UiState,
  Href extends `/${string}` = '/',
> {
  private constructor(
    private readonly _renderingMode: BlockRenderingMode,
    private readonly _initialArgs: Args | undefined,
    private readonly _initialUiState: UiState,
    private readonly _outputs: OutputsCfg,
    private readonly _inputsValid: TypedConfigOrConfigLambda,
    private readonly _sections: TypedConfigOrConfigLambda,
    private readonly _title: ConfigRenderLambda | undefined,
    private readonly _enrichmentTargets: ConfigRenderLambda | undefined,
  ) {}

  /** Initiates configuration builder */
  public static create(renderingMode: BlockRenderingMode): BlockModel<NoOb, {}, NoOb>;
  /** Initiates configuration builder */
  public static create(): BlockModel<NoOb, {}, NoOb>;
  /**
   * Initiates configuration builder
   * @deprecated use create method without generic parameter
   */
  public static create<Args>(renderingMode: BlockRenderingMode): BlockModel<Args, {}, NoOb>;
  /**
   * Initiates configuration builder
   * @deprecated use create method without generic parameter
   */
  public static create<Args>(): BlockModel<Args, {}, NoOb>;
  public static create(renderingMode: BlockRenderingMode = 'Heavy'): BlockModel<NoOb, {}, NoOb> {
    return new BlockModel<NoOb, {}, NoOb>(
      renderingMode,
      undefined,
      {},
      {},
      getImmediate(true),
      getImmediate([]),
      undefined,
      undefined,
    );
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
  ): BlockModel<Args, OutputsCfg & { [K in Key]: Cfg }, UiState, Href>;
  /**
   * Add output cell to the configuration
   *
   * @param key output cell name, that can be later used to retrieve the rendered value
   * @param rf  callback calculating output value using context, that allows to access
   *            workflows outputs and interact with platforma drivers
   * @param flags additional flags that may alter lambda rendering procedure
   * */
  public output<const Key extends string, const RF extends RenderFunction<Args, UiState>>(
    key: Key,
    rf: RF,
    flags?: ConfigRenderLambdaFlags
  ): BlockModel<
    Args,
    OutputsCfg & { [K in Key]: ConfigRenderLambda<InferRenderFunctionReturn<RF>> },
    UiState,
    Href
  >;
  public output(
    key: string,
    cfgOrRf: TypedConfig | AnyFunction,
    flags: ConfigRenderLambdaFlags = {},
  ): BlockModel<Args, OutputsCfg, UiState, Href> {
    if (typeof cfgOrRf === 'function') {
      const handle = `output#${key}`;
      tryRegisterCallback(handle, () => cfgOrRf(new RenderCtx()));
      return new BlockModel(
        this._renderingMode,
        this._initialArgs,
        this._initialUiState,
        {
          ...this._outputs,
          [key]: {
            __renderLambda: true,
            handle,
            ...flags,
          } satisfies ConfigRenderLambda,
        },
        this._inputsValid,
        this._sections,
        this._title,
        this._enrichmentTargets,
      );
    } else
      return new BlockModel(
        this._renderingMode,
        this._initialArgs,
        this._initialUiState,
        {
          ...this._outputs,
          [key]: cfgOrRf,
        },
        this._inputsValid,
        this._sections,
        this._title,
        this._enrichmentTargets,
      );
  }

  /** Shortcut for {@link output} with retentive flag set to true. */
  public retentiveOutput<const Key extends string, const RF extends RenderFunction<Args, UiState>>(
    key: Key,
    rf: RF,
  ): BlockModel<
      Args,
    OutputsCfg & { [K in Key]: ConfigRenderLambda<InferRenderFunctionReturn<RF>> },
    UiState,
    Href
    > {
    return this.output(key, rf, { retentive: true });
  }

  /** Sets custom configuration predicate on the block args at which block can be executed
   * @deprecated use lambda-based API */
  public argsValid<Cfg extends TypedConfig>(
    cfg: Cfg & InputsValidCfgChecked<Cfg, Args, UiState>
  ): BlockModel<Args, OutputsCfg, UiState, Href>;
  /** Sets custom configuration predicate on the block args at which block can be executed */
  public argsValid<RF extends RenderFunction<Args, UiState, boolean>>(
    rf: RF
  ): BlockModel<Args, OutputsCfg, UiState, Href>;
  public argsValid(
    cfgOrRf: TypedConfig | AnyFunction,
  ): BlockModel<Args, OutputsCfg, UiState, `/${string}`> {
    if (typeof cfgOrRf === 'function') {
      tryRegisterCallback('inputsValid', () => cfgOrRf(new RenderCtx()));
      return new BlockModel<Args, OutputsCfg, UiState>(
        this._renderingMode,
        this._initialArgs,
        this._initialUiState,
        this._outputs,
        {
          __renderLambda: true,
          handle: 'inputsValid',
        } satisfies ConfigRenderLambda,
        this._sections,
        this._title,
        this._enrichmentTargets,
      );
    } else
      return new BlockModel<Args, OutputsCfg, UiState>(
        this._renderingMode,
        this._initialArgs,
        this._initialUiState,
        this._outputs,
        cfgOrRf,
        this._sections,
        this._title,
        this._enrichmentTargets,
      );
  }

  /** Sets the config to generate list of section in the left block overviews panel
   * @deprecated use lambda-based API */
  public sections<const S extends SectionsExpectedType>(
    rf: S
  ): BlockModel<Args, OutputsCfg, UiState, DeriveHref<S>>;
  /** Sets the config to generate list of section in the left block overviews panel */
  public sections<
    const Ret extends SectionsExpectedType,
    const RF extends RenderFunction<Args, UiState, Ret>,
  >(rf: RF): BlockModel<Args, OutputsCfg, UiState, DeriveHref<ReturnType<RF>>>;
  public sections<const Cfg extends TypedConfig>(
    cfg: Cfg & SectionsCfgChecked<Cfg, Args, UiState>
  ): BlockModel<
    Args,
    OutputsCfg,
    UiState,
    DeriveHref<ConfigResult<Cfg, StdCtxArgsOnly<Args, UiState>>>
  >;
  public sections(
    arrOrCfgOrRf: SectionsExpectedType | TypedConfig | AnyFunction,
  ): BlockModel<Args, OutputsCfg, UiState, `/${string}`> {
    if (Array.isArray(arrOrCfgOrRf)) {
      return this.sections(getImmediate(arrOrCfgOrRf));
    } else if (typeof arrOrCfgOrRf === 'function') {
      tryRegisterCallback('sections', () => arrOrCfgOrRf(new RenderCtx()));
      return new BlockModel<Args, OutputsCfg, UiState>(
        this._renderingMode,
        this._initialArgs,
        this._initialUiState,
        this._outputs,
        this._inputsValid,
        { __renderLambda: true, handle: 'sections' } as ConfigRenderLambda,
        this._title,
        this._enrichmentTargets,
      );
    } else
      return new BlockModel<Args, OutputsCfg, UiState>(
        this._renderingMode,
        this._initialArgs,
        this._initialUiState,
        this._outputs,
        this._inputsValid,
        arrOrCfgOrRf as TypedConfig,
        this._title,
        this._enrichmentTargets,
      );
  }

  /** Sets a rendering function to derive block title, shown for the block in the left blocks-overview panel. */
  public title(
    rf: RenderFunction<Args, UiState, string>,
  ): BlockModel<Args, OutputsCfg, UiState, Href> {
    tryRegisterCallback('title', () => rf(new RenderCtx()));
    return new BlockModel<Args, OutputsCfg, UiState, Href>(
      this._renderingMode,
      this._initialArgs,
      this._initialUiState,
      this._outputs,
      this._inputsValid,
      this._sections,
      { __renderLambda: true, handle: 'title' } as ConfigRenderLambda,
      this._enrichmentTargets,
    );
  }

  /**
   * Sets initial args for the block, this value must be specified.
   * @deprecated use {@link withArgs}
   * */
  public initialArgs(value: Args): BlockModel<Args, OutputsCfg, UiState, Href> {
    return new BlockModel<Args, OutputsCfg, UiState, Href>(
      this._renderingMode,
      value,
      this._initialUiState,
      this._outputs,
      this._inputsValid,
      this._sections,
      this._title,
      this._enrichmentTargets,
    );
  }

  /** Sets initial args for the block, this value must be specified. */
  public withArgs<Args>(initialValue: Args): BlockModel<Args, OutputsCfg, UiState, Href> {
    return new BlockModel<Args, OutputsCfg, UiState, Href>(
      this._renderingMode,
      initialValue,
      this._initialUiState,
      this._outputs,
      this._inputsValid,
      this._sections,
      this._title,
      this._enrichmentTargets,
    );
  }

  /** Defines type and sets initial value for block UiState. */
  public withUiState<UiState>(initialValue: UiState): BlockModel<Args, OutputsCfg, UiState, Href> {
    return new BlockModel<Args, OutputsCfg, UiState, Href>(
      this._renderingMode,
      this._initialArgs,
      initialValue,
      this._outputs,
      this._inputsValid,
      this._sections,
      this._title,
      this._enrichmentTargets,
    );
  }

  /**
   * Defines how to derive list of upstream references this block is meant to enrich with its exports from block args.
   * Influences dependency graph construction.
   */
  public enriches(
    lambda: (args: Args) => PlRef[],
  ): BlockModel<Args, OutputsCfg, UiState, Href> {
    tryRegisterCallback('enrichmentTargets', lambda);
    return new BlockModel<Args, OutputsCfg, UiState, Href>(
      this._renderingMode,
      this._initialArgs,
      this._initialUiState,
      this._outputs,
      this._inputsValid,
      this._sections,
      this._title,
      { __renderLambda: true, handle: 'enrichmentTargets' } as ConfigRenderLambda,
    );
  }

  /** Renders all provided block settings into a pre-configured platforma API
   * instance, that can be used in frontend to interact with block state, and
   * other features provided by the platforma to the block. */
  public done(): Platforma<
    Args,
    InferOutputsFromConfigs<Args, OutputsCfg, UiState>,
    UiState,
    Href
  > {
    if (this._initialArgs === undefined) throw new Error('Initial arguments not set.');

    const config: BlockConfigContainer = {
      v3: {
        sdkVersion: PlatformaSDKVersion,
        renderingMode: this._renderingMode,
        initialArgs: this._initialArgs,
        initialUiState: this._initialUiState,
        inputsValid: this._inputsValid,
        sections: this._sections,
        title: this._title,
        outputs: this._outputs,
        enrichmentTargets: this._enrichmentTargets,
      },

      // fields below are added to allow previous desktop versions read generated configs
      sdkVersion: PlatformaSDKVersion,
      renderingMode: this._renderingMode,
      initialArgs: this._initialArgs,
      inputsValid: downgradeCfgOrLambda(this._inputsValid),
      sections: downgradeCfgOrLambda(this._sections),
      outputs: Object.fromEntries(
        Object.entries(this._outputs).map(([key, value]) => [key, downgradeCfgOrLambda(value)]),
      ),
    };

    if (!isInUI())
      // we are in the configuration rendering routine, not in actual UI
      return { config } as any;
    // normal operation inside the UI
    else return getPlatformaInstance({ sdkVersion: PlatformaSDKVersion }) as any;
  }
}

export type InferOutputType<CfgOrFH, Args, UiState> = CfgOrFH extends TypedConfig
  ? ResolveCfgType<CfgOrFH, Args, UiState>
  : CfgOrFH extends ConfigRenderLambda
    ? ExtractFunctionHandleReturn<CfgOrFH>
    : never;

type InferOutputsFromConfigs<
  Args,
  OutputsCfg extends Record<string, TypedConfigOrConfigLambda>,
  UiState,
> = {
  [Key in keyof OutputsCfg]: ValueOrErrors<InferOutputType<OutputsCfg[Key], Args, UiState>>;
};
