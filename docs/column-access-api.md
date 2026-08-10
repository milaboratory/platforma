# Column Access API — Surface Reference

Everything a block model uses to find, describe and hand off PColumns:
`ColumnsCollection`, `Column` / `ColumnRecipe` / `DataColumn`, the predicates,
the selector shapes, and the consumers that accept column ids.

All names below are exported from `@platforma-sdk/model`. Source lives in
`sdk/model/src/columns/` unless stated otherwise.

**Related docs.** [`migrations/2026-05-20-new-column-access-mechanism.md`](../migrations/2026-05-20-new-column-access-mechanism.md)
maps the old API onto this one and is the place for "what replaced X" —
this document is the surface itself, for code that has no old shape to
migrate from. [`column-identity.md`](./column-identity.md) covers the
physical/logical id split and the recipe-authoring contract.

## The Model in Six Lines

1. A column **is** its id — a `ColumnUniversalId` string. Everything else is
   derived from it.
2. A `ColumnRecipe` is a typed, immutable accessor over one id. It is a
   description of how to obtain a column, not the column's contents.
3. Discovery and filtering run **on the host**, against the host's spec frame.
   The sandbox only ever holds ids and opaque handles.
4. `getSpec()` is a host round-trip per column. Columns you never inspect cost
   nothing.
5. Data is mostly _not_ readable in the sandbox. Hand `recipe.id` to the host
   (`createPFrame` / `createPTableV2` / `createPlDataTableV3`) and let it
   materialise.
6. Nothing is mutable. To get a different spec, encode it into a new id with
   `withSpecs(patch)`.

The 8 MB sandbox input limit is why all six hold. Pulling specs you don't need
is the failure mode this API exists to prevent.

## Export Map

Every public export of the module, by role. Details follow in the sections below.

### Discovery

| Export                               | Kind            | One-liner                                                             |
| ------------------------------------ | --------------- | --------------------------------------------------------------------- |
| `ColumnsCollection(sources?, deps?)` | function + type | Host-driven column set. Entry point for all discovery.                |
| `isColumnsCollection(value)`         | guard           | Narrows to `ColumnsCollection`.                                       |
| `ColumnsSourceShorthand`             | type            | `"result_pool" \| "current_block"`.                                   |
| `ColumnsSource`                      | type            | Provider / accessor / `{ columns, isFinal }`.                         |
| `ColumnsCollectionDeps`              | type            | `{ ctx?, driver? }` — ctx override and test seam.                     |
| `ColumnsCollectionImpl`              | class           | Instance type behind `ColumnsCollection`; never constructed directly. |

### Columns

| Export                              | Kind                 | One-liner                                                                                                   |
| ----------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `Column(source, opts?)`             | function + type      | Unified factory: string id or object source → `ColumnRecipe`.                                               |
| `ColumnRecipe`                      | interface + function | The recipe contract; also the id-shape-dispatching factory.                                                 |
| `ColumnRecipe.getStatus(id, opts?)` | function             | Resolution status of an id without building the recipe.                                                     |
| `DataColumn(source, opts?)`         | function             | Leaf factory, plus `.fromId` / `.fromPlRef` / `.fromAccessor` / `.fromColumn` and the `getStatus*` statics. |
| `DataColumnRecipe`                  | interface            | `ColumnRecipe` + `getData()`.                                                                               |
| `ColumnSource`                      | type                 | Input union of `Column(...)`.                                                                               |
| `DataColumnSource`                  | type                 | Input union of `DataColumn(...)`.                                                                           |
| `DataColumnId`                      | type                 | Alias of `PObjectId` — a leaf's id.                                                                         |
| `ColumnData`                        | type                 | `undefined \| PColumnDataUniversal` — what `getData()` returns.                                             |
| `ColumnDiscoveredRecipe`            | class                | Discovery hit reached through a linker chain.                                                               |
| `ColumnFilteredRecipe`              | class                | Axis-sliced projection.                                                                                     |
| `ColumnOverriddenRecipe`            | class                | Spec-patched projection.                                                                                    |
| `DataColumnImpl`                    | class                | Leaf implementation. Internal — hold `DataColumnRecipe`.                                                    |

You do not name the recipe classes in ordinary block code. They are listed
because they appear in stack traces and in `instanceof` checks inside the SDK;
narrow with the predicates instead.

Two more classes exist in that file set and are deliberately **not** exported
from `@platforma-sdk/model`: `DataColumnOverriddenRecipe` (the data-bearing
variant of an override, which is what `hasReachableData` tests for) and
`rebrandLeafId` (the wrapper-query helper described in
[`column-identity.md`](./column-identity.md)). You will see them in SDK code;
you cannot import them.

### Predicates

| Export                         | Kind                                  | Answers                                                |
| ------------------------------ | ------------------------------------- | ------------------------------------------------------ |
| `isColumn(value)`              | guard                                 | Is this any recipe?                                    |
| `hasReachableData(recipe)`     | guard → `DataColumnRecipe`            | Can I read the data here, consistent with the spec?    |
| `hasSingleDataColumn(recipe)`  | boolean                               | Does it read exactly one storage column?               |
| `isDataColumn(value)`          | guard → `DataColumnRecipe<PObjectId>` | Is this a bare leaf, i.e. is its `id` a `PObjectId`?   |
| `hasColumnData(recipe, opts?)` | boolean                               | Do the underlying data resources actually carry bytes? |
| `isLeafColumn`                 | deprecated alias                      | Same as `hasSingleDataColumn`.                         |

### Status and Errors

| Export                   | Kind  | One-liner                                                                                |
| ------------------------ | ----- | ---------------------------------------------------------------------------------------- |
| `ColumnFieldStatus`      | type  | `"present" \| "resolving" \| "absent"` — data-field status, worst across referenced ids. |
| `ColumnResolutionStatus` | type  | Same value space; folds spec + registry readiness.                                       |
| `ColumnAbsentError`      | class | Thrown by factories when a column provably will not appear.                              |

### Utilities

| Export                                       | Kind     | One-liner                                                               |
| -------------------------------------------- | -------- | ----------------------------------------------------------------------- |
| `deriveColumnOptions(source, labelOptions?)` | function | `ColumnOption[]` — `{ id, label }` drop-down options over a collection. |
| `ColumnOption`                               | type     | `{ id: ColumnUniversalId; label: string }`.                             |
| `splitByAxes(inputs, splitAxes, opts?)`      | function | Fan a column out into one recipe per distinct value of the given axes.  |
| `SplitAxis`, `SplitByAxesOpts`               | types    | `{ idx }` and `{ axisValuesLabels? }`.                                  |

### Exported but Not Part of the Surface

The module also exports the names below. They exist for the SDK's own consumers
and are not the utility surface a block writes against — a block that reaches
for one is usually re-implementing something `ColumnsCollection` or
`createPlDataTableV3` already does. Listed so you know what they are when you
meet them in SDK code, not so you call them.

| Export                                   | What it is                                                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `deriveAxisValuesLabels(source?, opts?)` | Builds an `(axisId) => Record<value, label>` callback from `pl7.app/label` columns — the shape `splitByAxes`'s `axisValuesLabels` option takes. |
| `collectLinkerIds(recipe)`               | Non-hit `PObjectId`s referenced by the recipe's query.                                                                                          |
| `collectLinkerColumns(recipe, opts?)`    | The same set, resolved to leaves. Throws if any is unresolvable.                                                                                |
| `hitQualifications(recipe)`              | Hit-side axis qualifications, or `[]`.                                                                                                          |
| `queriesQualifications(recipe)`          | Per-primary-column axis qualifications, or `{}`.                                                                                                |

If you do end up needing one of the last four, use them rather than descending
the wrapper classes by hand: they encapsulate the layering invariants
(`Overridden` / `Filtered` over at most one `Discovered`) and keep working as
wrappers are added.

### Providers — Plumbing

Rarely needed in block code: `ColumnsCollection` sources cover the same ground
with less ceremony. Reach for these only when you need a provider object itself.

| Export                                                         | Kind                | One-liner                                                                                 |
| -------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| `ColumnsProvider`                                              | interface + factory | `{ getColumns(), isFinal() }`; the factory dispatches on accessor vs upstream-block list. |
| `ArrayColumnsProvider`                                         | class               | Wraps a `PColumn[]` / leaf array. Prefer the `{ columns, isFinal }` source shape.         |
| `AccessorColumnsProvider`, `ResultPoolColumnsProvider`         | factory + type      | Memoised providers over an accessor root / the result pool.                               |
| `AccessorColumnsProviderImpl`, `ResultPoolColumnsProviderImpl` | classes             | Their implementations.                                                                    |
| `isColumnProvider`, `toColumnProvider`, `getCtxProviders`      | functions           | Shape guard, coercion, ambient-ctx provider triplet.                                      |

## `ColumnsCollection`

```ts
ColumnsCollection(
  sources?: (ColumnsCollection | ColumnsSource | ColumnsSourceShorthand)[],
  deps?: { ctx?: GlobalCfgRenderCtx; driver?: ColumnsCollectionDriverModel },
): ColumnsCollection;
```

A sandbox proxy over a host-owned column set (`columns_collection.ts`). It holds
an opaque `CollectionHandle` and a driver reference — no specs, no data. There
is no `dispose()`: the host pins each handle to the active render ctx.

**Sources.** Omitting `sources` means current block outputs + prerun + result
pool. Narrow it aggressively — every entry widens the host-side spec frame the
collection queries against.

| Source entry           | Expands to                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `"current_block"`      | `outputs` + `prerun` accessors of this block, whichever exist                              |
| `"result_pool"`        | the upstream-block result pool                                                             |
| `TreeNodeAccessor`     | that subtree                                                                               |
| `ColumnsCollection`    | that collection, by handle (chaining)                                                      |
| `ColumnsProvider`      | its `getColumns()` ids + `isFinal()`                                                       |
| `{ columns, isFinal }` | the entries' `.id`s; `columns` accepts `PColumn` / `DataColumnRecipe` / any `ColumnRecipe` |

`isFinal` says whether the visible column set can still grow. While upstream
blocks are running it keeps growing across render passes. Built-in sources
compute it; you supply it only with the `{ columns, isFinal }` shape.

**Instance surface.** Every method that returns a collection mints a fresh
handle on the host; the receiver is unchanged.

| Member               | Returns               | Cost                                              |
| -------------------- | --------------------- | ------------------------------------------------- |
| `.handle`            | `CollectionHandle`    | free — pass into another `ColumnsCollection(...)` |
| `.isEmpty()`         | `boolean`             | host call, no ids transferred                     |
| `.isFinal()`         | `boolean`             | host call                                         |
| `.getColumnIds()`    | `ColumnUniversalId[]` | host call; the cheapest exit                      |
| `.getColumns()`      | `ColumnRecipe[]`      | ids + one recipe construction each                |
| `.addSource(source)` | `ColumnsCollection`   | host call                                         |
| `.discover(options)` | `ColumnsCollection`   | host-side discovery query                         |
| `.filter(options)`   | `ColumnsCollection`   | host-side selector match                          |

`getColumnIds()` is the fast path when the ids are all you need — and they
usually are, because the id-accepting consumers take them directly.

`getColumns()` builds a recipe per id. Two consequences worth knowing:

- Ids that are still resolving are **dropped**, so the result can be shorter
  than `getColumnIds()`.
- An id whose column is provably absent makes recipe construction throw
  `ColumnAbsentError`. Catch it at the boundary if partial absence should be
  surfaced rather than silently yielding an empty table.

```ts
// only the current block's own outputs/prerun
ColumnsCollection(["current_block"]);
// upstream blocks only
ColumnsCollection(["result_pool"]);
// current block plus one extra subtree
ColumnsCollection(["current_block", someAccessor]);
// chain onto an existing collection
ColumnsCollection([alreadyNarrowed, "result_pool"]);
```

### `discover` and `filter` Options

```ts
interface DiscoverColumnsOptions {
  include?: ColumnSelector; // omitted = include all
  exclude?: ColumnSelector; // applied after include
  mode?: MatchingMode; // default "enrichment"; ignored without anchors
  anchors?: Record<string, AnchorEntry>;
  maxHops?: number; // default 4 with anchors, 0 without
}

type ColumnsDiscoverOptions = DiscoverColumnsOptions;
type ColumnsFilterOptions = Omit<DiscoverColumnsOptions, "mode" | "maxHops">;
```

(`lib/model/common/src/drivers/columns/discover_columns_options.ts`)

`filter` has no `mode` / `maxHops` — traversal scope is fixed by the collection
it is called on. It matches selectors against what is already in the set.

`AnchorEntry` is `PlRef | PObjectId | PColumnSpec | RelaxedColumnSelector`. All
four are plain JSON, so the option object crosses the bridge unchanged.

| `MatchingMode`           | Axis behaviour                                                      |
| ------------------------ | ------------------------------------------------------------------- |
| `"enrichment"` (default) | anchor axes may float over un-mapped hit axes — "extend this query" |
| `"related"`              | both source and hit axes may float; widest match                    |
| `"exact"`                | no floating, no qualifications; strict equality                     |

### Selectors

```ts
type RelaxedStringMatchers = string | StringMatcher | (string | StringMatcher)[];
type StringMatcher = { type: "exact"; value: string } | { type: "regex"; value: string };

interface RelaxedColumnSelector {
  name?: RelaxedStringMatchers;
  type?: ColumnValueType | ColumnValueType[];
  domain?: Record<string, RelaxedStringMatchers>;
  contextDomain?: Record<string, RelaxedStringMatchers>;
  annotations?: Record<string, RelaxedStringMatchers>;
  axes?: RelaxedAxisSelector[]; // { name?, type?, domain?, contextDomain?, annotations? }
  partialAxesMatch?: boolean; // omit to require an exact axis-set length
}

type ColumnSelector = RelaxedColumnSelector | RelaxedColumnSelector[];
```

(`lib/model/common/src/columns/column_selector.ts`)

Semantics:

- Keys **within** one selector are ANDed. An array of selectors is ORed.
- A bare string is normalised to `{ type: "regex", value }`.
- **Prefer `{ type: "exact", value }` over `^…$`** when you mean one literal
  name. Column namespaces are full of `.` and `/`; the exact matcher takes the
  value literally and needs no escaping.
- Annotation and domain keys must be _present_ in the spec to match. A negation
  regex will not match columns that lack the key at all — use `exclude` for
  "not this", not a regex.
- There are no `(spec) => boolean` selectors. The point of a selector is that it
  runs host-side, where no spec has to cross the bridge.

When a predicate genuinely cannot be expressed — cross-column logic, parsing a
JSON annotation payload, a runtime-built `Set` — narrow with selectors first and
post-filter the survivors in JS, knowing each survivor pays one `getSpec()`:

```ts
const cols = ColumnsCollection(["result_pool"])
  .discover({ anchors: { main: anchorSpec }, mode: "enrichment", maxHops: 2 })
  .filter({ exclude: [{ type: "File" }, { annotations: { "pl7.app/isLinkerColumn": "true" } }] })
  .getColumns()
  .filter((c) => parseTrace(c.getSpec()).type !== "lead-selection");
```

## Recipes

### `ColumnRecipe`

```ts
interface ColumnRecipe<ID extends ColumnRecipeId = ColumnRecipeId> {
  readonly id: ID;
  getReferencedIds(): PObjectId[];
  getSpec(): PColumnSpec;
  getQuery(): SpecQuery;
  getDataStatus(): ColumnFieldStatus;
  withSpecs(overrides: SpecOverrides): ColumnRecipe;
}
```

(`sdk/model/src/columns/column_recipes/types.ts`)

| Member               | Cost                                       | Notes                                                                       |
| -------------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| `id`                 | free                                       | field, not a method. Canonical, addressable, transportable.                 |
| `getReferencedIds()` | free                                       | every storage column the recipe reaches.                                    |
| `getSpec()`          | **host round-trip**, memoised per instance | always returns a value — a constructed recipe is spec-complete by contract. |
| `getQuery()`         | free                                       | the `SpecQuery` IR the host executes.                                       |
| `getDataStatus()`    | host call, memoised                        | worst status across `getReferencedIds()`.                                   |
| `withSpecs(patch)`   | free                                       | new recipe, new id; receiver unchanged.                                     |

Two recipes are equal as value-objects exactly when their ids match. There is no
`getData()` on this interface, no spec field, and no `getSpecOverrides` /
`getDiscovery` / `getAxisFilters` — those are details of the id.

Iterating a 5k-column collection and calling `getSpec()` on each fetches 5k
specs. Most pipelines never call it: they pass `.id` on.

### `withSpecs`

```ts
type SpecOverrides = Pick<PColumnSpec, "domain" | "contextDomain" | "annotations"> & {
  axesSpec?: AxisPatches; // Record<axisIndex, Partial<AxisSpec>> — positional, not AxisSpec[]
};
```

The patch is encoded **into the id**, so the result is a real addressable column
that travels as a string:

```ts
const tagged = col.withSpecs({ annotations: { "myblock/highlight": "true" } });
tagged.id !== col.id; // true — original col untouched
```

Repeated calls flatten: `col.withSpecs(a).withSpecs(b)` is equal-by-id to
`col.withSpecs(merge(a, b))`. There is never an `Overridden<Overridden<…>>`.

`axesSpec` patches are keyed by positional index, deliberately — linker specs
carry several axes with the same `name` distinguished only by domain. A patch at
an index past the end appends an axis.

If you find yourself calling `getSpec()` only to feed the result back into
`withSpecs`, express the change as a patch and skip the round-trip.

### `DataColumnRecipe`

```ts
interface DataColumnRecipe<ID = ColumnRecipeId> extends ColumnRecipe<ID> {
  getData(): ColumnData; // undefined | PColumnDataUniversal — host round-trip
}
```

A **capability**, not a class. Only two shapes carry it: a bare leaf, and a spec
override over a bare leaf — the only shapes whose data still matches their spec.
Narrow with `hasReachableData`; the method is absent otherwise, so there is no
throwing path behind the guard.

### Id Shapes and Recipe Classes

The id decides the class. You never choose it.

| Id shape on the wire | Recipe class                             | What it is                                                              |
| -------------------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| bare `PObjectId`     | `DataColumnImpl` (as `DataColumnRecipe`) | a plain stored column; spec and data both reachable                     |
| `ColumnOverriddenId` | `ColumnOverriddenRecipe`                 | "that recipe, with domain / contextDomain / annotations / axes patched" |
| `ColumnFilteredId`   | `ColumnFilteredRecipe`                   | "that recipe, with some axes pinned to values"                          |
| `ColumnDiscoveredId` | `ColumnDiscoveredRecipe`                 | a discovery hit, carrying the linker path back to its anchor            |

Layering rules, enforced by the wrappers themselves:

- `ColumnOverriddenRecipe` is always **outermost**. `filtered.withSpecs(p)`
  yields `Overridden<Filtered<inner>>`; the reverse is unreachable through the
  public API.
- At most one `Overridden` layer, at most one `Filtered` layer, at most one
  `Discovered` layer in any chain.
- A bare leaf is the only recipe built from a `TreeNodeAccessor` / `PColumn` /
  `PlRef`. Every other shape is produced by `discover` / `filter` / `withSpecs`
  and is passed around by `.id`.

Spec derivation per layer: `Discovered` passes the hit's spec through (the
linker chain enables co-indexing, it does not remap axes); `Filtered` drops the
pinned axes from `axesSpec`; `Overridden` applies the patch.

## Factories

```ts
Column(source: ColumnSource, opts?): undefined | ColumnRecipe;
```

The one entry point. Routing:

- **string id** (`PObjectId` or `ColumnUniversalId`) → `ColumnRecipe(id)`, which
  dispatches on the parsed id shape.
- **object** (`PlRef` / `LeafEntry` / `PColumn` / `DataColumnRecipe`) →
  `DataColumn(source)`. These shapes only ever map to a bare leaf.

Call the dispatchers directly when the call site is unambiguous:

```ts
ColumnRecipe(id); // string id, routed by shape
DataColumn(source); // id | PlRef | PColumn | LeafEntry | DataColumnRecipe
DataColumn.fromId(pObjectId);
DataColumn.fromPlRef(ref);
DataColumn.fromColumn(pColumn);
DataColumn.fromAccessor(leafEntry);
```

**Return contract.** Every factory returns `undefined` while the column is still
`resolving` — retry on the next render pass, more accessor inputs may arrive.
Every factory throws `ColumnAbsentError` when the column is `absent` — every
relevant accessor reports `inputsLocked` and the column did not appear, so it
never will in this ctx. Always check for `undefined` before chaining.

`ColumnRecipe(id)` additionally throws for an id variant it cannot build (e.g. a
legacy `AnchoredPColumnId`, which needs an anchor map to resolve).

### Status Without Construction

```ts
ColumnRecipe.getStatus(id, opts?);        // any id shape, dispatches by parsed key
DataColumn.getStatus(source, opts?);      // any DataColumnSource
DataColumn.getStatusById(id, opts?);
DataColumn.getStatusByPlRef(ref, opts?);
DataColumn.getStatusByAccessor(entry);
```

Inside a loop over known ids, one `getStatus` up front beats a try/catch around
the factory.

| Type                     | Means                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `ColumnFieldStatus`      | data-field status, worst across every referenced id. What `recipe.getDataStatus()` returns; the usual thing to check while iterating recipes. |
| `ColumnResolutionStatus` | same values, but folds spec readiness and leaf-registry readiness: "can this recipe be _constructed_ at all in this ctx".                     |

Both are `"present" | "resolving" | "absent"`, worst-wins (`absent` ▸
`resolving` ▸ `present`).

`getDataStatus() === "present"` means the `.data` field is wired onto the
accessor. It does **not** mean bytes have arrived. When you need that stronger
claim, use `hasColumnData(recipe)`, which walks every referenced leaf and checks
`hasData()` across all of them (inline `PColumnValues` count as present, an
unresolvable leaf counts as not-ready rather than throwing).

## Predicates

Named after what you can do with the column, not after which class it is. Which
classes exist is an implementation detail behind `recipe.id` — never
`instanceof`-narrow to one.

```ts
isColumn(value); // value is Column                     — any recipe
hasReachableData(recipe); // recipe is DataColumnRecipe           — data readable here
hasSingleDataColumn(recipe); // boolean                             — reads one column, not several
isDataColumn(value); // value is DataColumnRecipe<PObjectId> — bare leaf
```

**`hasReachableData` — "can I read the data?"** True for a bare leaf and for a
spec override over one. False for an axis-filtered recipe: its spec has dropped
axes the underlying data still carries, so the two no longer line up and the
slice only exists engine-side. False for anything reached through other columns.
In both false cases, pass `recipe.id` to the host instead.

**`hasSingleDataColumn` — "one column or several?"** True for a bare leaf and
for projections over one (spec overrides, axis slicing) — layers, but no new
columns. False when the recipe reaches its data through further columns, which
is what a linker-chain discovery hit does.

Why it matters: a recipe over a single data column is co-indexed by its own
axes, so its spec is the whole truth about them. One that reads several only
lines up after the join, and drags axes into that join its own spec never
mentions. That is the **primary vs linker-joined** split at the
`createPlDataTableV3` boundary — only single-column recipes are valid primaries.
The SDK's own `discoverTableColumns` splits on exactly this predicate.

**`isDataColumn` — "is this a storage column?"** True only for a bare leaf,
whose `id` is a `PObjectId` naming a real column in storage. Reach for it when a
_type_ forces that id shape — `PColumn.id`, `PColumnIdAndSpec.columnId` — not
when you merely want to read data.

The predicates are independent. An axis-filtered leaf reads a single column and
has no reachable data. Pick by what you do next, not by which sounds stricter:

| You want to…                              | Guard                 |
| ----------------------------------------- | --------------------- |
| call `getData()` in the sandbox           | `hasReachableData`    |
| use it as a `createPlDataTableV3` primary | `hasSingleDataColumn` |
| put its id in a `PObjectId`-typed slot    | `isDataColumn`        |
| know whether bytes actually landed        | `hasColumnData`       |

## Utilities

### `deriveColumnOptions`

```ts
deriveColumnOptions(
  source: ColumnsCollection | ColumnsSource[],
  labelOptions?: DeriveLabelsOptions,
): ColumnOption[];   // { id: ColumnUniversalId; label: string }[]
```

Labels every column already in `source` via `deriveDistinctLabels`. Filtering is
the caller's job — pass a collection you already narrowed. Note it calls
`getSpec()` on every entry, so narrow first.

The `id`-valued option shape is what the id-accepting consumers want. A block
arg holding one of these is typed `ColumnUniversalId`, not `PlRef` — see the
migration doc's persisted-data section before changing a stored field's type.

```ts
const options = deriveColumnOptions(
  ColumnsCollection(["result_pool"]).discover({
    include: { axes: [{ name: [{ type: "exact", value: "pl7.app/sampleId" }] }] },
    mode: "enrichment",
  }),
);
```

### `splitByAxes`

```ts
splitByAxes(
  inputs: Column[],
  splitAxes: { idx: number }[],
  opts?: { axisValuesLabels?: (axisId: AxisId) => undefined | Record<string | number, string> },
): ColumnRecipe[] | undefined;
```

One recipe per Cartesian combination of unique partition values on the requested
axes. Each split is `Overridden(Filtered(inner))`: `Filtered` pins the axes and
drops them from `axesSpec` (the engine does the slicing via a `sliceAxes` query
node), `Overridden` adds `domain[axisName]` plus a `split:<axisId>` entry on
`pl7.app/trace` so `deriveDistinctLabels` can tell the splits apart.

Inputs must be readable here — partition keys are inspected via `getData()`.
Guard with `hasReachableData`, not `hasSingleDataColumn`.

`axisValuesLabels` defaults to `deriveAxisValuesLabels()` over the ambient
render ctx, so splits are labelled from the `pl7.app/label` columns in scope
without any wiring. The label columns are discovered lazily, on the first axis
lookup. Supply your own resolver to narrow the label source, or
`() => undefined` to keep raw axis values.

Returns `undefined` when an input's data is neither a live `TreeNodeAccessor`
nor parsed `DataInfoEntries`, or when partition keys can't be read — i.e. "not
ready yet, try next render pass". Throws when a requested `idx` exceeds the
column's partition-key depth.

This is the sanctioned way to split a column. Do not fabricate ids by string
concatenation (`` `${col.id}#${value}` ``) or by nesting a canonical id inside a
`LocalPObjectId` path: both produce ids that fail `extractPObjectId` downstream,
and the cast silences the type-checker, not the runtime invariant.

## Handing Columns to Consumers

### Accepts Ids

| Consumer                            | Accepts                                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `ctx.createPFrame(def)`             | `PFrameDef<PObjectId \| SUniversalPColumnId \| PColumn<…>>` — ids and `PColumn`s, mixed |
| `ctx.createPTableV2(def)`           | `PTableDefV2<ColumnUniversalId \| PColumn<…>>`                                          |
| `createPlDataTableV3(ctx, options)` | `ColumnRecipe[]` directly, or a declarative discovery config                            |

`SUniversalPColumnId` is a legacy alias of `ColumnUniversalId` — same type, no
migration needed where a signature still names it.

```ts
ctx.createPFrame(collection.getColumnIds()); // cheapest form
ctx.createPFrame(recipes.map((c) => c.id)); // works for any recipe, leaf or wrapped
```

Passing ids is also the _only_ way to feed wrapped recipes into a PFrame. Most
of them cannot be read in the sandbox at all, but `recipe.id` is a
`ColumnUniversalId` the host resolves server-side. Don't try to narrow a recipe
list before building a PFrame — pass `.id`.

`PColumn` objects with live `TreeNodeAccessor` / `DataInfo` data still work when
the column was assembled in the sandbox; `finalizePColumnData` is the converter.
Prefer the id form whenever the column came from the host in the first place.

### Does Not Accept Ids

| Slot                               | Needs                             | Why                              |
| ---------------------------------- | --------------------------------- | -------------------------------- |
| `ctx.createPTable(def)` (v1)       | `PColumn<PColumnDataUniversal>[]` | pre-id API; use `createPTableV2` |
| `createPFrameForGraphs(ctx, cols)` | `PColumn<PColumnDataUniversal>[]` | no id form yet                   |
| `PColumn.id`                       | `PObjectId`                       | physical id slot                 |
| `PColumnIdAndSpec.columnId`        | `PObjectId`                       | physical id slot                 |

The bridge, valid **only** for bare leaves:

```ts
const leaves = recipes.filter(isDataColumn);
const pCols: PColumn<PColumnDataUniversal>[] = leaves.map((c) => ({
  id: c.id,
  spec: c.getSpec(),
  data: c.getData()!,
}));
```

`isDataColumn` — not `hasReachableData` — is the right guard: `PColumn.id` is
typed `PObjectId`, which only a bare leaf carries. An override over a leaf is
readable but exposes a `ColumnUniversalId` that the slot rejects. There is no
materialisation path for `Filtered` or `Discovered` recipes at all; if your
discovery emits those and you need a `PColumn`-only helper, the helper has to
grow id support.

### `createPlDataTableV3`

Two forms (`sdk/model/src/components/PlDataTable/createPlDataTable/createPlDataTableV3.ts`):

```ts
// Form A — declarative. The helper discovers and splits primary/secondary itself.
createPlDataTableV3(ctx, {
  columns: {
    sources: [...],                          // ColumnsSource[] — no string shorthand here
    anchors: { main: anchorSpec },
    selector: { mode: "enrichment", maxHops: 4, include: [...], exclude: [...] },
  },
  tableState, filters, sorting, primaryJoinType, labelsOptions, displayOptions,
});

// Form B — you discover, you split.
createPlDataTableV3(ctx, {
  primaryColumns: primary,     // ColumnRecipe[] — must pass hasSingleDataColumn
  columns: secondary,          // ColumnRecipe[]
  ...
});
```

Form A specifics:

- `sources` is `ColumnsSource[]`. The `"result_pool"` / `"current_block"`
  shorthands are accepted only by `ColumnsCollection` itself — pass accessors or
  a collection instance here.
- `selector` is `ColumnsSelectorConfig`, whose `include` / `exclude` are typed
  as the **strict** `MultiColumnSelector` (`name?: StringMatcher[]`,
  `domain?: Record<string, StringMatcher[]>`), unlike the relaxed form
  `ColumnsCollection.discover` accepts. The runtime normalises either; the types
  here do not.
- `displayOptions.ordering[].match` and `visibility[].match` are `ColumnSelector`,
  not lambdas. Anything not selector-expressible has no place in display options.
  First matching rule wins, so `{ match: {} }` is the catch-all — put the
  exception rules above it.

Pick Form B when display rules depend on predicates a selector can't express: do
the discovery yourself, post-filter in JS, and hand over the exact recipe lists.

**`primaryColumns` must pass `hasSingleDataColumn`.** `discover` with anchors
returns a mix of direct hits, projections over a leaf (still fine as primaries)
and multi-hop `Discovered` hits (not fine). Form A does the split for you; Form
B trusts you. A multi-axis `Discovered` in `primaryColumns` makes
`discoverLabelColumns` pull in label columns on its extra axes, which then enter
the engine join as disjoint-axes tables and fail with `axes sets are disjoint`.
Filter with `hasSingleDataColumn` — not `isDataColumn`, which is stricter and
drops valid projections.

## Cost Model

What crosses the sandbox bridge, and when.

| Operation                                                         | Bridge traffic                                   |
| ----------------------------------------------------------------- | ------------------------------------------------ |
| `ColumnsCollection(...)`, `.discover`, `.filter`, `.addSource`    | one host call, returns a handle                  |
| `.isEmpty()`, `.isFinal()`                                        | one host call, no payload                        |
| `.getColumnIds()`                                                 | one host call, N id strings                      |
| `.getColumns()`                                                   | ids + per-id registry resolution (no spec bytes) |
| `recipe.id`, `.getQuery()`, `.getReferencedIds()`, `.withSpecs()` | none                                             |
| `recipe.getSpec()`                                                | one round-trip per recipe, memoised per instance |
| `recipe.getData()`                                                | one round-trip, memoised per instance            |
| `createPFrame(ids)` / `createPTableV2(ids)`                       | ids only; host resolves spec and data            |

Rules that follow:

1. Push filtering into selectors. A column that never matches never costs a spec.
2. Prefer ids to recipes when passing things around.
3. Call `getSpec()` on survivors only, never across a whole pool.
4. Don't read a spec just to patch it — use `withSpecs`.

## Working Example

`etc/blocks/table-test/model/src/index.ts` exercises the surface end to end:
anchored discovery, `hasSingleDataColumn` for the primary split,
`hasReachableData` before `splitByAxes`, recipe
ids used as filter and sort targets, and both `createPlDataTableV3` forms.

```ts
const valueAnchor = { name: "value", axes: [{ name: "name" }] };

const primary = ColumnsCollection()
  .discover({ anchors: { main: valueAnchor }, mode: "exact" })
  .getColumns()
  .filter(hasSingleDataColumn);
if (primary.length === 0) return undefined;

const countLeaves = ColumnsCollection()
  .filter({ include: { name: [{ type: "exact", value: "count" }] } })
  .getColumns()
  .filter(hasReachableData);

const splitRecipes = splitByAxes(countLeaves, [{ idx: 0 }]);
if (splitRecipes === undefined) return undefined;

const primaryIds = new Set(primary.map((c) => c.id));
const secondary = ColumnsCollection()
  .discover({ anchors: { main: valueAnchor }, mode: "enrichment", maxHops: 4 })
  .getColumns()
  .filter((c) => !primaryIds.has(c.id));

return createPlDataTableV3(ctx, {
  primaryColumns: primary,
  columns: [...secondary, ...splitRecipes],
  tableState: ctx.data.tableSplitState,
});
```

## Deprecated Surface

Still exported, do not write new code against it:

| Name                                                                 | Instead                                 |
| -------------------------------------------------------------------- | --------------------------------------- |
| `isLeafColumn`                                                       | `hasSingleDataColumn`                   |
| `ResultPool` and every column entry point on it (`ctx.resultPool.*`) | `ColumnsCollection` / `Column(ref)`     |
| `TreeNodeAccessor.getPColumns()`                                     | `ColumnsCollection([accessor])`         |
| `ctx.getBlockLabel(blockId)`                                         | nothing — slated to return dummy values |
| `SUniversalPColumnId`                                                | `ColumnUniversalId` (same type)         |

`TreeNodeAccessor.getIsFinal()` is not deprecated, but once you have wrapped the
accessor in a collection, read `collection.isFinal()` instead — same answer for
a single-accessor source, and it stays correct as you add sources.

One exception worth naming: `ctx.resultPool.getOptions(selectors, opts)` is
still the supported entry point when you need the `Option[]` = `{ ref: PlRef,
label }` wire shape with `refsWithEnrichments`. Its `@deprecated` note points at
`ctx.getOptions`, which has not been promoted to `RenderCtxBase` yet. Move to
`deriveColumnOptions` when you can also update the workflow and UI consumers,
since that changes the stored value from a `PlRef` to a `ColumnUniversalId`.

Removed names and their one-to-one replacements are in the migration doc.
