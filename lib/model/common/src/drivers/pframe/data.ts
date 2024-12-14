import { number } from 'zod';
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

export type NotNAPValueInt = number;
export type NotNAPValueLong = number | bigint; // use bigint only if extra integer precision is needed
export type NotNAPValueFloat = number;
export type NotNAPValueDouble = number;
export type NotNAPValueString = string;

export type NotNAPValue = number | bigint | string;

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

export function ensureNotNAPValue(value: string): string;
export function ensureNotNAPValue(value: number): number;
export function ensureNotNAPValue(value: bigint): bigint;
export function ensureNotNAPValue(value: unknown): NotNAPValue;
export function ensureNotNAPValue(value: unknown): NotNAPValue {
  if (!isNotNAPValue(value)) throw new Error(`Expected not-NA PValue, got ${value}`);
  return value;
}

export function isNotNAPValue(value: unknown, valueType: 'Int'): value is number;
export function isNotNAPValue(value: unknown, valueType: 'Long'): value is number | bigint;
export function isNotNAPValue(value: unknown, valueType: 'Float'): value is number;
export function isNotNAPValue(value: unknown, valueType: 'Double'): value is number;
export function isNotNAPValue(value: unknown, valueType: 'String'): value is string;
export function isNotNAPValue(value: unknown, valueType: ValueType): value is NotNAPValue;
export function isNotNAPValue(value: unknown): value is NotNAPValue;
export function isNotNAPValue(value: unknown, valueType?: ValueType): boolean {
  if (!valueType)
    return (
      typeof value === 'string' ||
      (typeof value === 'number' && isFinite(value)) ||
      typeof value === 'bigint'
    );
  if (isValueNA(value, valueType)) return false;
  switch (valueType) {
    case 'Int':
      return typeof value === 'number';
    case 'Long':
      return typeof value === 'number' || typeof value === 'bigint';
    case 'Float':
      return typeof value === 'number';
    case 'Double':
      return typeof value === 'number';
    case 'String':
      return typeof value === 'string';
    case 'Bytes':
      throw Error(`Bytes not yet supported`);
    default:
      throw Error(`unsupported data type: ${valueType satisfies never}`);
  }
}

export function isPValue(value: unknown, valueType: 'Int'): value is PValueInt;
export function isPValue(value: unknown, valueType: 'Long'): value is PValueLong;
export function isPValue(value: unknown, valueType: 'Float'): value is PValueFloat;
export function isPValue(value: unknown, valueType: 'Double'): value is PValueDouble;
export function isPValue(value: unknown, valueType: 'String'): value is PValueString;
export function isPValue(value: unknown, valueType: ValueType): value is PValue;
export function isPValue(value: unknown): value is PValue;
export function isPValue(value: unknown, valueType?: ValueType): boolean {
  if (!valueType)
    return (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'bigint'
    );
  if (isValueNA(value, valueType)) return true;
  switch (valueType) {
    case 'Int':
      return typeof value === 'number';
    case 'Long':
      return typeof value === 'number' || typeof value === 'bigint';
    case 'Float':
      return typeof value === 'number';
    case 'Double':
      return typeof value === 'number';
    case 'String':
      return typeof value === 'string';
    case 'Bytes':
      throw Error(`Bytes not yet supported`);
    default:
      throw Error(`unsupported data type: ${valueType satisfies never}`);
  }
}

export type PValueLongJsonSafe = { bigint: string };
export type PValueJsonSafe = number | string | null | PValueLongJsonSafe;

/**
 * Converts PValue to value that can be safely serialized by standard JSON.stringify
 * method. Use {@link safeConvertToPValue} to "deserialize" the value back to runtime
 * PValue representation.
 */
export function toJsonSafePValue(value: PValue): PValueJsonSafe {
  if (value === null || typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'bigint') return { bigint: value.toString() };
  throw new Error(`Type ${typeof value} (value ${value}) not yet supported.`);
}

/**
 * Can be used to "deserialize" result of {@link toJsonSafePValue} or to
 * safely cast any unknown value to actual runtime PValue representation.
 */
export function safeConvertToPValue(value: unknown, checkType?: ValueType): PValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint'
  ) {
    if (checkType && !isValueNA(value, checkType) && !isPValue(value, checkType))
      throw new Error(`Unexpected value type, got ${typeof value}, expected ${checkType}`);
    return value;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'bigint' in value &&
    typeof value.bigint === 'string'
  ) {
    if (checkType && checkType !== 'Long')
      throw new Error(`Unexpected value type, got serialized bigint, expected ${checkType}`);

    return BigInt(value.bigint);
  }

  throw new Error(`Unsupported type ${typeof value} (value ${value}).`);
}

export function pValueToStringOrNumber(value: string): string;
export function pValueToStringOrNumber(value: number | bigint): number;
export function pValueToStringOrNumber(value: PValue | PValueJsonSafe): string | number;
export function pValueToStringOrNumber(value: PValue | PValueJsonSafe): string | number {
  value = pValueToStringOrNumberOrNull(value);
  if (value === null) throw new Error('Value is null');
  return value;
}

export function pValueToStringOrNumberOrNull(value: string | null): string;
export function pValueToStringOrNumberOrNull(value: number | bigint | null): number;
export function pValueToStringOrNumberOrNull(
  value: PValue | PValueJsonSafe
): string | number | null;
export function pValueToStringOrNumberOrNull(
  value: PValue | PValueJsonSafe
): string | number | null {
  value = safeConvertToPValue(value);
  if (value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!isFinite(value)) throw new Error(`Value is not finite (${value})`);
    return value;
  }
  if (typeof value === 'bigint') {
    // @TODO add range check
    return Number(value);
  }
  throw new Error(`Unexpected value type: ${typeof value}`);
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

export type PColumnValue = null | number | string;
export type PColumnValuesEntry = {
  key: PColumnValue[];
  val: PColumnValue;
};
export type PColumnValues = PColumnValuesEntry[];

export const PTableAbsent = { type: 'absent' };
export type PTableAbsent = typeof PTableAbsent;
export const PTableNA = null;
export type PTableNA = typeof PTableNA;

/** Decoded PTable value */
export type PTableValue = PTableAbsent | PTableNA | number | string;

/** Type guard for absent PValue */
export function isPTableAbsent(value: PTableValue): value is PTableAbsent {
  return typeof value === 'object' && value !== null && value.type === 'absent';
}

export type AbsentAndNAFill = {
  na?: PTableValue;
  absent?: PTableValue;
};

/** Read PTableValue from PTable column at specified row */
export function pTableValue(
  column: PTableVector,
  row: number,
  fill: AbsentAndNAFill = {}
): PTableValue {
  if (isValueAbsent(column.absent, row))
    return fill.absent === undefined ? PTableAbsent : fill.absent;

  const value = column.data[row];
  const valueType = column.type;
  if (isValueNA(value, valueType)) return fill.na === undefined ? PTableNA : fill.na;

  switch (valueType) {
    case 'Int':
      return value as PVectorDataInt[number];
    case 'Long':
      return Number(value as PVectorDataLong[number]);
    case 'Float':
      return value as PVectorDataFloat[number];
    case 'Double':
      return value as PVectorDataDouble[number];
    case 'String':
      return value as PVectorDataString[number];
    case 'Bytes':
      throw Error(`Bytes not yet supported`);
    default:
      throw Error(`unsupported data type: ${valueType satisfies never}`);
  }
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
