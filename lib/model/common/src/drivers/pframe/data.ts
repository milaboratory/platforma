import { ValueType } from './spec';

export const PValueInt32NA = -2147483648;
export const PValueInt64NA = -9007199254740991n;
export const PValueFloat32NA = NaN;
export const PValueFloat64NA = NaN;
export const PValueStringNA = null;
export const PValueBytesNA = null;

export type PVectorDataInt32 = Int32Array
export type PVectorDataInt64 = BigInt64Array;
export type PVectorDataFloat32 = Float32Array;
export type PVectorDataFloat64 = Float64Array;
export type PVectorDataString = (string | null)[];
export type PVectorDataBytes = (Uint8Array | null)[];

export type PVectorData =
  | PVectorDataInt32
  | PVectorDataInt64
  | PVectorDataFloat32
  | PVectorDataFloat64
  | PVectorDataString
  | PVectorDataBytes

/** Table column data in comparison to the data stored in a separate PColumn
 * may have some of the values "absent", i.e. as a result of missing record in
 * outer join operation. This information is encoded in {@link absent} field. */
export interface PTableVector {
  /** Stored data type */
  readonly type: ValueType;

  /** Values for present positions, absent positions have NA values */
  readonly data: PVectorData;

  /**
   * Encoded bit array marking some elements of this vector as absent,
   *
   * Encoding described here:
   * https://gist.github.com/vadimpiven/45f8279d84f47b9857df845126694c39
   * */
  readonly absent: Uint8Array;
}

/** Used in requests to partially retrieve table's data */
export type TableRange = {
  /** Index of the first record to retrieve */
  readonly offset: number;

  /** Block length */
  readonly length: number;
}
