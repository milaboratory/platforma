import { BlockRenderingMode, BlockSection, ValueOrErrors } from '@milaboratories/pl-model-common';
import { Checked, ConfigResult, getImmediate, PlResourceEntry, TypedConfig } from './config';
import { getPlatformaInstance, isInUI, tryRegisterCallback } from './internal';
import { Platforma } from './platforma';
import { InferRenderFunctionReturn, RenderCtx, RenderFunction } from './render';
import { PlatformaSDKVersion } from './version';

type StdCtxArgsOnly<Args, UiState = undefined> = {
  readonly $blockId: string;
  readonly $args: Args;
  readonly $ui: UiState;
};

export type StdCtx<Args, UiState = undefined> = StdCtxArgsOnly<Args, UiState> & {
  readonly $prod: PlResourceEntry;
  readonly $staging: PlResourceEntry;
};

export type ResolveCfgType<Cfg extends TypedConfig, Args, UiState = undefined> = ConfigResult<
  Cfg,
  StdCtx<Args, UiState>
>;

type SectionsExpectedType = readonly BlockSection[];

type SectionsCfgChecked<Cfg extends TypedConfig, Args, UiState> = Checked<
  Cfg,
  ConfigResult<Cfg, StdCtxArgsOnly<Args, UiState>> extends SectionsExpectedType ? true : false
>;

type SectionsRFChecked<RF extends Function> = Checked<
  RF,
  InferRenderFunctionReturn<RF> extends SectionsExpectedType ? true : false
>;

type InputsValidExpectedType = boolean;

type InputsValidCfgChecked<Cfg extends TypedConfig, Args, UiState> = Checked<
  Cfg,
  ConfigResult<Cfg, StdCtxArgsOnly<Args, UiState>> extends InputsValidExpectedType ? true : false
>;

type InputsValidRFChecked<RF extends Function> = Checked<
  RF,
  InferRenderFunctionReturn<RF> extends InputsValidExpectedType ? true : false
>;

export type Code = {
  type: 'plain';
  content: string;
};

/** Field key to attach ConfAction information to a config type. */
declare const __function_handle__: unique symbol;

/** Creates branded Cfg type */
export type FunctionHandle<Return = unknown> = string & { [__function_handle__]: Return };

export type ExtractFunctionHandleReturn<Func extends FunctionHandle> =
  Func[typeof __function_handle__];

export type TypedConfigOrFunctionHandle = TypedConfig | FunctionHandle;

export function isFunctionHandle(cfgOrFh: TypedConfigOrFunctionHandle): cfgOrFh is FunctionHandle {
  return typeof cfgOrFh === 'string';
}

type OnlyString<S> = S extends string ? S : '';

// prettier-ignore
export type DeriveHref<S> = S extends readonly BlockSection[]
  ? OnlyString<Extract<S[number], { type: 'link' }>['href']>
  : never;

/** This structure is rendered from the configuration, type can accommodate any
 * version of config structure. */
export type BlockConfigUniversal<
  Args = unknown,
  Outputs extends Record<string, TypedConfigOrFunctionHandle> = Record<
    string,
    TypedConfigOrFunctionHandle
  >
> = {
  /** SDK version used by the block */
  readonly sdkVersion: string;

  /** Main rendering mode for the block */
  readonly renderingMode: BlockRenderingMode;

  /** Initial value for the args when block is added to the project */
  readonly initialArgs: Args;

  /** @deprecated */
  readonly canRun?: TypedConfigOrFunctionHandle;

  /**
   * Config to determine whether the block can be executed with current
   * arguments.
   *
   * Optional to support earlier SDK version configs.
   * */
  readonly inputsValid?: TypedConfigOrFunctionHandle;

  /** Configuration to derive list of section for the left overview panel */
  readonly sections: TypedConfigOrFunctionHandle;

  /** Configuration for the output cells */
  readonly outputs: Outputs;

  /** Config code bundle */
  readonly code?: Code;
};

/** This structure is rendered from the configuration */
export type BlockConfig<
  Args = unknown,
  Outputs extends Record<string, TypedConfigOrFunctionHandle> = Record<
    string,
    TypedConfigOrFunctionHandle
  >
> = Required<Omit<BlockConfigUniversal<Args, Outputs>, 'canRun' | 'code'>> &
  Pick<BlockConfigUniversal<Args, Outputs>, 'code'>;

/** Takes universal config, and converts it into latest structure */
export function normalizeBlockConfig<
  Args,
  Outputs extends Record<string, TypedConfigOrFunctionHandle>
>(cfg: BlockConfigUniversal<Args, Outputs>): BlockConfig<Args, Outputs> {
  if (cfg.inputsValid !== undefined) return cfg as BlockConfig<Args, Outputs>;
  else {
    if (cfg.canRun === undefined)
      throw new Error(`Malformed config, SDK version ${cfg.sdkVersion}`);
    const latest = { ...cfg, inputsValid: cfg.canRun };
    delete latest['canRun'];
    return latest;
  }
}

/** Main entry point that each block should use in it's "config" module. Don't forget
 * to call {@link done()} at the end of configuration. Value returned by this builder must be
 * exported as constant with name "platforma" from the "config" module. */
export class BlockModel<
  Args,
  OutputsCfg extends Record<string, TypedConfigOrFunctionHandle>,
  UiState,
  Href extends `/${string}` = '/'
> {
  private constructor(
    private readonly _renderingMode: BlockRenderingMode,
    private readonly _initialArgs: Args | undefined,
    private readonly _outputs: OutputsCfg,
    private readonly _inputsValid: TypedConfigOrFunctionHandle,
    private readonly _sections: TypedConfigOrFunctionHandle
  ) { }

  /** Initiates configuration builder */
  public static create<Args, UiState = undefined>(
    renderingMode: BlockRenderingMode = 'Heavy'
  ): BlockModel<Args, {}, UiState> {
    return new BlockModel<Args, {}, UiState>(
      renderingMode,
      undefined,
      {},
      getImmediate(true),
      getImmediate([])
    );
  }

  /**
   * Add output cell to the configuration
   *
   * @param key cell name, that can be used to retrieve the rendered value
   * @param cfg configuration describing how to render cell value from the blocks
   *            workflow outputs
   * */
  public output<const Key extends string, const Cfg extends TypedConfig>(
    key: Key,
    cfg: Cfg
  ): BlockModel<Args, OutputsCfg & { [K in Key]: Cfg }, UiState, Href>;
  public output<const Key extends string, const RF extends RenderFunction<Args, UiState>>(
    key: Key,
    rf: RF
  ): BlockModel<
    Args,
    OutputsCfg & { [K in Key]: FunctionHandle<InferRenderFunctionReturn<RF>> },
    UiState,
    Href
  >;
  public output(
    key: string,
    cfgOrRf: TypedConfig | Function
  ): BlockModel<Args, OutputsCfg, UiState, Href> {
    if (typeof cfgOrRf === 'function') {
      const functionHandle = `output#${key}` as FunctionHandle;
      tryRegisterCallback(functionHandle, () => cfgOrRf(new RenderCtx()));
      return new BlockModel(
        this._renderingMode,
        this._initialArgs,
        {
          ...this._outputs,
          [key]: functionHandle
        },
        this._inputsValid,
        this._sections
      );
    } else
      return new BlockModel(
        this._renderingMode,
        this._initialArgs,
        {
          ...this._outputs,
          [key]: cfgOrRf
        },
        this._inputsValid,
        this._sections
      );
  }

  /** @deprecated */
  public canRun<Cfg extends TypedConfig>(
    cfg: Cfg & InputsValidCfgChecked<Cfg, Args, UiState>
  ): BlockModel<Args, OutputsCfg, UiState, Href> {
    return this.inputsValid(cfg as any);
  }

  /** Sets custom configuration predicate on the block args at which block can be executed */
  public argsValid<Cfg extends TypedConfig>(
    cfg: Cfg & InputsValidCfgChecked<Cfg, Args, UiState>
  ): BlockModel<Args, OutputsCfg, UiState, Href>;
  /** Sets custom configuration predicate on the block args at which block can be executed */
  public argsValid<RF extends RenderFunction<Args, UiState, boolean>>(
    rf: RF
  ): BlockModel<Args, OutputsCfg, UiState, Href>;
  public argsValid(
    cfgOrRf: TypedConfig | Function
  ): BlockModel<Args, OutputsCfg, UiState, `/${string}`> {
    if (typeof cfgOrRf === 'function') {
      tryRegisterCallback('inputsValid', () => cfgOrRf(new RenderCtx()));
      return new BlockModel<Args, OutputsCfg, UiState>(
        this._renderingMode,
        this._initialArgs,
        this._outputs,
        'inputsValid' as FunctionHandle,
        this._sections
      );
    } else
      return new BlockModel<Args, OutputsCfg, UiState>(
        this._renderingMode,
        this._initialArgs,
        this._outputs,
        cfgOrRf,
        this._sections
      );
  }

  /** @deprecated use argsValid()  */
  public inputsValid<Cfg extends TypedConfig>(
    cfg: Cfg & InputsValidCfgChecked<Cfg, Args, UiState>
  ): BlockModel<Args, OutputsCfg, UiState, Href>;
  /** @deprecated use argsValid()  */
  public inputsValid<RF extends RenderFunction<Args, UiState, boolean>>(
    rf: RF
  ): BlockModel<Args, OutputsCfg, UiState, Href>;
  public inputsValid(
    cfgOrRf: TypedConfig | Function
  ): BlockModel<Args, OutputsCfg, UiState, `/${string}`> {
    return this.argsValid(cfgOrRf as any);
  }

  /** Sets the config to generate list of section in the left block overviews panel */
  public sections<const S extends SectionsExpectedType,>(rf: S): BlockModel<Args, OutputsCfg, UiState, DeriveHref<S>>;
  public sections<
    const Ret extends SectionsExpectedType,
    const RF extends RenderFunction<Args, UiState, Ret>
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
    arrOrCfgOrRf: SectionsExpectedType | TypedConfig | Function
  ): BlockModel<Args, OutputsCfg, UiState, `/${string}`> {
    if (Array.isArray(arrOrCfgOrRf)){
      return this.sections(getImmediate(arrOrCfgOrRf))
    } else if (typeof arrOrCfgOrRf === 'function') {
      tryRegisterCallback('sections', () => arrOrCfgOrRf(new RenderCtx()));
      return new BlockModel<Args, OutputsCfg, UiState>(
        this._renderingMode,
        this._initialArgs,
        this._outputs,
        this._inputsValid,
        'sections' as FunctionHandle
      );
    } else
      return new BlockModel<Args, OutputsCfg, UiState>(
        this._renderingMode,
        this._initialArgs,
        this._outputs,
        this._inputsValid,
        arrOrCfgOrRf as TypedConfig
      );
  }


  /** Sets initial args for the block, this value must be specified. */
  public initialArgs(value: Args): BlockModel<Args, OutputsCfg, UiState, Href> {
    return new BlockModel<Args, OutputsCfg, UiState, Href>(
      this._renderingMode,
      value,
      this._outputs,
      this._inputsValid,
      this._sections
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

    const config: BlockConfig<Args, OutputsCfg> = {
      sdkVersion: PlatformaSDKVersion,
      renderingMode: this._renderingMode,
      initialArgs: this._initialArgs,
      inputsValid: this._inputsValid,
      sections: this._sections,
      outputs: this._outputs
    };

    if (!isInUI())
      // we are in the configuration rendering routine, not in actual UI
      return { config } as any;
    // normal operation inside the UI
    else return getPlatformaInstance(config) as any;
  }
}

export type InferOutputType<CfgOrFH, Args, UiState> = CfgOrFH extends TypedConfig
  ? ResolveCfgType<CfgOrFH, Args, UiState>
  : CfgOrFH extends FunctionHandle
    ? ExtractFunctionHandleReturn<CfgOrFH>
    : never;

type InferOutputsFromConfigs<
  Args,
  OutputsCfg extends Record<string, TypedConfigOrFunctionHandle>,
  UiState
> = {
  [Key in keyof OutputsCfg]: ValueOrErrors<InferOutputType<OutputsCfg[Key], Args, UiState>>;
};
