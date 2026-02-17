import { extractConfigGeneric, type BlockConfigContainer } from "@milaboratories/pl-model-common";
import type { TypedConfigOrConfigLambda, TypedConfigOrString } from "./types";
import { isConfigLambda } from "./types";
import type { BlockConfig } from "./v3";
import { BlockStorageFacadeHandles } from "../block_storage_facade";

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
  const config = extractConfigGeneric(cfg) as BlockConfig;
  // Fill facadeCallbacks with defaults for V4 blocks that don't declare them
  if (config.configVersion === 4 && Object.keys(config.facadeCallbacks).length === 0) {
    (config as { facadeCallbacks: Record<string, unknown> }).facadeCallbacks =
      BlockStorageFacadeHandles;
  }
  return config;
}
