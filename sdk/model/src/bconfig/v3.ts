import { BlockRenderingMode } from '@milaboratories/pl-model-common';
import { Code, TypedConfigOrConfigLambda } from './types';
import { ConfigRenderLambda } from './lambdas';

export type BlockConfigV3<
  Args = unknown,
  UiState = unknown,
  Outputs extends Record<string, TypedConfigOrConfigLambda> = Record<
    string,
    TypedConfigOrConfigLambda
  >
> = {
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

  /** Lambda to derive block title */
  readonly title?: ConfigRenderLambda;

  /** Configuration for the output cells */
  readonly outputs: Outputs;

  /** Config code bundle */
  readonly code?: Code;
};

export type BlockConfig = BlockConfigV3;
