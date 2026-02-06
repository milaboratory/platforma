import type { PTableDef, PObjectId } from "@milaboratories/pl-model-common";

/**
 * Represents the configuration for a step that reads data from a PFrame directory into the tablespace.
 * Creates a lazy table from the provided PFrame using polars-pf.
 */
export interface ReadFrameStep {
  /** The type of the step, which is always 'read_frame' for this operation. */
  type: "read_frame";
  /** The name assigned to the loaded DataFrame in the tablespace. */
  name: string;
  /** Request to create the table from the PFrame. */
  request: PTableDef<PObjectId>;
  /**
   * Translation from PFrame column ids (file names) into Polars column names
   * (which will be referenced via pt.col(...)).
   */
  translation: Record<string, string>;
  /**
   * Polars parallel strategy to use for the read. Defaults to 'auto'.
   * @see Parallel option in [scan_parquet](https://docs.pola.rs/api/python/stable/reference/api/polars.scan_parquet.html#polars.scan_parquet) documentation.
   */
  parallel?: "auto" | "columns" | "row_groups" | "prefiltered" | "none";
  /** Whether to use low memory mode for the polars read. Defaults to false. */
  low_memory?: boolean;
}
