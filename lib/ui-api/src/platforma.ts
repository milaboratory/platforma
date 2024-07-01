import { BlockApi } from './block_api';
import { BlobDriver, LogsDriver, LsDriver, ValueOrErrors } from '@milaboratory/sdk-model';
import { BlockConfig } from './builder';

/** Defines all methods to interact with the platform environment from within a block UI. */
export interface Platforma<
  Args = unknown,
  Outputs extends Record<string, ValueOrErrors<unknown>> = Record<string, ValueOrErrors<unknown>>,
  UiState = unknown>
  extends BlockApi<Args, Outputs, UiState> {
  /** Driver allowing to retrieve blob data */
  blobDriver: BlobDriver;

  /** Driver allowing to retrieve blob data */
  logDriver: LogsDriver;

  /**
   * Driver allowing to list local and remote files that current user has
   * access to.
   *
   * Along with file listing this driver provides import handles for listed
   * files, that can be communicated to the workflow via block arguments,
   * converted into blobs using standard workflow library functions.
   * */
  lsDriver: LsDriver;
}

export type InferOutputsType<Pl extends Platforma> =
  Pl extends Platforma<unknown, infer Outputs> ? Outputs : never;

export type PlatformaFactory = (config: BlockConfig) => Platforma;
