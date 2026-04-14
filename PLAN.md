# Filter Column API — Implementation Plan

Spec: `docs/text/work/projects/pframes-api/05-filter-column-api.md`

## Goal

Make filter columns first-class block inputs across Model, UI,
and Workflow SDK layers.

## Key Types

```typescript
// lib/model/common/src/ref.ts — spec R1, R2, R3

// Stored in block args. column.requireEnrichments = true.
type PrimaryRef = {
  __isPrimaryRef: "v1"; // version marker
  column: PlRef;
  filter?: PlRef;
};

function isPrimaryRef(value: unknown): value is PrimaryRef;

// Block args accept either form — backward compat
type DatasetInput = PlRef | PrimaryRef;

// Produced by wf.resolve() — spec R4
type ResolvedPrimaryRef = {
  __isPrimaryRef: "v1";
  column: PColumnResult; // { spec, data }
  filter?: PColumnResult;
};
```

Detection: `PlRef` has `__isRef: true` at top level.
`PrimaryRef` has `__isPrimaryRef` at top level.
Dependency scanner deep-scans for `__isRef: true` — finds
nested PlRefs inside PrimaryRef without changes.

## Implementation Checklist

- [x] **Stage A** — Workflow Resolution Layer (R4, R5)
- [x] **Stage B** — PrimaryRef Types (R1, R2, R3)
- [x] **Stage C** — Filter Discovery (R6, R7)
- [x] **Stage D** — tableBuilder (R9-R12, R14)
- [ ] **Stage E** — PlDatasetSelector (R8)

## Dependencies and Parallelism

Stages ordered by risk (highest first) within dependency
constraints. If a high-risk stage reveals problems, we
re-estimate before investing in downstream work.

- Stages A, B have zero mutual dependencies — run in parallel
- Stage C depends on B
- Stage D blocked (open questions in milaboratory/text#34)
- Stage E depends on B+C (UX decided: conditional dropdown)

**Risk ranking:**

| Stage | Risk | Rationale |
| --- | --- | --- |
| A (workflow resolution) | High | Core resolve logic change + unproven await pattern on resolved PrimaryRef structures. If deep-walk breaks existing PlRef path or `_toRefOrJson()` doesn't handle mixed structures, blocks everything. |
| B (PrimaryRef types) | Low | Pure TS types + Zod. Mirrors PlRef. Dependency scanner already deep-scans for `__isRef`. |
| C (filter discovery) | Low | Uses proven `findColumns()` with verified annotation filtering. |
| D (tableBuilder) | High | Builder + ephemeral template + Query API inner-join. Blocked by open questions. |
| E (PlDatasetSelector) | Medium | Vue component, conditional dropdown UX. |

**Recommended execution order:**
Stage A -> Stage B -> Stage C (A and B in parallel;
C after B; focus review attention on A first)

### Cross-Phase: Phase 06 (processColumn Batch)

Phase 06 (`06-process-column-batch.md`) is developed in parallel
by another engineer. It depends on **Stages A and B only**:

- `PrimaryRef` / `ResolvedPrimaryRef` types (Stage B)
- `wf.resolve()` universal for PrimaryRef args (Stage A)
- `"PrimarySpecsReady"` await template (Stage A)

Phase 06 does **not** need Stages C-E (filter discovery,
tableBuilder, PlDatasetSelector).

**Merge conflict risk:**

| Stage | Phase 06 overlap | Risk |
| --- | --- | --- |
| A (`workflow/`, `tpl/`) | May read/test, shouldn't modify | Low |
| B (`ref.ts`) | Consumes types, doesn't modify | None |
| C (`sdk/model/src/columns/`) | Doesn't touch | None |
| D (`pframes/index.lib.tengo`) | Both add exports here | **High** |

Stage D and phase 06 both modify
`sdk/workflow-tengo/src/pframes/index.lib.tengo` (adding
exports) and both create new files in `pframes/`. Mitigations:

- Land A+B first — unblocks phase 06 immediately
- Coordinate on `pframes/index.lib.tengo` — add exports in
  separate sections to minimize diff overlap
- Stage D creates `table-builder.lib.tengo`; phase 06 modifies
  `process-pcolumn-data.tpl.tengo` — different files

## Stage A: Workflow Resolution Layer (R4, R5) — Risk: High

**Depends on:** nothing | **Status:** ready

**Delivers:** universal `wf.resolve()` that deep-walks
structures containing PlRefs + `"PrimarySpecsReady"` await
template for spec-only waiting in ephemeral templates.
Consumed by both phase 05 and phase 06.

### Universal wf.resolve() (R4)

Current `wf.resolve()`
(`sdk/workflow-tengo/src/workflow/index.lib.tengo:235`)
accepts only a single PlRef. Extend to deep-walk any
structure:

```go
// Current — unchanged (spec R3: backward compat)
wf.resolve(plRef)
// -> { spec, data }

// PrimaryRef with filter
wf.resolve({
    __isPrimaryRef: "v1",
    column: plRef,
    filter: filterPlRef
})
// -> {
//   __isPrimaryRef: "v1",
//   column: { spec, data },
//   filter: { spec, data }
// }

// Arbitrary nested structure
wf.resolve({ a: plRef1, b: { nested: plRef2 } })
// -> { a: { spec, data }, b: { nested: { spec, data } } }

// Options propagate to all refs
wf.resolve(primaryRef, { data: false })
// -> { __isPrimaryRef: "v1", column: { spec } }

// Zero PlRefs in non-PlRef input -> panic
wf.resolve({ noRefs: "here" }) // panics
```

**Files:**

1. `sdk/workflow-tengo/src/workflow/index.lib.tengo:235`
   — add deep-walk in `wf.resolve()` (spec R4 places
   the deep-walk here, not in `bquery.resolve()`)
2. `sdk/workflow-tengo/src/workflow/bquery.lib.tengo`
   — may add `_deepResolve` helper if needed

`_deepResolve` logic: check `__isRef` at current level ->
resolve via existing `bquery.resolve()`. Map without `__isRef`
-> recurse into values. Array -> recurse into elements. Track
PlRef count; panic if zero in non-PlRef input. Pass options to
each resolve call.

`_toRefOrJson()` (`smart.lib.tengo:291`) already handles mixed
structures (plain values + smart resource references) —
no changes needed.

### PrimarySpecsReady Await Template (R5)

**File:** `sdk/workflow-tengo/src/tpl/base.lib.tengo:79`
— add to `AWAIT_TEMPLATES` map:

```go
// Matches a v1 ResolvedPrimaryRef shape:
//   { __isPrimaryRef: "v1", column: {spec, data}, filter?: {spec, data} }
// Awaits column.spec (required) and filter.spec (optional, regex-matched).
// The `__isPrimaryRef` marker is ignored — we never descend into it.
// Usage: tpl.awaitState("primary", "PrimarySpecsReady")
"PrimarySpecsReady": [
    ["column", "spec", "ResourceReady"],
    [{ match: "^filter$" }, "spec", "ResourceReady"]
]
```

A wildcard pattern like `PColumnBundle` does not work here:
`__isPrimaryRef: "v1"` serializes as a JSON child field, and wildcard
traversal would panic trying to find `.spec` on a primitive. Explicit
paths into `column` and optional `filter` match R4's resolved shape.

### Verification — Stage A

- [x] `wf.resolve(plRef)` returns `{ spec, data }`
      (backward compat)
- [x] `wf.resolve(primaryRef)` preserves `__isPrimaryRef`,
      resolves nested `column` and `filter`
- [x] `wf.resolve(primaryRef, { data: false })` omits data
- [x] `wf.resolve({ noRefs: "here" })` panics
- [x] `wf.resolve({ a: plRef1, b: [plRef2] })` resolves both
- [x] `tpl.awaitState("x", "PrimarySpecsReady")` registers
- [x] Template body runs when specs ready, data still computing
- [x] End-to-end: resolve a PrimaryRef, pass to ephemeral
      template, awaitState proceeds when specs resolve

---

## Stage B: PrimaryRef Types (R1, R2, R3) — Risk: Low

**Depends on:** nothing | **Status:** ready

**Delivers:** `PrimaryRef` type, `isPrimaryRef()` guard,
`DatasetInput` union in `pl-model-common`. Consumed by all
downstream stages and phase 06.

**File:** `lib/model/common/src/ref.ts` — add after PlRef.
`index.ts` already re-exports via `export * from "./ref"`.

```typescript
export type PrimaryRef = {
  readonly __isPrimaryRef: "v1";
  readonly column: PlRef;
  readonly filter?: PlRef;
};

export function isPrimaryRef(
  value: unknown,
): value is PrimaryRef {
  return (
    typeof value === "object" &&
    value !== null &&
    "__isPrimaryRef" in value
  );
}

export type DatasetInput = PlRef | PrimaryRef;
```

### Verification — Stage B

- [x] `isPrimaryRef({ __isPrimaryRef: "v1", column: ref })`
      returns `true`
- [x] `isPrimaryRef(somePlRef)` returns `false`
- [x] `isPlRef(somePrimaryRef)` returns `false`
- [x] Dependency scanner finds `__isRef: true` inside nested
      `column` and `filter` fields
- [x] Existing code using `PlRef` compiles unchanged

---

## Stage C: Filter Discovery (R6, R7) — Risk: Low

**Depends on:** Stage B | **Status:** ready

**Delivers:** `findFilterColumns()` helper — complete
model-side filter discovery. Consumed by Stage E
(PlDatasetSelector) and block model code.

Compatible filter (CTO, milaboratory/text#34): `"enrichment"`
kinship, annotation `pl7.app/isSubset: "true"`, axes subset
of dataset's axes.

**File:** `sdk/model/src/columns/` — new file, standalone
helper. Domain knowledge stays out of the generic
`AnchoredColumnCollection` interface.

```typescript
// Standalone helper — spec R6 leaves API shape at
// implementor's discretion. Standalone chosen because
// filter discovery is a domain concept, not a data
// access capability. AnchoredColumnCollection stays
// generic; new column use-cases don't bloat its interface.
//
// ColumnSelectorInput supports annotations natively
// (column_selector.test.ts has explicit tests).
export function findFilterColumns(
  collection: AnchoredColumnCollection,
): ColumnMatch[] {
  return collection.findColumns({
    mode: "enrichment",
    include: {
      annotations: { "pl7.app/isSubset": "true" },
    },
  });
}
```

**Label derivation (R7):** start with existing `deriveLabels()`
at `sdk/model/src/render/util/label.ts` (uses `pl7.app/label`
and `pl7.app/trace`). Filter-specific algorithm is a follow-up
if labels are ambiguous. (spec: flagged as risk)

### Verification — Stage C

- [x] Returns only columns with `pl7.app/isSubset: "true"`
- [x] Returned filters have axes subset of dataset's axes
- [x] Filter labels are human-readable and distinct
      (uses existing `deriveLabels()` — filter-specific
      algorithm is a follow-up if labels are ambiguous)
- [x] Empty result when no filters exist

---

## Stage D: tableBuilder (R9-R12, R14) — Risk: High

**Depends on:** Stage A | **Status:** done

**Delivers:** `pframes.tableBuilder(format)` API with
`.build()` producing a filtered exported file. Builder +
`:pframes.build-table` ephemeral template as one unit.

Resolved questions (milaboratory/text#34, dbolotin 2026-04-08):

1. **Export format:** files only — tsv/csv/parquet/ndjson.
   No `"pframe"` output needed.
2. **Query language:** legacy format sufficient for this stage.
   Full query language exposure is future work.

**New file:**
`sdk/workflow-tengo/src/pframes/table-builder.lib.tengo`

**Modify:**
`sdk/workflow-tengo/src/pframes/index.lib.tengo`
— export `tableBuilder`

### Builder API (spec R9, R10, R11)

```go
// spec R9: construction
tableBuilder := func(format) // "tsv", "csv", "parquet", "ndjson"

// spec R10: primary — defines the key space
// name: anchor identifier for column axis references
// value: PlRef | PrimaryRef | PColumnResult
//        | ResolvedPrimaryRef
// opts[0].header: column header in exported file
.addPrimary(name, value, ...opts)

// spec R11: enrichment columns — joined onto primary
// query: column query spec with anchored axes,
//        or resolved PColumnResult { spec, data }
// Anchored axes reference primaries by name:
//   { anchor: "main", name: "pl7.app/sampleId" }
//   { anchor: "main", idx: 0 }
.addColumn(query, ...opts)   // opts[0].header
                             // exactly 1 match; panics on 0
.addColumns(query, ...opts)  // opts[0].headerPrefix,
                             // opts[0].headerSuffix
                             // 0 matches = empty set (no error)

// Configuration
.setJoinMode(mode)               // "inner" (default) | "full"
.setAxisHeader(matcher, header)  // matcher: name or AxisSpec
.cpu(cores)
.mem(size)                       // e.g., "16GiB"

// spec R12: returns ResourceRef to exported file
.build()
```

### Input Detection (spec R10, R11)

```go
_isUnresolved := func(value) {
    // Priority 1: __isRef: true anywhere -> unresolved
    if ll.isMap(value) {
        if value.__isRef == true { return true }
        for _, v in value {
            if _isUnresolved(v) { return true }
        }
    }
    return false
}

_isResolvedColumn := func(value) {
    // Priority 2: has spec + data -> PColumnResult
    return ll.isMap(value) &&
        !is_undefined(value.spec) &&
        !is_undefined(value.data)
}

// Priority 3: __isPrimaryRef with resolved columns
//             -> ResolvedPrimaryRef
// Priority 4: otherwise -> column query spec
//             (resolve via bquery.anchoredQuery())
```

Unresolved inputs require workflow context; panics without it.

### .build() + Ephemeral Template (spec R12, R14)

When unblocked: `:pframes.build-table` ephemeral template.
Await specs via `"PrimarySpecsReady"`, resolve via
`bquery.anchoredQuery()`, assemble PFrame (reuse
`xsvFileBuilder._constructPFrameAndDistillSpecs()`), inner-join
with filter via PFrames Query API (`JoinKind::Inner` in
`pframes-rs/packages/bridge/src/query/query_join_kind.rs`),
export. Single join regardless of column count. (spec R14)

### Verification — Stage D

- [x] `pframes.tableBuilder("tsv")` returns builder
- [x] `.addPrimary("main", plRef)` detects unresolved
- [x] `.addPrimary("main", { spec, data })` detects resolved
- [x] `.addPrimary("main", primaryRef)` detects PrimaryRef
- [x] `.addColumn({ axes: [...] })` detects query spec
- [x] `.addColumn({ spec, data })` detects resolved column
- [x] `.build()` without `.addPrimary()` panics
- [x] Chaining works
- [x] `.build()` produces filtered TSV with correct rows
- [x] Inner-join reduces key space, enrichments contain only
      surviving keys
- [x] Existing blocks using `xsvFileBuilder` unaffected

---

## Stage E: PlDatasetSelector (R8) — Risk: Medium

**Depends on:** Stage B, Stage C | **Status:** ready

**Delivers:** Vue component — select dataset + optional filter,
emit `PrimaryRef`. File: `sdk/ui-vue/src/components/`.

**UX: conditional second dropdown.**
Spec lists flat vs hierarchical as open question.
Decision: hierarchical with conditional filter dropdown.

Rationale (per `docs/text/principles/progressive-disclosure.md`):

- No filters: one dropdown, identical to `PlDropdownRef`
- Filters exist: second dropdown appears, defaults to
  "No filter" — no action required
- Complexity revealed only when relevant
- Flat rejected: imposes filter complexity on all users,
  O(datasets x filters) list length

```text
// Dataset with filters:
[Dataset A          ▼]
[No filter          ▼]  ← conditional, has sensible default

// Dataset without filters:
[Dataset B          ▼]  ← single dropdown, same as PlDropdownRef
```

### Verification — Stage E

- [ ] Single dataset dropdown when no filters exist
- [ ] Filter dropdown appears when selected dataset has filters
- [ ] Filter dropdown defaults to "No filter"
- [ ] Filter dropdown hidden when dataset has no filters
- [ ] Emits `PrimaryRef` with `filter: undefined` when
      "No filter" selected or no filters exist
- [ ] Emits `PrimaryRef` with filter PlRef when filter selected
- [ ] Switching dataset resets filter to "No filter"

## File Index

| File | Stages | Action |
| --- | --- | --- |
| `lib/model/common/src/ref.ts` | B | PrimaryRef, isPrimaryRef, DatasetInput |
| `sdk/workflow-tengo/src/workflow/index.lib.tengo` | A | Extend resolve() with deep-walk |
| `sdk/workflow-tengo/src/workflow/bquery.lib.tengo` | A | Deep-walk helper if needed |
| `sdk/workflow-tengo/src/tpl/base.lib.tengo` | A | PrimarySpecsReady await template |
| `sdk/model/src/columns/` | C | Filter discovery helper |
| `sdk/model/src/render/util/label.ts` | C | Filter labels if needed |
| `sdk/workflow-tengo/src/pframes/table-builder.lib.tengo` | D | tableBuilder API + build template |
| `sdk/workflow-tengo/src/pframes/index.lib.tengo` | D | Export tableBuilder |
| `sdk/ui-vue/src/components/` | E | PlDatasetSelector |

## Edge Cases

| Case | Handling |
| --- | --- |
| Primary is `PlRef` (no filter) | No inner-join |
| `PrimaryRef` with `filter: undefined` | Same as plain PlRef |
| No `.addPrimary()` before `.build()` | Panic |
| Zero columns added | Export primary columns only |
| `addColumn` matches zero | Panic |
| `addColumns` matches zero | Empty set, no error |
| Unresolved input without workflow context | Panic |
| Mix resolved + unresolved columns | Each detected independently |
| Filter axes not subset of dataset axes | Not in discovery results |
| No compatible filters for dataset | UI hides filter dropdown |
