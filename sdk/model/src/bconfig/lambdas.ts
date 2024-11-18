import { ConfigResult, PlResourceEntry, TypedConfig } from '../config';

export type StdCtxArgsOnly<Args, UiState = undefined> = {
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

/** Creates branded Cfg type */
export type ConfigRenderLambda<Return = unknown> = {
  __renderLambda: true;
  handle: string;
  retentive: boolean;
};

export type ExtractFunctionHandleReturn<Func extends ConfigRenderLambda> =
  Func extends ConfigRenderLambda<infer Return> ? Return : never;
