import type { Branded } from "../../branding";
import { ValueType } from "./spec/spec";

export type PVectorDataInt = Int32Array;
export type PVectorDataLong = BigInt64Array;
export type PVectorDataFloat = Float32Array;
export type PVectorDataDouble = Float64Array;
export type PVectorDataString = (null | string)[];
export type PVectorDataBytes = (null | Uint8Array)[];
export type PVectorDataTyped<DataType extends ValueType> = DataType extends typeof ValueType.Int
  ? PVectorDataInt
  : DataType extends typeof ValueType.Long
    ? PVectorDataLong
    : DataType extends typeof ValueType.Float
      ? PVectorDataFloat
      : DataType extends typeof ValueType.Double
        ? PVectorDataDouble
        : DataType extends typeof ValueType.String
          ? PVectorDataString
          : DataType extends typeof ValueType.Bytes
            ? PVectorDataBytes
            : never;
export type PVectorData = PVectorDataTyped<ValueType>;

export type PTableVectorTyped<DataType extends ValueType> = {
  /** Stored data type */
  readonly type: DataType;

  /** Values for present positions, absent positions have NA values */
  readonly data: PVectorDataTyped<DataType>;

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
};
/** Table column data in comparison to the data stored in a separate PColumn
 * may have some of the values "absent", i.e. as a result of missing record in
 * outer join operation. This information is encoded in {@link absent} field. */
export type PTableVector = PTableVectorTyped<ValueType>;

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

  // Check for legacy magic values to support old desktop versions
  const valueType = vector.type;
  const value = vector.data[row];
  switch (valueType) {
    case ValueType.Int:
      return (value as PVectorDataInt[number]) === -2147483648;
    case ValueType.Long:
      return (value as PVectorDataLong[number]) === -9007199254740991n;
    case ValueType.Float:
      return Number.isNaN(value as PVectorDataFloat[number]);
    case ValueType.Double:
      return Number.isNaN(value as PVectorDataDouble[number]);
    case ValueType.String:
      return (value as PVectorDataString[number]) === null;
    case ValueType.Bytes:
      return (value as PVectorDataBytes[number]) === null;
    default:
      throw Error(`unsupported data type: ${valueType satisfies never}`);
  }
}

export const PTableAbsent = { type: "absent" } as const;
export type PTableAbsent = typeof PTableAbsent;

/** Type guard for absent value */
export function isPTableAbsent(value: unknown): value is PTableAbsent {
  return typeof value === "object" && value !== null && "type" in value && value.type === "absent";
}

export const PTableNA = null;
export type PTableNA = typeof PTableNA;

/** Type guard for NA value */
export function isPTableNA(value: unknown): value is PTableNA {
  return value === PTableNA;
}

export type ValueTypeSupported = Exclude<ValueType, typeof ValueType.Bytes>;

export type PTableValueInt = number;
export type PTableValueLong = number;
export type PTableValueFloat = number;
export type PTableValueDouble = number;
export type PTableValueString = string;
export type PTableValueData<DataType extends ValueTypeSupported> =
  DataType extends typeof ValueType.Int
    ? PTableValueInt
    : DataType extends typeof ValueType.Long
      ? PTableValueLong
      : DataType extends typeof ValueType.Float
        ? PTableValueFloat
        : DataType extends typeof ValueType.Double
          ? PTableValueDouble
          : DataType extends typeof ValueType.String
            ? PTableValueString
            : never;
export type PTableValueDataBranded<DataType extends ValueTypeSupported> = Branded<
  PTableValueData<DataType>,
  DataType
>;
export type PTableValue<
  Absent = PTableAbsent,
  NA = PTableNA,
  DataType extends ValueTypeSupported = ValueTypeSupported,
> = Absent | NA | PTableValueData<DataType>;
export type PTableValueBranded<
  Absent = PTableAbsent,
  NA = PTableNA,
  DataType extends ValueTypeSupported = ValueTypeSupported,
> = Absent | NA | PTableValueDataBranded<DataType>;

export type PTableValueAxis<
  Absent = PTableAbsent,
  DataType extends ValueTypeSupported = ValueTypeSupported,
> = PTableValue<Absent, never, DataType>;

export function isPTableValueAxis<Absent, NA, DataType extends ValueTypeSupported>(
  value: PTableValue<Absent, NA, DataType>,
  isNA: (value: PTableValue<Absent, NA, DataType>) => value is NA,
): value is PTableValueAxis<Absent, DataType>;
export function isPTableValueAxis<Absent, DataType extends ValueTypeSupported>(
  value: PTableValue<Absent, PTableNA, DataType>,
): value is PTableValueAxis<Absent, DataType>;
export function isPTableValueAxis<
  Absent = PTableAbsent,
  NA = PTableNA,
  DataType extends ValueTypeSupported = ValueTypeSupported,
>(
  value: PTableValue<Absent, NA, DataType>,
  isNA?: (value: PTableValue<Absent, NA, DataType>) => value is NA,
): value is PTableValueAxis<Absent, DataType> {
  return !(isNA ? isNA(value) : isPTableNA(value));
}

function pTableValueImpl<
  FillAbsent = PTableAbsent,
  FillNA = PTableNA,
  DataType extends ValueType = ValueTypeSupported,
>(
  column: PTableVectorTyped<ValueType>,
  row: number,
  options?: {
    absent?: FillAbsent;
    na?: FillNA;
    dataType?: DataType;
  },
) {
  const valueType = column.type;
  if (valueType === ValueType.Bytes) {
    throw Error("Bytes not yet supported");
  }

  if (
    options &&
    "dataType" in options &&
    options.dataType !== undefined &&
    options.dataType !== valueType
  ) {
    throw Error(`expected column of type ${options.dataType}, got ${valueType}`);
  }

  if (isValueAbsent(column, row)) {
    return options?.absent !== undefined ? options.absent : PTableAbsent;
  }

  if (isValueNA(column, row)) {
    return options?.na !== undefined ? options.na : PTableNA;
  }

  const value = column.data[row]!;
  switch (valueType) {
    case ValueType.Int:
      return value as PVectorDataInt[number];
    case ValueType.Long:
      return Number(value as PVectorDataLong[number]);
    case ValueType.Float:
      return value as PVectorDataFloat[number];
    case ValueType.Double:
      return value as PVectorDataDouble[number];
    case ValueType.String:
      return (value as PVectorDataString[number])!;
  }
}

/** Read PTableValue from PTable column at specified row */
export function pTableValue<DataType extends ValueType>(
  column: PTableVectorTyped<DataType>,
  row: number,
): DataType extends ValueTypeSupported ? PTableValue<PTableAbsent, PTableNA, DataType> : never;
export function pTableValue<FillAbsent, DataType extends ValueType>(
  column: PTableVectorTyped<DataType>,
  row: number,
  options: {
    absent: FillAbsent;
  },
): DataType extends ValueTypeSupported ? PTableValue<FillAbsent, PTableNA, DataType> : never;
export function pTableValue<FillNA, DataType extends ValueType>(
  column: PTableVectorTyped<DataType>,
  row: number,
  options: {
    na: FillNA;
  },
): DataType extends ValueTypeSupported ? PTableValue<PTableAbsent, FillNA, DataType> : never;
export function pTableValue<FillNA, FillAbsent, DataType extends ValueType>(
  column: PTableVectorTyped<DataType>,
  row: number,
  options: {
    absent: FillAbsent;
    na: FillNA;
  },
): DataType extends ValueTypeSupported ? PTableValue<FillAbsent, FillNA, DataType> : never;
export function pTableValue<FillAbsent, DataType extends ValueTypeSupported>(
  column: PTableVectorTyped<ValueType>,
  row: number,
  options: {
    absent: FillAbsent;
    dataType: DataType;
  },
): PTableValue<FillAbsent, PTableNA>;
export function pTableValue<FillNA, DataType extends ValueTypeSupported>(
  column: PTableVectorTyped<ValueType>,
  row: number,
  options: {
    na: FillNA;
    dataType: DataType;
  },
): PTableValue<PTableAbsent, FillNA, DataType>;
export function pTableValue<FillNA, FillAbsent, DataType extends ValueTypeSupported>(
  column: PTableVectorTyped<ValueType>,
  row: number,
  options: {
    absent: FillAbsent;
    na: FillNA;
    dataType: DataType;
  },
): PTableValue<FillAbsent, FillNA, DataType>;
export function pTableValue<
  FillAbsent = PTableAbsent,
  FillNA = PTableNA,
  DataType extends ValueType = ValueTypeSupported,
>(
  column: PTableVectorTyped<ValueType>,
  row: number,
  options?: {
    absent?: FillAbsent;
    na?: FillNA;
    dataType?: DataType;
  },
) {
  return pTableValueImpl(column, row, options);
}

export function pTableValueBranded<DataType extends ValueType>(
  column: PTableVectorTyped<DataType>,
  row: number,
): DataType extends ValueTypeSupported
  ? PTableValueBranded<PTableAbsent, PTableNA, DataType>
  : never;
export function pTableValueBranded<FillAbsent, DataType extends ValueType>(
  column: PTableVectorTyped<DataType>,
  row: number,
  options: {
    absent: FillAbsent;
  },
): DataType extends ValueTypeSupported ? PTableValueBranded<FillAbsent, PTableNA, DataType> : never;
export function pTableValueBranded<FillNA, DataType extends ValueType>(
  column: PTableVectorTyped<DataType>,
  row: number,
  options: {
    na: FillNA;
  },
): DataType extends ValueTypeSupported ? PTableValueBranded<PTableAbsent, FillNA, DataType> : never;
export function pTableValueBranded<FillNA, FillAbsent, DataType extends ValueType>(
  column: PTableVectorTyped<DataType>,
  row: number,
  options: {
    absent: FillAbsent;
    na: FillNA;
  },
): DataType extends ValueTypeSupported ? PTableValueBranded<FillAbsent, FillNA, DataType> : never;
export function pTableValueBranded<FillAbsent, DataType extends ValueTypeSupported>(
  column: PTableVectorTyped<ValueType>,
  row: number,
  options: {
    absent: FillAbsent;
    dataType: DataType;
  },
): PTableValueBranded<FillAbsent, PTableNA>;
export function pTableValueBranded<FillNA, DataType extends ValueTypeSupported>(
  column: PTableVectorTyped<ValueType>,
  row: number,
  options: {
    na: FillNA;
    dataType: DataType;
  },
): PTableValueBranded<PTableAbsent, FillNA, DataType>;
export function pTableValueBranded<FillNA, FillAbsent, DataType extends ValueTypeSupported>(
  column: PTableVectorTyped<ValueType>,
  row: number,
  options: {
    absent: FillAbsent;
    na: FillNA;
    dataType: DataType;
  },
): PTableValueBranded<FillAbsent, FillNA, DataType>;
export function pTableValueBranded<
  FillAbsent = PTableAbsent,
  FillNA = PTableNA,
  DataType extends ValueType = ValueTypeSupported,
>(
  column: PTableVectorTyped<ValueType>,
  row: number,
  options?: {
    absent?: FillAbsent;
    na?: FillNA;
    dataType?: DataType;
  },
) {
  return pTableValueImpl(column, row, options);
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
