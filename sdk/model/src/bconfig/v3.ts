import type { BlockConfigV3Generic, BlockConfigV4Generic } from '@milaboratories/pl-model-common';
import type { TypedConfigOrConfigLambda } from './types';
import type { ConfigRenderLambda } from './lambdas';

export type BlockConfigV3<
  Args = unknown,
  UiState = unknown,
  Outputs extends Record<string, TypedConfigOrConfigLambda> = Record<
    string,
    TypedConfigOrConfigLambda
  >,
> = BlockConfigV3Generic<Args, UiState, TypedConfigOrConfigLambda, ConfigRenderLambda, Outputs>;

export type BlockConfigV4<
  Args = unknown,
  UiState = unknown,
  Outputs extends Record<string, TypedConfigOrConfigLambda> = Record<
    string,
    TypedConfigOrConfigLambda
  >,
> = BlockConfigV4Generic<Args, UiState, TypedConfigOrConfigLambda, ConfigRenderLambda, Outputs>;

/** Union of all block config versions with discriminator for type narrowing */
export type BlockConfig = BlockConfigV3 | BlockConfigV4;
