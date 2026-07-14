# New column access mechanism

## Why

The block model runs in a sandbox with a hard **8 MB** input limit. The old `ColumnCollectionBuilder` API pulled every upstream `PColumnSpec` it could see into that 8 MB up-front — even specs the model never read. On projects with a wide upstream graph this routinely blew the limit, and there was nothing you could do about it short of rewriting the model.

The whole refactor exists to fix this. The shape of the fix:

- **Identity lives in `ColumnUniversalId`.** A column is now a canonical id string. Spec, data and dataStatus are _derived_ from the id — nothing is materialised until you ask for it. (`SUniversalPColumnId` is a legacy alias of the same type, still surfaced by `createPFrame` / `createPTable` signatures.)
- **Specs are fetched on demand, one at a time.** The host owns the upstream tree and the spec frame. The sandbox only holds opaque handles and ids. `col.getSpec()` crosses the bridge for _that_ column; uninspected columns cost ~0 bytes.
- **Columns are immutable.** A column's spec is reachable only through `getSpec()`, and the spec you get back is a fresh snapshot of what the host has — you can't write to it, and there's no "local edit" that survives anywhere.

What this means for you, the consumer:

- **Don't read specs you don't need.** Every `col.getSpec()` is a host round-trip. Discover columns with a selector (regex on name/domain/annotations runs host-side, for free), and only call `getSpec()` on the survivors. The old habit of "grab everything, filter in JS with `(spec) => …`" doesn't translate.
- **Don't mutate specs.** There's no field to mutate, and patching the local copy buys you nothing — nothing else can see the change, the next `getSpec()` round-trip re-fetches the canonical version, and you've burnt bridge bytes for a value you immediately overwrote. If you genuinely need a different spec (e.g. to retag annotations for a downstream PFrame), `col.withSpecs(patch)` encodes the patch into the id, so the resulting column is a real, addressable, transportable thing.
- **Prefer ids over column objects when passing things around.** `createPFrame` / `createPTable` and block args all accept `ColumnUniversalId` strings directly. The host resolves them server-side; no spec/data has to travel through the sandbox just to be handed back to the host.

The rest of this document is the mechanical migration. Each change is an instance of one of the rules above.

---

## Column access — `ColumnCollectionBuilder` → `ColumnsCollection`

`ColumnCollectionBuilder` and its surrounding helpers are removed. The new entry point is `ColumnsCollection(sources?)` from `@platforma-sdk/model`.

The collection itself is **host-driven** — it never ships specs into the sandbox. Discovery, filtering and addSource all mint a fresh handle on the host; only ids come back. No `dispose()`, no spec-frame lifetime to manage on the sandbox side.

### Discovery

```diff
- const collection = new ColumnCollectionBuilder(ctx.getService("pframeSpec"))
-   .addSources(collectCtxColumnSnapshotProviders(ctx))
-   .build({ anchors: { main: spec } });
- try {
-   const variants = collection.findColumnVariants({ include, maxHops: 4 });
-   ...
- } finally {
-   collection.dispose();
- }
+ const cols = ColumnsCollection()
+   .discover({ anchors: { main: spec }, include, maxHops: 4 })
+   .getColumns(); // ColumnRecipe[] — no specs fetched yet
```

`ColumnsCollection(sources?)` defaults to **current block + result pool** (`outputs` + `prerun` + upstream-block result pool) when `sources` is omitted. To scope discovery, pass an explicit array — entries can be:

- `"current_block"` — shorthand for `outputs` + `prerun` accessors of the current block;
- `"result_pool"` — shorthand for the upstream-block result pool;
- a `TreeNodeAccessor`, a `ColumnsProvider`, another `ColumnsCollection`, or a column-like shape `{ columns, isFinal }`. The `columns` array accepts `PColumn` / `ColumnLazy` / any `ColumnRecipe` — the source only needs `.id` from each entry.

`isFinal` says whether everything upstream has finished computing. While blocks are still running the set of visible columns keeps growing across render passes; `isFinal: true` means it won't grow anymore. The built-in sources figure this out themselves — you only set it explicitly when you pass `{ columns, isFinal }`.

The instance itself exposes a handful of host-driven methods on top of `discover` / `filter` / `addSource`:

```ts
collection.isEmpty(); // host-side emptiness check, no ids transferred
collection.isFinal(); // upstream done? — same flag the `{ columns, isFinal }` source carries
collection.getColumnIds(); // ColumnUniversalId[] — fast path when you only need ids
collection.getColumns(); // ColumnRecipe[] — same ids, lifted to typed recipes
collection.handle; // CollectionHandle — pass to another `ColumnsCollection(sources)` to chain
```

`getColumnIds()` is the fastest exit: nothing on the recipe is touched, you just get the ids back to feed into `createPFrame` / `createPTable`. `getColumns()` is a thin map over those ids.

```ts
// only the upstream blocks
ColumnsCollection(["result_pool"]);
// only the current block's own outputs/prerun
ColumnsCollection(["current_block"]);
// current block + a specific extra subtree
ColumnsCollection(["current_block", someAccessor]);
```

Narrow `sources` aggressively. Every entry you add expands the host-side spec frame the collection operates against; `"current_block"` alone is much cheaper than the default triplet when you actually only care about your own outputs.

### Selectors do filtering host-side — use them

`(spec) => boolean` selectors are gone. `name`, `domain`, `annotations`, etc. now take regex strings (auto-wrapped as `StringMatcher` of `type: "regex"`). The filter runs against the host-side spec frame, so columns that don't match never need their spec brought into the sandbox.

```diff
- { match: (spec) => spec.name === "value",   priority: 10 }
- { match: (spec) => spec.name === "score",   visibility: "optional" }
+ { match: { name: "^value$" },               priority: 10 }
+ { match: { name: "^score$" },               visibility: "optional" }
```

If you genuinely need a predicate the selector can't express, apply it as a post-filter — but understand that **every column reaching the predicate pays a `getSpec()` round-trip**, so push as much as possible into the selector first:

```ts
const cols = ColumnsCollection()
  .discover({ include: { name: "^value$" } }) // host-side, cheap
  .getColumns()
  .filter((c) => myCustomPredicate(c.getSpec())); // sandbox-side, one round-trip per survivor
```

### `ColumnRecipe` vs `ColumnLazy` — what you're actually holding

Every column you get back from the new API is a **`ColumnRecipe`**: an immutable, identity-bearing _description_ of how to obtain a column — not the column data itself. The recipe interface is intentionally narrow:

```ts
recipe.id; // PObjectId | ColumnUniversalId — addressable string, transportable
recipe.getReferencedIds(); // every PObjectId this recipe reaches (leaf + nested refs)
recipe.getSpec(); // PColumnSpec — host round-trip, memoised; always returns a value
recipe.getQuery(); // SpecQuery — the IR the host uses to derive `getSpec()`
recipe.getDataStatus(); // "present" | "absent" | "resolving" (worst across referenced ids)
recipe.withSpecs(patch); // returns a new recipe with the patch baked into the id
```

Note what's **not** there: there is no `getData()` on a recipe. Data is only meaningful at a leaf — `Overridden` / `Filtered` / `Discovered` recipes are descriptions whose data is fetched on the **host** when you hand the id to `createPFrame` / `createPTable`. Pulling data into the sandbox for a non-leaf recipe would defeat the whole point of the refactor.

The id is the source of truth; the recipe is just a typed accessor over it. The id string encodes _how_ the column was produced, and each form has its own recipe class:

| Id shape on the wire  | Recipe class             | What it represents                                                                                                      |
| --------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| bare `PObjectId`      | `ColumnLazy`             | a plain upstream column — spec comes from the host accessor, data is reachable as `TreeNodeAccessor`                    |
| `ColumnOverriddenKey` | `ColumnOverriddenRecipe` | "this other recipe, but with annotations/domain/axes patched" — `withSpecs()` builds these                              |
| `ColumnFilteredKey`   | `ColumnFilteredRecipe`   | "this recipe restricted to a subset of axes" — produced by `ColumnsCollection.filter`                                   |
| `ColumnDiscoveredKey` | `ColumnDiscoveredRecipe` | the result of a `ColumnsCollection.discover` hit, carrying the join graph back to its anchor so the spec can be rebuilt |

The `*Key` rows are the parsed JSON object shapes; the stringified-on-the-wire form for each is `Column*Id` (e.g. `ColumnOverriddenId`).

**`ColumnLazy` is the only recipe class with `getData()`.** It is the _leaf_ — `implements ColumnRecipe<PObjectId>` — and is also the only recipe you ever construct from a `TreeNodeAccessor` / `PColumn` / `PlRef`. Everything else is a wrapper around a leaf id; you produce the wrappers by calling `discover` / `filter` / `withSpecs`, and you pass them around by `.id`.

For most code this is all you need to know: **you hold recipes, you pass ids, you call `getSpec()` only on survivors.** The recipe-kind taxonomy only becomes visible when you `instanceof`-narrow to a leaf to call `getData()`, and even then most call sites are better off using the helpers in `@platforma-sdk/model` (`collectLinkerColumns`, `hitQualifications`, …) than walking the recipe tree by hand.

### Reading and constructing columns

`id` is a field; spec / data status / query are getter methods. Each round-trips the host once and memoises per instance:

```ts
col.id; // recipe id
col.getReferencedIds(); // leaf-set this recipe depends on
col.getSpec(); // PColumnSpec — bridge round-trip on first call
col.getDataStatus(); // ColumnFieldStatus: "present" | "absent" | "resolving"

// Only on ColumnLazy (the leaf) — narrow first.
// `ColumnLazy` (the value) is the dispatcher function with statics attached,
// so `instanceof ColumnLazy` does not narrow. Always use the `isColumnLazy`
// guard — do **not** import the internal `ColumnLazyImpl` symbol to
// `instanceof`-narrow either; that's an implementation detail.
if (isColumnLazy(col)) {
  col.getData(); // PColumnDataUniversal | undefined — bridge round-trip
}
```

Iterating a 5k-column collection to call `getSpec()` on every entry will fetch 5k specs. If you only need ids, pass `col.id` straight through to whatever needs it — `createPFrame` / `createPTable` accept ids directly, so most pipelines never call `getSpec()` at all.

### Type guards — `isColumn` / `isColumnRecipe` / `isColumnLazy` / `isLeafColumn`

Four guards are exported alongside the factories so consumers don't need to import the internal `*Impl` symbols just to narrow:

```ts
isColumn(value); // value is Column          (alias of isColumnRecipe)
isColumnRecipe(value); // value is ColumnRecipe    (any recipe — leaf or wrapper)
isColumnLazy(value); // value is ColumnLazy      (bare leaf only — the one with getData())
isLeafColumn(recipe); // boolean              (leaf-form: chain contains no Discovered)
```

Use `isColumnLazy` instead of `instanceof ColumnLazy`: `ColumnLazy` (the value) is the dispatcher function with statics, not the class, so `instanceof` does not narrow there.

**`isColumnLazy` vs `isLeafColumn` — pick by what you do with the result.**

- `isColumnLazy(c)` — strict, type-narrowing predicate. Returns `true` only for the **bare leaf** (`ColumnLazy`). Use it when you need access to `getData()` directly, or when the type forces you to a bare leaf — e.g. `PColumnIdAndSpec.columnId` and `PColumn.id` are `PObjectId`, which only bare leaves carry; wrappers expose `ColumnUniversalId`.
- `isLeafColumn(recipe)` — broader, boolean (not a type guard). Returns `true` for any recipe whose wrapper chain contains no `ColumnDiscoveredRecipe` — so `Overridden` / `Filtered` over a bare leaf still count. Use it for the **primary vs linker-joined** classification at the `createPlDataTableV3` boundary: anything that has no `Discovered` in its chain is a valid primary, projections over a plain leaf included. The SDK's own `createPlDataTableV3` uses `isLeafColumn` for this split — mirror it in your block code.

Counterpart for reading data without a strict `isColumnLazy` narrow: `getLeafColumnData(recipe)` walks the wrapper chain down to the bottom leaf and returns its data (throws when the chain reaches a `Discovered`).

There is a single top-level entry point, `Column(source)`. It picks the right factory by source shape and returns a `ColumnRecipe`:

```ts
Column(source); // id string | PlRef | PColumn | LeafEntry | ColumnLazy
```

Routing rules:

- **String id** (`PObjectId` or `ColumnUniversalId`) → `ColumnRecipe(id)`. The id shape decides which recipe class comes back (see the table above) — you don't pick, the id does.
- **Object source** (`PlRef` / `LeafEntry` / `PColumn` / `ColumnLazy`) → `ColumnLazy(source)`. These shapes only ever map to the bare `ColumnLazy` case.

`Column(source)` returns `undefined` when the source can't be resolved (e.g. an id whose accessor isn't reachable from the current ctx, or a `PlRef` with no matching entry). Always check before chaining.

When the intent at the call site is unambiguous you can call the dispatchers directly:

```ts
ColumnRecipe(id); // string id → routed by id shape
ColumnLazy(source); // id | PlRef | PColumn | LeafEntry | ColumnLazy
```

Or the explicit factories when the source shape would otherwise be ambiguous:

```ts
ColumnLazy.fromId(id); // PObjectId
ColumnLazy.fromPlRef(ref); // PlRef
ColumnLazy.fromColumn(pColumn); // already-materialised PColumn
ColumnLazy.fromAccessor(leafEntry); // direct accessor binding
```

### Two flavours of "not yet" — `resolving` vs `absent`

Two distinct status types live next to recipes:

- **`ColumnFieldStatus`** = `"present" | "resolving" | "absent"` — the worst-case across every PObjectId the recipe references. Returned by `recipe.getDataStatus()`. This is the only thing you usually look at when iterating recipes.
- **`ColumnResolutionStatus`** = `"present" | "resolving" | "absent"` — same value space, different meaning: it folds spec readiness + leaf-registry readiness, so you can ask "can this recipe be _constructed_ at all in the active ctx" without actually building it.

Use the static `getStatus` helpers when you need the answer without paying for the recipe:

```ts
ColumnRecipe.getStatus(id); // any id shape — dispatches by parsed key
ColumnLazy.getStatus(source); // PObjectId / PlRef / LeafEntry / PColumn / ColumnLazy
ColumnLazy.getStatusById(id);
ColumnLazy.getStatusByPlRef(ref);
ColumnLazy.getStatusByAccessor(entry);
```

A recipe factory returns `undefined` for `resolving` (try again on the next render pass — more accessor inputs may still arrive), and throws **`ColumnAbsentError`** for `absent` (every relevant accessor is `inputsLocked`; the column will not appear in this ctx). Catch `ColumnAbsentError` at boundaries — resolver / filter-and-sort wiring / data-table assembly — when partial absence should be surfaced rather than silently producing an empty result. Inside a tight loop over already-known ids, prefer `getStatus(...)` once up-front over a try/catch around the factory.

### Columns are immutable — don't poke at specs

Previously columns were plain objects: callers spread/rewrote `col.spec` in place. That "worked" only locally — the mutation didn't survive a bridge crossing, and the original spec had already cost you bytes to fetch. Doing it in a loop over upstream columns was a frequent way to blow the 8 MB limit for nothing.

No recipe has a spec field. The spec is derived from the id, lazily, on first `getSpec()`. To produce a column with a different spec, use `withSpecs(patch)`: the patch becomes part of the **id** (the recipe class for the result is `ColumnOverriddenRecipe`, but you don't need to care — you still hold a `ColumnRecipe`), so the new column is a real, addressable thing — the override travels with the id, no extra bridge traffic needed to re-describe it elsewhere.

```diff
- // ad-hoc mutation — paid for the original spec, change was invisible to everyone else
- col.spec = { ...col.spec, annotations: { ...col.spec.annotations, x: "y" } };
- const tagged = { ...col, spec: { ...col.spec, annotations: { ...col.spec.annotations, x: "y" } } };
+ // new column, new id; original `col` is unchanged, no spec read required
+ const tagged = col.withSpecs({ annotations: { x: "y" } });
+ tagged.id !== col.id;
```

`withSpecs` accepts a `SpecOverrides` — `Pick<PColumnSpec, "domain" | "contextDomain" | "annotations"> & { axesSpec?: AxisPatches }`. `axesSpec` is an `AxisPatches` map (positional patches keyed by axis index, **not** an `AxisSpec[]`). Repeated calls flatten into a single override on the id, so `col.withSpecs(a).withSpecs(b)` is equal-by-id to `col.withSpecs(merge(a, b))`.

If you find yourself reaching for `getSpec()` just to feed it back into `withSpecs`, you're paying for a round-trip you don't need — express the change as a patch.

---

## `createPFrame` / `createPTable` accept ids directly

`PFrameDef` / `PTableDefV2` now accept `ColumnUniversalId` and `PObjectId` strings mixed with `PColumn` objects. (The runtime signature of `createPFrame` still names the legacy alias `SUniversalPColumnId` — same type, no migration needed.) The host resolves ids server-side, so the sandbox doesn't have to fetch spec+data just to hand them back:

```diff
- ctx.createPFrame(cols.map(c => ({ id: c.id, spec: c.getSpec(), data: c.getData() })));
+ ctx.createPFrame(cols.map(c => c.id));     // strings — resolved on host, zero spec reads
```

When you already have a `ColumnsCollection`, skip the intermediate recipes entirely:

```ts
ctx.createPFrame(collection.getColumnIds());
```

This is also the canonical way to feed **wrapped recipes** (`ColumnDiscoveredRecipe` / `ColumnFilteredRecipe` / `ColumnOverriddenRecipe`) into a PFrame. They have no `getData()` — but `recipe.id` is a `ColumnUniversalId` that `createPFrame` accepts directly, and the host materialises it server-side. So instead of trying to narrow a recipe list to leaves before building a PFrame, pass `.id`:

```ts
ctx.createPFrame(recipes.map((c) => c.id)); // works for any recipe — leaf or wrapped
```

(Code that still needs a `PColumn<...>[]`, e.g. `createPFrameForGraphs`, does not have this id-form yet — see the "ColumnLazy → PColumn adapter" section below for the materialisation pattern that only works for leaves.)

You can still pass `PColumn` objects with live `TreeNodeAccessor` / `DataInfo` data when the column was assembled in the sandbox (e.g. via `expandByPartition`); the helper that converts those (`transformPColumnData`) was renamed and exported as `finalizePColumnData`. Prefer the id form whenever the column came from the host in the first place.

---

## `ResultPool` / `RenderCtxBase` — all column access goes through `ColumnsCollection`

The whole `ResultPool` class is `@deprecated`. Every column-discovery / column-fetch entry point on it (and the convenience wrappers on `RenderCtxBase`) pulled specs eagerly — exactly the pattern this refactor exists to kill. Use `ColumnsCollection` + `ColumnLazy` for **everything**.

| Old                                                                                                | New                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ctx.resultPool.getData()` / `getDataFromResultPool()`                                             | `ColumnsCollection(["result_pool"]).getColumns()` — iterate the resulting `ColumnRecipe[]` and pass `.id`s into `createPFrame` / `createPTable`; never iterate `getData()` over the whole pool                                                                                                                                                                                                                                                                                                                                                   |
| `ctx.resultPool.getDataWithErrors()` / `getDataWithErrorsFromResultPool()`                         | same; per-column status comes from `recipe.getDataStatus()` ("present" / "absent" / "resolving"). Errors live on the host — surface them at the consumer (PFrame/PTable) instead of the result-pool boundary                                                                                                                                                                                                                                                                                                                                     |
| `ctx.resultPool.getSpecs()` / `getSpecsFromResultPool()`                                           | `ColumnsCollection(["result_pool"]).getColumns()` and `getSpec()` only on the survivors of a discover/filter — never iterate `getSpec()` over the whole pool                                                                                                                                                                                                                                                                                                                                                                                     |
| `ctx.resultPool.getDataByRef(ref)`                                                                 | `ColumnLazy.fromPlRef(ref)?.getData()` — `getData()` lives on the leaf `ColumnLazy`, not on the generic `ColumnRecipe`                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `ctx.resultPool.getPColumnByRef(ref)`                                                              | `ColumnLazy.fromPlRef(ref)` (or the unified `Column(ref)`, which for `PlRef` likewise yields a `ColumnLazy`)                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `ctx.resultPool.getSpecByRef(ref)` / `getPColumnSpecByRef(ref)`                                    | `Column(ref)?.getSpec()` (or `ColumnLazy.fromPlRef(ref)?.getSpec()`) — `getSpec()` is on every recipe, so either form types out                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ctx.resultPool.selectColumns(predicate)`                                                          | `ColumnsCollection(["result_pool"]).discover({ include }).getColumns()` — push the predicate into `include` so filtering runs host-side; fall back to a JS post-`.filter((c) => …(c.getSpec()))` only if you must                                                                                                                                                                                                                                                                                                                                |
| `ctx.resultPool.findDataWithCompatibleSpec(spec)`                                                  | `ColumnsCollection(["result_pool"]).discover({ anchors: { main: spec }, mode: "default" }).getColumns()`                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `ctx.resultPool.getOptions(predicate, labelOps)`                                                   | **Stay on `ctx.resultPool.getOptions(...)`** — it preserves the `Option[]` = `{ ref: PlRef, label }` wire shape and `refsWithEnrichments`. (The `@deprecated` JSDoc on `ResultPool` lists `ctx.getOptions` as the migration target, but the method has **not** been promoted to `RenderCtxBase` yet — `ctx.getOptions` is not callable.) Switch to `ColumnsCollection(["result_pool"]).discover({ include }).getColumns()` + `deriveLabels` **only when** the consumer wants column **ids** (e.g. for `createPFrame`/`createPTable`), not PlRefs |
| `ctx.resultPool.getAnchoredPColumns(anchors, selectors, opts)`                                     | `ColumnsCollection(["result_pool"]).discover({ anchors, include: selectors, … }).getColumnIds()` — each id is already a `ColumnUniversalId`, pass directly into `createPFrame` / `createPTable`                                                                                                                                                                                                                                                                                                                                                  |
| `ctx.resultPool.getCanonicalOptions(anchors, selectors, opts)`                                     | same discover call; map `(col) => ({ value: col.id, label: deriveLabel(col) })`                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ctx.resultPool.resolveAnchorCtx({ key: PlRef })`                                                  | per-entry: `isPlRef(v) ? Column(v)?.getSpec() : v`. `ColumnsCollection.discover` accepts the resulting `{ key: PColumnSpec }` directly                                                                                                                                                                                                                                                                                                                                                                                                           |
| `ctx.resultPool.findLabels(axis)` / `findLabelsForColumnAxis(spec, axisIdx)` / `ctx.findLabels(…)` | discover label columns via `ColumnsCollection` (`{ name: "^pl7.app/label$", axes: [{ name: axis.name }] }`) and read JSON data off the resulting `ColumnLazy`                                                                                                                                                                                                                                                                                                                                                                                    |
| `ctx.getBlockLabel(blockId)`                                                                       | `@deprecated` on `RenderCtxBase` — still callable but slated to return dummy values; do not write new code against it                                                                                                                                                                                                                                                                                                                                                                                                                            |

Deprecated aliases that just forward to the non-`*FromResultPool` versions (`getDataFromResultPool`, `getDataWithErrorsFromResultPool`, `getSpecsFromResultPool`) follow the same row as their canonical name. `ctx.resultPool` itself is `@deprecated` — the `*ByRef` reads have already moved to `ctx.*ByRef` on `RenderCtxBase` (see the migration map in the JSDoc above `class ResultPool` in `sdk/model/src/render/api.ts`), but the recommended migration is straight to `Column(ref)` / `ColumnsCollection`, which doesn't touch `ctx.resultPool` at all.

Always pass `["result_pool"]` (or the narrowest source set that works) — the default ctx-wide triplet pulls the upstream tree **and** the current block. Use `["current_block"]` if you only want your own outputs/prerun.

---

## Recipe utilities (`@platforma-sdk/model`)

A few helpers in `sdk/model/src/columns/utils.ts` cover the recipe-walk cases you'd otherwise hand-roll:

- **`collectLinkerIds(recipe): PObjectId[]`** — every non-hit `PObjectId` referenced by `recipe.getQuery()`, deduped in traversal order. Pure query walk, no registry access.
- **`collectLinkerColumns(recipe, opts?): ColumnLazy[]`** — same set, resolved against the ambient ctx as leaf `ColumnLazy` instances. Throws if any linker fails to resolve — direct replacement for the legacy `resolveLinkers`.
- **`hitQualifications(recipe): readonly AxisQualification[]`** — hit-side axis qualifications, pulled out of the inner `ColumnDiscoveredRecipe` (if any). Returns `[]` for plain leaves / overrided-over-leaf chains.
- **`queriesQualifications(recipe): Readonly<Record<PObjectId, AxisQualification[]>>`** — per-primary-column qualifications, applied to outer primary anchors at the consumer boundary.

Prefer these over walking the recipe class hierarchy yourself — they encapsulate the wrapper-peeling invariants (`Overridden` / `Filtered` over at most one `Discovered`) so they keep working as new wrappers are added.

---

## Removed types — mechanical renames

These names are gone from `@platforma-sdk/model`. Replace one-to-one before chasing semantic differences:

| Old                                                 | New                                                                   | Notes                                                                                                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ColumnCollectionBuilder`                           | `ColumnsCollection` (function)                                        | Not a class — call as `ColumnsCollection(sources?)`. No `.build()` / `.dispose()`.                                                                   |
| `AnchoredColumnCollection`                          | `ColumnsCollection` (type)                                            | Same name, function _and_ instance type.                                                                                                             |
| `AnchoredFindColumnsOptions`                        | `ColumnsDiscoverOptions` / `ColumnsFilterOptions`                     | `mode` / `maxHops` only on `discover`; `filter` takes a strict subset.                                                                               |
| `ColumnMatch`                                       | `ColumnRecipe`                                                        | **Shape changes** — see "ColumnMatch → ColumnRecipe" below. There is no `.column` wrapper field anymore.                                             |
| `collection.findColumns({...})`                     | `collection.discover({...}).getColumns()`                             | `findColumns` is gone. `discover` returns a new `ColumnsCollection`; call `getColumns()` / `getColumnIds()` to materialise.                          |
| `collection.findColumnVariants({...})`              | `collection.discover({...}).getColumns()`                             | Same — single discovery method, no `variants` vs `columns` split.                                                                                    |
| `ArrayColumnProvider`                               | `ArrayColumnsProvider` (renamed) **or** `{ columns, isFinal }` source | Prefer the inline `{ columns, isFinal: true }` shape inside `sources` — no wrapper class needed.                                                     |
| `namePattern: "..."`                                | `name: "..."` (inside a selector)                                     | Selectors accept plain regex strings as `name`. The old `namePattern` key is gone.                                                                   |
| `ctx.getService("pframeSpec")`                      | _not needed_                                                          | `ColumnsCollection` resolves its own driver via `getService("columnsCollection")`.                                                                   |
| `ColumnSource` (legacy meaning: source for builder) | `ColumnsSource` (note the **`s`**)                                    | The legacy `ColumnSource` is now the input type of `Column(source)` (singular, id/PlRef/PColumn). Source arrays for `sources` use `ColumnsSource[]`. |

---

## `ColumnMatch` → `ColumnRecipe`

The biggest mechanical hazard. `ColumnMatch` had a nested `.column` field carrying a materialised `PColumn`; `ColumnRecipe` is flat, identity-only, and field access is replaced by method calls.

| Old                         | New                         | Cost                                                                                  |
| --------------------------- | --------------------------- | ------------------------------------------------------------------------------------- |
| `m.column.id`               | `c.id`                      | field, free                                                                           |
| `m.column.spec`             | `c.getSpec()`               | **host round-trip on first call**, memoised after. Do not iterate this in a hot loop. |
| `m.column.spec.name`        | `c.getSpec().name`          | host round-trip                                                                       |
| `m.column.spec.axesSpec`    | `c.getSpec().axesSpec`      | host round-trip                                                                       |
| `m.column.spec.annotations` | `c.getSpec().annotations`   | host round-trip                                                                       |
| `m.column.data`             | _only on `ColumnLazy`_      | narrow first: `if (isColumnLazy(c)) c.getData()`                                      |
| `m.column.data.get()`       | `c.getData()` (no `.get()`) | the `.get()` indirection is gone — `getData()` is the read.                           |

The rule is the same as for any other recipe: **filter host-side via `include` / `exclude` whenever possible, call `getSpec()` only on survivors**. Whenever you see a long `.filter(m => …m.column.spec…)` chain in legacy code, the first migration step is "what of this is expressible as a selector?".

---

## Predicates → `collection.filter()` cookbook

The minimal filter surface on `ColumnsCollection` covers almost every JS-side predicate the legacy code used. Anything that runs through `collection.filter({ include, exclude })` stays on the host and never pays the spec round-trip.

The selector schema is `{ name, type, domain, contextDomain, annotations, axes: [{ name, type, domain, contextDomain, annotations }], partialAxesMatch }`. Plain string values become `{ type: "regex", value }` matchers automatically.

| Legacy JS predicate                                                                  | Host-side equivalent                                                                                                                           |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `m.column.spec.name === 'pl7.app/label'`                                             | `filter({ include: { name: '^pl7\\.app/label$' } })`                                                                                           |
| `m.column.spec.name !== 'pl7.app/label'`                                             | `filter({ exclude: { name: '^pl7\\.app/label$' } })`                                                                                           |
| `m.column.spec.valueType !== 'String'`                                               | `filter({ exclude: { type: 'String' } })`                                                                                                      |
| `(spec.valueType as string) !== 'File'`                                              | `filter({ exclude: { type: 'File' } })`                                                                                                        |
| `spec.annotations?.['pl7.app/isLinkerColumn'] === 'true'`                            | `filter({ include: { annotations: { 'pl7.app/isLinkerColumn': 'true' } } })`                                                                   |
| `spec.annotations?.['pl7.app/isAnchor'] !== 'true'`                                  | `filter({ exclude: { annotations: { 'pl7.app/isAnchor': 'true' } } })`                                                                         |
| `spec.axesSpec.some(a => a.name === sampleAxisName)`                                 | `filter({ include: { axes: [{ name: `^${escape(sampleAxisName)}$` }], partialAxesMatch: true } })`                                             |
| `!spec.axesSpec.some(a => a.name === sampleAxisName)`                                | `filter({ exclude: { axes: [{ name: `^${escape(sampleAxisName)}$` }], partialAxesMatch: true } })`                                             |
| `spec.axesSpec.length === 1 && spec.axesSpec[0].name === 'pl7.app/vdj/clonotypeKey'` | `filter({ include: { axes: [{ name: '^pl7\\.app/vdj/clonotypeKey$' }] } })` (omit `partialAxesMatch` to require exact axis-set length)         |
| `spec.domain?.['pl7.app/alphabet'] === 'aminoacid'`                                  | `filter({ include: { domain: { 'pl7.app/alphabet': 'aminoacid' } } })`                                                                         |
| `spec.annotations?.[Annotation.Trace]?.includes('antibody-tcr-lead-selection')`      | `filter({ exclude: { annotations: { 'pl7.app/trace': '.*antibody-tcr-lead-selection.*' } } })` (regex value — selectors match values as regex) |

Multiple `include` clauses combine as **OR** (pass arrays of `RelaxedColumnSelector`); multiple keys inside one selector combine as **AND**. `exclude` is the same shape and removes hits.

If a predicate still doesn't fit (cross-column logic, JSON-parsing the annotations payload, computing a derived value), keep it as a JS post-filter on `getColumns()`, but minimise the survivor set with `filter()` first:

```ts
const matches = ColumnsCollection(["result_pool"])
  .discover({ anchors: { main: anchorSpec }, mode: "enrichment", maxHops: 2 })
  .filter({
    exclude: [
      { annotations: { "pl7.app/isLinkerColumn": "true" } },
      { annotations: { "pl7.app/sequence/isAnnotation": "true" } },
    ],
  })
  .filter({ exclude: { axes: [{ name: `^${escape(sampleAxisName)}$` }], partialAxesMatch: true } })
  .getColumns()
  // post-filter only what selectors can't express
  .filter((c) => parseTrace(c.getSpec().annotations?.[Annotation.Trace]).type !== "lead-selection");
```

---

## `createPlDataTableV3` — full example

The new `createPlDataTableV3` takes a declarative `columns: { sources, anchors, selector }` block and does discovery itself host-side. You no longer need to gather `ColumnSource[]` via `selectColumns` + `ArrayColumnProvider` and feed them in.

Legacy shape (the `table` output of `antibody-tcr-lead-selection`):

```ts
// Legacy
const resultPoolColumns = ctx.resultPool.selectColumns(
  (spec) =>
    spec.valueType !== "File" &&
    !(spec.annotations?.["pl7.app/isLinkerColumn"] === "true" && spec.axesSpec.length > 2) &&
    !spec.annotations?.[Annotation.Trace]?.includes("antibody-tcr-lead-selection"),
);
const sources: ColumnSource[] = [
  new ArrayColumnProvider(resultPoolColumns),
  new ArrayColumnProvider(sampledRows),
];
if (assemblingKabatAccessor)
  sources.push(new ArrayColumnProvider(assemblingKabatAccessor.getPColumns()));

return createPlDataTableV3(ctx, {
  columns: {
    sources,
    anchors: { main: leadSelectionCol.spec },
    selector: { mode: "enrichment" },
  },
  // ...
});
```

New shape:

There are two shapes of `createPlDataTableOptionsV3.columns`:

```ts
// Form A — declarative; the helper does discovery for you.
createPlDataTableV3(ctx, {
  columns: {
    sources: [...],                       // ColumnsSource[] — NO string shorthand here
    anchors: { main: leadSelectionCol.spec },
    selector: { mode: 'enrichment', exclude: [...] },
  },
  ...
});

// Form B — you do discovery yourself and hand recipes in directly.
createPlDataTableV3(ctx, {
  primaryColumns: [leadSelection],          // ColumnRecipe[]
  columns: secondaryRecipes,                // ColumnRecipe[]
  ...
});
```

**Form A pitfalls:**

- `sources` is typed `ColumnsSource[]` — the `"result_pool"` / `"current_block"` shorthand strings are **not** accepted there (only by `ColumnsCollection(sources?)` itself). Pass `TreeNodeAccessor`s or a `ColumnsCollection` instance explicitly.
- `displayOptions.ordering[].match` and `visibility[].match` are typed **`ColumnSelector`**, not `(spec) => boolean` lambdas. Anything you can't express as a selector (axis cardinality `axesSpec.length === N`, closures over runtime args, runtime-built Sets of canonical specs) has no place in display-options anymore.

**When to pick Form B:** whenever the legacy code's display-rules depend on lambda predicates that can't be re-expressed as selectors. In Form B you do the discovery up-front (`ColumnsCollection.discover().filter().getColumns()`), filter aggressively in JS for anything not selector-expressible, and hand the helper the recipe list it should render. The columns the table sees are already the right ones — there's nothing to hide via `visibility`.

```ts
// Form B example — discovery + JS post-filter for non-expressible parts,
// then split into primary (anchor leaf) vs secondary (everything else).
const cols = ColumnsCollection(['result_pool'])
  .discover({ anchors: { main: leadSelectionCol.spec }, mode: 'enrichment' })
  .filter({ exclude: [
    { type: 'File' },
    { annotations: { 'pl7.app/isLinkerColumn': 'true' } },
    { annotations: { 'pl7.app/trace': '.*antibody-tcr-lead-selection.*' } },
  ] })
  .getColumns()
  // Non-selector-expressible: axis-count, runtime-Set membership, etc.
  .filter((c) => !(isLinkerColumn(c) && c.getSpec().axesSpec.length > 2));

const [primary, secondary] = partitionByLeaf(cols);  // bare ColumnLazy vs wrapped recipes

return createPlDataTableV3(ctx, {
  primaryColumns: primary,
  columns: secondary,
  ...
});
```

**Always push as much filtering as possible into `collection.filter`/`discover` selectors before falling back to `.getColumns().filter(...)` — every survivor of the post-filter pays one `getSpec()` round-trip.**

### NOT-predicates inside `displayOptions.match`

`ColumnSelector` has no nested negation operator, and `displayOptions.ordering[]` / `visibility[]` accept only one selector per rule (no sibling `exclude` like `discover`/`filter` have). Common workarounds:

- **`match: {}` + first-match-wins ordering.** The catch-all selector matches everything; place earlier rules that explicitly handle the "exception" set. Linker columns hidden, everything else optional:

  ```ts
  visibility: [
    { match: { annotations: { "pl7.app/isLinkerColumn": "true" } }, visibility: "hidden" },
    { match: {}, visibility: "optional" }, // catch-all — only reached when the rule above didn't match
  ];
  ```

  This is the safe, declarative path. Use it for any NOT-predicate that hinges on an **optional annotation** — the WASM matcher requires a selector's annotation key to be present in the spec, so a regex like `^(?!true$).*$` won't match columns that don't carry the annotation at all.

- **Synthetic-annotation tag via `withSpecs`.** When the "exception" set is computed from runtime state and can't be expressed as a single selector, tag the recipes upstream:

  ```ts
  const TAG = "__myblock/highlighted";
  const tagged = recipes.map((c) =>
    specialIds.has(c.id) ? c.withSpecs({ annotations: { [TAG]: "true" } }) : c,
  );
  // ...
  visibility: [
    { match: { annotations: { [TAG]: "true" } }, visibility: "default" },
    { match: {}, visibility: "optional" },
  ];
  ```

  Trade-off: each tagged recipe gets wrapped as `ColumnOverriddenRecipe`, so its `id` changes — downstream resolvers must accept `ColumnUniversalId`. Use only when the `{ match: {} }` ordering approach can't express the rule.

- **Don't bet on regex negation** (`^(?!X$).*$`) for selector values until the WASM matcher's regex flavour and absent-key semantics are confirmed. The TS-side `MatcherMap` type is identical to the legacy form, but the active matcher is in `pframes-rs` — JS-side regex-negation behaviour may not transfer.

---

## `resultPool.getOptions(selectors, { refsWithEnrichments: true })`

There are two paths to drop `ctx.resultPool.getOptions(...)`, and the choice depends on whether you can change the **wire shape** of the option-list:

### Preferred: `deriveColumnOptions` (new helper, `ColumnUniversalId`-valued)

`@platforma-sdk/model` exports `deriveColumnOptions(source, labelOptions?): ColumnOption[]` where `ColumnOption = { id: ColumnUniversalId; label: string }`. It accepts a pre-filtered `ColumnsCollection` or a raw `ColumnsSource[]` (provider, accessor, `"result_pool"` / `"current_block"` shorthand) and runs `deriveDistinctLabels` internally.

```ts
import { ColumnsCollection, deriveColumnOptions } from "@platforma-sdk/model";

const options = deriveColumnOptions(
  ColumnsCollection(["result_pool"]).discover({
    include: { axes: [{ name: "pl7.app/sampleId" }], annotations: { "pl7.app/isAnchor": "true" } },
    mode: "enrichment",
  }),
);
// options: [{ id: ColumnUniversalId, label: string }, ...]
```

**Use this whenever you can.** It runs filtering host-side, returns ids that `createPFrame` / `createPTable` accept directly, and removes the deprecated `ctx.resultPool` surface.

**Wire-shape implication.** The old `Option[]` shape was `{ ref: PlRef, label }`. The new shape is `{ id: ColumnUniversalId, label }`. Migrating a `getOptions` consumer means:

- `BlockArgs` field type: `PlRef` → `ColumnUniversalId`.
- Sandbox-side reads that fed the `PlRef` into `Column(ref)` continue to work — `Column(source)` accepts both `PlRef` and `ColumnUniversalId` / `PObjectId`. No further change needed in model code.
- **Workflow (tengo) and UI consumers must be updated separately.** Workflow helpers built around `bundleBuilder.addAnchor(name, plRef)` and `columns.getSpec(plRef)` accept the `PlRef` shape; the `ColumnUniversalId` shape is a string id, not a `PlRef`, so the workflow side needs to switch to whatever accepts the id-form (out of scope for this guide). Same for UI: `option.ref === model.data.X` comparisons become `option.id === model.data.X`, with `plRefsEqual` replaced by string equality.

If the workflow/UI updates are out of scope for the current change, **stay on `ctx.resultPool.getOptions(...)`** until you can land them together.

### Persisted block data — migrate `PlRef` → `ColumnUniversalId`

Changing the `BlockArgs` / `BlockData` field type from `PlRef` to `ColumnUniversalId` is not just a TypeScript rename — every block that has ever opened a project under the old shape has a stored `inputAnchor: PlRef` value persisted under the previous data-model version. Without a migration step it stays a `PlRef` object on disk, the model loads it under the new `ColumnUniversalId` type, and downstream code (`Column(id)`, `createPFrame`, etc.) silently sees an object where it expects a string.

The two traps that catch this:

1. **The `DataModelBuilder` chain typechecks even when no step touches the field.** A migration like `.migrate<BlockData>("vN+1", (prev) => ({ ...prev, ... }))` where `BlockData.inputAnchor` is now `ColumnUniversalId` will pass — but `prev.inputAnchor` is whatever was on disk, and the spread carries the `PlRef` object straight through. The type system can't catch this because the _previous_ version was also annotated as `BlockData` (or `Omit<BlockData, …>`), which got dragged into the new type when `BlockData` itself changed.

2. **Reusing the current `BlockData` for historical versions hides the conversion.** Anchor each migration's input/output type to the **shape persisted at that version**, not to a relative of the current `BlockData`. Otherwise the chain reads as if every step already handles the new field, and the only step where the actual `PlRef → ColumnUniversalId` conversion belongs is invisible.

**Pattern.** Freeze each historical version as its own type with `inputAnchor: PlRef`, and add one new migration step whose output is the current `BlockData` and whose body actually converts the value:

```ts
import {
  createGlobalPObjectId,
  DataModelBuilder,
  type ColumnUniversalId,
  type PlRef,
} from "@platforma-sdk/model";

// Stored shape at v1 — what's actually on disk under "Ver_2026_04_07".
type StoredV1 = {
  inputAnchor?: PlRef;
  // …other fields exactly as they were at v1…
};

// Stored shape at v2 — same as v1 with whatever v2's migration added.
type StoredV2 = Omit<StoredV1, "sampleTableState"> & {
  sampleTableState: PlDataTableStateV2;
};

// For a result-pool leaf, the canonical id is `createGlobalPObjectId(blockId, name)`
// of the ref. Wrappers (Filtered/Overridden/Discovered) have no PlRef form —
// they only exist as ids, so they never need this conversion.
function plRefToUniversalId(ref: PlRef | undefined): ColumnUniversalId | undefined {
  return ref ? createGlobalPObjectId(ref.blockId, ref.name) : undefined;
}

export const blockDataModel = new DataModelBuilder()
  .from<StoredV1>("Ver_2026_04_07")
  .upgradeLegacy<LegacyBlockArgs, LegacyUiState>(({ args, uiState }) => ({
    inputAnchor: args.inputAnchor, // still PlRef — upgradeLegacy outputs the v1 shape
    // …
  }))
  .migrate<StoredV2>("Ver_2026_04_14", (prev) => ({
    ...prev,
    sampleTableState: prev.sampleTableState ?? createPlDataTableStateV2(),
  }))
  // New step — the only place where PlRef becomes ColumnUniversalId.
  .migrate<BlockData>("Ver_2026_05_28", (prev) => ({
    ...prev,
    inputAnchor: plRefToUniversalId(prev.inputAnchor),
  }))
  .init(() => ({
    /* current shape */
  }));
```

Three things to check at review time:

- **`upgradeLegacy` returns the v1 shape, not the current `BlockData`.** Doing the `plRefToUniversalId` conversion inside `upgradeLegacy` looks tempting but means stored-v1 data (which never went through `upgradeLegacy`) still arrives as `PlRef`. Keep `upgradeLegacy` aligned with `from<...>` and put the conversion in a dedicated migration step that every code path traverses.
- **Each `migrate<Next>(...)` is typed against the next version's stored shape, not against `BlockData`.** Reusing `BlockData` (or `Omit<BlockData, …>`) for historical versions is what hid this bug in the first place — when `BlockData.inputAnchor` changed type, every historical alias quietly changed with it.
- **`init()` is the current shape.** If the new migration step's output equals `BlockData`, `init()` naturally types as `BlockData` and any drift gets caught.

For consumers whose stored field used a value other than a bare result-pool leaf (a `PObjectId` already, a wrapper-shaped ref produced by `withEnrichments`, etc.), `plRefToUniversalId` is the wrong helper — those should round-trip through the corresponding factory. But for the common case of "options came from `ctx.resultPool.getOptions` and were saved as `PlRef`", `createGlobalPObjectId(ref.blockId, ref.name)` is the canonical translation.

### Fallback: `ctx.resultPool.getOptions(...)` (preserves `PlRef` wire shape)

```ts
ctx.resultPool.getOptions(selectors, { refsWithEnrichments: true });
```

The `@deprecated` JSDoc on `ResultPool` lists `ctx.getOptions` on `RenderCtxBase` as the migration target, but the method has not yet been promoted there. Until it lands — or until you migrate the consumer to `ColumnUniversalId` — `ctx.resultPool.getOptions(...)` remains the supported entry point and preserves the `PlRef` enrichment-rewrite (`withEnrichments`) plus `label` derivation options.

### Selector shape — `PColumnSelector` (legacy) vs `RelaxedColumnSelector` (new)

`ctx.resultPool.getOptions(...)` still accepts the **legacy** `PColumnSelector`, while `ColumnsCollection.discover(...)` / `.filter(...)` take the **new** `RelaxedColumnSelector`. The two look superficially similar but differ in one important place — `axes`:

| Field          | Legacy `PColumnSelector` (getOptions)      | New `RelaxedColumnSelector` (discover/filter)                                            |
| -------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `name`         | `string`                                   | `string \| StringMatcher \| (string \| StringMatcher)[]`                                 |
| `domain`       | `Record<string, string>`                   | `Record<string, string \| StringMatcher \| StringMatcher[]>`                             |
| `annotations`  | `Record<string, string>`                   | `Record<string, string \| StringMatcher \| StringMatcher[]>`                             |
| `axes`         | `AxisSelector[]` with `{ name?, idx?, … }` | `RelaxedAxisSelector[]` with `{ name?, type?, domain?, … }`                              |
| anchor binding | `axes: [{ anchor: 'main', idx: 1 }]`       | **not supported** — extract `anchorSpec.axesSpec[i].name` and pass as `axes: [{ name }]` |
| `namePattern`  | `namePattern: '^pl7\\.app/foo$'`           | **gone** — use `name: '^pl7\\.app/foo$'` (auto-wrapped as regex matcher)                 |

Don't reuse a legacy selector literal with `ColumnsCollection`. Translate by:

- dropping `namePattern` → fold into `name`,
- replacing `{ anchor, idx }` axis bindings with `axes: [{ name: anchorSpec.axesSpec[idx].name }]` derived from the anchor's resolved spec,
- relaxing typed `Record<string, string>` values into the same plain strings (they're auto-wrapped as `{ type: "regex", value }`).

**Prefer `{ type: 'exact', value }` over `^…$` regex for exact-name match.** Anywhere you'd write `name: '^pl7\\.app/foo$'` to mean "this exact name", write `name: [{ type: 'exact', value: 'pl7.app/foo' }]` instead. Same for `axes: [{ name: [{ type: 'exact', value: anchorSpec.axesSpec[1].name }] }]` when binding to the resolved anchor axis name. Reasons:

- No double-escaping of `.` / `/` / other regex metachars in column-namespace strings — the value goes through literally.
- No `escapeRegex(...)` helper needed when the axis name is read off `anchorSpec` at runtime; the value is wrapped in the matcher object as-is.
- Reads as intent: "exact match on this string", not "regex that happens to be anchored and have its dots escaped".

Keep the regex form only when you actually need pattern semantics (prefix, suffix, alternation). Example:

```ts
// regex form — needed when intent is a pattern
{
  name: "^(pl7\\.app/vdj/sampleCount|pl7\\.app/sampleCount)$";
}

// exact form — preferred when intent is a single literal name
{
  name: [{ type: "exact", value: "pl7.app/vdj/sampleCount" }];
}
```

Switch to `ColumnsCollection(["result_pool"]).discover({...}).getColumns()` only when the consumer wants column **ids** (e.g. for `createPFrame` / `createPTable`), not refs — `ColumnRecipe` exposes `.id`, not a reconstructible `PlRef`, and for linker-reachable hits (`ColumnDiscoveredRecipe`) there is no underlying single ref at all.

---

## `accessor.getPColumns()` / `getIsFinal()` → `ColumnsCollection([accessor])`

`TreeNodeAccessor.getPColumns()` is `@deprecated` and now returns `ColumnLazy[]` (the transitive break: every `.spec` / `.data` read on its result needs `.getSpec()` / `.getData()`). The replacement is **wrap the accessor as a source of a `ColumnsCollection`** — once that's done, every read goes through the collection's host-side surface:

```diff
- const sampledRowsAccessor = ctx.outputs?.resolve({ field: 'sampledRows', ... });
- const sampledRows = sampledRowsAccessor?.getPColumns();
- const sampledRowsAreFinal = sampledRowsAccessor?.getIsFinal() ?? false;
- const leadSelectionCol = sampledRows?.find((c) => c.spec.name === 'pl7.app/lead-selection');
+ const sampledRowsAccessor = ctx.outputs?.resolve({ field: 'sampledRows', ... });
+ if (!sampledRowsAccessor) return undefined;
+ const sampledRowsCollection = ColumnsCollection([sampledRowsAccessor]);
+ const sampledRowsAreFinal = sampledRowsCollection.isFinal();
+ const leadSelectionCol = sampledRowsCollection
+   .filter({ include: { name: '^pl7\\.app/lead-selection$' } })
+   .getColumns()[0];
```

Two things to notice:

1. **Don't iterate `getPColumns()` to do name lookups.** Each named lookup → one `collection.filter({ include: { name: '^...$' } })`. The host resolves the filter and returns only the surviving recipe, so a five-named-lookup loop is five host-side queries returning ~1 id each — not five JS scans over an N-element array paying `getSpec()` per element.

2. **`isFinal()` lives on the collection.** Don't reach back into the accessor for `getIsFinal()` once you've built the collection — they're equivalent for a single-accessor source, and the collection is the supported API going forward.

When the same accessor is reused as a discovery **source** (e.g. `sampledRows` is both queried by name above _and_ fed into `createPlDataTableV3` as part of `sources`), pass the accessor itself or the collection's `handle` into the next `ColumnsCollection` — no need to fetch `getPColumns()` once and pass the array.

---

## Helpers that still need `PColumn[]` — `ColumnLazy` → `PColumn` adapter

A handful of SDK helpers (most notably `createPFrameForGraphs`, and any consumer typed against `PColumn<PColumnDataUniversal>[]`) still take materialised `PColumn[]` only — they do not yet accept `ColumnRecipe[]` / ids. The bridge is straightforward when every recipe in the set is a **bare leaf** (`ColumnLazy`):

```ts
const leaves = recipes.filter(isColumnLazy);
const pCols: PColumn<PColumnDataUniversal>[] = leaves.map((c) => ({
  id: c.id,
  spec: c.getSpec(),
  data: c.getData()!,
}));
return createPFrameForGraphs(ctx, pCols);
```

Use strict `isColumnLazy` here, **not** the broader `isLeafColumn`. The `PColumn.id` slot is typed `PObjectId`, which only bare `ColumnLazy` carries — wrappers (`Overridden` / `Filtered`-over-leaf) expose `ColumnUniversalId`. Same reasoning applies to `PColumnIdAndSpec.columnId`. `isColumnLazy` is both a type guard and the canonical narrow — pass it straight to `Array.prototype.filter` (no manual predicate, no `ColumnLazyImpl` import).

Notes:

- This **only works for `ColumnLazy`**. `ColumnOverriddenRecipe` / `ColumnDiscoveredRecipe` / `ColumnFilteredRecipe` have no `getData()` — there is no "materialise this recipe to a PColumn" path in the sandbox. If your discovery emits any wrapped recipes and you need to feed them into a PColumn-only helper, the helper needs to grow id-form support (or you avoid it for that source).
- `PColumnIdAndSpec.columnId: PObjectId` — same constraint by the same logic. Only `ColumnLazy.id` (bare `PObjectId`) goes there; never a `ColumnUniversalId` from a wrapper recipe.
- The `{ anchor: 'main', idx: 1 }` axis-binding from legacy `getAnchoredPColumns` has no `RelaxedAxisSelector` form. Workaround: read the anchor's `axesSpec[i].name` and pass it as `axes: [{ name }]` in the new selector — the axis-name match is enough for the common case.

### Splitting columns by partition — use `expandByPartition`

The legacy "snapshot to N synthetic PColumns" pattern (read `data` accessor, fan out, wrap each item with a fresh id, re-wrap via `ColumnLazyImpl.fromColumn`) does not fit the new recipe model. Two traps:

1. **You cannot fabricate ids by string concatenation.** `${col.id}#${value} as PObjectId` looks fine, but the result is not canonical JSON — `JSON.parse` rejects the trailing suffix and any consumer walking the id graph (`discoverLabelColumns` → `collectLinkerIds` → `extractPObjectId` inside `createPlDataTableV3`) throws with `id "..." is not a valid canonical column id`. The cast silences the type-checker, not the runtime invariant.

2. **You cannot embed a foreign canonical id inside `LocalPObjectId.resolvePath` either.** `createLocalPObjectId([col.id, ...], value)` parses and passes `extractPObjectId`, but it abuses the semantics of `LocalPObjectKey` (a path inside a _block's own_ local tree) by stuffing a `GlobalPObjectId` JSON in as a path element. Nested canonical ids are not how this layer composes.

**Use the SDK helper `expandByPartition`** instead. Internally it pairs `ColumnFilteredRecipe.wrap` (pins specific axes to specific values, generates a `sliceAxes` query node) with `ColumnOverriddenRecipe.wrap` (overlays domain + trace annotations). The result per split is a canonical `ColumnOverriddenId(source: ColumnFilteredId, specOverrides)` — distinct, parseable, linked to the source for linker discovery — and the PFrame engine does the data slicing, so you never materialise filtered `data` in the sandbox.

For human-readable axis-value labels in the trace annotation, pair it with `deriveAxisValuesLabels()` — the modern replacement for the legacy `ctx.resultPool.findLabels(axisId)`. It reads all label columns in scope and returns a `(axisId) => Record<value, label>` resolver.

```ts
import {
  ColumnsCollection,
  createPlDataTableV3,
  deriveAxisValuesLabels,
  expandByPartition,
  isColumnLazy,
  isLeafColumn,
} from "@platforma-sdk/model";

.outputWithStatus("tableSplit", (ctx) => {
  const valueAnchor = { name: "value", axes: [{ name: "name" }] };

  // Primary: only leaf-form hits. `discover({mode: "exact"})` with anchors
  // can also surface multi-axis Discovered variants (e.g. `count [group, name]`
  // reached via a linker); those belong in secondary, not in the join's primary
  // side. Mirrors what `discoverTableColumns` does internally for the
  // selector-form path. `isLeafColumn` accepts bare `ColumnLazy` plus
  // `Overridden` / `Filtered` over a leaf — anything whose chain reaches a
  // `Discovered` is rejected.
  const primary = ColumnsCollection()
    .discover({ anchors: { main: valueAnchor }, mode: "exact" })
    .getColumns()
    .filter(isLeafColumn);
  if (primary.length === 0) return undefined;

  // Inputs for the split must be unwrapped bare leaves — `expandByPartition`
  // reads `getData()` on each, which only `ColumnLazy` exposes directly. Use
  // strict `isColumnLazy` here, not `isLeafColumn`.
  const countLeaves = ColumnsCollection()
    .filter({ include: { name: [{ type: "exact", value: "count" }] } })
    .getColumns()
    .filter(isColumnLazy);

  const splitRecipes = expandByPartition(countLeaves, [{ idx: 0 }], {
    axisValuesLabels: deriveAxisValuesLabels(),
  });
  if (splitRecipes === undefined) return undefined;

  const primaryIds = new Set(primary.map((c) => c.id));
  const secondary = ColumnsCollection()
    .discover({ anchors: { main: valueAnchor }, mode: "enrichment", maxHops: 4 })
    .getColumns()
    .filter((c) => !primaryIds.has(c.id));

  return createPlDataTableV3(ctx, {
    tableState: ctx.data.tableState,
    primaryColumns: primary,
    columns: [...secondary, ...splitRecipes],
  });
});
```

What you gain over hand-rolling Filtered/Overridden yourself:

- **No data materialisation in the sandbox** — partition inspection reads `getUniquePartitionKeys` once; the actual slicing moves into the engine via the `sliceAxes` node generated by `ColumnFilteredRecipe.getQuery()`.
- **No synthetic ids** — each split's `ColumnOverriddenId` is canonical and uniquely keyed by the override patch.
- **Spec correctness for free** — `ColumnFilteredRecipe.getSpec()` removes the pinned axis from `axesSpec` automatically; `domain[axisName]` and the `pl7.app/trace` entry (used by `deriveDistinctLabels` for human-readable disambiguation) land in the outer `ColumnOverriddenRecipe`.
- **Linker discovery still works** — the recipe's `getQuery()` references the inner via the rebrand-leaf-id mechanism, so `collectLinkerIds` resolves correctly.

Two architectural invariants worth remembering when reading or extending this path:

- **`ColumnOverriddenRecipe` is always the outermost wrap.** `ColumnFilteredRecipe.withSpecs(overrides)` yields `Overridden<Filtered<inner>>` automatically. Do not try to construct `Filtered<Overridden<...>>` — the SDK has no public path to that layering and the invariant is enforced inside `unwrapOverrides`.

- **`primaryColumns` must be leaf-form only.** `discover` with anchors returns a mix of bare `ColumnLazy` (direct anchor hits), `Overridden` / `Filtered` over a leaf (projections — still leaf-form), and `ColumnDiscoveredRecipe` (multi-hop hits via linker chains). The selector-form of `createPlDataTableV3` (via `discoverTableColumns`) splits these into `primary` / `secondary` for you using `isLeafColumn`; the `primaryColumns` form trusts you to do the same. If a multi-axis Discovered slips into `primaryColumns`, `discoverLabelColumns` flat-maps its extra axes into the include set and pulls in label columns on those axes — which then appear in the engine join as disjoint-axes tables and crash with `axes sets are disjoint`. The fix is `.filter(isLeafColumn)` on the discover result — **not** `isColumnLazy`, which is stricter and drops valid `Filtered` / `Overridden`-over-leaf primaries.
