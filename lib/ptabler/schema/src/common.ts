/**
 * Defines the supported Polars primitive data types for schema definition.
 *
 * The following are aliases for convenience:
 * - 'Int': maps to 'Int32'
 * - 'Long': maps to 'Int64'
 * - 'Float': maps to 'Float32'
 * - 'Double': maps to 'Float64'
 */
export type DataType =
  | 'Int8'
  | 'Int16'
  | 'Int32'
  | 'Int64'
  | 'UInt8'
  | 'UInt16'
  | 'UInt32'
  | 'UInt64'
  | 'Float32'
  | 'Float64'
  | 'Boolean'
  | 'String'
  | 'Date'
  | 'Datetime'
  | 'Time'
  // Aliases
  | 'Int'
  | 'Long'
  | 'Float'
  | 'Double';
