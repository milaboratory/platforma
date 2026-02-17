// TODO BroadActiveHandleDescriptor must be removed

import type { BlockCodeFeatureFlags } from "../flags";
import type { BlockCodeWithInfo, Code } from "./code";
import type { BlockRenderingMode } from "./types";

/**
 * BroadActiveHandleDescriptor = TypedConfigOrConfigLambda,
 * NarrowActiveHandleDescriptor = ConfigRenderLambda
 */
export type BlockConfigV4Generic<
  _Args = unknown,
  _Data extends Record<string, unknown> = Record<string, unknown>,
  BroadActiveHandleDescriptor = unknown,
  NarrowActiveHandleDescriptor extends BroadActiveHandleDescriptor = BroadActiveHandleDescriptor,
  Outputs extends Record<string, BroadActiveHandleDescriptor> = Record<
    string,
    BroadActiveHandleDescriptor
  >,
> = {
  /** Discriminator to identify config version */
  readonly configVersion: 4;

  readonly modelAPIVersion: 2;

  /** SDK version used by the block */
  readonly sdkVersion: string;

  /** Main rendering mode for the block */
  readonly renderingMode: BlockRenderingMode;

  /** Lambda to derive block args from state */
  readonly args: NarrowActiveHandleDescriptor;

  /**
   * Lambda to derive prerun args from state (optional).
   * If not defined, defaults to using the args() result.
   * Used for staging/prerun phase.
   */
  readonly prerunArgs?: NarrowActiveHandleDescriptor;

  /** Lambda to derive list of sections for the left overview panel */
  readonly sections: NarrowActiveHandleDescriptor;

  /** Lambda to derive block title */
  readonly title?: NarrowActiveHandleDescriptor;

  /** Lambda to derive block subtitle, shown below the title */
  readonly subtitle?: NarrowActiveHandleDescriptor;

  /** Lambda returning array of tags for search functionality */
  readonly tags?: BroadActiveHandleDescriptor;

  /**
   * Lambda returning list of upstream blocks this block enriches with its exports,
   * influences dependency graph construction
   * */
  readonly enrichmentTargets?: NarrowActiveHandleDescriptor;

  /** Configuration for the output cells */
  readonly outputs: Outputs;

  /** Config code bundle */
  readonly code?: Code;

  /** Feature flags for the block Model and UI code. */
  readonly featureFlags?: BlockCodeFeatureFlags;

  /** Facade callbacks supported by this block (for pre-execution validation) */
  readonly facadeCallbacks: Record<string, NarrowActiveHandleDescriptor>;
};

/**
 * BroadActiveHandleDescriptor = TypedConfigOrConfigLambda,
 * NarrowActiveHandleDescriptor = ConfigRenderLambda
 */
export type BlockConfigV3Generic<
  Args = unknown,
  UiState = unknown,
  BroadActiveHandleDescriptor = unknown,
  NarrowActiveHandleDescriptor extends BroadActiveHandleDescriptor = BroadActiveHandleDescriptor,
  Outputs extends Record<string, BroadActiveHandleDescriptor> = Record<
    string,
    BroadActiveHandleDescriptor
  >,
> = {
  /** Discriminator to identify config version */
  readonly configVersion: 3;

  readonly modelAPIVersion: 1;

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
   */
  readonly inputsValid: BroadActiveHandleDescriptor;

  /** Configuration to derive list of section for the left overview panel */
  readonly sections: BroadActiveHandleDescriptor;

  /** Lambda to derive block title */
  readonly title?: NarrowActiveHandleDescriptor;

  /** Lambda to derive block subtitle, shown below the title */
  readonly subtitle?: NarrowActiveHandleDescriptor;

  /** Lambda returning array of tags for search functionality */
  readonly tags?: BroadActiveHandleDescriptor;

  /**
   * Lambda returning list of upstream blocks this block enriches with its exports,
   * influences dependency graph construction
   */
  readonly enrichmentTargets?: NarrowActiveHandleDescriptor;

  /** Configuration for the output cells */
  readonly outputs: Outputs;

  /** Config code bundle */
  readonly code?: Code;

  /** Feature flags for the block Model and UI code. */
  readonly featureFlags?: BlockCodeFeatureFlags;
};

export type BlockConfigGeneric = BlockConfigV3Generic | BlockConfigV4Generic;

export function extractCodeWithInfo(cfg: BlockConfigGeneric): BlockCodeWithInfo {
  if (cfg.code === undefined) throw new Error("extractCodeWithInfo: No code bundle");
  return {
    code: cfg.code,
    sdkVersion: cfg.sdkVersion,
    featureFlags: cfg.featureFlags,
  };
}
