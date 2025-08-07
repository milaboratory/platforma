// copy from https://github.com/milaboratory/pframes/blob/main/packages/conv/docs/import_csv.d.ts

/** PFrame axes and columns within them may store one of these types */
export type ValueType = 'Int' | 'Long' | 'Float' | 'Double' | 'String';

export type PreProcessStep =
  | {
      /**
       * Perform JS String.prototype.replace() operation,
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace
       */
      type: 'regexpReplace';

      /**
       * String representing ECMAScript RegEx with at least one capturing group.
       * If you need to reorder capturing groups - use RegExp matching the whole string
       * (must start with string begin anchor ^, end with string end anchor $).
       * @see https://regexr.com/
       */
      pattern: string;

      /**
       * Replacement pattern used to construct result string from captured groups,
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#specifying_a_string_as_the_replacement
       * @see https://tc39.es/ecma262/#sec-getsubstitution
       * `srell::regex_replace` is used under the hood, @see https://www.akenotsuki.com/misc/srell/en/
       * Empty string as result would become NA.
       */
      replacement: string;
    }
  | {
      /**
       * Simplified 'regexpReplace' with replacement set to $1.
       * This means that string is replaced with first capture group value.
       * Example 1:
       * - input: 123___abc.xlsx
       * - pattern: \d+___([a-z]+).xlsx
       * - result: abc
       * Example 2:
       * - input: 123___abc.xlsx
       * - pattern: (\d+)___([a-z]+).xlsx
       * - result: 123
       * Example 3:
       * - input: 123___abc.xlsx
       * - pattern: ((\d+)___([a-z]+)).xlsx
       * - result: 123___abc
       */
      type: 'regexpExtract';

      /**
       * String representing ECMAScript RegEx with at least one capturing group.
       * RegEx must match the entire string, this would be enforced even when ^ and $ are skipped.
       * If there are no matches - value would be replaced with empty string.
       * Wrong example:
       * - input: 123___abc.xlsx
       * - pattern: (\d+___[a-z]+)
       * - result: empty string, as .xlsx part is missing in pattern, so pattern was not matched
       * Correct example:
       * - input: 123___abc.xlsx
       * - pattern: (\d+___[a-z]+).xlsx
       * - result: 123___abc
       */
      pattern: string;
    };

export interface AxisSpecParam {
  /** Column label from XSV */
  column: string;

  /**
   * Regular expression, if matched - whole row would be skipped
   * Performed just after reading XSV before any other operations
   * @default no filter
   */
  filterOutRegex?: string;

  /** Pre-processing operations to be performed just after filtering out rows. */
  preProcess?: PreProcessStep[];

  /**
   * Regular expression, if matched - value is considered to be N/A
   * @default Int, Long - check that the value is a valid integer number;
   *          Float, Double - check that the value is a valid float number;
   *          String - accept anything
   */
  naRegex?: string;

  /**
   * Should the N/A values (or empty rows) be allowed. When set to false,
   * an error would be thrown on N/A value (or empty row) encountering
   * @default false
   */
  allowNA?: boolean;

  /** Specification of an individual axis */
  spec: {
    /**
     * Name of the axis to be used in spec
     * @default column label
     */
    name?: string;

    /** Type of axis values */
    type: ValueType;

    /**
     * Auxiliary information to the axis name, type and parents to form a unique identifier
     * @default empty
     */
    domain?: Record<string, string>;

    /**
     * Any additional information attached to the axis that does not affect its identifier
     * @default "pl7.app/label": Column label from XSV
     */
    annotations?: Record<string, string>;

    /**
     * A list of zero-based indices of parent axes in the overall axes specification
     * @default empty
     */
    parentAxes?: number[];
  };
}

export interface ColumnSpecParam {
  /** Column label from XSV */
  column: string;

  /**
   * Regular expression, if matched - whole row would be skipped
   * Performed just after reading XSV before any other operations
   * @default no filter
   */
  filterOutRegex?: string;

  /** Pre-processing operations to be performed just after filtering out rows. */
  preProcess?: PreProcessStep[];

  /**
   * Regular expression, if matched - value is considered to be N/A
   * @default Int, Long - check that the value is a valid integer number;
   *          Float, Double - check that the value is a valid float number;
   *          String - accept anything
   */
  naRegex?: string;

  /**
   * Should the N/A values (or empty rows) be allowed. When set to false,
   * an error would be thrown on N/A value (or empty row) encountering
   * @default true
   */
  allowNA?: boolean;

  /**
   * ID of the column to be used in spec and as a saved filename
   * @default column label with all special characters replaced with '_'
   */
  id?: string;

  /** Specification of column */
  spec: {
    /**
     * Name of the column to be used in spec
     * @default column label
     */
    name?: string;

    /** Type of column values */
    valueType: ValueType;

    /**
     * Auxiliary information to the column name, type and parents to form a unique identifier
     * @default empty
     */
    domain?: Record<string, string>;

    /**
     * Any additional information attached to the column that does not affect its identifier
     * @default "pl7.app/label": Column label from XSV
     */
    annotations?: Record<string, string>;

    /**
     * A list of zero-based indices of parent axes in the overall axes specification
     * @default empty
     */
    parentAxes?: number[];
  };
}

export interface IndexParam {
  /** Name of the axis */
  name: string;

  /**
   * Auxiliary information to the axis name, type and parents to form a unique identifier
   * @default empty
   */
  domain?: Record<string, string>;

  /**
   * Any additional information attached to the axis that does not affect its identifier
   * @default "pl7.app/label": Column label from XSV
   */
  annotations?: Record<string, string>;

  /**
   * A list of zero-based indices of parent axes in the overall axes specification
   * @default empty
   */
  parentAxes?: number[];
}

export interface Spec {
  /**
   * Single ASCII character to be used as separator
   * @default ',' for .csv, '\t' for .tsv
   */
  separator?: string;

  /**
   * Single ASCII character, if XSV row begins with this character - the row would be skipped
   * @default: undefined
   */
  commentLinePrefix?: string;

  /**
   * Should empty lines be skipped
   * @default false
   */
  skipEmptyLines?: boolean;

  /**
   * Resolve duplicates by adding sequential suffixes to column labels
   * @default true
   */
  allowColumnLabelDuplicates?: boolean;

  /**
   * XSV columns to use as PColumn axes
   * Provided axes ordering would be preserved in the resulting column specifications
   */
  axes: AxisSpecParam[];

  /**
   * Axis of type Long with XSV row numbers (would be the last one)
   * @default do not create axis with indexes
   */
  index?: IndexParam;

  /** XSV columns to use as PColumn values, each exported individually */
  columns: ColumnSpecParam[];

  /**
   * When columns spec is provided but no such column was found in XSV - create such column filled with NA values
   * instead of failing.
   * @default false
   */
  allowArtificialColumns?: boolean;

  /**
   * Prefix all column names with given string
   * @default names would be preserved
   */
  columnNamePrefix?: string;

  /**
   * Columns would be stored using specified format
   * @default Binary
   */
  storageFormat?: 'Binary' | 'Json';

  /**
   * Partitioning key length
   * @default 0 (single partition)
   */
  partitionKeyLength?: number;
}