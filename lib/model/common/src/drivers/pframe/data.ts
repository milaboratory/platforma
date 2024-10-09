import { ValueType } from './spec';

export const PValueIntNA = -2147483648;
export const PValueLongNA = -9007199254740991n;
export const PValueFloatNA = NaN;
export const PValueDoubleNA = NaN;
export const PValueStringNA = null;
export const PValueBytesNA = null;

export type PValueInt = number;
export type PValueLong = number | bigint; // use bigint only if extra integer precision is needed
export type PValueFloat = number;
export type PValueDouble = number;
export type PValueString = string | null;
export type PValueBytes = Uint8Array | null;

export type PValue =
  | PValueInt
  | PValueLong
  | PValueFloat
  | PValueDouble
  | PValueString
  | PValueBytes;

export function isValueNA(value: unknown, valueType: ValueType): boolean {
  switch (valueType) {
    case 'Int':
      return value === PValueIntNA;
    case 'Long':
      return value === Number(PValueLongNA) || value === PValueLongNA;
    case 'Float':
      return value === PValueFloatNA;
    case 'Double':
      return value === PValueDoubleNA;
    case 'String':
      return value === PValueStringNA;
    case 'Bytes':
      return value === PValueBytesNA;
    default:
      throw Error(`unsupported data type: ${valueType satisfies never}`);
  }
}

export type PVectorDataInt = Int32Array;
export type PVectorDataLong = BigInt64Array;
export type PVectorDataFloat = Float32Array;
export type PVectorDataDouble = Float64Array;
export type PVectorDataString = PValueString[];
export type PVectorDataBytes = PValueBytes[];

export type PVectorData =
  | PVectorDataInt
  | PVectorDataLong
  | PVectorDataFloat
  | PVectorDataDouble
  | PVectorDataString
  | PVectorDataBytes;

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
   * call {@link isValueAbsent} to read the data.
   * */
  readonly absent: Uint8Array;
}

/** Used to read bit array with value absence information */
export function isValueAbsent(absent: Uint8Array, index: number): boolean {
  const chunkIndex = Math.floor(index / 8);
  const mask = 1 << (7 - (index % 8));
  return (absent[chunkIndex] & mask) > 0;
}

/** Used in requests to partially retrieve table's data */
export type TableRange = {
  /** Index of the first record to retrieve */
  readonly offset: number;

  /** Block length */
  readonly length: number;
};

/** Unified information about table shape */
export type PTableShape = {
  /** Number of unified table columns, including all axes and PColumn values */
  columns: number;

  /** Number of rows */
  rows: number;
};
