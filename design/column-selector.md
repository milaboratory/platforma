# Column Selector

A `ColumnSelector` selects PColumns by matching against their spec properties. It serves as the standard predicate for column discovery and filtering throughout the platform.

## Strict Form

The strict form is what the API accepts and what appears in serialized contexts (e.g., `excludeColumns` annotation on linker columns). All values are arrays of string matcher objects. No ambiguity.

```yaml
ColumnSelector[]:                                    # OR across selectors
  ColumnSelector:                                    # AND across fields
    name?:           StringMatcher[]                 # OR across matchers
    type?:           ValueType[]                     # OR across types
    domain?:         Record<string, StringMatcher[]>  # keys AND-ed, matchers per key OR-ed
    contextDomain?:  Record<string, StringMatcher[]>  # same
    annotations?:    Record<string, StringMatcher[]>  # same
    axes?:           AxisSelector[]
    partialAxesMatch?: boolean                       # default: true

AxisSelector:                                        # AND across fields
  name?:           StringMatcher[]
  type?:           ValueType[]
  domain?:         Record<string, StringMatcher[]>
  contextDomain?:  Record<string, StringMatcher[]>
  annotations?:    Record<string, StringMatcher[]>

StringMatcher:
  { exact: string }
  { regex: string }
```

### Composition Rules

Three levels of composition:

| Level                 | Operator                    | Meaning                                                        |
| --------------------- | --------------------------- | -------------------------------------------------------------- |
| **Top level**         | `ColumnSelector[]` — **OR** | A column matches if it satisfies **any** selector in the array |
| **Within a selector** | fields — **AND**            | A column must satisfy **every** present field                  |
| **Within a field**    | `StringMatcher[]` — **OR**  | A value matches if it satisfies **any** matcher in the array   |

For `domain`, `contextDomain`, and `annotations` (record fields): keys are AND-ed (every key must match), matchers per key are OR-ed (any matcher for that key satisfies it).

## StringMatcher

### `exact`

Matches if the value equals the given string exactly.

```json
{ "exact": "pl7.app/vdj/sequence" }
```

### `regex`

Matches if the value matches the given regex pattern (full match).

```json
{ "regex": "pl7\\.app/vdj/.*" }
```

## Column-Level Fields

### `name`

Matches if the column's name satisfies **any** of the matchers.

```json
{ "name": [{ "exact": "pl7.app/vdj/sequence" }, { "exact": "pl7.app/vdj/geneHit" }] }
```

### `type`

Matches if the column's `valueType` equals **any** of the listed types.

```json
{ "type": ["Int", "Long"] }
```

### `domain`

Matches if the column's combined domain satisfies all listed keys. The combined domain merges the column's own `domain` with all axis domains.

Each key must be present in the column's domain, and its value must satisfy **any** of the matchers for that key.

```json
{
  "domain": {
    "pl7.app/vdj/chain": [{ "exact": "IGHeavy" }]
  }
}
```

Domain presence uses `strictly_kin` semantics — the column's domain can have keys not listed in the selector. The selector only constrains the keys it specifies.

### `contextDomain`

Same semantics as `domain`, applied to the column's combined context domain.

```json
{
  "contextDomain": {
    "point": [{ "exact": "from" }]
  }
}
```

### `annotations`

Matches if the column's annotations satisfy all listed keys. Each key must be present, and its value must satisfy **any** of the matchers for that key.

```json
{
  "annotations": {
    "pl7.app/isLinkerColumn": [{ "exact": "true" }],
    "pl7.app/label": [{ "regex": ".*CDR3.*" }]
  }
}
```

## Axis Filtering

`axes` and `partialAxesMatch` filter columns by their axis structure. This is a structural predicate — it checks whether a column's axes match certain criteria. It is orthogonal to axis _compatibility_ checking (`AxesSpec` + `MatchingConstraints` in `discoverColumns`), which computes qualification mappings.

### `axes`

A list of `AxisSelector` entries. Each entry matches an axis by name, type, domain, contextDomain, and/or annotations.

```yaml
AxisSelector:
  name?: StringMatcher[]
  type?: ValueType[]
  domain?: Record<string, StringMatcher[]>
  contextDomain?: Record<string, StringMatcher[]>
  annotations?: Record<string, StringMatcher[]>
```

All specified fields within an `AxisSelector` are AND-ed.

### `partialAxesMatch`

Controls how `axes` entries match against the column's axis list.

**`true` (default):** Each `AxisSelector` entry must match at least one of the column's axes. The column can have additional axes not covered by the selector. Order does not matter.

```json
{
  "axes": [{ "name": [{ "exact": "pl7.app/vdj/clonotypeKey" }] }],
  "partialAxesMatch": true
}
```

Matches any column that has a `clonotypeKey` axis, regardless of other axes.

**`false`:** The column must have exactly as many axes as selector entries, and each selector entry must match the axis at the same position.

### Axis Filtering vs. Axis Compatibility

| Mechanism                          | Purpose                                                                                      | Where                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `ColumnSelector.axes`              | Structural pre-filter: "does this column have axes matching these criteria?"                 | `ColumnSelector` (cheap, runs first)                |
| `AxesSpec` + `MatchingConstraints` | Compatibility: "can this column be integrated with my axes? What qualifications are needed?" | `discoverColumns` request (computes qualifications) |

In `discoverColumns`, the selector narrows the candidate set; the compatibility check then computes qualifications on what remains.

## Relaxed Form and Normalization

The relaxed form accepts plain strings and scalars wherever the strict form requires arrays and matcher objects. A normalization procedure converts relaxed form to strict form. Relaxed form is convenient for hand-written selectors; strict form is what the API and serialized annotations use.

### Normalization Rules

| Relaxed input                                                             | Strict output                                         |
| ------------------------------------------------------------------------- | ----------------------------------------------------- |
| Plain string `"foo"` where `StringMatcher[]` expected                     | `[{ "exact": "foo" }]`                                |
| Single `StringMatcher` object (not in array)                              | `[StringMatcher]`                                     |
| Array of mixed strings and `StringMatcher` objects                        | Each string → `{ "exact": "..." }`, wrap all in array |
| Single `ValueType` where `ValueType[]` expected                           | `[ValueType]`                                         |
| `Record<string, string>` where `Record<string, StringMatcher[]>` expected | Each value → `[{ "exact": "..." }]`                   |
| Single `ColumnSelector` (not in array)                                    | `[ColumnSelector]`                                    |

`axes` always requires an `AxisSelector[]` array — no single-object relaxation. An array of axis selectors is the natural form (columns have multiple axes), so wrapping a single selector adds no burden. Within each `AxisSelector`, the same string/matcher normalization applies to field values.

### Examples

**Relaxed:**

```json
{
  "name": "pl7.app/vdj/sequence",
  "domain": { "pl7.app/vdj/chain": "IGHeavy" }
}
```

**Strict equivalent:**

```json
[
  {
    "name": [{ "exact": "pl7.app/vdj/sequence" }],
    "domain": {
      "pl7.app/vdj/chain": [{ "exact": "IGHeavy" }]
    }
  }
]
```

**Two selectors OR-ed (relaxed):**

```json
[
  { "name": "pl7.app/vdj/sequence" },
  { "name": "pl7.app/vdj/geneHit", "domain": { "pl7.app/vdj/chain": "IGHeavy" } }
]
```

Matches columns named `sequence` (any domain) **OR** columns named `geneHit` with chain IGHeavy.

**Regex on annotation, exact on name (relaxed):**

```json
{
  "name": ["pl7.app/vdj/sequence", "pl7.app/vdj/geneHit"],
  "annotations": { "pl7.app/label": { "regex": ".*CDR3.*" } }
}
```

**Domain key with multiple values (relaxed):**

```json
{ "domain": { "pl7.app/vdj/chain": ["IGHeavy", "IGLight"] } }
```

Matches columns whose chain is IGHeavy **OR** IGLight.

**Axis selector (relaxed):**

```json
{
  "axes": [{ "name": "pl7.app/vdj/clonotypeKey" }],
  "partialAxesMatch": true
}
```

**`excludeColumns` annotation on linker (strict, serialized as JSON string):**

```json
[{ "domain": { "pl7.app/vdj/chain": [{ "exact": "IGHeavy" }] } }]
```

## Related

- [PColumn Specification](spec-description.md) — defines domain and contextDomain semantics
- [Linker Columns](linker-column.md) — uses ColumnSelector for traversal filtering via `excludeColumns`
- [Phase 3: Column Discovery](../../work/projects/pframes-api/phase-3.md) — primary consumer of ColumnSelector in `discoverColumns`
