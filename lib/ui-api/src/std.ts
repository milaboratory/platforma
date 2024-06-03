import { ConfigResult, PlResourceEntry, TypedConfig } from './type_engine';
import { getImmediate } from './actions';

export type StdCtx<Inputs, UiState = undefined> = {
  $inputs: Inputs,
  $ui: UiState,
  $prod: PlResourceEntry,
  $staging: PlResourceEntry,
}

type Checked<Type, Condition> = Condition extends true ? Type : 'error';

export type ResolveCfgType<Cfg extends TypedConfig, Inputs, UiState = undefined> = ConfigResult<Cfg, StdCtx<Inputs, UiState>>

export interface Section {
  readonly id: string,
  readonly title: string
}

export type SectionsExpectedType = readonly Section[];

export type SectionsChecked<Cfg extends TypedConfig, Inputs, UiState> = Checked<Cfg, ResolveCfgType<Cfg, Inputs, UiState> extends SectionsExpectedType ? true : false>

export type CanRunExpectedType = boolean;

export type CanRunChecked<Cfg extends TypedConfig, Inputs, UiState> = Checked<Cfg, ResolveCfgType<Cfg, Inputs, UiState> extends CanRunExpectedType ? true : false>

export type BlockConfig<Inputs, UiState, Outputs extends Record<string, TypedConfig>> = {
  canRun: TypedConfig,
  sections: TypedConfig,
  outputs: Outputs,
}

export class BlockConfigBuilder<Inputs, UiState, Outputs extends Record<string, TypedConfig>> {
  private constructor(private readonly _outputs: Outputs,
                      private readonly _canRun: TypedConfig,
                      private readonly _sections: TypedConfig) {
  }

  public static create<Inputs, UiState = undefined>(): BlockConfigBuilder<Inputs, UiState, {}> {
    return new BlockConfigBuilder<Inputs, UiState, {}>({}, getImmediate(true), getImmediate([]));
  }

  public output<const Key extends string, const Cfg extends TypedConfig>(
    key: Key, cfg: Cfg
  ): BlockConfigBuilder<Inputs, UiState, Outputs & { [K in Key]: Cfg }> {
    return new BlockConfigBuilder({ ...this._outputs, [key]: cfg }, this._canRun, this._sections);
  }

  public canRun<Cfg extends TypedConfig>(cfg: Cfg & CanRunChecked<Cfg, Inputs, UiState>): BlockConfigBuilder<Inputs, UiState, Outputs> {
    return new BlockConfigBuilder<Inputs, UiState, Outputs>(this._outputs, cfg, this._sections);
  }

  public sections<Cfg extends TypedConfig>(cfg: Cfg & SectionsChecked<Cfg, Inputs, UiState>): BlockConfigBuilder<Inputs, UiState, Outputs> {
    return new BlockConfigBuilder<Inputs, UiState, Outputs>(this._outputs, this._canRun, cfg);
  }

  public build(): BlockConfig<Inputs, UiState, Outputs> {
    return {
      canRun: this._canRun,
      sections: this._sections,
      outputs: this._outputs
    };
  }
}

export type ResolveOutputsType<T extends BlockConfig<any, any, any>> =
  T extends BlockConfig<infer Inputs, infer UiState, infer Outputs>
    ? { [Key in keyof Outputs]: ResolveCfgType<Outputs[Key], Inputs, UiState> }
    : never
