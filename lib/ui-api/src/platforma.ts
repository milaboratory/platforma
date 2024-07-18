import { BlockApi } from './block_api';
import { BlockOutputsBase, DriverKit, ValueOrErrors } from '@milaboratory/sdk-model';
import { BlockConfig } from './builder';
import { SdkInfo } from './sdk_info';

/** Defines all methods to interact with the platform environment from within a block UI. */
export interface Platforma<
  Args = unknown,
  Outputs extends Record<string, ValueOrErrors<unknown>> = Record<string, ValueOrErrors<unknown>>,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`
> extends BlockApi<Args, Outputs, UiState, Href>,
    DriverKit {
  /** Information about SDK version current platforma environment was compiled with. */
  readonly sdkInfo: SdkInfo;
}

export type InferOutputsType<Pl extends Platforma> =
  Pl extends Platforma<unknown, infer Outputs> ? Outputs : never;

export type InferHrefType<Pl extends Platforma> =
  Pl extends Platforma<unknown, BlockOutputsBase, unknown, infer Href> ? Href : never;

export type PlatformaFactory = (config: BlockConfig) => Platforma;
