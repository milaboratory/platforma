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

**📁 For detailed schemas, see:** `lib/ptabler/schema/src/` - contains `expressions.ts`, `basic_steps.ts`, `aggregate.ts`, `join.ts`, and other schema definition files.

### **7. Current Implementation and Usage**

PTabler is currently the primary and only implementation of this workflow-driven table manipulation approach within the Platforma ecosystem. The main consumer of the PTabler API is the **Tengo `pt` library**, which provides a high-level, Polars-inspired API for Platforma block developers.

**📁 For implementation details, see:** `sdk/workflow-tengo/src/pt/` - contains the complete pt library implementation.

#### **7.1 Tengo PT Library Architecture**

The `pt` library consists of several key components:

* **`index.lib.tengo`**: Main workflow and DataFrame API that mimics Polars syntax in Tengo
  - Provides `pt.workflow()` for creating workflows
  - Implements `DataFrame`-like objects with methods such as `select()`, `filter()`, `groupBy()`, `join()`, etc.
  - Handles automatic format detection for CSV, TSV, and NDJSON files
  - Manages resource references and file I/O within the Platforma execution environment

* **`expression.lib.tengo`**: Expression system implementation
  - Provides `pt.col()`, `pt.lit()`, and other expression builders
  - Implements arithmetic, comparison, string, and aggregation operations
  - Supports complex nested expressions and window functions
  - Maps Tengo expressions to PTabler JSON structures

* **`expression.test.tengo`**: Comprehensive test suite for the expression system

**📁 For API usage examples, see:** `sdk/workflow-tengo/src/pt/expression.test.tengo` - contains extensive examples of expression usage patterns.

#### **7.2 Developer Experience**

Block developers interact with PTabler through the intuitive Tengo `pt` API:

```tengo
pt := import("@platforma-sdk/workflow-tengo:pt")

// Create workflow
wf := pt.workflow()

// Read data (auto-detects format from extension)
df := wf.frame(inputs.dataFile, {format: "csv"})

// Transform data using Polars-like API
result := df
  .select(
    pt.col("id"),
    pt.col("score").plus(10).alias("adjusted_score")
  )
  .filter(pt.col("category").eq("A"))
  .groupBy("department")
  .agg(
    pt.col("adjusted_score").mean().alias("avg_score")
  )

// Save results
result.save("output.tsv")

// Execute workflow
ptablerResult := wf.run()
```

Behind the scenes, this generates a PTabler JSON workflow that gets executed by the Python backend.

**📁 For Python backend implementation, see:** `lib/ptabler/software/src/ptabler/` - contains the complete Python implementation with `expression/`, `steps/`, and `workflow/` modules.

#### **7.3 Software Integration**

The `pt` library integrates with the Platforma execution system by:
- Importing the PTabler software package: `@platforma-open/milaboratories.software-ptabler:main`
- Generating JSON workflow files that conform to the TypeScript schema
- Managing input/output file resources through the Platforma asset system
- Executing the Python PTabler command-line tool within the distributed compute environment

### **8. Development Workflow for New Features**

Implementing new features in PTabler follows a structured 5-step process that maintains consistency across the TypeScript schema, Python implementation, and Tengo API layers.

#### **Step 1: TypeScript Type Definition**

Start by defining the new feature in the TypeScript schema:

**📁 Schema files:** `lib/ptabler/schema/src/` - examine existing patterns in `expressions.ts`, `basic_steps.ts`, etc.

**For Expression Types:** Add to `expressions.ts`
```typescript
export interface MyNewExpression {
  type: 'my_new_operation';
  operand: Expression;
  parameter: string;
}
```

**For Workflow Steps:** Add to appropriate files (`basic_steps.ts`, `aggregate.ts`, etc.) and update `index.ts`
```typescript
export interface MyNewStep {
  type: 'my_new_step';
  inputTable: string;
  outputTable: string;
  configuration: MyConfiguration;
}
```

#### **Step 2: Python Implementation**

Implement the corresponding Python classes in the Python backend:

**📁 Python source:** `lib/ptabler/software/src/ptabler/` - study existing implementations in `expression/basics.py`, `steps/basics.py`, etc.

**For Expressions:** Add to `expression/` directory
```python
class MyNewExpression(Expression, tag="my_new_operation"):
    operand: AnyExpression
    parameter: str
    
    def to_polars(self) -> pl.Expr:
        # Implementation using Polars API
        return self.operand.to_polars().my_operation(self.parameter)
```

**For Steps:** Add to `steps/` directory
```python
class MyNewStep(PStep, tag="my_new_step"):
    input_table: str = msgspec.field(name="inputTable")
    output_table: str = msgspec.field(name="outputTable") 
    configuration: MyConfiguration
    
    def execute(self, table_space: TableSpace, global_settings: GlobalSettings) -> tuple[TableSpace, list[pl.LazyFrame]]:
        # Implementation logic
        pass
```

#### **Step 3: Python Testing**

Add tests in the Python test suite:

**📁 Python tests:** `lib/ptabler/software/src/test/` - follow patterns from `expression_tests.py`, `basic_test.py`, `aggregation_test.py`, etc.

**📁 Quick commands:** `lib/ptabler/docs/development-experiment-guide.md` - contains commands for running individual tests and development workflows.

**For Major Features:** Create dedicated test files (e.g., `my_new_feature_test.py`)
```python
class MyNewFeatureTests(unittest.TestCase):
    def test_basic_functionality(self):
        # Test implementation
        pass
```

**For Minor Features:** Add test cases to existing relevant test files with assertions that cover the new functionality.

Run tests using:
```bash
cd lib/ptabler/software
../.venv/bin/python -m unittest discover --verbose -s src -p '*test*.py'
```

#### **Step 4: Tengo PT Library Implementation**

Implement the developer-facing API in the Tengo pt library:

**📁 Tengo implementation:** `sdk/workflow-tengo/src/pt/` - follow existing patterns in `expression.lib.tengo` and `index.lib.tengo`.

**For Expressions:** Add methods to `expression.lib.tengo`
```tengo
myNewOperation: func(parameter) {
    return _newExpression({
        type: "my_new_operation",
        operand: expression,
        parameter: parameter
    }, undefined)
}
```

**For DataFrame Operations:** Add methods to `index.lib.tengo`
```tengo
myNewStep: func(configuration) {
    outputDfName := parentWorkflow._newAnonymousDataFrameId()
    parentWorkflow.addRawStep({
        type: "my_new_step",
        inputTable: dfName,
        outputTable: outputDfName,
        configuration: configuration
    })
    return _newDataFrame(parentWorkflow, outputDfName)
}
```

#### **Step 5: Workflow Testing**

Add comprehensive tests in the Tengo test suite:

**📁 Unit tests:** `sdk/workflow-tengo/src/pt/expression.test.tengo` - for testing expression serialization and API correctness.

**For Major Features:** Create dedicated test functions in `expression.test.tengo` or add new test files
```tengo
TestMyNewFeature := func() {
    expr := pt.col("data").myNewOperation("param")
    test.isEqual(getExpr(expr), {
        type: "my_new_operation",
        operand: {type: "col", name: "data"},
        parameter: "param"
    })
}
```

**For Integration Tests:** Add comprehensive workflow tests that verify the complete pipeline from Tengo API through PTabler execution.

**📁 Integration tests:** `tests/workflow-tengo/src/pt/` - contains `pt.test.ts` (TypeScript orchestration) and various `.tpl.tengo` templates (workflow logic).

#### **Step 5.1: Integration Test Structure**

The integration tests use a sophisticated dual-language approach combining **TypeScript test orchestration** with **Tengo workflow templates**:

**📁 See implementation:** `tests/workflow-tengo/src/pt/pt.test.ts` and accompanying `.tpl.tengo` files for complete examples.

**TypeScript Test File (`pt.test.ts`):**
- Orchestrates the test execution using Platforma's test framework
- Defines expected input/output data for validation
- Handles blob storage interactions and file content verification
- Provides timeout management for complex data processing operations
- Implements data normalization and comparison utilities

**Tengo Workflow Templates (`.tpl.tengo` files):**
- Contain actual workflow logic using the `pt` library API
- Process real data through complete PTabler pipelines
- Test various complexity levels from basic operations to comprehensive data transformations

#### **Step 5.2: Test Coverage**

The integration tests cover various complexity levels through multiple `.tpl.tengo` template files that test basic operations, window functions, aggregations, joins, string processing, and multi-format data interoperability (CSV, TSV, NDJSON). Each template processes real data through complete PTabler pipelines.

#### **Step 5.3: Test Execution and Validation**

The integration tests perform end-to-end validation by:

1. **Template Execution**: Running Tengo templates that generate PTabler JSON workflows
2. **Data Processing**: Executing the Python PTabler backend with real data transformation
3. **Output Validation**: Comparing actual file outputs against expected results with normalization for consistent formatting
4. **Error Handling**: Testing both success and failure scenarios across the complete pipeline

**Example Test Validation:**
```typescript
// TypeScript test validates the complete workflow execution
const result = await helper.renderTemplate(false, 'pt.ex1', ['out_windows', 'out_grouped'], 
  (tx) => ({ inputTsv: tx.createValue(Pl.JsonObject, JSON.stringify(inputTsvData)) })
);
const outputContent = await getFileContent('out_windows');
expect(normalizeAndSortTsv(outputContent)).toEqual(normalizeAndSortTsv(expectedOutputTsvData));
```

This systematic approach ensures that new features are properly typed, implemented, tested, and accessible to block developers through the intuitive Tengo API while maintaining the robust foundation of the PTabler workflow system. The integration tests provide confidence that the entire pipeline—from developer-friendly Tengo syntax through TypeScript schema validation to Python execution—works correctly with real data processing scenarios.