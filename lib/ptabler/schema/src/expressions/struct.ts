import type { DataType } from '../common';
import type { Expression } from './base';

/**
 * Represents a struct field access operation.
 * This operation retrieves a single field from a struct (nested data structure).
 *
 * Uses native Polars struct.field() functionality when possible for optimal performance,
 * but falls back to Python UDF (map_elements) when dtype casting or default values
 * are specified, trading performance for robust handling of missing fields and null structs.
 *
 * When fields is an array, the operation performs recursive field access,
 * where each element in the array represents a level in the nested structure.
 */
export interface StructFieldExpression {
  /** The type of operation, always 'struct_field'. */
  type: 'struct_field';
  /** The struct expression to extract fields from. */
  struct: Expression;
  /**
   * The field name(s) to extract from the struct.
   * - If a string, extracts a single field from the struct.
   * - If an array, performs recursive field access where each element represents a level in the nested structure.
   */
  fields: string | string[];
  /**
   * Optional expected data type for the returned value.
   * This can be used for type validation or casting of the extracted field.
   */
  dtype?: DataType;
  /**
   * Optional default value to return if the field is not found or is null.
   * If not provided and the field is missing, the operation returns null.
   * Only constant scalar values are supported.
   */
  default?: string | number | boolean | null;
}
