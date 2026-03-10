/**
 * Axes values are used as unique key to access the column data,
 * so they cannot be floating point numbers.
 */
export type AxisType = "Int" | "Long" | "String";

/** PColumn values could be of any type supported by PFrames. */
export type ColumnType = "Int" | "Long" | "Float" | "Double" | "String";

export interface AxisMapping {
  /** The name of the column in the input table. */
  column: string;
  /**
   * The type of the axis to be created.
   * A cast would be performed if the type of the column in the input table is different.
   * Warning: cast failure will result in an error.
   */
  type: AxisType;
}

export interface ColumnMapping {
  /** The name of the column in the input table. */
  column: string;
  /**
   * The value type of the PColumn to be created.
   * A cast would be performed if the type of the column in the input table is different.
   * Warning: cast failure will produce null values in the PColumn.
   */
  type: ColumnType;
}

/** Defines a step that creates a PFrame from the lazy table. */
export interface WriteFrameStep {
  /** The type identifier for this step. */
  type: "write_frame";

  /** The name of the table from the tablespace which will be written. */
  inputTable: string;

  /**
   * The name of the frame to be created.
   * A folder with this name will be created in the working directory.
   * The folder will contain the .datainfo and .parquet files representing the frame's PColumns.
   */
  frameName: string;

  /**
   * Axes specs, the order of axes in PColumns will match the order of axes in this array.
   * Each column in the input table could be used as axis or PColumn only once.
   * Warning: rows with null values in axes columns of input table will be discarded.
   */
  axes: AxisMapping[];

  /**
   * PColumns specs.
   * Each column in the input table could be used as axis or PColumn only once.
   */
  columns: ColumnMapping[];

  /**
   * Partition key length, specifies the number of axes to be split into metadata partition key.
   * Default: 0, which means no partitioning.
   * Must be strictly less than the number of axes.
   */
  partitionKeyLength: number;
}
