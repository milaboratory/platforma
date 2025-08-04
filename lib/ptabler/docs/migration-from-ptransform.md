# Migration Guide: from `ptransform` to `ptabler`

This document provides guidance for migrating data transformation workflows from the legacy `ptransform` tool to the modern `ptabler` CLI. It is intended for both human users and LLM-based assistants involved in the migration process.

`ptransform` is a Pandas-based tool, while `ptabler` leverages the high-performance Polars library and offers a more flexible and powerful approach to table manipulations.

## Core Philosophy and High-Level Differences

Understanding these key differences is crucial for a successful migration:

1.  **Execution Engine**:
    *   `ptransform`: Utilizes Pandas for its operations.
    *   `ptabler`: Built on Polars, offering potential performance benefits and a distinct API for expressions and operations.

2.  **Workflow Paradigm**:
    *   `ptransform`: Operates on a single DataFrame that is implicitly passed through a linear sequence of transformation steps.
    *   `ptabler`: Introduces a "tablespace," a named collection of DataFrames. Steps explicitly reference input and output table names within this tablespace, allowing for more complex, branched, and explicit data flows.

3.  **Data Input/Output (I/O)**:
    *   `ptransform`: Handles I/O implicitly. Input TSV file(s) are specified as command-line arguments, and the final result is written to a single output TSV, also via command-line arguments. The workflow definition itself does not contain I/O steps.
    *   `ptabler`: I/O operations are explicit steps within the workflow definition. You use `read_csv` to load data into the tablespace and `write_csv` (or `write_json`) to save data from the tablespace.

4.  **Expression System**:
    *   `ptransform`: Defines transformations through specific step types with somewhat fixed structures for predicates (in filters) and aggregation functions.
    *   `ptabler`: Features a rich, composable, and highly flexible expression system. These expressions are used across various steps like `add_columns`, `filter`, and `aggregate`, providing a unified and powerful way to define computations.

5.  **Immutability and Step Outputs**:
    *   `ptransform`: Steps often modify the single working DataFrame in-place, or the modified DataFrame replaces the previous one.
    *   `ptabler`: Most transformative steps (`filter`, `aggregate`, `join`, `concatenate`) produce new, named tables in the tablespace, promoting clearer data lineage. The `add_columns` step modifies a specified table in-place within the tablespace.

## Mapping `ptransform` Workflows to `ptabler`

Migrating a `ptransform` workflow involves translating its structure and steps into the `ptabler` paradigm.

### Overall Workflow Structure

*   **Initial Data Loading**:
    *   `ptransform` reads one or more TSV files specified on the command line.
    *   In `ptabler`, this translates to one or more `read_csv` steps at the beginning of your workflow. Each `read_csv` step loads data into a named table in the tablespace.
    *   If `ptransform` implicitly concatenates multiple input files, you will use multiple `read_csv` steps followed by a `concatenate` step in `ptabler` to combine them into a single table.
*   **Sequential Steps**:
    *   `ptransform` applies a list of steps sequentially to its single DataFrame.
    *   In `ptabler`, this linear flow is replicated by a sequence of steps where the `outputTable` of one step typically becomes the `inputTable` for the subsequent step.
*   **Final Output**:
    *   `ptransform` writes the final DataFrame to a TSV file specified on the command line.
    *   In `ptabler`, this maps to a `write_csv` (or `write_json`) step at the end of your workflow, specifying which table from the tablespace to write.

### Step-by-Step Migration

Here's how individual `ptransform` step types generally map to `ptabler` concepts:

1.  **`Filter` (from `ptransform.filter`)**
    *   **Maps to**: `ptabler.FilterStep`.
    *   **Details**:
        *   The `FilterStep` in `ptabler` requires an `inputTable` (the table to filter) and an `outputTable` (where the filtered result is stored).
        *   `ptransform` predicates (e.g., `FilterEquals`, `FilterGreaterThan`, `FilterNot`, `FilterAnd`, `FilterOr`) must be converted into `ptabler`'s expression language.
            *   `FilterEquals(column, value)` -> `ComparisonExpression({type: 'eq', lhs: {type: 'col', name: 'column'}, rhs: {type: 'const', value: 'value'}})`
            *   `FilterNot(operand)` -> `NotExpression({value: <converted_operand_expression>})`
            *   `FilterAnd(operands)` -> `BooleanLogicExpression({type: 'and', operands: [<converted_operand_expressions>]})`
            *   And so on for other comparison and logical operators.

2.  **`Aggregate` (from `ptransform.aggregate`)**
    *   **Maps to**: `ptabler.AggregateStep`.
    *   **Details**:
        *   `inputTable` and `outputTable` are specified.
        *   `ptransform`'s `group_by` list maps directly to `ptabler`'s `groupBy` property.
        *   Each aggregation defined in `ptransform` (e.g., `AggregationCount`, `AggregationMax`, `AggregationSum`) maps to an entry in `ptabler`'s `aggregations` array, typically a `StandardAggregationOperation`.
            *   The `src` column in `ptransform` becomes a `ColumnReferenceExpression` for the `expression` field in `ptabler`.
            *   The `dst` column name in `ptransform` becomes the `name` field in `ptabler`.
            *   Example: `AggregationSum(src: "value", dst: "total_value")` -> `{ name: "total_value", aggregation: "sum", expression: { type: "col", name: "value" } }`.
        *   **`AggregationMedian` Note**: The `ptransform.AggregationMedian` step is implemented incorrectly and actually computes the mean. When migrating, you should use `ptabler`'s `median` aggregation type to achieve the intended median calculation.
        *   **`AggregationMaxBy(ranking_col, pick_cols)`**:
            *   If `pick_cols` is specified (defining specific source columns to pick and their new names): This maps to multiple `ptabler.ByClauseAggregationOperation` objects within the `aggregations` array. Each object will have:
                *   `aggregation: 'max_by'`
                *   `name`: The destination column name (from `pick_cols`).
                *   `expression`: A `ColumnReferenceExpression` for the source column to pick (from `pick_cols`).
                *   `by`: An array containing a `ColumnReferenceExpression` for the `ranking_col`.
            *   If `pick_cols` is *not* specified (implying all columns of the "max" row should be kept): This "top 1 per group" behavior is more complex in `ptabler` if you need all original columns. A common `ptabler` pattern would be:
                1.  An `add_columns` step to create a rank column using `RankExpression` (partition by `group_by` keys, order by `ranking_col` descending).
                2.  A `filter` step to keep only rows where the rank is 1.
                3.  (Optional) An `add_columns` step with `drop_columns` (if available/needed) or select specific columns in a subsequent `write_csv` step to remove the temporary rank column.

3.  **`AggregateMulti` (from `ptransform.aggregate`)**
    *   **Functionality Maps to**: `ptabler.AddColumnsStep` using specific expressions. `AggregateMulti` in `ptransform` adds new columns (like cumulative sum or rank) to the existing DataFrame.
    *   **Details**:
        *   The `table` property in `AddColumnsStep` would be the current working table.
        *   `MultiAggregationCumsum(src, dst)` (grouped by `group_by`):
            *   Add a column definition to `AddColumnsStep`'s `columns` array:
                *   `name: dst`
                *   `expression`: A `CumsumExpression` where `value` is `ColumnReferenceExpression(name: src)` and `partitionBy` is an array of `ColumnReferenceExpression` for each column in `group_by`.
        *   `MultiAggregationRank(src, dst)` (grouped by `group_by`):
            *   Add a column definition:
                *   `name: dst`
                *   `expression`: A `RankExpression` where `orderBy` likely includes `ColumnReferenceExpression(name: src)` (or as per desired ranking logic) and `partitionBy` maps from `group_by`.

4.  **`TransformationCombineColumnsAsJson` (from `ptransform.transform`)**
    *   **Direct Equivalent**: **This step does not have a direct, one-to-one equivalent in `ptabler`**.
    *   **Details**: `ptransform` combines specified source columns into a single new column containing a JSON array string, using a custom `NumpyEncoder`.
    *   `ptabler`'s expression system, including `StringJoinExpression`, can concatenate string representations of columns but does not natively:
        *   Format the output as a well-formed JSON array.
        *   Handle diverse data types within the JSON array (e.g., numbers vs. strings in JSON) with the same fidelity as `json.dumps` with a custom encoder.
    *   **Migration Strategies**:
        *   Perform this transformation using an external script or tool before or after the `ptabler` workflow.
        *   If the JSON structure is extremely simple and all source columns are strings (or can be cast to strings), you might approximate it with `StringJoinExpression` and literal characters like `[`, `]`, `,`, `"`, but this is fragile and not generally recommended for complex JSON.
        *   Note: `ptabler` *can* write an entire table to a JSON file (typically line-delimited JSON) using the `WriteJsonStep`. This is different from creating a JSON string *within a column*.

## `ptransform` Features Requiring Re-evaluation

*   **JSON Column Creation**: As highlighted above, `TransformationCombineColumnsAsJson` is the primary feature in `ptransform` that lacks a direct counterpart in `ptabler`. This specific transformation logic will need to be addressed outside of a direct `ptabler` step or by significantly simplifying the requirement.

## Advantages of Migrating to `ptabler`

Migrating to `ptabler` offers several benefits:

*   **Performance**: Leverages the Polars library, which is known for its high performance on larger datasets.
*   **Flexibility**: The tablespace concept and explicit naming of intermediate tables allow for more complex and non-linear data processing workflows.
*   **Powerful Expressions**: A rich and composable expression system provides greater power and reusability for defining column computations, filters, and aggregations.
*   **Explicit Control**: Clearer I/O steps and data lineage through named tables.
*   **Modern Tooling**: Aligns with the growing Polars ecosystem.

This guide should provide a solid foundation for planning and executing your migration from `ptransform` to `ptabler`. Remember to consult the detailed `ptabler` documentation for specifics on step configurations and expression syntax.
