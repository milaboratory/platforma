# PColumn

PColumn (Platforma Column) is a fundamental data structure within the Platforma framework, representing a strongly-typed column of data indexed by a set of axes. It serves as the primary way to manage and manipulate tabular and multi-dimensional data within workflows and applications.

## PColumn Specification (`PColumnSpec`)

Each PColumn is defined by its metadata, known as `PColumnSpec`. This specification adheres to the general structure of Platforma Objects (`PObject`) but is specialized for columnar data. The key components of a `PColumnSpec` are:

*   **`kind`**: Must be `"PColumn"`.
*   **`valueType`**: Defines the data type of the values stored in the column (e.g., `Int`, `Long`, `Float`, `Double`, `String`, `Bytes`).
*   **`name`**: A logical, human-readable name for the column.
*   **`domain`**: A key-value map providing additional identifying information beyond the name and type. This helps differentiate columns that might otherwise seem similar.
*   **`annotations`**: A key-value map for storing arbitrary metadata that doesn't affect the column's identity (e.g., `pl7.app/label` for UI display names).
*   **`axesSpec`**: An ordered list of `AxisSpec` objects defining the axes that index the column's data. Each `AxisSpec` includes its own type, name, domain, annotations, and potentially references to parent axes, forming a hierarchical structure if needed.

**Links:**
*   Tengo validation schema: See `P_COLUMN_SPEC_SCHEMA` and `P_AXIS_SPEC_SCHEMA` in `sdk/workflow-tengo/src/pframes/spec.lib.tengo`.
*   TypeScript definition: `PColumnSpec` and `AxisSpec` (imported from `@milaboratories/pl-model-common`, see usage in `sdk/model/src/render/util/column_collection.ts`).

## Representation in Platforma: PFrame

A PColumn typically exists within the context of a **PFrame**. A PFrame acts as a container or collection manager for multiple PColumns.

Within the underlying storage managed by a PFrame (a structural platforma resource with type `PFrame`), each PColumn is commonly represented by two associated components, often distinguished by their local column ids:

1.  **Specification Resource (e.g., `column_id.spec`)**: Contains the JSON representation of the `PColumnSpec` object described above. This resource defines the structure, types, and metadata of the column.
2.  **Data Resource (e.g., `column_id.data`)**: Contains the actual data values, mapped according to the axes defined in the spec. The internal structure of this component depends on the chosen **Data Storage Type** (see below).

The PFrame implementation is responsible for managing these pairs, linking a specific `.spec` with its corresponding `.data`, and providing unified access to the columns it contains.

**Links:**
*   `PFrame` interface/implementation: `sdk/model/src/pframe.ts`.
*   Relevant resource types can be found in `sdk/workflow-tengo/src/pframes/constants.lib.tengo`.
*   Tengo code provide builder for `PFrame` as `pframes.pFrameBuilder()`

## Data Structure: Keys and Values

PColumn data conceptually represents a map from a composite key derived from its axes to a value of the specified `valueType`.

*   **`PColumnKey`**: An array consisting of the specific values from each of the column's axes for a single data point. The order of values in the key array corresponds directly to the order of `AxisSpec` entries in the `axesSpec` list within the `PColumnSpec`. For example, if `axesSpec` is `[AxisA, AxisB]`, a key might look like `[valueA1, valueB1]`.
*   **`PColumnDataEntry`**: Represents a single point within the column's data, typically pairing a `PColumnKey` with its corresponding data value.

How these keys and values are physically stored depends on the chosen **Data Storage Type**.

**Links:**
*   TypeScript types: `PColumnKey`, `PColumnDataEntry` (imported from `@milaboratories/pl-model-common`, see usage in `sdk/model/src/render/util/pcolumn_data.ts`).

## Data Storage Types and Resource Types

Platforma uses different storage layouts (represented by specific **Resource Types**) for PColumn data to optimize for various dataset sizes and access patterns:

*   **`ResourceMap`**: A simple, non-partitioned format where data is stored as a direct key-to-value map within a single resource. Values in case of this layour are often files or other resources representing some "big" objects.
    *   Resource Type: `PColumnData/ResourceMap` (Constant: `RT_RESOURCE_MAP`)
    *   Suitable for storing files (like raw sample data)

*   **Partitioned Data**: Data is divided into multiple resources (partitions) based on the initial values of the `PColumnKey`. A metadata field (`partitionKeyLength`) indicates how many leading axis values form the partition key.
    *   **`JsonPartitioned`**: Partitions store data entries serialized as JSON.
        *   Resource Type: `PColumnData/JsonPartitioned` (Constant: `RT_JSON_PARTITIONED`)
    *   **`BinaryPartitioned`**: Partitions store data using an efficient binary format (often involving separate `.index` and `.values` components within the resource).
        *   Resource Type: `PColumnData/BinaryPartitioned` (Constant: `RT_BINARY_PARTITIONED`)

*   **Super-Partitioned Data**: An extension of partitioning, allowing for multiple levels of partitioning. Data is first partitioned by a `superPartitionKeyLength`, and within each super-partition, it's further partitioned by a `partitionKeyLength`.
    *   **`JsonSuperPartitioned`**: Multi-level partitioning with JSON data.
        *   Resource Type: `PColumnData/Partitioned/JsonPartitioned` (Constant: `RT_JSON_SUPER_PARTITIONED`)
    *   **`BinarySuperPartitioned`**: Multi-level partitioning with binary data.
        *   Resource Type: `PColumnData/Partitioned/BinaryPartitioned` (Constant: `RT_BINARY_SUPER_PARTITIONED`)
    *   **`Partitioned/ResourceMap`**: A specific two-level structure sometimes used.
        *   Resource Type: `PColumnData/Partitioned/ResourceMap` (Constant: `RT_RESOURCE_MAP_PARTITIONED`)

**Links:**
*   Resource Type Constants (TypeScript): Defined in `sdk/model/src/render/util/pcolumn_data.ts`.
*   Tengo schemas related to import/export configurations (which implicitly use these types): `sdk/workflow-tengo/src/pframes/util.lib.tengo`.
