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

  /** Values for present positions */
  readonly data: PVectorDataTyped<DataType>;

  /**
   * Encoded bit array marking some elements of this vector as NA,
   * call {@link bitSet} to read the data.
   * In old desktop versions NA values are encoded as magic values in data array.
   * */
  readonly isNA?: Uint8Array;

  /** @deprecated Always empty. Kept for backwards compatibility with old blocks. */
  readonly absent?: Uint8Array;
};
/** Table column data */
export type PTableVector = PTableVectorTyped<ValueType>;

function isBitSet(bitVector: Uint8Array, offset: number): boolean {
  const chunkIndex = Math.floor(offset / 8);
  const mask = 1 << (7 - (offset % 8));
  return (bitVector[chunkIndex] & mask) > 0;
}

export function isValueNA(vector: PTableVector, row: number): boolean {
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
export type PTableValue<NA = PTableNA, DataType extends ValueTypeSupported = ValueTypeSupported> =
  | NA
  | PTableValueData<DataType>;
export type PTableValueBranded<
  NA = PTableNA,
  DataType extends ValueTypeSupported = ValueTypeSupported,
> = NA | PTableValueDataBranded<DataType>;

export type PTableValueAxis<DataType extends ValueTypeSupported = ValueTypeSupported> =
  PTableValueData<DataType>;

function pTableValueImpl<FillNA = PTableNA, DataType extends ValueType = ValueTypeSupported>(
  column: PTableVectorTyped<ValueType>,
  row: number,
  options?: {
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
): DataType extends ValueTypeSupported ? PTableValue<PTableNA, DataType> : never;
export function pTableValue<FillNA, DataType extends ValueType>(
  column: PTableVectorTyped<DataType>,
  row: number,
  options: {
    na: FillNA;
  },
): DataType extends ValueTypeSupported ? PTableValue<FillNA, DataType> : never;
export function pTableValue<FillNA, DataType extends ValueTypeSupported>(
  column: PTableVectorTyped<ValueType>,
  row: number,
  options: {
    na: FillNA;
    dataType: DataType;
  },
): PTableValue<FillNA, DataType>;
export function pTableValue<FillNA = PTableNA, DataType extends ValueType = ValueTypeSupported>(
  column: PTableVectorTyped<ValueType>,
  row: number,
  options?: {
    na?: FillNA;
    dataType?: DataType;
  },
) {
  return pTableValueImpl(column, row, options);
}

export function pTableValueBranded<DataType extends ValueType>(
  column: PTableVectorTyped<DataType>,
  row: number,
): DataType extends ValueTypeSupported ? PTableValueBranded<PTableNA, DataType> : never;
export function pTableValueBranded<FillNA, DataType extends ValueType>(
  column: PTableVectorTyped<DataType>,
  row: number,
  options: {
    na: FillNA;
  },
): DataType extends ValueTypeSupported ? PTableValueBranded<FillNA, DataType> : never;
export function pTableValueBranded<FillNA, DataType extends ValueTypeSupported>(
  column: PTableVectorTyped<ValueType>,
  row: number,
  options: {
    na: FillNA;
    dataType: DataType;
  },
): PTableValueBranded<FillNA, DataType>;
export function pTableValueBranded<
  FillNA = PTableNA,
  DataType extends ValueType = ValueTypeSupported,
>(
  column: PTableVectorTyped<ValueType>,
  row: number,
  options?: {
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

/** Supported formats for PTable file download. */
export type PTableDownloadFormat = "csv" | "tsv";

/** Compression applied to the written file. */
export type PTableDownloadCompression = "none" | "gzip";

/** Options for downloading PTable data to a file. */
export interface WritePTableToFsOptions {
  path: string;
  format: PTableDownloadFormat;
  columnIndices: number[];
  range?: TableRange;
  chunkSize?: number;
  includeHeader?: boolean;
  bom?: boolean;
  compression?: {
    type: "gzip";
    level?: number;
  };
  signal?: AbortSignal;
}

/** Result of a PTable file download. */
export interface WritePTableToFsResult {
  path: string;
  rowsWritten: number;
  bytesWritten: number;
}
