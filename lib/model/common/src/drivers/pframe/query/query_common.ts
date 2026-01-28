import type { PObjectId } from '../../../pool';
import type { JsonDataInfo } from '../data_info';
import type { AxisValueType, ColumnValueType } from '../spec';

// ============ Type Spec Types ============

/**
 * Specification of column/frame structure.
 *
 * Defines the shape of data: which axes (dimensions) the data has
 * and what value types are stored in columns.
 */
export type TypeSpec = {
  /** List of axis value types defining the dimensions of the data */
  axes: AxisValueType[];
  /** List of column value types defining the data stored */
  columns: ColumnValueType[];
};

// ============ Operand Types ============

/**
 * Unary mathematical operation kinds.
 *
 * These operations take a single numeric input and produce a numeric output.
 * **Null handling**: If input is null, result is null.
 *
 * Operations:
 * - `abs` - Absolute value: |x|
 * - `ceil` - Round up to nearest integer
 * - `floor` - Round down to nearest integer
 * - `round` - Round to nearest integer (banker's rounding)
 * - `sqrt` - Square root (returns NaN for negative inputs)
 * - `log` - Natural logarithm (ln)
 * - `log2` - Base-2 logarithm
 * - `log10` - Base-10 logarithm
 * - `exp` - Exponential function (e^x)
 * - `negate` - Negation (-x)
 */
export type NumericUnaryOperand = 'abs' | 'ceil' | 'floor' | 'round' | 'sqrt' | 'log' | 'log2' | 'log10' | 'exp' | 'negate';

/**
 * Binary mathematical operation kinds.
 *
 * These operations take two numeric inputs and produce a numeric result.
 * **Null handling**: If either operand is null, result is null.
 *
 * Operations:
 * - `add` - Addition: left + right
 * - `sub` - Subtraction: left - right
 * - `mul` - Multiplication: left * right
 * - `div` - Division: left / right (division by zero returns Infinity or NaN)
 * - `mod` - Modulo: left % right
 */
export type NumericBinaryOperand = 'add' | 'sub' | 'mul' | 'div' | 'mod';

/**
 * Numeric comparison operation kinds.
 *
 * These operations compare two numeric inputs and produce a boolean result.
 * **Null handling**: If either operand is null, result is null.
 *
 * Operations:
 * - `eq` - Equal: left == right
 * - `ne` - Not equal: left != right
 * - `lt` - Less than: left < right
 * - `le` - Less or equal: left <= right
 * - `gt` - Greater than: left > right
 * - `ge` - Greater or equal: left >= right
 */
export type NumericComparisonOperand = 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge';

// ============ Geometric Types ============

/**
 * 2D point coordinates.
 *
 * Used for geometric operations like point-in-polygon tests.
 * Common use case: flow cytometry gating where points are tested
 * against user-defined polygon regions.
 */
export type Point2D = {
  x: number;
  y: number;
};

// ============ Constant Expression ============

/**
 * Constant value expression.
 *
 * Represents a literal constant value in an expression tree.
 * The value can be a string, number, or boolean.
 *
 * @example
 * // Constant number
 * { type: 'constant', value: 42 }
 *
 * // Constant string
 * { type: 'constant', value: 'hello' }
 *
 * // Constant boolean
 * { type: 'constant', value: true }
 */
export type ExprConstant = {
  type: 'constant';
  value: string | number | boolean;
};

// ============ Generic Expression Interfaces ============
// I = expression type (recursive), S = selector type

/**
 * Unary mathematical expression.
 *
 * Applies a unary mathematical function to a single input expression.
 * **Input**: One expression that evaluates to a numeric value.
 * **Output**: Numeric value.
 * **Null handling**: If input is null, result is null.
 *
 * @template I - The expression type (for recursion)
 *
 * @example
 * // Absolute value of column "value"
 * { type: 'unaryMath', operand: 'abs', input: columnRef }
 *
 * // Natural log of expression
 * { type: 'unaryMath', operand: 'log', input: someExpr }
 *
 * @see NumericUnaryOperand for available operations
 */
export interface ExprNumericUnary<I> {
  type: 'numericUnary';
  /** The mathematical operation to apply */
  operand: NumericUnaryOperand;
  /** Input expression (must evaluate to numeric) */
  input: I;
}

/**
 * Binary mathematical expression.
 *
 * Applies a binary arithmetic operation to two input expressions.
 * **Input**: Two expressions that evaluate to numeric values.
 * **Output**: Numeric value.
 * **Null handling**: If either operand is null, result is null.
 *
 * @template I - The expression type (for recursion)
 *
 * @example
 * // Addition: col_a + col_b
 * { type: 'binaryMath', operand: 'add', left: colA, right: colB }
 *
 * // Division: col_a / 2
 * { type: 'binaryMath', operand: 'div', left: colA, right: { type: 'constant', value: 2 } }
 *
 * @see NumericBinaryOperand for available operations
 */
export interface ExprNumericBinary<I> {
  type: 'numericBinary';
  /** The arithmetic operation to apply */
  operand: NumericBinaryOperand;
  /** Left operand expression */
  left: I;
  /** Right operand expression */
  right: I;
}

/**
 * Numeric comparison expression.
 *
 * Compares two numeric expressions and produces a boolean result.
 * **Input**: Two expressions that evaluate to numeric values.
 * **Output**: Boolean.
 * **Null handling**: If either operand is null, result is null.
 *
 * @template I - The expression type (for recursion)
 *
 * @example
 * // Greater than: col_a > 10
 * { type: 'numericComparison', operand: 'gt', left: colA, right: { type: 'constant', value: 10 } }
 *
 * // Equality: col_a == col_b
 * { type: 'numericComparison', operand: 'eq', left: colA, right: colB }
 *
 * // Range check (combine with logical AND): 0 <= x && x < 100
 * // { type: 'logical', operand: 'and', input: [
 * //   { type: 'numericComparison', operand: 'ge', left: colX, right: { type: 'constant', value: 0 } },
 * //   { type: 'numericComparison', operand: 'lt', left: colX, right: { type: 'constant', value: 100 } }
 * // ]}
 *
 * @see NumericComparisonOperand for available operations
 */
export interface ExprNumericComparison<I> {
  type: 'numericComparison';
  /** The comparison operation to apply */
  operand: NumericComparisonOperand;
  /** Left operand expression */
  left: I;
  /** Right operand expression */
  right: I;
}

/**
 * String equality check.
 *
 * Compares input string to a reference value.
 * **Input**: Expression evaluating to a string.
 * **Output**: Boolean.
 * **Null handling**: Returns false if input is null.
 *
 * @template I - The expression type (for recursion)
 *
 * @example
 * // Check if name equals "John" (case-sensitive)
 * // Matches only: "John"
 * { type: 'stringEquals', input: nameColumn, value: 'John' }
 *
 * @example
 * // Check if name equals "John" (case-insensitive)
 * // Matches: "john", "JOHN", "John", "jOhN"
 * { type: 'stringEquals', input: nameColumn, value: 'John', caseInsensitive: true }
 */
export interface ExprStringEquals<I> {
  type: 'stringEquals';
  /** Input expression (must evaluate to string) */
  input: I;
  /** Reference string to compare against */
  value: string;
  /** If true, comparison ignores case */
  caseInsensitive: boolean;
}

/**
 * Regular expression match check.
 *
 * Tests if input string matches a regular expression pattern.
 * **Input**: Expression evaluating to a string.
 * **Output**: Boolean (true if pattern matches).
 * **Null handling**: Returns false if input is null.
 *
 * @template I - The expression type (for recursion)
 *
 * @example
 * // Check if value matches email pattern
 * { type: 'stringRegex', input: emailColumn, value: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$' }
 *
 * // Check if starts with "prefix"
 * { type: 'stringRegex', input: valueColumn, value: '^prefix' }
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions | MDN Regular Expressions Guide}
 */
export interface ExprStringRegex<I> {
  type: 'stringRegex';
  /** Input expression (must evaluate to string) */
  input: I;
  /** Regular expression pattern */
  value: string;
}

/**
 * Substring containment check.
 *
 * Tests if input string contains a specified substring.
 * **Input**: Expression evaluating to a string.
 * **Output**: Boolean (true if substring is found).
 * **Null handling**: Returns false if input is null.
 *
 * @template I - The expression type (for recursion)
 *
 * @example
 * // Case-sensitive contains
 * { type: 'stringContains', input: descColumn, value: 'error', caseInsensitive: false }
 *
 * // Case-insensitive contains
 * { type: 'stringContains', input: descColumn, value: 'ERROR', caseInsensitive: true }
 */
export interface ExprStringContains<I> {
  type: 'stringContains';
  /** Input expression (must evaluate to string) */
  input: I;
  /** Substring to search for */
  value: string;
  /** If true, comparison ignores case */
  caseInsensitive: boolean;
}

/**
 * Fuzzy string containment check with edit distance.
 *
 * Tests if input string approximately matches a pattern within a specified edit distance.
 * Uses Levenshtein distance (or substitution-only distance) for fuzzy matching.
 * **Input**: Expression evaluating to a string.
 * **Output**: Boolean (true if approximate match found within maxEdits).
 * **Null handling**: Returns false if input is null.
 *
 * @template I - The expression type (for recursion)
 *
 * @example
 * // Match "color" with up to 1 edit (catches "colour", "colr", etc.)
 * {
 *   type: 'stringContainsFuzzy',
 *   input: textColumn,
 *   value: 'color',
 *   maxEdits: 1,
 *   caseInsensitive: true,
 *   substitutionsOnly: false,
 *   wildcard: null
 * }
 *
 * // Match with wildcard (? matches any single character)
 * {
 *   type: 'stringContainsFuzzy',
 *   input: textColumn,
 *   value: 'te?t',
 *   maxEdits: 0,
 *   caseInsensitive: false,
 *   substitutionsOnly: false,
 *   wildcard: '?'
 * }
 */
export interface ExprStringContainsFuzzy<I> {
  type: 'stringContainsFuzzy';
  /** Input expression (must evaluate to string) */
  input: I;
  /** Pattern to match against */
  value: string;
  /**
   * Maximum edit distance (Levenshtein distance).
   * 0 = exact match only, 1 = one edit allowed, etc.
   */
  maxEdits: number;
  /** If true, comparison ignores case */
  caseInsensitive: boolean;
  /**
   * If true, only substitutions count as edits (no insertions/deletions).
   * Useful when you want to match strings of same length with typos.
   */
  substitutionsOnly: boolean;
  /**
   * Optional wildcard character that matches any single character.
   * Example: '?' in "te?t" matches "test", "text", "tent", etc.
   * Set to null to disable wildcard matching.
   */
  wildcard: null | string;
}

/**
 * Logical NOT expression.
 *
 * Negates a boolean expression.
 * **Input**: Expression evaluating to boolean.
 * **Output**: Boolean (inverted).
 * **Null handling**: NOT null = null.
 *
 * @template I - The expression type (for recursion)
 *
 * @example
 * // NOT (value > 10)
 * { type: 'not', input: comparisonExpr }
 */
export interface ExprLogicalUnary<I> {
  type: 'not';
  /** Input boolean expression to negate */
  input: I;
}

/**
 * Logical AND/OR expression.
 *
 * Combines multiple boolean expressions using AND or OR logic.
 * **Input**: Array of expressions evaluating to boolean (minimum 2).
 * **Output**: Boolean.
 *
 * **Null handling**
 * - AND: null AND true = null, null AND false = false
 * - OR: null OR true = true, null OR false = null
 *
 * @template I - The expression type (for recursion)
 *
 * @example
 * // (a > 0) AND (b < 100)
 * { type: 'and', input: [exprA, exprB] }
 *
 * // (status == 'active') OR (status == 'pending')
 * { type: 'or', input: [statusActive, statusPending] }
 */
export interface ExprLogicalVariadic<I> {
  /** Logical operation: 'and' or 'or' */
  type: 'and' | 'or';
  /** Array of boolean expressions to combine (minimum 2 elements) */
  input: I[];
}

/**
 * Set membership check expression.
 *
 * Tests if a value is present in a predefined set of values.
 * **Input**: Expression evaluating to string or number.
 * **Output**: Boolean.
 * **Null handling**: Returns false if input is null.
 *
 * @template I - The expression type (for recursion)
 * @template T - The type of set elements (string or number)
 *
 * @example
 * // Check if status is in ['active', 'pending', 'review']
 * {
 *   type: 'isIn',
 *   input: statusColumn,
 *   set: ['active', 'pending', 'review']
 * }
 */
export interface ExprIsIn<I, T extends string | number> {
  type: 'isIn';
  /** Input expression to test */
  input: I;
  /** Set of allowed values */
  set: T[];
}

// ============ Generic Query Types ============
// A = Axis ID type, S = Selector type, Q = Query type, E = Expression type
// AF = Axis filter type, SE = Sort entry type, JE = Join entry type, SO = Spec override type

/**
 * Selector for referencing an axis in queries.
 *
 * Used to identify a specific axis dimension in operations like:
 * - Sorting by axis values
 * - Partitioning for window functions
 * - Filtering/slicing axes
 *
 * @template A - Axis identifier type (typically string name or numeric index)
 *
 * @example
 * // Select axis by name
 * { type: 'axis', id: 'sample' }
 *
 * // Select axis by index
 * { type: 'axis', id: 0 }
 */
export interface QueryAxisSelector<A> {
  type: 'axis';
  /** Axis identifier (name or index depending on context) */
  id: A;
}

/**
 * Selector for referencing a column in queries.
 *
 * Used to identify a specific column in operations like:
 * - Sorting by column values
 * - Partitioning for window functions
 * - Aggregation expressions
 *
 * @template C - Column identifier type (typically string name or numeric index)
 *
 * @example
 * // Select column by name
 * { type: 'column', id: 'expression_value' }
 *
 * // Select column by index
 * { type: 'column', id: 0 }
 */
export interface QueryColumnSelector<C> {
  type: 'column';
  /** Column identifier (name or index depending on context) */
  id: C;
}

/**
 * Sort entry specifying sort criteria.
 *
 * Defines how to sort by a single axis or column.
 * Multiple sort entries can be combined for multi-level sorting
 * (first entry has highest priority).
 *
 * @template S - Selector type (axis or column selector)
 *
 * @example
 * // Sort by "score" column descending, nulls last
 * {
 *   axisOrColumn: { type: 'column', id: 'score' },
 *   ascending: false,
 *   nullsFirst: false
 * }
 *
 * // Sort by "name" axis ascending, default null handling
 * {
 *   axisOrColumn: { type: 'axis', id: 'name' },
 *   ascending: true,
 *   nullsFirst: null
 * }
 */
export interface QuerySortEntry<S> {
  /** Selector for axis or column to sort by */
  axisOrColumn: S;
  /** If true, sort ascending (A-Z, 0-9); if false, descending */
  ascending: boolean;
  /**
   * Null placement control:
   * - true: nulls sort before non-null values
   * - false: nulls sort after non-null values
   * - null: use default behavior (typically nulls last)
   */
  nullsFirst: null | boolean;
}

/**
 * Left outer join query operation.
 *
 * Joins a primary query with one or more secondary queries using left outer join semantics.
 * All records from the primary are preserved; matching records from secondaries are joined,
 * non-matching positions are filled with nulls.
 *
 * **Join behavior**:
 * - All records from `primary` are preserved
 * - For each secondary, matching records (by axis keys) are joined
 * - Missing matches from secondaries are filled with null values
 * - Empty `secondary` array acts as identity (returns primary unchanged)
 *
 * **Null handling**: Null join keys don't match; positions without matches get null values.
 *
 * @template JE - Join entry type
 *
 * @example
 * // Left join samples with optional annotations
 * {
 *   type: 'outerJoin',
 *   primary: samplesQuery,
 *   secondary: [annotationsQuery, metadataQuery]
 * }
 * // Result has all samples; annotations/metadata are null where not available
 */
export interface QueryOuterJoin<JE> {
  type: 'outerJoin';
  /** Primary query - all its records are preserved */
  primary: JE;
  /** Secondary queries - joined where keys match, null where they don't */
  secondary: JE[];
}

/**
 * Axis slicing query operation.
 *
 * Filters data by fixing one or more axes to specific constant values.
 * Each filtered axis is removed from the resulting data shape (reduces dimensionality).
 *
 * **Behavior**:
 * - Each axis filter selects records where that axis equals the constant
 * - Filtered axes are removed from the output spec
 * - Multiple filters apply conjunctively (AND)
 *
 * @template Q - Input query type
 * @template A - Axis selector type
 *
 * @example
 * // Slice 3D data [sample, gene, condition] to 1D [gene]
 * {
 *   type: 'sliceAxes',
 *   input: fullDataQuery,
 *   axisFilters: [
 *     { type: 'constant', axisSelector: { type: 'axis', id: 'sample' }, constant: 'Sample1' },
 *     { type: 'constant', axisSelector: { type: 'axis', id: 'condition' }, constant: 'Treatment' }
 *   ]
 * }
 */
export interface QuerySliceAxes<Q, A> {
  type: 'sliceAxes';
  /** Input query to slice */
  input: Q;
  /** List of axis filters to apply (at least one required) */
  axisFilters: {
    /** Selector identifying which axis to filter */
    axisSelector: A;
    /** The constant value to filter the axis to */
    constant: string | number;
  }[];
}

/**
 * Sort query operation.
 *
 * Reorders records by one or more axes or columns.
 * Does not change data shape or values, only record order.
 *
 * **Behavior**:
 * - Sort entries are applied in priority order (first entry = primary sort key)
 * - Ties in first sort key are broken by second, etc.
 * - All axes and columns pass through unchanged
 * - Only the physical ordering of records changes
 *
 * @template Q - Input query type
 * @template SE - Sort entry type
 *
 * @example
 * // Sort by score descending, then by name ascending for ties
 * {
 *   type: 'sort',
 *   input: dataQuery,
 *   sortBy: [
 *     { axisOrColumn: { type: 'column', id: 'score' }, ascending: false, nullsFirst: null },
 *     { axisOrColumn: { type: 'axis', id: 'name' }, ascending: true, nullsFirst: null }
 *   ]
 * }
 */
export interface QuerySort<Q, SE> {
  type: 'sort';
  /** Input query to sort */
  input: Q;
  /** Sort criteria in priority order (at least one required) */
  sortBy: SE[];
}

/**
 * Filter query operation.
 *
 * Filters records based on a boolean predicate expression.
 * Only records where predicate evaluates to true are kept.
 *
 * **Behavior**:
 * - Evaluates predicate for each record
 * - Keeps records where predicate is true
 * - Discards records where predicate is false or null
 * - Data shape (axes, columns) is preserved
 *
 * **Null handling**: Records with null predicate result are excluded (null ≠ true).
 *
 * @template Q - Input query type
 * @template E - Expression type
 *
 * @example
 * // Filter to records where value > 10 AND status == 'active'
 * {
 *   type: 'filter',
 *   input: dataQuery,
 *   predicate: {
 *     type: 'logical',
 *     operand: 'and',
 *     input: [
 *       { type: 'numericComparison', operand: 'gt', left: valueRef, right: { type: 'constant', value: 10 } },
 *       { type: 'stringEquals', input: statusRef, value: 'active' }
 *     ]
 *   }
 * }
 */
export interface QueryFilter<Q, E> {
  type: 'filter';
  /** Input query to filter */
  input: Q;
  /** Boolean predicate expression - only true records pass */
  predicate: E;
}

/**
 * Column reference query (leaf node).
 *
 * References an existing column by its unique identifier.
 * This is a leaf node in the query tree that retrieves actual data.
 *
 * The column must exist in the dataset and its spec (axes, value type)
 * becomes the output spec of this query node.
 *
 * @example
 * // Reference column by ID
 * { type: 'column', columnId: 'col_abc123' }
 */
export interface QueryColumn {
  type: 'column';
  /** Unique identifier of the column to reference */
  columnId: PObjectId;
}

/**
 * Inline column query (leaf node).
 *
 * Creates a column with inline/embedded data and type specification.
 * Useful for creating constant columns or injecting computed data.
 *
 * The data is provided via dataInfo which contains the actual values
 * or reference to where data is stored.
 *
 * @template T - Type spec type
 *
 * @example
 * // Create inline column with constant values
 * {
 *   type: 'inlineColumn',
 *   spec: { axes: ['sample'], columns: ['Int'] },
 *   dataInfo: { ... } // JsonDataInfo object
 * }
 */
export interface QueryInlineColumn<T> {
  type: 'inlineColumn';
  /** Type specification defining axes and column types */
  spec: T;
  /** Data information containing or referencing the actual values */
  dataInfo: JsonDataInfo;
}

/**
 * Cross join column query operation.
 *
 * Expands a column across additional axes using Cartesian product.
 * Creates all combinations of existing axis values with new axis values.
 *
 * **Use case**: When you need to repeat/broadcast a column across
 * new dimensions that it doesn't originally have.
 *
 * **Behavior**:
 * - Takes an existing column
 * - Expands it across specified axes indices
 * - Result has Cartesian product of original axes × new axes
 *
 * @template SO - Spec override type
 *
 * @example
 * // Expand column across axes at indices 0 and 2
 * {
 *   type: 'crossJoinColumn',
 *   columnId: 'col_abc123',
 *   axesIndices: [0, 2],
 *   specOverride: { ... } // optional spec modifications
 * }
 */
export interface QueryCrossJoinColumn<SO> {
  type: 'crossJoinColumn';
  /** ID of the column to cross-join */
  columnId: PObjectId;
  /** Optional override for the column specification */
  specOverride?: SO;
  /** Indices of axes to expand across */
  axesIndices: number[];
}

/**
 * Symmetric join query operation (inner join or full outer join).
 *
 * Joins multiple queries symmetrically (order doesn't affect result semantics).
 *
 * **Inner Join** (`type: 'innerJoin'`):
 * - Returns only records that exist in ALL entries
 * - Null join keys don't match, so records with null keys are excluded
 * - Result contains intersection of all entries by axis keys
 *
 * **Full Join** (`type: 'fullJoin'`):
 * - Returns all records from ALL entries
 * - Missing values are filled with nulls
 * - Null join keys create separate groups
 * - Result contains union of all entries by axis keys
 *
 * **Single entry**: Acts as identity (returns entry unchanged).
 *
 * @template JE - Join entry type
 *
 * @example
 * // Inner join: only records present in all queries
 * {
 *   type: 'innerJoin',
 *   entries: [query1Entry, query2Entry, query3Entry]
 * }
 *
 * // Full join: all records from all queries, nulls for missing
 * {
 *   type: 'fullJoin',
 *   entries: [query1Entry, query2Entry]
 * }
 */
export interface QuerySymmetricJoin<JE> {
  /** 'innerJoin' for intersection, 'fullJoin' for union with nulls */
  type: 'innerJoin' | 'fullJoin';
  /** Queries to join (at least one required) */
  entries: JE[];
}

/**
 * Join entry wrapper.
 *
 * Wraps a query to be used as an entry in join operations.
 * The wrapper allows for additional metadata or configuration
 * on each joined query (e.g., specifying join keys, aliases).
 *
 * @template Q - Query type
 *
 * @example
 * // Wrap a query for use in join
 * { entry: someQuery }
 */
export interface QueryJoinEntry<Q> {
  /** The query to be joined */
  entry: Q;
}
