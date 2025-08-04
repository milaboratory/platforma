## **Polars Workflow CLI Tool: High-Level Description**

### **1. Overview**

A command-line interface (CLI) tool designed for flexible and efficient batch table manipulation using the `Polars` library and potentially extensions like `polars-distance` and `polars-hash`. It acts as a processing step within larger batch jobs, configured entirely through a single workflow file. The design emphasizes reusable components, such as expression definitions, across different transformation steps.

**Core Concepts:**

* **Workflow Driven:** The tool's behavior is defined by a structured workflow file (`JSON` or `YAML`).
* **Polars Backend:** Leverages the performance and features of the `Polars` DataFrame library.
* **Lazy Evaluation:** Prioritizes Polars' lazy execution model. Transformations are queued and optimized, ideally executing in a single `collect()` call unless explicitly specified otherwise.
* **Tablespace:** Operations occur within a "tablespace," a named collection (like a dictionary) of `Polars` DataFrames available during the workflow execution.
* **Extensible:** Designed to potentially incorporate functionality from specialized `Polars` extension libraries.

### **2. Workflow Structure**

The workflow file defines a sequence of steps to be executed.

```json
{
  "workflow": [
    // Step 1,
    // Step 2,
    // ...
  ]
}
```

### **3. Step Structure**

Each object in the `workflow` array represents a single operation (a "step"). Every step has a `type` defining the operation and specific parameters for that operation.

```json
{
  "type": "<step_type_identifier>",
  // ... other step-specific parameters
}
```

### **4. Key Step Examples**

* **`read_csv`**: Loads data from a CSV file into the tablespace.
  * `file`: Path to the CSV file.
  * `name`: The name assigned to the loaded DataFrame in the tablespace.
  * `delimiter` (optional): CSV delimiter character.
  * `schema` (optional): Explicit schema definition for the CSV.
  * `columns` (optional): List of column names to read; reads all if omitted.
  * `null_values` (optional): A string representing nulls, or a dictionary mapping column names to specific null strings for those columns.
* **`write_csv`**: Writes a table from the tablespace to a CSV file.
  * `table`: Name of the table in the tablespace to write.
  * `file`: Path to the output CSV file.
  * `columns` (optional): List of column names to write; writes all if omitted.
  * `delimiter` (optional): CSV delimiter character.
* **`add_columns`**: Adds one or more new columns to an existing table in the tablespace.
  * `table`: Name of the target DataFrame in the tablespace.
  * `columns`: An array defining the new columns.
    * `name`: Name of the new column.
    * `expression`: An `Expression` object defining how to compute the column's values.
* **`filter`**: Filters rows in a table based on a condition.
  * `table`: Name of the table in the tablespace to filter.
  * `condition`: A boolean `Expression` object. Rows where the expression evaluates to true are kept.
* **`aggregate`**: Performs aggregation operations on a table, potentially grouping by certain columns, and outputs a new table.
  * `input_table`: Name of the table in the tablespace to aggregate.
  * `output_table`: Name for the resulting aggregated table in the tablespace.
  * `group_by` (optional): List of column names to group by.
  * `aggregations`: An array defining the aggregation operations (likely using aggregation/window `Expression` types).
* **`join`**: Joins two tables from the tablespace.
  * `left_table`: Name of the left table in the tablespace.
  * `right_table`: Name of the right table in the tablespace.
  * `output_table`: Name for the resulting joined table in the tablespace.
  * `left_on`: List of column names from the left table for the equi-join.
  * `right_on`: List of column names from the right table for the equi-join.
  * `how`: Join type (`inner`, `left`, `right`, `outer`, `cross`).

### **5. Expression System**

A structured way to define computations within steps (e.g., for `add_columns`, `filter`, `aggregate`). Expressions can be nested and are designed to be reusable across different step types.

* **Types:**
  * **Comparisons:** `gt`, `ge`, `eq`, `lt`, `le`, `neq` etc. (Requires `lhs`, `rhs`). Used heavily in `filter`.
  * **Arithmetic (Binary):** `plus`, `minus`, `multiply`, `truediv`, `floordiv`, etc. (Requires `lhs`, `rhs`).
  * **Arithmetic (Unary):** `log10`, `abs`, `sqrt`, etc. (Requires a single operand, e.g., `value`).
  * **Boolean Logic:** `and`, `or` (Requires an array of boolean expressions, e.g., `operands`), `not` (Requires a single boolean operand, e.g., `value`). Used heavily in `filter`.
  * **NA/Null Checks:** `is_na`, `is_not_na` (Requires a single operand, e.g., `value`).
  * **String Ops:** `concat`, etc. (Requires `lhs`, `rhs`).
  * **Hashing:** `hash` (Requires a single operand, e.g., `value`). Computes a hash value (relies on a hashing library like `polars-hash`).
  * **Column Reference:** `col` (Requires `name` of the column).
  * **Constant Value:** `const` (Requires `value`).
  * **Aggregations/Window Functions:** `agg` (Requires `agg_type` like `sum`, `mean`, `rank`, `cumsum`, etc., and relevant settings). Used heavily in `aggregate` and potentially `add_columns`.
    * *Note:* Specific aggregations like `cumsum` might require additional parameters, such as `sort_by` to define ordering before calculation. The `sort_by` parameter can accept a *list* of column names for multi-column sorting.
* **Operands (`lhs`, `rhs`, `value`, `operands`):** Can themselves be other `Expression` objects, allowing for complex computations. The specific parameter name (`lhs`/`rhs`, `value`, `operands`) depends on the expression type.

### **6. Documentation Approach**

The definitive structure of the workflow, steps, and expressions will be formally documented using `TypeScript` type definitions.