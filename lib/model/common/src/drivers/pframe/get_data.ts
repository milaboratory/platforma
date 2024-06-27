import { AxisSpec, ColumnIdAndSpec } from './spec';

export interface DataVector {
  data:
    | Int32Array // `-2147483648` is NaN marker
    | BigInt64Array // `BigInt(-9007199254740991)` is NaN marker
    | Float32Array // `NaN` is NaN marker
    | Float64Array // `NaN` is NaN marker
    | string[] // `null` is NaN marker
    | Uint8Array[]; // `null` is NaN marker

  /**
   * Encoded bit array marking some elements of this vector as absent,
   *
   * Encoding described here:
   * https://gist.github.com/vadimpiven/45f8279d84f47b9857df845126694c39
   * */
  absent: Uint8Array;
}

export interface TableData {
  type: 'tableFormatJS';
  axes: {
    src: AxisSpec;

  }[];
  columns: {
    src: ColumnIdAndSpec;
    data:
      | Int32Array // `-2147483648` is NaN marker
      | BigInt64Array // `BigInt(-9007199254740991)` is NaN marker
      | Float32Array // `NaN` is NaN marker
      | Float64Array // `NaN` is NaN marker
      | string[] // `null` is NaN marker
      | Uint8Array[]; // `null` is NaN marker
    absent: Uint8Array; // https://gist.github.com/vadimpiven/45f8279d84f47b9857df845126694c39
  }[];
}
