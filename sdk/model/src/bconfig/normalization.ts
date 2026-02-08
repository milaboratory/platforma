import { extractConfigGeneric, type BlockConfigContainer } from "@milaboratories/pl-model-common";
import type { TypedConfigOrConfigLambda, TypedConfigOrString } from "./types";
import { isConfigLambda } from "./types";
import type { BlockConfig } from "./v3";

export function downgradeCfgOrLambda(data: TypedConfigOrConfigLambda): TypedConfigOrString;
export function downgradeCfgOrLambda(
  data: TypedConfigOrConfigLambda | undefined,
): TypedConfigOrString | undefined;
export function downgradeCfgOrLambda(
  data: TypedConfigOrConfigLambda | undefined,
): TypedConfigOrString | undefined {
  if (data === undefined) return undefined;
  if (isConfigLambda(data)) return data.handle;
  return data;
}

export function extractConfig(cfg: BlockConfigContainer): BlockConfig {
  return extractConfigGeneric(cfg) as BlockConfig;
}
