---
"@platforma-sdk/block-kind": minor
"@milaboratories/pl-model-common": minor
"@milaboratories/pl-model-middle-layer": minor
"@milaboratories/pl-middle-layer": minor
"@platforma-sdk/block-tools": minor
"@milaboratories/ts-builder": minor
"@platforma-sdk/model": minor
---

Block kinds and project templates.

A **block kind** is a separately-versioned npm package declaring the typed init-params
contract a block is created from; many block versions implement one kind version. On top
of kinds sits the **template engine**: a project exports to `template-v1` YAML, and a
template — exported or hand-authored — applies into a fresh project.

**New package `@platforma-sdk/block-kind`.** `defineBlockKind<BlockParams>({ name,
version, parseTemplateParams })` returns a frozen `CompiledBlockKind`. Source `name` /
`version` from the kind's own `package.json` so the on-wire `{name}@{version}` cannot
drift from what npm publishes.

```ts
// <block>/kind/src/index.ts
import { defineBlockKind } from "@platforma-sdk/block-kind";
import { name, version } from "../package.json" with { type: "json" };

export type BlockParams = { numbers?: number[] };
const Params = z.object({ numbers: z.array(z.number()).optional() }).strict();

export const kind = defineBlockKind<BlockParams>({
  name,
  version,
  parseTemplateParams: (value) => Params.parse(value),
});
```

**`@platforma-sdk/model`** — the kind is now part of the model:

```ts
const dataModel = new DataModelBuilder({ kind })
  .from<BlockDataV1>("v1")
  .init(({ params }) => ({ numbers: params?.numbers ?? [] }));

export const platforma = BlockModelV3.create({ dataModel, kind })
  .templateParams((data) => ({ numbers: data.numbers }))
  .args(...)
  .done();
```

`init` receives the kind's `params` (optional — a block may be created without a
template) and builds the block's initial storage from them. `templateParams()` is the
inverse: it projects block state back to the kind's params for export. Both are written in
live terms — the SDK marks the column identifiers in what the lambda returned, so nothing about
templates leaks into a block's own code.

**`@milaboratories/pl-model-common`** — `BlockKindReference` + `formatKindRef`, the
`template-v1` document schema, the kind selector's semver ranges, and the `{ $ref: … }` wrapper
that marks a column identifier inside template params. `wrapTemplateRefs` puts those wrappers
on, in the block's own bundle where the reference system is already known; the template engine
stores what is inside verbatim and redirects the block ids textually, so it holds no model of
that system at all.

**`@milaboratories/pl-middle-layer`** — `MiddleLayer.exportProjectAsTemplate(id)` and
`MiddleLayer.applyTemplateToProject(id, document)`, backing "Export Project as
Template…" and "Create Project from Template…". The template import path is public:
`parseProjectTemplateV1Yaml`, `validateTemplateV1ForApply`, `resolveTemplateEntries`,
`applyProjectTemplateV1`, plus the `BlockPackProvider` seam deciding which registries to
consult. Entries resolve against the configured registries, ids are mapped to the blocks
they become, and each entry's params are offered to the block's kind for a shape check
before anything is created.

**`@platforma-sdk/block-tools`** — the `kind` part in `.structure` with its own package
rules and scaffold, a `build-kind-manifest` command, kind-first publication (the kind
content is written to the registry's `kinds/` tree, source-hash guarded and idempotent,
before the facade — gated by a version-match check that hard-fails before any write),
and registry-side kind resolution.

**`@milaboratories/ts-builder`** — `block-kind` build target (rolldown config + tsconfig).

**BREAKING:**

- `BlockModelV3.create(dataModel)` → `BlockModelV3.create({ dataModel, kind })`. A block
  cannot omit its kind.
- `new DataModelBuilder()` → `new DataModelBuilder({ kind })`, and `init` takes
  `({ params })` rather than no argument.
- `templateParams()` is required — `done()` throws without it. A block whose state
  cannot be reduced to params returns `{}` explicitly, rather than exporting an entry
  that silently applies as a default-initialized block.
- Every kind must declare `parseTemplateParams`. A kind whose params are genuinely empty
  still declares one; it just rejects everything but `{}`.
- Publishing a block whose model was compiled against a kind requires the facade to
  declare that kind as a dependency, at a matching version. Blocks declaring no kind
  publish exactly as before.
