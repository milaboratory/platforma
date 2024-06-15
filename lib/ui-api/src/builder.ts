import { ConfigResult, PlResourceEntry, TypedConfig } from './type_engine';
import { getImmediate } from './actions';
import { Checked } from './type_util';

export type StdCtxArgsOnly<Args, UiState = undefined> = {
  $args: Args,
  $ui: UiState,
}

export type StdCtx<Args, UiState = undefined> = StdCtxArgsOnly<Args, UiState> & {
  $prod: PlResourceEntry,
  $staging: PlResourceEntry,
}

export type ResolveCfgType<Cfg extends TypedConfig, Args, UiState = undefined> = ConfigResult<Cfg, StdCtx<Args, UiState>>

export interface Section {
  readonly id: string,
  readonly title: string
}

export type SectionsExpectedType = readonly Section[];

export type SectionsChecked<Cfg extends TypedConfig, Args, UiState> =
  Checked<Cfg, ConfigResult<Cfg, StdCtxArgsOnly<Args, UiState>> extends SectionsExpectedType ? true : false>

export type CanRunExpectedType = boolean;

export type CanRunChecked<Cfg extends TypedConfig, Args, UiState> =
  Checked<Cfg, ConfigResult<Cfg, StdCtxArgsOnly<Args, UiState>> extends CanRunExpectedType ? true : false>

export type BlockRenderingMode =
  | 'Light'
  | 'Heavy'
  | 'DualContextHeavy';

export type BlockConfig<Args = {}, UiState = undefined, Outputs extends Record<string, TypedConfig> = Record<string, TypedConfig>> = {
  renderingMode: BlockRenderingMode,
  initialArgs: Args,
  canRun: TypedConfig,
  sections: TypedConfig,
  outputs: Outputs,
}

export class BlockConfigBuilder<Args, UiState, Outputs extends Record<string, TypedConfig>> {
  private constructor(private readonly _renderingMode: BlockRenderingMode,
                      private readonly _initialArgs: Args | undefined,
                      private readonly _outputs: Outputs,
                      private readonly _canRun: TypedConfig,
                      private readonly _sections: TypedConfig) {
  }

  public static create<Args, UiState = undefined>(renderingMode: BlockRenderingMode): BlockConfigBuilder<Args, UiState, {}> {
    return new BlockConfigBuilder<Args, UiState, {}>(renderingMode, undefined, {}, getImmediate(true), getImmediate([]));
  }

  public output<const Key extends string, const Cfg extends TypedConfig>(
    key: Key, cfg: Cfg
  ): BlockConfigBuilder<Args, UiState, Outputs & { [K in Key]: Cfg }> {
    return new BlockConfigBuilder(this._renderingMode,
      this._initialArgs, {
        ...this._outputs,
        [key]: cfg
      }, this._canRun, this._sections);
  }

  public canRun<Cfg extends TypedConfig>(cfg: Cfg & CanRunChecked<Cfg, Args, UiState>): BlockConfigBuilder<Args, UiState, Outputs> {
    return new BlockConfigBuilder<Args, UiState, Outputs>(this._renderingMode, this._initialArgs, this._outputs, cfg, this._sections);
  }

  public sections<Cfg extends TypedConfig>(cfg: Cfg & SectionsChecked<Cfg, Args, UiState>): BlockConfigBuilder<Args, UiState, Outputs> {
    return new BlockConfigBuilder<Args, UiState, Outputs>(this._renderingMode, this._initialArgs, this._outputs, this._canRun, cfg);
  }

  public initialArgs(value: Args) {
    return new BlockConfigBuilder<Args, UiState, Outputs>(this._renderingMode, value, this._outputs, this._canRun, this._sections);
  }

  public build(): BlockConfig<Args, UiState, Outputs> {
    if (this._initialArgs === undefined)
      throw new Error('Initial arguments not set.');
    return {
      renderingMode: this._renderingMode,
      initialArgs: this._initialArgs,
      canRun: this._canRun,
      sections: this._sections,
      outputs: this._outputs
    };
  }
}

export type OutputCell<T> = OutputCellOK<T> | OutputCellError;

export type OutputCellError = {
  ok: false,
  errors: unknown[]
}

export type OutputCellOK<T> = {
  ok: true
  value: T
}

export type ResolveOutputsType<T extends BlockConfig<any, any, any>> =
  T extends BlockConfig<infer Args, infer UiState, infer Outputs>
    ? { [Key in keyof Outputs]: OutputCell<ResolveCfgType<Outputs[Key], Args, UiState>> }
    : never
