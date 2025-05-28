# PColumn

PColumn (Platforma Column) is a fundamental data structure within the Platforma framework, representing a strongly-typed column of data indexed by a set of axes. It serves as the primary way to manage and manipulate tabular and multi-dimensional data within workflows and applications.

## PColumn Specification (`PColumnSpec`)

Each PColumn is defined by its metadata, known as `PColumnSpec`. This specification adheres to the general structure of Platforma Objects (`PObject`) but is specialized for columnar data. The key components of a `PColumnSpec` are:

- **`kind`**: Must be `"PColumn"`.
- **`valueType`**: Defines the data type of the values stored in the column (e.g., `Int`, `Long`, `Float`, `Double`, `String`, `Bytes`).
- **`name`**: A logical, human-readable name for the column.
- **`domain`**: A key-value map providing additional identifying information beyond the name and type. This helps differentiate columns that might otherwise seem similar.
- **`annotations`**: A key-value map for storing arbitrary metadata that doesn't affect the column's identity (e.g., `pl7.app/label` for UI display names).
- **`axesSpec`**: An ordered list of `AxisSpec` objects defining the axes that index the column's data. Each `AxisSpec` includes its own type, name, domain, annotations, and potentially references to parent axes, forming a hierarchical structure if needed.

**Links:**
- Tengo validation schema: See `P_COLUMN_SPEC_SCHEMA` and `P_AXIS_SPEC_SCHEMA` in `sdk/workflow-tengo/src/pframes/spec.lib.tengo`.
- TypeScript definition: `PColumnSpec` and `AxisSpec` (imported from `@milaboratories/pl-model-common`, see usage in `sdk/model/src/render/util/column_collection.ts`).

## Representation in Platforma: PFrame

A PColumn typically exists within the context of a **PFrame**. A PFrame acts as a container or collection manager for multiple PColumns.

Within the underlying storage managed by a PFrame (a structural platforma resource with type `PFrame`), each PColumn is commonly represented by two associated components, often distinguished by their local column ids:

1.  **Specification Resource (e.g., `column_id.spec`)**: Contains the JSON representation of the `PColumnSpec` object described above. This resource defines the structure, types, and metadata of the column.
2.  **Data Resource (e.g., `column_id.data`)**: Contains the actual data values, mapped according to the axes defined in the spec. The internal structure of this component depends on the chosen **Data Storage Type** (see below).

The PFrame implementation is responsible for managing these pairs, linking a specific `.spec` with its corresponding `.data`, and providing unified access to the columns it contains.

**Links:**
- `PFrame` interface/implementation: `sdk/model/src/pframe.ts`.
- Relevant resource types can be found in `sdk/workflow-tengo/src/pframes/constants.lib.tengo`.
- Tengo code provide builder for `PFrame` as `pframes.pFrameBuilder()`

## Data Structure: Keys and Values

PColumn data conceptually represents a map from a composite key derived from its axes to a value of the specified `valueType`.

- **`PColumnKey`**: An array consisting of the specific values from each of the column's axes for a single data point. The order of values in the key array corresponds directly to the order of `AxisSpec` entries in the `axesSpec` list within the `PColumnSpec`. For example, if `axesSpec` is `[AxisA, AxisB]`, a key might look like `[valueA1, valueB1]`.
- **`PColumnDataEntry`**: Represents a single point within the column's data, typically pairing a `PColumnKey` with its corresponding data value.

How these keys and values are physically stored depends on the chosen **Data Storage Type**.

**Links:**
- TypeScript types: `PColumnKey`, `PColumnDataEntry` (imported from `@milaboratories/pl-model-common`, see usage in `sdk/model/src/render/util/pcolumn_data.ts`).

## `PColumnData` Reference (Data Storage Layout Variants)

This section details the structure of the **data resource** associated with a PColumn, based on its `Resource Type`. The PFrame manages a `.spec` (see `PColumnSpec` section) and a `.data` resource for each column. The content of this primary `.data` resource varies as described below.

All PColumn keys, when serialized as strings (e.g., for map keys in JSON or as parts of resource field names), are JSON-encoded arrays (e.g., `"[\\"key0\\",1,\\"key2\\"]"`).

```typescript
type PColumKey = string // i.e. `["key0",1,"key2"]`
```

Platforma employs a universal resource model. Every PColumn, like any Platforma entity, is represented as a resource. A resource is defined by: (1) its `resource type` (e.g., `PColumnData/Json`), (2) its `resource data` (a payload of bytes, typically JSON, whose meaning depends on the resource type), and (3) its `fields` (named references to other resources, usually 'input' fields unless stated otherwise, also regulated by resource type).

In the context of `PColumnData` resources:
  - For types like `PColumnData/Json`, the `resource data` directly holds the column's actual key-value content.
  - For partitioned types (e.g., `PColumnData/JsonPartitioned`), the `resource data` of the PColumn's main `.data` resource contains metadata defining the partitioning scheme (like `partitionKeyLength`). The actual data segments are then held in separate resources linked via resource fields. These resources in turn represent a reference to potentially large data segments stored elswhere.
  - For `PColumnData/ResourceMap`, the `resource data` stores metadata such as the `keyLength`, while its fields map keys to the actual resource references.

The following sections detail the specific structure of the `resource data` and any associated partition data resources for each `PColumnData` resource type.

---

- **Resource Type**: `PColumnData/Json`
  - **Resource Data Schema**
    ```typescript
    {
      keyLength: number, // integer (total number of elements in each `PColumnKey`)
      data: Record<PColumKey, string | number>
    }
    ```
  - **Resource Fields**: none

---

- **Resource Type**: `PColumnData/ResourceMap`
  - **Description**: A non-partitioned format storing a map from `PColumnKey`s to `PResourceRef`s (references to other Platforma resources, often files). The entire map is within a single data resource.
  - **Resource Data Schema**
    ```typescript
    {
      keyLength: number, // integer (total number of elements in each `PColumnKey`)
    }
    ```
  - **Resource Fields**: Maps stringified `PColumnKey`s to arbitrary platforma resources.

---

- **Resource Type**: `PColumnData/JsonPartitioned`
  - **Description**: Data is partitioned based on a prefix of the `PColumnKey`. The resource specifies the partitioning scheme in its data section, and links each partition by a field pointing to a resource representing a JSON file.
  - **Resource Data Schema**
    ```typescript
    {
      partitionKeyLength: number; // integer (number of leading key elements for partitioning; the resulting partition key is stringified and used as a field name)
    }
    ```
  - **Resource Fields**: Maps stringified partition keys to partition data resources (which are JSON files in this case, stored in a separate storage).

---

- **Resource Type**: `PColumnData/BinaryPartitioned`
  - **Description**: Data is partitioned based on a prefix of the `PColumnKey`. The resource specifies the partitioning scheme in its data section, and links each partition by two fields pointing to a resource representing a file with partition data index (fields named with `.index` suffix) and partition data values (fields named with `.values` suffix), stored in a binary format.
  - **Resource Data Schema**
    ```typescript
    {
      partitionKeyLength: number; // integer (number of leading key elements for partitioning; the resulting partition key is stringified and used as a field name)
    }
    ```
  - **Resource Fields**: Maps stringified partition keys to `PResourceRef`s for the binary partition data resources:
    - Fields with names like `["key0",1,"key2"].index` point to binary encoded index of a partition
    - Fields with names like `["key0",1,"key2"].values` point to binary encoded values part of a partition

---

- **Resource Type**: `PColumnData/Partitioned/JsonPartitioned`
  - **Description**: Super-partitioned data where each super-partition is further partitioned into JSON data resources. The main resource defines the super-partitioning scheme, and its fields point to intermediate `PColumnData/JsonPartitioned` resources.
  - **Resource Data Schema**
    ```typescript
    {
      superPartitionKeyLength: number; // integer (number of leading key elements for the first level of partitioning)
      partitionKeyLength: number; // integer (number of leading key elements for the second level of partitioning; the same value will be in all child PColumnData/JsonPartitioned resource data sections)
    }
    ```
  - **Resource Fields**: Maps stringified super-partition keys to `PColumnData/JsonPartitioned` resources. Each of these, in turn, will have its own `partitionKeyLength` (with the same value as in this resource data) and fields pointing to the actual JSON data partitions.

---

- **Resource Type**: `PColumnData/Partitioned/BinaryPartitioned`
  - **Description**: Super-partitioned data where each super-partition is further partitioned into binary data resources. The main resource defines the super-partitioning scheme (including the `partitionKeyLength` for the child partitions), and its fields point to intermediate `PColumnData/BinaryPartitioned` resources.
  - **Resource Data Schema**
    ```typescript
    {
      superPartitionKeyLength: number; // integer (number of leading key elements for the first level of partitioning)
      partitionKeyLength: number; // integer (number of leading key elements for the second level of partitioning; the same value will be in all child PColumnData/BinaryPartitioned resource data sections)
    }
    ```
  - **Resource Fields**: Maps stringified super-partition keys to `PColumnData/BinaryPartitioned` resources. Each of these, in turn, will have its own `partitionKeyLength` (with the same value as in this resource data) and fields pointing to the binary data partitions (both `.index` and `.values` files).

---

- **Resource Type**: `PColumnData/Partitioned/ResourceMap`
  - **Description**: Data is first partitioned by a prefix of the `PColumnKey`. Each partition is then a `PColumnData/ResourceMap`, meaning it directly maps the remaining parts of the key to resource references.
  - **Resource Data Schema**
    ```typescript
    {
      partitionKeyLength: number; // integer (number of leading key elements for partitioning; the resulting partition key is stringified and used as a field name)
      keyLength: number, // integer (number of remaining key elements used in child `PColumnData/ResourceMap` to refer to the actual platforma resources)
    }
    ```
  - **Resource Fields**: Maps stringified partition keys to `PColumnData/ResourceMap` resources. Each of these `PColumnData/ResourceMap` resources will then have its own `keyLength` (for the remaining key elements; the same value of `keyLength` in this resource data) and fields mapping the rest of the stringified key to the actual platforma resources.

---

**Links:**
- Resource Type Constants (TypeScript): Defined in `sdk/model/src/render/util/pcolumn_data.ts`.
- Tengo schemas related to import/export configurations (which implicitly use these types): `sdk/workflow-tengo/src/pframes/util.lib.tengo`.
