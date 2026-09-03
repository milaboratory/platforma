# @milaboratories/ts-builder

## 1.7.2

### Patch Changes

- ddf58fa: Restore emission of `*.vue.d.ts` declarations in browser-lib builds.

  vite-plugin-dts 5 auto-detects whether to run its Vue program processor, but its detector only scans two directory levels below the package root. Our SFCs live deeper (`src/components/**`), so it fell back to the plain TypeScript processor and silently emitted no `*.vue.d.ts` — while `dist/lib.d.ts` still re-exported those `.vue` specifiers, breaking any consumer that resolves them (e.g. block model facade builds). ts-builder now picks the processor itself.

## 1.7.1

### Patch Changes

- c5af077: Support TypeScript 7 (the native compiler) across the build toolchain.

  TS7 no longer exposes the classic JS Compiler API that Volar-based tooling
  requires, so:

  - ts-builder runs `vue-tsc` against the official `@typescript/typescript6`
    bridge, passes a TS7-compatible `--customConditions` value (a bare `,` is
    parsed as a source file on TS7), provides an explicit `fs` to
    `@vue/compiler-sfc` (`ts.sys` is gone on TS7), and uses `Bundler`
    `moduleResolution` for declaration emit.
  - build-configs provides the same explicit `fs` to the vitest Vue config so
    SFC-compiling tests pass on TS7.
  - ui-vue's `AnnotationsSidebar`/`FilterSidebar` title/label handlers accept
    `string | undefined`, matching `PlEditableTitle`'s model emit type.

## 1.7.0

### Minor Changes

- 80a9963: Block kinds and project templates.

  A **block kind** is a separately-versioned npm package declaring the typed init-params
  contract a block is created from; many block versions implement one kind version. On top
  of kinds sits the **template engine**: a project exports to `template-v1` YAML, and a
  template — exported or hand-authored — applies into a fresh project.

  **New package `@platforma-sdk/block-kind`.** `defineBlockKind<BlockParams>({ name,
version, parseInitializationParams })` returns a frozen `CompiledBlockKind`. Source `name` /
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
    parseInitializationParams: (value) => Params.parse(value),
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
  `parseProjectTemplateV1Yaml`, `validateTemplateV1ForApply`, `resolveTemplateEntries`, plus the
  `BlockPackProvider` seam deciding which registries to consult. Entries resolve against the configured registries, ids are mapped to the blocks
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
  - Every kind must declare `parseInitializationParams`. A kind whose params are genuinely empty
    still declares one; it just rejects everything but `{}`.
  - Publishing a block whose model was compiled against a kind requires the facade to
    declare that kind as a dependency, at a matching version. Blocks declaring no kind
    publish exactly as before.

## 1.6.2

### Patch Changes

- Updated dependencies [da11734]
  - @milaboratories/ts-configs@1.4.0

## 1.6.1

### Patch Changes

- 27600c3: Escape including label columns for non primary columns
- Updated dependencies [27600c3]
  - @milaboratories/ts-configs@1.3.1

## 1.6.0

### Minor Changes

- 534a237: Add `block-facade` build target and facade tsconfig preset.

  - ts-builder: new `--target block-facade` that bundles a facade's `src/` into a
    self-contained `dist/` (single inlined `.d.ts` + bundled `.js`, all deps
    force-inlined via `external: () => false`). Bumps `rolldown` to ^1.1.2 and
    `rolldown-plugin-dts` to ^0.26.0.
  - ts-configs: new `@milaboratories/ts-configs/block/facade` preset
    (`customConditions: []` so dts-bundling reads sibling `.d.ts`, not source).

### Patch Changes

- Updated dependencies [534a237]
  - @milaboratories/ts-configs@1.3.0

## 1.5.2

### Patch Changes

- f2d1351: Pin `vue-tsc` to `3.3.5` (latest), replacing the earlier `3.2.6` pin. The `3.2.6` pin was made on the premise that vue-tsc 3.3.3+ regressed `UnwrapNestedRefs` over inferred generics; re-investigation against a fully-bumped block showed that diagnosis was a false lead (the earlier bisect was confounded by the SDK model version — the failing block reports identical errors on every vue-tsc version _and_ on older ui-vue). vue-tsc is kept pinned for build reproducibility, but to the latest version rather than an arbitrary older one.

## 1.5.1

### Patch Changes

- b2284d5: Pin `vue-tsc` to `3.2.6`. vue-tsc 3.3.3+ regressed `UnwrapNestedRefs` resolution over inferred generics, which breaks `@platforma-sdk/ui-vue`'s `AppV3` typing — returned `ref`/`computed` app fields stop type-unwrapping, surfacing as false-positive `TS2322`/`TS7053` in blocks while the runtime is correct.

## 1.5.0

### Minor Changes

- 6066082: Replace custom `as (Signed)?ResourceId` regex check with an oxlint-native rule. Bumps `oxlint` to `1.63.0` and adds `oxlint-plugin-eslint` to ship the ESLint `no-restricted-syntax` rule. The shared `oxlint-node.json` config bans `as SignedResourceId` casts via an AST selector. The pl-client `types.ts` — the canonical place to construct `SignedResourceId` values — opts out with a single file-wide `/* oxlint-disable */` directive, so no per-call suppressions are needed. Pl-client now exports `asSignedResourceId(str)` which validates the `<globalId>|<signatureHex>` format and returns a branded `SignedResourceId`; callers outside `types.ts` must use it instead of casting.

## 1.4.0

### Minor Changes

- 72a9e61: Support signatures tracking and strict security mode of backend

## 1.3.2

### Patch Changes

- 92854a4: Fix windows builds
- 92854a4: Fix Windows build output with `preserveModules`: the default `external` callback now only runs its classification for unresolved specifiers (`isResolved=false`). Previously, when Rolldown called `external` again with a resolved absolute path, the regex `/^[^./]/` matched Windows drive letters (`D:\...`), flagging local files as external. This caused Rolldown to emit imports with source `.ts` extensions (e.g. `import from "./helper.ts"`), producing bundles that fail at runtime with `ERR_MODULE_NOT_FOUND`. POSIX was unaffected because its absolute paths start with `/`.

## 1.3.1

### Patch Changes

- cad9688: Fix "go to definition" + update build deps
- Updated dependencies [cad9688]
  - @milaboratories/ts-configs@1.2.3

## 1.3.0

### Minor Changes

- 6fd7371: Update ts-builder serve config to support CJS

## 1.2.14

### Patch Changes

- 90ee879: Set build target to Chrome 140 (Electron 38) to prevent LightningCSS from polyfilling modern CSS features like `light-dark()`

## 1.2.13

### Patch Changes

- 79156bc: fix dense axis
- c4fb398: Correct export and share build configs
- Updated dependencies [79156bc]
  - @milaboratories/ts-configs@1.2.2

## 1.2.12

### Patch Changes

- 1b1dcea: vscode-integration command

## 1.2.11

### Patch Changes

- Updated dependencies [0271e3f]
  - @milaboratories/build-configs@1.5.0

## 1.2.10

### Patch Changes

- 0ae1854: createPTableV2 + Advanced filter in AgTable
- Updated dependencies [0ae1854]
  - @milaboratories/build-configs@1.4.4

## 1.2.9

### Patch Changes

- 4b08ca5: fix lint

## 1.2.8

### Patch Changes

- 2dc3b33: Update oxc setup

## 1.2.7

### Patch Changes

- Updated dependencies [c620234]
  - @milaboratories/build-configs@1.4.3

## 1.2.6

### Patch Changes

- a6ea24f: silent ci tests
- Updated dependencies [a6ea24f]
  - @milaboratories/build-configs@1.4.2
  - @milaboratories/ts-configs@1.2.1

## 1.2.5

### Patch Changes

- f89a883: full integration oxc
- Updated dependencies [f89a883]
  - @milaboratories/build-configs@1.4.1

## 1.2.4

### Patch Changes

- Updated dependencies [3adaafd]
  - @milaboratories/build-configs@1.4.0

## 1.2.3

### Patch Changes

- Updated dependencies [3b11738]
  - @milaboratories/build-configs@1.3.0

## 1.2.2

### Patch Changes

- Updated dependencies [fc8c6d3]
  - @milaboratories/build-configs@1.2.2

## 1.2.1

### Patch Changes

- 1eb721e: annotations default value
- Updated dependencies [1eb721e]
  - @milaboratories/build-configs@1.2.1

## 1.2.0

### Minor Changes

- 25fd324: Standardize block build tooling with explicit targets and config exports
  - Add `block-ui` and `block-test` targets to ts-builder
  - `block-ui`: Uses Vite for building, vue-tsc for type-checking
  - `block-test`: Type-check only, errors on build attempt
  - Add clean export aliases for ts-configs: `block/model`, `block/ui`, `block/test`
  - Add `test` export to eslint-config with vitest globals
  - Create dedicated config files for each block target (tsconfig and vite/rollup configs)

### Patch Changes

- Updated dependencies [25fd324]
  - @milaboratories/build-configs@1.2.0
  - @milaboratories/ts-configs@1.2.0

## 1.1.1

### Patch Changes

- 9e496f1: use custom typescript declaration for model separate bundle
- Updated dependencies [9e496f1]
  - @milaboratories/build-configs@1.1.1

## 1.1.0

### Minor Changes

- 4a90a47: correct usage use-sources for typecheck command

### Patch Changes

- Updated dependencies [4a90a47]
  - @milaboratories/build-configs@1.1.0
  - @milaboratories/ts-configs@1.1.0

## 1.0.6

### Patch Changes

- 92439e1: ts-builder ignore customcudition for build/serve without flag
- Updated dependencies [92439e1]
  - @milaboratories/build-configs@1.0.9

## 1.0.5

### Patch Changes

- 6f85a52: windows friendly runner

## 1.0.4

### Patch Changes

- Updated dependencies [215c50b]
  - @milaboratories/build-configs@1.0.8

## 1.0.3

### Patch Changes

- Updated dependencies [ee5f3ad]
  - @milaboratories/build-configs@1.0.7

## 1.0.2

### Patch Changes

- 69ed569: update resolver to bin commands

## 1.0.1

### Patch Changes

- 3f93434: Packages configuration normalization
- Updated dependencies [3f93434]
  - @milaboratories/build-configs@1.0.6
  - @milaboratories/ts-configs@1.0.6
