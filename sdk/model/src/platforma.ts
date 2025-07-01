import type { BlockApi, BlockApiV2 } from './block_api';
import type { BlockOutputsBase, BlockState, DriverKit, ValueOrErrors } from '@milaboratories/pl-model-common';
import type { SdkInfo } from './sdk_info';
import type { BlockStatePatch } from './block_state_patch';

/** Defines all methods to interact with the platform environment from within a block UI. */
export interface PlatformaV1<
  Args = unknown,
  Outputs extends Record<string, ValueOrErrors<unknown>> = Record<string, ValueOrErrors<unknown>>,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
> extends BlockApi<Args, Outputs, UiState, Href>,
  DriverKit {
  /** Information about SDK version current platforma environment was compiled with. */
  readonly sdkInfo: SdkInfo;
}

export interface PlatformaV2<
  Args = unknown,
  Outputs extends Record<string, ValueOrErrors<unknown>> = Record<string, ValueOrErrors<unknown>>,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
> extends BlockApiV2<Args, Outputs, UiState, Href>,
  DriverKit {
  /** Information about SDK version current platforma environment was compiled with. */
  readonly sdkInfo: SdkInfo;
}

export interface Platforma<
  Args = unknown,
  Outputs extends Record<string, ValueOrErrors<unknown>> = Record<string, ValueOrErrors<unknown>>,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
> extends PlatformaV2<Args, Outputs, UiState, Href> {
  /** Information about SDK version current platforma environment was compiled with. */
  readonly sdkInfo: SdkInfo;
}

export type InferArgsType<Pl extends Platforma> = Pl extends Platforma<infer Args> ? Args : never;

export type InferOutputsType<Pl extends Platforma> =
  Pl extends Platforma<unknown, infer Outputs> ? Outputs : never;

export type InferUiState<Pl extends Platforma> =
  Pl extends Platforma<unknown, Record<string, ValueOrErrors<unknown>>, infer UiState>
    ? UiState
    : never;

export type InferHrefType<Pl extends Platforma> =
  Pl extends Platforma<unknown, BlockOutputsBase, unknown, infer Href> ? Href : never;

export type PlatformaFactory = (config: { sdkVersion: string }) => Platforma;

export type InferBlockState<Pl extends Platforma> = BlockState<
  InferArgsType<Pl>,
  InferOutputsType<Pl>,
  InferUiState<Pl>,
  InferHrefType<Pl>
>;

export type InferBlockStatePatch<Pl extends Platforma> = BlockStatePatch<
  InferArgsType<Pl>,
  InferOutputsType<Pl>,
  InferUiState<Pl>,
  InferHrefType<Pl>
>;
