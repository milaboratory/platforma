import type { ConfigResult, PlResourceEntry, TypedConfig } from '../config';
import type { OutputWithStatus } from '@milaboratories/pl-model-common';
import type { TypedConfigOrConfigLambda } from './types';

export type StdCtxArgsOnly<Args, Data = undefined> = {
  readonly $blockId: string;
  readonly $args: Args;
  readonly $ui: Data; // TODO v3
  readonly $data: Data;
};

export type StdCtx<Args, Data = undefined> = StdCtxArgsOnly<Args, Data> & {
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
   * This flag can be overridden by the system.
   * */
  retentive?: boolean;

  /**
   * Tells the system that resulting computable has important side-effects, thus it's rendering is required even
   * nobody is actively monitoring rendered values. Like file upload progress, that triggers upload itself.
   * */
  isActive?: boolean;

  /**
   * If true, result will be wrapped with additional status information,
   * such as stability status and explicit error
   */
  withStatus?: boolean;
};

/** Creates branded Cfg type */
export interface ConfigRenderLambda<Return = unknown> extends ConfigRenderLambdaFlags {
  /** Type marker */
  __renderLambda: true;

  /** Phantom property for type inference. Never set at runtime. */
  __phantomReturn?: Return;

  /** Reference to a callback registered inside the model code. */
  handle: string;
}

export type ExtractFunctionHandleReturn<Func extends ConfigRenderLambda> =
  Func extends ConfigRenderLambda<infer Return> ? Return : never;

/** Infers the output type from a TypedConfig or ConfigRenderLambda */
export type InferOutputType<CfgOrFH, Args, UiState> = CfgOrFH extends TypedConfig
  ? ResolveCfgType<CfgOrFH, Args, UiState>
  : CfgOrFH extends ConfigRenderLambda
    ? ExtractFunctionHandleReturn<CfgOrFH>
    : never;

/** Maps outputs configuration to inferred output types with status wrapper */
export type InferOutputsFromConfigs<
  Args,
  OutputsCfg extends Record<string, TypedConfigOrConfigLambda>,
  UiState,
> = {
  [Key in keyof OutputsCfg]:
    & OutputWithStatus<InferOutputType<OutputsCfg[Key], Args, UiState>>
    & { __unwrap: (OutputsCfg[Key] extends { withStatus: true } ? false : true) };
};

/** Maps lambda-only outputs configuration to inferred output types (for V3 blocks) */
export type InferOutputsFromLambdas<
  OutputsCfg extends Record<string, ConfigRenderLambda>,
> = {
  [Key in keyof OutputsCfg]:
    & OutputWithStatus<ExtractFunctionHandleReturn<OutputsCfg[Key]>>
    & { __unwrap: (OutputsCfg[Key] extends { withStatus: true } ? false : true) };
};
