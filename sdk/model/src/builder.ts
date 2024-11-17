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
export type ConfigRenderLambda<Return = unknown> = {
  __renderLambda: true;
  handle: string;
  retentive: boolean;
};

export type ExtractFunctionHandleReturn<Func extends ConfigRenderLambda> =
  Func extends ConfigRenderLambda<infer Return> ? Return : never;

export type TypedConfigOrConfigLambda = TypedConfig | ConfigRenderLambda;

export function isFunctionHandle(
  cfgOrFh: TypedConfigOrConfigLambda
): cfgOrFh is ConfigRenderLambda {
  return (cfgOrFh as any).__renderLambda === true;
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
  UiState = unknown,
  Outputs extends Record<string, TypedConfigOrConfigLambda | string> = Record<
    string,
    TypedConfigOrConfigLambda | string
  >
> = {
  /** Config format version */
  readonly cfgVersion?: number;

  /** SDK version used by the block */
  readonly sdkVersion: string;

  /** Main rendering mode for the block */
  readonly renderingMode: BlockRenderingMode;

  /** Initial value for the args when block is added to the project */
  readonly initialArgs: Args;

  /** Initial value for the args when block is added to the project */
  readonly initialUiState: UiState;

  /** @deprecated */
  readonly canRun?: TypedConfigOrConfigLambda | string;

  /**
   * Config to determine whether the block can be executed with current
   * arguments.
   *
   * Optional to support earlier SDK version configs.
   * */
  readonly inputsValid?: TypedConfigOrConfigLambda | string;

  /** Configuration to derive list of section for the left overview panel */
  readonly sections: TypedConfigOrConfigLambda | string;

  /** Config code bundle */
  readonly title?: ConfigRenderLambda;

  /** Configuration for the output cells */
  readonly outputs: Outputs;

  /** Config code bundle */
  readonly code?: Code;
};

// /** This structure is rendered from the configuration */
// export type BlockConfig<
//   Args = unknown,
//   UiState = unknown,
//   Outputs extends Record<string, TypedConfigOrConfigLambda> = Record<
//     string,
//     TypedConfigOrConfigLambda
//   >
// > =
//   // Code below:
//   //   - removes 'canRun' field
//   //   - make everething except 'code' and 'title' required
//   //   - narrows cfgVersion to number 3;
//   Required<Omit<BlockConfigUniversal<Args, UiState, Outputs>, 'canRun' | 'code' | 'title'>> &
//     Pick<BlockConfigUniversal<Args, UiState, Outputs>, 'code' | 'title'> & {
//       readonly cfgVersion: 3;
//     };

export type BlockConfig<
  Args = unknown,
  UiState = unknown,
  Outputs extends Record<string, TypedConfigOrConfigLambda> = Record<
    string,
    TypedConfigOrConfigLambda
  >
> = {
  /** Config format version */
  readonly cfgVersion: 3;

  /** SDK version used by the block */
  readonly sdkVersion: string;

  /** Main rendering mode for the block */
  readonly renderingMode: BlockRenderingMode;

  /** Initial value for the args when block is added to the project */
  readonly initialArgs: Args;

  /** Initial value for the args when block is added to the project */
  readonly initialUiState: UiState;

  /**
   * Config to determine whether the block can be executed with current
   * arguments.
   *
   * Optional to support earlier SDK version configs.
   * */
  readonly inputsValid: TypedConfigOrConfigLambda;

  /** Configuration to derive list of section for the left overview panel */
  readonly sections: TypedConfigOrConfigLambda;

  /** Config code bundle */
  readonly title?: ConfigRenderLambda;

  /** Configuration for the output cells */
  readonly outputs: Outputs;

  /** Config code bundle */
  readonly code?: Code;
};

function migrateCfgOrLambda(data: TypedConfigOrConfigLambda | string): TypedConfigOrConfigLambda;
function migrateCfgOrLambda(
  data: TypedConfigOrConfigLambda | string | undefined
): TypedConfigOrConfigLambda | undefined;
function migrateCfgOrLambda(
  data: TypedConfigOrConfigLambda | string | undefined
): TypedConfigOrConfigLambda | undefined {
  if (data === undefined) return undefined;
  if (typeof data === 'string') return { __renderLambda: true, handle: data, retentive: false };
  return data;
}

/**
 * Takes universal config, and converts it into latest structure.
 *
 * **Important:** This operation is not meant to be executed recusively for the same content.
 *                This means in no circumstance result of this function should be persisted!
 * */
export function normalizeBlockConfig(cfg: BlockConfigUniversal): BlockConfig {
  if (cfg.cfgVersion === 3) return cfg as BlockConfig;
  else if (cfg.inputsValid !== undefined) {
    if (cfg.title !== undefined) throw new Error(`Malformed config, SDK version ${cfg.sdkVersion}`);
    // version 2
    const latest = {
      ...cfg,
      cfgVersion: 3,
      outputs: Object.fromEntries(
        Object.entries(cfg.outputs).map(([key, value]) => [key, migrateCfgOrLambda(value)])
      ),
      inputsValid: migrateCfgOrLambda(cfg.inputsValid!),
      sections: migrateCfgOrLambda(cfg.sections),
      initialUiState: undefined
    } satisfies BlockConfig;
    return latest;
  } else {
    // version 1
    if (cfg.canRun === undefined)
      throw new Error(`Malformed config, SDK version ${cfg.sdkVersion}`);
    if (cfg.title !== undefined) throw new Error(`Malformed config, SDK version ${cfg.sdkVersion}`);
    const latest = {
      ...cfg,
      cfgVersion: 3,
      outputs: Object.fromEntries(
        Object.entries(cfg.outputs).map(([key, value]) => [key, migrateCfgOrLambda(value)])
      ),
      inputsValid: migrateCfgOrLambda(cfg.canRun),
      sections: migrateCfgOrLambda(cfg.sections),
      initialUiState: undefined
    } satisfies BlockConfig;
    delete latest['canRun'];
    return latest;
  }
}

type NoOb = Record<string, never>;

/** Main entry point that each block should use in it's "config" module. Don't forget
 * to call {@link done()} at the end of configuration. Value returned by this builder must be
 * exported as constant with name "platforma" from the "config" module. */
export class BlockModel<
  Args,
  OutputsCfg extends Record<string, TypedConfigOrConfigLambda>,
  UiState,
  Href extends `/${string}` = '/'
> {
  private constructor(
    private readonly _renderingMode: BlockRenderingMode,
    private readonly _initialArgs: Args | undefined,
    private readonly _initialUiState: UiState,
    private readonly _outputs: OutputsCfg,
    private readonly _inputsValid: TypedConfigOrConfigLambda,
    private readonly _sections: TypedConfigOrConfigLambda,
    private readonly _title: ConfigRenderLambda | undefined
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
      undefined
    );
  }

  /**
   * Add output cell to the configuration
   *
   * @param key output cell name, that can be later used to retrieve the rendered value
   * @param cfg configuration describing how to render cell value from the blocks
   *            workflow outputs
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
   * */
  public output<const Key extends string, const RF extends RenderFunction<Args, UiState>>(
    key: Key,
    rf: RF
  ): BlockModel<
    Args,
    OutputsCfg & { [K in Key]: ConfigRenderLambda<InferRenderFunctionReturn<RF>> },
    UiState,
    Href
  >;
  /**
   * Add output cell to the configuration
   *
   * @param key output cell name, that can be later used to retrieve the rendered value
   * @param rf  callback calculating output value using context, that allows to access
   *            workflows outputs and interact with platforma drivers
   * @param retentive if set to true, this output will retain and present prevois stable
   *                  state while new stable value is being calculated
   * */
  public output<const Key extends string, const RF extends RenderFunction<Args, UiState>>(
    key: Key,
    rf: RF,
    retentive: boolean
  ): BlockModel<
    Args,
    OutputsCfg & { [K in Key]: ConfigRenderLambda<InferRenderFunctionReturn<RF>> },
    UiState,
    Href
  >;
  public output(
    key: string,
    cfgOrRf: TypedConfig | Function,
    retentive: boolean = false
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
            retentive
          } satisfies ConfigRenderLambda
        },
        this._inputsValid,
        this._sections,
        this._title
      );
    } else
      return new BlockModel(
        this._renderingMode,
        this._initialArgs,
        this._initialUiState,
        {
          ...this._outputs,
          [key]: cfgOrRf
        },
        this._inputsValid,
        this._sections,
        this._title
      );
  }

  /** Shortcut for {@link output} with retentive flag set to true. */
  public retentiveOutput<const Key extends string, const RF extends RenderFunction<Args, UiState>>(
    key: Key,
    rf: RF
  ): BlockModel<
    Args,
    OutputsCfg & { [K in Key]: ConfigRenderLambda<InferRenderFunctionReturn<RF>> },
    UiState,
    Href
  > {
    return this.output(key, rf, true);
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
        this._initialUiState,
        this._outputs,
        {
          __renderLambda: true,
          handle: 'inputsValid',
          retentive: false
        } satisfies ConfigRenderLambda,
        this._sections,
        this._title
      );
    } else
      return new BlockModel<Args, OutputsCfg, UiState>(
        this._renderingMode,
        this._initialArgs,
        this._initialUiState,
        this._outputs,
        cfgOrRf,
        this._sections,
        this._title
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
  public sections<const S extends SectionsExpectedType>(
    rf: S
  ): BlockModel<Args, OutputsCfg, UiState, DeriveHref<S>>;
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
        { __renderLambda: true, handle: 'sections', retentive: false } as ConfigRenderLambda,
        this._title
      );
    } else
      return new BlockModel<Args, OutputsCfg, UiState>(
        this._renderingMode,
        this._initialArgs,
        this._initialUiState,
        this._outputs,
        this._inputsValid,
        arrOrCfgOrRf as TypedConfig,
        this._title
      );
  }

  public title(
    rf: RenderFunction<Args, UiState, string>
  ): BlockModel<Args, OutputsCfg, UiState, Href> {
    tryRegisterCallback('title', () => rf(new RenderCtx()));
    return new BlockModel<Args, OutputsCfg, UiState, Href>(
      this._renderingMode,
      this._initialArgs,
      this._initialUiState,
      this._outputs,
      this._inputsValid,
      this._sections,
      { __renderLambda: true, handle: 'title', retentive: false } as ConfigRenderLambda
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
      this._title
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
      this._title
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
      this._title
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

    const config: BlockConfig<Args, UiState, OutputsCfg> = {
      cfgVersion: 3,
      sdkVersion: PlatformaSDKVersion,
      renderingMode: this._renderingMode,
      initialArgs: this._initialArgs,
      initialUiState: this._initialUiState,
      inputsValid: this._inputsValid,
      sections: this._sections,
      title: this._title,
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
  : CfgOrFH extends ConfigRenderLambda
    ? ExtractFunctionHandleReturn<CfgOrFH>
    : never;

type InferOutputsFromConfigs<
  Args,
  OutputsCfg extends Record<string, TypedConfigOrConfigLambda>,
  UiState
> = {
  [Key in keyof OutputsCfg]: ValueOrErrors<InferOutputType<OutputsCfg[Key], Args, UiState>>;
};
