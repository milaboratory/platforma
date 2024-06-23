import { ConfigResult, PlResourceEntry, TypedConfig } from './type_engine';
import { getImmediate } from './actions';
import { Checked } from './type_util';
import { ValueOrErrors } from './common_types';
import { Platforma } from './platforma';
import { PlatformaSDKVersion } from './version';
import { getPlatformaInstance, isInUI } from './platforma_instance';
import { BlockRenderingMode, BlockSection } from '@milaboratory/sdk-model';

type StdCtxArgsOnly<Args, UiState = undefined> = {
  $args: Args,
  $ui: UiState,
}

export type StdCtx<Args, UiState = undefined> = StdCtxArgsOnly<Args, UiState> & {
  $prod: PlResourceEntry,
  $staging: PlResourceEntry,
}

type ResolveCfgType<Cfg extends TypedConfig, Args, UiState = undefined> = ConfigResult<Cfg, StdCtx<Args, UiState>>

type SectionsExpectedType = readonly BlockSection[];

type SectionsChecked<Cfg extends TypedConfig, Args, UiState> =
  Checked<Cfg, ConfigResult<Cfg, StdCtxArgsOnly<Args, UiState>> extends SectionsExpectedType ? true : false>

type CanRunExpectedType = boolean;

type CanRunChecked<Cfg extends TypedConfig, Args, UiState> =
  Checked<Cfg, ConfigResult<Cfg, StdCtxArgsOnly<Args, UiState>> extends CanRunExpectedType ? true : false>

/** This structure is rendered from the configuration*/
export type BlockConfig<
  Args = unknown,
  Outputs extends Record<string, TypedConfig> = Record<string, TypedConfig>> = {

  /** SDK version used by the block */
  sdkVersion: string,

  /** Main rendering mode for the block */
  renderingMode: BlockRenderingMode,

  /** Initial value for the args when block is added to the project */
  initialArgs: Args,

  /** Configuration to derive whether the block can be executed at current value
   * of args and state of referenced upstream blocks */
  canRun: TypedConfig,

  /** Configuration to derive list of section for the left overview panel */
  sections: TypedConfig,

  /** Configuration for the output cells */
  outputs: Outputs,
}

/** Main entry point that each block should use in it's "config" module. Don't forget
 * to call {@link done()} at the end of configuration. Value returned by this builder must be
 * exported as constant with name "platforma" from the "config" module. */
export class PlatformaConfiguration<Args, OutputsCfg extends Record<string, TypedConfig>, UiState> {
  private constructor(private readonly _renderingMode: BlockRenderingMode,
                      private readonly _initialArgs: Args | undefined,
                      private readonly _outputs: OutputsCfg,
                      private readonly _canRun: TypedConfig,
                      private readonly _sections: TypedConfig) {
  }

  /** Initiates configuration builder */
  public static create<Args, UiState = undefined>(renderingMode: BlockRenderingMode): PlatformaConfiguration<Args, {}, UiState> {
    return new PlatformaConfiguration<Args, {}, UiState>(renderingMode, undefined, {}, getImmediate(true), getImmediate([]));
  }

  /**
   * Add output cell to the configuration
   *
   * @param key cell name, that can be used to retrieve the rendered value
   * @param cfg configuration describing how to render cell value from the blocks
   *            workflow outputs
   * */
  public output<const Key extends string, const Cfg extends TypedConfig>(
    key: Key, cfg: Cfg
  ): PlatformaConfiguration<Args, OutputsCfg & { [K in Key]: Cfg }, UiState> {
    return new PlatformaConfiguration(this._renderingMode,
      this._initialArgs, {
        ...this._outputs,
        [key]: cfg
      }, this._canRun, this._sections);
  }

  /** Sets custom configuration predicate on the block args at which block can be executed */
  public canRun<Cfg extends TypedConfig>(cfg: Cfg & CanRunChecked<Cfg, Args, UiState>): PlatformaConfiguration<Args, OutputsCfg, UiState> {
    return new PlatformaConfiguration<Args, OutputsCfg, UiState>(this._renderingMode, this._initialArgs, this._outputs, cfg, this._sections);
  }

  /** Sets the config to generate list of section in the left block overviews panel */
  public sections<Cfg extends TypedConfig>(cfg: Cfg & SectionsChecked<Cfg, Args, UiState>): PlatformaConfiguration<Args, OutputsCfg, UiState> {
    return new PlatformaConfiguration<Args, OutputsCfg, UiState>(this._renderingMode, this._initialArgs, this._outputs, this._canRun, cfg);
  }

  /** Sets initial args for the block, this value must be specified. */
  public initialArgs(value: Args): PlatformaConfiguration<Args, OutputsCfg, UiState> {
    return new PlatformaConfiguration<Args, OutputsCfg, UiState>(this._renderingMode, value, this._outputs, this._canRun, this._sections);
  }

  /** Renders all provided block settings into a pre-configured platforma API
   * instance, that can be used in frontend to interact with block state, and
   * other features provided by the platforma to the block. */
  public done(): Platforma<Args, InferOutputsFromConfigs<Args, OutputsCfg, UiState>, UiState> {
    if (this._initialArgs === undefined)
      throw new Error('Initial arguments not set.');

    const config: BlockConfig<Args, OutputsCfg> = {
      sdkVersion: PlatformaSDKVersion,
      renderingMode: this._renderingMode,
      initialArgs: this._initialArgs,
      canRun: this._canRun,
      sections: this._sections,
      outputs: this._outputs
    };

    if (!isInUI())
      // we are in the configuration rendering routine, not in actual UI
      return { config } as any;
    else
      // normal operation inside the UI
      return getPlatformaInstance(config) as any;
  }
}

type InferOutputsFromConfigs<Args, OutputsCfg extends Record<string, TypedConfig>, UiState> =
  { [Key in keyof OutputsCfg]: ValueOrErrors<ResolveCfgType<OutputsCfg[Key], Args, UiState>> }
