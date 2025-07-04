import type { TypedConfig } from '../config';
import type { ConfigRenderLambda } from './lambdas';

export function isConfigLambda(
  cfgOrFh: TypedConfigOrConfigLambda,
): cfgOrFh is ConfigRenderLambda {
  return (cfgOrFh as any).__renderLambda === true;
}

export type TypedConfigOrConfigLambda = TypedConfig | ConfigRenderLambda;

/** @deprecated */
export type TypedConfigOrString = TypedConfig | string;
