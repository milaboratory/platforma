import type { BlockConfigContainer } from './container';
import type { TypedConfigOrConfigLambda, TypedConfigOrString } from './types';
import { isConfigLambda } from './types';
import type { BlockConfig } from './v3';

export function downgradeCfgOrLambda(data: TypedConfigOrConfigLambda): TypedConfigOrString;
export function downgradeCfgOrLambda(
  data: TypedConfigOrConfigLambda | undefined
): TypedConfigOrString | undefined;
export function downgradeCfgOrLambda(
  data: TypedConfigOrConfigLambda | undefined,
): TypedConfigOrString | undefined {
  if (data === undefined) return undefined;
  if (isConfigLambda(data)) return data.handle;
  return data;
}

function upgradeCfgOrLambda(data: TypedConfigOrString): TypedConfigOrConfigLambda;
function upgradeCfgOrLambda(
  data: TypedConfigOrString | undefined
): TypedConfigOrConfigLambda | undefined;
function upgradeCfgOrLambda(
  data: TypedConfigOrString | undefined,
): TypedConfigOrConfigLambda | undefined {
  if (data === undefined) return undefined;
  if (typeof data === 'string') return { __renderLambda: true, handle: data, retentive: false };
  return data;
}

/**
 * Takes universal config, and converts it into latest config structure.
 *
 * **Important**: This operation is not meant to be executed recusively.
 *                In no circumstance result of this function should be persisted!
 * */
export function extractConfig(cfg: BlockConfigContainer): BlockConfig {
  if (cfg.v3 !== undefined) {
    // version 3
    const {
      initialArgs,
      initialUiState,
      inputsValid,
      outputs,
      renderingMode,
      sdkVersion,
      sections,
      title,
    } = cfg.v3;
    const { code } = cfg;
    return {
      initialArgs,
      initialUiState,
      inputsValid,
      outputs,
      renderingMode,
      sdkVersion,
      sections,
      title,
      code,
    };
  } else if (cfg.inputsValid !== undefined) {
    // version 2
    const { sdkVersion, renderingMode, outputs, inputsValid, sections, initialArgs, code } = cfg;
    const fields = Object.keys(cfg);
    if (
      sdkVersion === undefined
      || renderingMode === undefined
      || outputs === undefined
      || inputsValid === undefined
      || sections === undefined
      || initialArgs === undefined
    )
      throw new Error(
        `Malformed config v2. SDK version ${sdkVersion}; Fields = ${fields.join(', ')}`,
      );
    return {
      sdkVersion,
      renderingMode,
      initialArgs,
      outputs: Object.fromEntries(
        Object.entries(outputs).map(([key, value]) => [key, upgradeCfgOrLambda(value)]),
      ),
      inputsValid: upgradeCfgOrLambda(inputsValid),
      sections: upgradeCfgOrLambda(sections),
      initialUiState: undefined,
      code,
    };
  } else if (cfg.renderingMode !== undefined) {
    // version 1
    const { sdkVersion, canRun, renderingMode, outputs, sections, initialArgs, code } = cfg;
    const fields = Object.keys(cfg);
    if (
      renderingMode === undefined
      || outputs === undefined
      || canRun === undefined
      || sections === undefined
      || initialArgs === undefined
    )
      throw new Error(
        `Malformed config v1. SDK version ${sdkVersion}; Fields = ${fields.join(', ')}`,
      );
    return {
      sdkVersion: sdkVersion ?? 'unknown',
      renderingMode,
      initialArgs,
      outputs: Object.fromEntries(
        Object.entries(outputs).map(([key, value]) => [key, upgradeCfgOrLambda(value)]),
      ),
      inputsValid: upgradeCfgOrLambda(canRun),
      sections: upgradeCfgOrLambda(sections),
      initialUiState: undefined,
      code,
    };
  } else {
    const { sdkVersion } = cfg;
    const fields = Object.keys(cfg);
    throw new Error(
      `Config format not supported: SDK = ${sdkVersion}; Fields = ${fields.join(', ')}`,
    );
  }
}
