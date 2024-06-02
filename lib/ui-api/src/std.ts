import { ConfigResult, PlResourceEntry, TypedConfig } from './type_engine';

export type StdCtx<Inputs, UiState = undefined> = {
  $inputs: Inputs,
  $ui: UiState,
  $outputs: PlResourceEntry
}

// type Assume<T, U> = T extends U ? T : U;

type Checked<Type, Condition> = Condition extends true ? Type : never;

export type ResolveCfgType<Cfg extends TypedConfig, Inputs, UiState = undefined> = ConfigResult<Cfg, StdCtx<Inputs, UiState>>

export type CheckedBlockConfig<Cfg extends BlockConfig, Inputs, UiState = undefined> =
  Checked<Cfg, ResolveCfgType<Cfg['overview'], Inputs, UiState> extends Overview ? true : false>

export interface Section {
  readonly id: string,
  readonly title: string
}

export interface Overview {
  readonly canRun: boolean,
  readonly sections: readonly Section[]
}

export type BlockConfig = {
  overview: TypedConfig,
  data: TypedConfig,
}

export function blockConfigFactory<Inputs, UiState = undefined>() {
  return function <OverviewCfg extends TypedConfig, DataCfg extends TypedConfig>(
    overview: OverviewCfg,
    data: DataCfg
  ): CheckedBlockConfig<{
    overview: OverviewCfg,
    data: DataCfg
  }, Inputs, UiState> {
    return { overview, data } as any;
  };
}
