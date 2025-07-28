import type { ValueType } from './spec/spec';

export type PVectorDataInt = Int32Array;
export type PVectorDataLong = BigInt64Array;
export type PVectorDataFloat = Float32Array;
export type PVectorDataDouble = Float64Array;
export type PVectorDataString = (null | string)[];
export type PVectorDataBytes = (null | Uint8Array)[];

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
   * Encoded bit array marking some elements of this vector as NA,
   * call {@link bitSet} to read the data.
   * In old desktop versions NA values are encoded as magic values in data array.
   * */
  readonly isNA?: Uint8Array;

  /**
   * Encoded bit array marking some elements of this vector as absent,
   * call {@link bitSet} to read the data.
   * */
  readonly absent: Uint8Array;
}

function isBitSet(bitVector: Uint8Array, offset: number): boolean {
  const chunkIndex = Math.floor(offset / 8);
  const mask = 1 << (7 - (offset % 8));
  return (bitVector[chunkIndex] & mask) > 0;
}

function isValueAbsent(vector: PTableVector, row: number): boolean {
  return isBitSet(vector.absent, row);
}

function isValueNA(vector: PTableVector, row: number): boolean {
  if (vector.isNA) return isBitSet(vector.isNA, row);

  // Legacy magic values
  const value = vector.data[row];
  const valueType = vector.type;
  switch (valueType) {
    case 'Int':
      return (value as PVectorDataInt[number]) === -2147483648;
    case 'Long':
      return (value as PVectorDataLong[number]) === -9007199254740991n;
    case 'Float':
      return Number.isNaN((value as PVectorDataFloat[number]));
    case 'Double':
      return Number.isNaN((value as PVectorDataDouble[number]));
    case 'String':
      return (value as PVectorDataString[number]) === null;
    case 'Bytes':
      return (value as PVectorDataBytes[number]) === null;
    default:
      throw Error(`unsupported data type: ${valueType satisfies never}`);
  }
}

export const PTableAbsent = { type: 'absent' } as const;
export type PTableAbsent = typeof PTableAbsent;

/** Type guard for absent value */
export function isPTableAbsent(value: unknown): value is PTableAbsent {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'absent';
}

export const PTableNA = null;
export type PTableNA = typeof PTableNA;

/** Type guard for NA value */
export function isPTableNA(value: unknown): value is PTableNA {
  return value === PTableNA;
}

export type PTableValueData = number | string;
export type PTableValueAxis<FillAbsent = PTableAbsent> = FillAbsent | PTableValueData;
export type PTableValue<FillAbsent = PTableAbsent, FillNA = PTableNA> = FillNA | PTableValueAxis<FillAbsent>;

export function isPTableValueAxis<FillAbsent = PTableAbsent, FillNA = PTableNA>(
  value: PTableValue<FillAbsent, FillNA>,
  isNA: (value: PTableValue<FillAbsent, FillNA>) => value is FillNA,
): value is PTableValueAxis<FillAbsent>;
export function isPTableValueAxis<FillAbsent = PTableAbsent>(
  value: PTableValue<FillAbsent, PTableNA>,
): value is PTableValueAxis<FillAbsent>;
export function isPTableValueAxis<FillAbsent = PTableAbsent, FillNA = PTableNA>(
  value: PTableValue<FillAbsent, FillNA>,
  isNA?: (value: PTableValue<FillAbsent, FillNA>) => value is FillNA,
): value is PTableValueAxis<FillAbsent> {
  return !(isNA ? isNA(value) : isPTableNA(value));
}

/** Read PTableValue from PTable column at specified row */
export function pTableValue(
  column: PTableVector,
  row: number,
): PTableValue;
export function pTableValue<FillAbsent>(
  column: PTableVector,
  row: number,
  fill: {
    absent: FillAbsent;
  }
): PTableValue<FillAbsent, PTableNA>;
export function pTableValue<FillNA>(
  column: PTableVector,
  row: number,
  fill: {
    na: FillNA;
  }
): PTableValue<PTableAbsent, FillNA>;
export function pTableValue<FillNA, FillAbsent>(
  column: PTableVector,
  row: number,
  fill: {
    absent: FillAbsent;
    na: FillNA;
  }
): PTableValue<FillAbsent, FillNA>;
export function pTableValue<FillAbsent = PTableAbsent, FillNA = PTableNA>(
  column: PTableVector,
  row: number,
  fill?: {
    absent?: FillAbsent;
    na?: FillNA;
  },
) {
  if (isValueAbsent(column, row)) {
    if (fill?.absent !== undefined) return fill.absent;
    return PTableAbsent;
  }

  if (isValueNA(column, row)) {
    if (fill?.na !== undefined) return fill.na;
    return PTableNA;
  }

  const value = column.data[row];
  const valueType = column.type;
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
      return (value as PVectorDataString[number])!;
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
