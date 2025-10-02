import type { PTableDef, PObjectId } from '@milaboratories/pl-model-common';

/**
 * Represents the configuration for a step that reads data from a PFrame directory into the tablespace.
 * Creates a lazy table from the provided PFrame using polars-pf.
 */
export interface ReadFrameStep {
  /** The type of the step, which is always 'read_frame' for this operation. */
  type: 'read_frame';
  /** The name assigned to the loaded DataFrame in the tablespace. */
  name: string;
  /** Request to create the table from the PFrame. */
  request: PTableDef<PObjectId>;
  /** Polars parallel strategy to use for the read. Defaults to 'auto'. */
  parallel?: 'auto' | 'columns' | 'row_groups' | 'prefiltered' | 'none';
  /** Whether to use low memory mode for the polars read. Defaults to false. */
  low_memory?: boolean;
}
