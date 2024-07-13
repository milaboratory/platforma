import { BlockApi } from './block_api';
import {
  BlobDriver,
  DriverKit,
  LogsDriver,
  LsDriver,
  ValueOrErrors
} from '@milaboratory/sdk-model';
import { BlockConfig } from './builder';

/** Defines all methods to interact with the platform environment from within a block UI. */
export interface Platforma<
  Args = unknown,
  Outputs extends Record<string, ValueOrErrors<unknown>> = Record<string, ValueOrErrors<unknown>>,
  UiState = unknown
> extends BlockApi<Args, Outputs, UiState>,
    DriverKit {}

export type InferOutputsType<Pl extends Platforma> =
  Pl extends Platforma<unknown, infer Outputs> ? Outputs : never;

export type PlatformaFactory = (config: BlockConfig) => Platforma;
