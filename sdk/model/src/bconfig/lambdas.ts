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

/** Additional information that may alter lambda rendering procedure. */
export type ConfigRenderLambdaFlags = {
  /**
   * Tells the system that corresponding computable should be created with StableOnlyRetentive rendering mode.
   * This flag can be overriden by the system.
   * */
  retentive?: boolean;

  /**
   * Tells the system that resulting computable has important side-effects, thus it's rendering is required even
   * nobody is actively monitoring rendered values. Like file upload progress, that triggers upload itself.
   * */
  isActive?: boolean;
};

/** Creates branded Cfg type */
export interface ConfigRenderLambda<Return = unknown> extends ConfigRenderLambdaFlags {
  /** Type marker */
  __renderLambda: true;

  /** Reference to a callback registered inside the model code. */
  handle: string;
}

export type ExtractFunctionHandleReturn<Func extends ConfigRenderLambda> =
  Func extends ConfigRenderLambda<infer Return> ? Return : never;
