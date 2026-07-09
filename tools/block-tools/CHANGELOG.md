# @platforma-sdk/block-tools

## 2.12.0

### Minor Changes

- 232ddef: Add per-channel docker address overrides to `block-tools software build`: `PL_DEV_DOCKER_PUSH_URL`
  / `PL_DEV_DOCKER_PULL_URL` and `PL_RELEASE_DOCKER_PUSH_URL` / `PL_RELEASE_DOCKER_PULL_URL`. The
  push URL is where the image is pushed (dev defaults to the built-in dev registry, release to the
  artifact's own registry); the pull URL is the address embedded in the descriptor and defaults to the
  push URL. Explicit `--docker-registry`/`--docker-push-to` still win, and the bare pl-pkg-parity
  invocation is unchanged. `ecr://`-scheme auto docker-login is handled separately.
- 51c230a: Automate the dev docker login for `block-tools software build` (A-0044). A push target written as
  `ecr://<host>/<repo>` triggers an automatic ECR `docker login` before the push; a plain `https://`
  or bare host opts out. The built-in dev default push target now uses the `ecr://` form, so dev push
  logs in by default. The scheme is stripped for the actual tag/push and for the descriptor's embedded
  pull address.

  The login token is fetched via the AWS SDK (`@aws-sdk/client-ecr-public`), reusing the same default
  credential chain as the S3 binary upload — environment variables first (CI), else the SSO profile
  (local). `AWS_PROFILE` is selected once, process-wide (`PL_AWS_PROFILE` override, default
  `research-poweruser`), so docker login and S3 upload use identical credentials. Login runs
  unconditionally (idempotent, ~1s): an expired or absent session fails at login with a clear
  `aws sso login` hint rather than surfacing an opaque error at push time. Public ECR is the only
  auto-login target. The build engine and `pl-pkg` are untouched — login lives in the block-tools
  layer.

- a89523d: Add the `block-tools software build` command: the single-pass software builder driven by
  three knobs — `--channel`/`PL_BUILD_CHANNEL` (dev|release), `--variant`/`PL_BUILD_VARIANT`
  (docker|binary|all|none), `--location`/`PL_BUILD_LOCATION` (local|remote) — plus
  `--use-published`/`PL_BUILD_USE_PUBLISHED` (build-against-existing). It builds the artifact,
  pushes it when the target is remote, then writes the `.sw.json` descriptor last (ready ⟺ the
  descriptor exists).

  `variant=all` builds every variant the software declares; `variant=none` builds no software and
  emits a minimal `binary` placeholder descriptor per entrypoint, so a block can be built, loaded,
  and rendered without any software (only executing it fails). With no knobs the command reproduces
  `pl-pkg build` (release, version-derived, per-entrypoint variant, docker push only in CI, no
  binary upload). Dev binary remote uploads a content-addressed archive to the dev binary registry
  (endpoint via `PL_DEV_BINARY_UPLOAD_URL`). `location=ssh` and `ecr://` auto docker-login are not
  yet implemented. The command is additive — no block is retargeted to it yet, and `pl-pkg` is
  unchanged.

  The `--do`/`--no-do` tri-state flag resolver (`shouldDoAction`) moves to `package-builder-lib`'s
  `util` and is shared by both `pl-pkg` and the new command instead of being duplicated.

- 7c66be8: Add a per-block `softwareBuild` rollout marker to the structurer. `block-tools structure refresh
--software-build` retargets a block's software leaf from `pl-pkg` to `block-tools software build`
  (plus `do-pack`) and replaces the single `build:dev` script with the scenario set
  (`build:dev-local`, `build:dev-remote`, `build:dev-no-software`, `build:dev-binary-existing`,
  `build:release`) plus a dev-binary-local `test`. The dev-local/remote scripts build every variant
  the software declares (`PL_BUILD_VARIANT=all`); docker-vs-binary is not a per-script choice. The
  choice persists in `.structure`, so later plain refreshes keep the block migrated. Without the
  flag, blocks keep building via `pl-pkg` — no change.
- 1163eb4: Declare the `software build` env vars in the block's turbo `build` task. The root `turbo.json`
  template now cache-keys the build on `PL_BUILD_CHANNEL`/`PL_BUILD_VARIANT`/`PL_BUILD_LOCATION`/
  `PL_BUILD_USE_PUBLISHED` and the `PL_DEV_*`/`PL_RELEASE_*` docker/binary overrides, so a
  channel/scenario switch invalidates the cache for every package's build — including the workflow
  package that embeds the descriptor. The list is declared once (`softwareBuildCacheEnv`) and a test
  guards the template against drift. `PL_PKG_DEV` is retained for the pl-pkg transition.

### Patch Changes

- 45706c3: Fix release publishing: declare `AWS_*`/`PL_AWS_*` in the `build`/`do-pack` `passThroughEnv` of the ptexter and ptabler `turbo.json`, and in the structurer's root `turbo.json` template (`build`) so generated block repos get them too. The S3 upload now runs inside the turbo-cached `build` task under strict env mode, which strips any env var not declared in `env`/`passThroughEnv`. The AWS credentials set by CI were being stripped, so the package builder's S3 storage driver could not load credentials and publish failed with "Could not load credentials from any providers". Uses `passThroughEnv` (not `env`) because session tokens rotate per run and must not enter the cache key.
- 25ae090: Fix release publishing: declare `PL_REGISTRY_PLATFORMA_OPEN_UPLOAD_URL` in the `build`/`do-pack` `env` of the ptexter and ptabler `turbo.json`, and in the structurer's root `turbo.json` template (`build` env) so generated block repos get it too. Software upload now runs inside the turbo-cached `build` task under strict env mode, which strips any env var not declared in `env`/`passThroughEnv`. The registry-scoped upload URL set by CI was being stripped, leaving `registry.storageURL` empty and failing publish with "no storage URL is set for registry platforma-open".
- Updated dependencies [6890c99]
- Updated dependencies [a89523d]
- Updated dependencies [0f7045a]
- Updated dependencies [232ddef]
- Updated dependencies [51c230a]
- Updated dependencies [a6f7e3e]
- Updated dependencies [a89523d]
  - @platforma-sdk/package-builder-lib@1.2.0

## 2.11.10

### Patch Changes

- @milaboratories/pl-model-common@1.46.4
- @milaboratories/pl-model-middle-layer@1.30.11
- @milaboratories/ts-helpers@1.8.4
- @milaboratories/pl-model-backend@1.4.13

## 2.11.9

### Patch Changes

- @milaboratories/pl-model-backend@1.4.12

## 2.11.8

### Patch Changes

- @milaboratories/pl-model-backend@1.4.11

## 2.11.7

### Patch Changes

- f01c92d: Make the generated block `do-pack` script idempotent: it now removes any prior `package.tgz` before packing. Re-running `do-pack`, or running it on a dirty working tree, no longer fails with `mv: dest is not a directory (too many sources)`.
- Updated dependencies [3df748f]
  - @milaboratories/pl-model-common@1.46.3
  - @milaboratories/pl-model-backend@1.4.10
  - @milaboratories/pl-model-middle-layer@1.30.10

## 2.11.6

### Patch Changes

- eecf3a5: Structurer: software packages must not be `private`. `pl-pkg` gates docker
  image auto-push on `!isPrivate`, so a private software package built its image
  but never pushed it — the published block then failed at runtime with a 404
  pulling that image. The structurer no longer generates `private` on software
  packages and now actively removes it on refresh, so a `structure refresh`
  heals any block that still has it.

## 2.11.5

### Patch Changes

- @milaboratories/pl-model-backend@1.4.9

## 2.11.4

### Patch Changes

- 534a237: Reshape the `from-pack-v2` BlockPointer to a dependency-free URL locator: rename
  `folder` → `packUrl` (the block-pack directory) and add optional `rootUrl` (the
  facade/package root). Both are `file:` URLs, NOT filesystem paths.

  The facade emits the lossless, OS-agnostic locator (`import.meta.url` is always a
  forward-slash `file:` URL, even on Windows) by pure string ops with zero imports,
  so it stays dependency-free and loadable in minimal engines (e.g. QuickJS). Each
  consumer converts at its own edge with `fileURLToPath` (loader, `resolveToRegistry`,
  tests), where Windows drive letters / `%`-encoding / UNC are handled correctly; the
  watcher cache key uses `packUrl` directly (a stable string). The structurer that
  builds a block owns its on-disk layout, so the pointer self-describes where the
  pack lives instead of letting consumers reconstruct `<root>/block-pack` — a
  consumer at a different SDK version cannot know a layout the structurer may
  relocate. `loadPackDescriptionFromManifest` takes the pack directory directly.
  `dev-v2` is unchanged (keeps its path-valued `folder`).

- Updated dependencies [534a237]
  - @milaboratories/pl-model-middle-layer@1.30.9
  - @milaboratories/pl-model-backend@1.4.8
  - @milaboratories/pl-model-common@1.46.2
  - @milaboratories/pl-http@1.2.4
  - @milaboratories/ts-helpers@1.8.3
  - @platforma-sdk/blocks-deps-updater@2.2.0
  - @milaboratories/resolve-helper@1.1.3

## 2.11.3

### Patch Changes

- 33be13c: Migrate the block-tools CLI framework from oclif to commander. CLI-only, internal change — the full command surface (build-meta, build-model, pack, publish, refresh-registry, mark-stable, update-deps, list-overview-snapshots, restore-overview-from-snapshot, upload-package-v1, and `structure check|init|refresh`), all flags, short flags, env-var bindings, defaults, and exit behavior are preserved. The library exports (`src/lib.ts` / `dist/index.*` / `dist/lib.d.ts`) are unchanged.

## 2.11.2

### Patch Changes

- Updated dependencies [3a4036d]
  - @milaboratories/pl-model-middle-layer@1.30.8

## 2.11.1

### Patch Changes

- Updated dependencies [2760ae1]
- Updated dependencies [b863d05]
  - @milaboratories/pl-model-common@1.46.2
  - @milaboratories/pl-model-middle-layer@1.30.7
  - @milaboratories/pl-model-backend@1.4.8

## 2.11.0

### Minor Changes

- 10944e8: structurer: manage the block CI workflows (`.github/workflows/build.yaml` and
  `mark-stable.yaml`) as engine-owned (`fixed`) scaffold files, generated from
  the block's short name. Brings the shared-CI pin (`@v4`) and job wiring under
  central management so `refresh` keeps every block's workflow in sync; the only
  per-block bits are derived (`app-name`, `app-name-slug`), with `team-id` and
  the `test` toggle as shared constants. Standalone blocks only — `--sdk-internal`
  blocks are unaffected.

### Patch Changes

- cf7b5c4: structurer: `managed(path, initial, body)` bodies now receive the active
  `RunContext` as an argument (`(ctx) => …`), matching `generate`/`tpl`/`when`.
  Rule code no longer reaches for the module-global `getActiveRunContext()` —
  every execution-level lambda gets `ctx` by argument. Internal refactor; no
  change to generated block output.

## 2.10.19

### Patch Changes

- 459c878: structure: address review follow-ups on the block scaffolding rules

  - test scope now runs the full `ts-builder check` (type-check + lint + fmt-check) instead of type-only, with block-local `.oxlintrc.json` / `.oxfmtrc.json` and a `fmt` script — matching model/ui.
  - ui declares `@types/node` as a peer dependency (mirrors model) instead of stripping it.
  - drop the retired eslint leftovers: the `lint` script and `@platforma-sdk/eslint-config` dep across model/ui/test, plus its catalog entry.
  - drop the vite-era `@vitejs/plugin-vue` / `vite-plugin-dts` deps and catalog entries (now owned by ts-builder).
  - workflow `tsconfig.json` is scaffolded only when the workflow carries co-located tests (paired with the conditional vitest config).
  - rename the root `update` script to `upgrade-sdk` (deprecated `update-sdk` kept for now).

## 2.10.18

### Patch Changes

- 20a96b5: structure: several block-compat improvements distributed to every migrated block.

  - **Derive the catalog `vue` pin from `@platforma-sdk/ui-vue`** via a new `pinCatalogToDependencyOf` builder: it reads the exact `vue` version ui-vue declares (at npm-latest, or a given `ofVersion`) and OVERWRITES the block's catalog entry, so a loose `vue: ^3.5.x` is tightened to match the SDK. This prevents the two-vue-instance mismatch that broke `AppV3`/`SdkPluginV3` typing. Replaces the add-if-absent `vue` floor (which never tightened a pre-existing loose pin).
  - **Conditional `vitest`**: the `vitest` devDep (model/ui/workflow) and the workflow `vitest.config.mts` are now wired only when a package carries co-located tests (added when present, removed when absent), matching the existing conditional `test` script.
  - **Cruft cleanup**: drop vite/tsup/vue-tsc-era artefacts — catalog entries (`vite`, `tsup`, `vue-tsc`), the ui `vite` dep + `preview` script, and the model `tsup`/`vite` deps + top-level `tsup` config block.
  - **`update` script**: add a second `pnpm i` after the structural refresh so a first migration installs the newly-added devDeps (ts-builder/oxlint/oxfmt) before `pnpm fmt`.
  - @milaboratories/pl-model-backend@1.4.7
  - @milaboratories/pl-model-common@1.46.1
  - @milaboratories/pl-model-middle-layer@1.30.6
  - @milaboratories/pl-http@1.2.4
  - @milaboratories/ts-helpers@1.8.3
  - @milaboratories/ts-helpers-oclif@1.1.42
  - @platforma-sdk/blocks-deps-updater@2.2.0

## 2.10.17

### Patch Changes

- 7ac2f79: structure: declare the block tsconfig as a `fixed` file with two static end states (with / without node ambient types), chosen by a `when`/else on co-located-test presence, instead of an imperative `managed` body. This fixes a first-pass `RecheckError` (non-idempotent rule set) on test-bearing blocks migrating off a legacy tsconfig, and adds an optional `else` branch to `when`. Also drops the vestigial `vue-tsc` devDep from the migrated ui (ts-builder owns vue-tsc).
  - @milaboratories/pl-model-backend@1.4.7
  - @milaboratories/pl-model-common@1.46.1
  - @milaboratories/pl-model-middle-layer@1.30.6
  - @milaboratories/pl-http@1.2.4
  - @milaboratories/ts-helpers@1.8.3
  - @milaboratories/ts-helpers-oclif@1.1.42
  - @platforma-sdk/blocks-deps-updater@2.2.0

## 2.10.16

### Patch Changes

- Updated dependencies [508fdcb]
  - @milaboratories/pl-model-middle-layer@1.30.6

## 2.10.15

### Patch Changes

- 63689d1: structure: emit oxfmt-clean JSON for managed non-package.json files

  The structurer's JSON serialiser now matches oxfmt's generic-.json formatting
  for managed/generated files other than package.json (e.g. tsconfig.json):
  objects stay expanded one property per line, while arrays collapse onto a
  single line when they fit the print width. Previously `JSON.stringify`
  expanded every array, so the single-element `include` array in a block's
  `tsconfig.json` failed `ts-builder check` (oxfmt 0.35 collapses it) unless a
  `pnpm fmt` ran first — which then broke the structure fixpoint. Refresh output
  is now both oxfmt-clean and a structure fixpoint with no intervening format
  pass. package.json output is unchanged (fully expanded, as oxfmt formats it).

  Also in this release:

  - fix(registry): `fetchWithRetry` now wraps only the `fetch()` call in its
    try/catch (transport errors are retryable), with HTTP-status handling moved
    outside the catch so a non-retryable status (404/403) throws immediately
    instead of being swallowed and retried.
  - refactor(engine): the structurer engine core is now fully synchronous. The
    `FileSystem` abstraction and everything built on it (runner, discovery,
    version, builders, the run-context scope) drop their Promises; only the npm
    registry client and the CLI's pre-run network prefetch stay async. This
    removes the module-global run-context race by construction — a sync call
    stack cannot interleave — and leaves all generated output byte-identical.

## 2.10.14

### Patch Changes

- Updated dependencies [48f8210]
  - @milaboratories/pl-model-middle-layer@1.30.5

## 2.10.13

### Patch Changes

- Updated dependencies [958289c]
  - @milaboratories/pl-model-common@1.46.1
  - @milaboratories/pl-model-middle-layer@1.30.4
  - @milaboratories/pl-model-backend@1.4.7

## 2.10.12

### Patch Changes

- Updated dependencies [f7c21df]
  - @milaboratories/pl-model-middle-layer@1.30.3

## 2.10.11

### Patch Changes

- Updated dependencies [51c4c8e]
  - @milaboratories/pl-model-middle-layer@1.30.2

## 2.10.10

### Patch Changes

- Updated dependencies [d314bbb]
  - @milaboratories/pl-model-middle-layer@1.30.1

## 2.10.9

### Patch Changes

- Updated dependencies [8cbe874]
  - @milaboratories/ts-helpers@1.8.3
  - @milaboratories/ts-helpers-oclif@1.1.42
  - @milaboratories/pl-model-backend@1.4.6

## 2.10.8

### Patch Changes

- Updated dependencies [5eb93c5]
  - @milaboratories/pl-model-middle-layer@1.30.0

## 2.10.7

### Patch Changes

- Updated dependencies [60b13d1]
  - @milaboratories/pl-model-common@1.46.0
  - @milaboratories/pl-model-middle-layer@1.29.2
  - @milaboratories/pl-model-backend@1.4.5

## 2.10.6

### Patch Changes

- Updated dependencies [c9dccff]
  - @milaboratories/pl-model-middle-layer@1.29.1

## 2.10.5

### Patch Changes

- Updated dependencies [b0c2b5f]
  - @milaboratories/pl-model-common@1.45.0
  - @milaboratories/pl-model-middle-layer@1.29.0
  - @milaboratories/pl-model-backend@1.4.4

## 2.10.4

### Patch Changes

- @milaboratories/pl-model-backend@1.4.3

## 2.10.3

### Patch Changes

- Updated dependencies [fbff717]
  - @milaboratories/pl-model-common@1.44.0
  - @milaboratories/pl-model-middle-layer@1.28.0
  - @milaboratories/pl-model-backend@1.4.2

## 2.10.2

### Patch Changes

- Updated dependencies [d2d7fe5]
  - @milaboratories/pl-model-middle-layer@1.27.0

## 2.10.1

### Patch Changes

- Updated dependencies [98092a6]
  - @milaboratories/pl-model-common@1.43.0
  - @milaboratories/pl-model-middle-layer@1.26.0
  - @milaboratories/pl-model-backend@1.4.1

## 2.10.0

### Minor Changes

- 0a3af02: MILAB-6145: tengo-builder learns a `wasm` artefact type; declare WASM runtime requirement on packed blocks.

  - `pl-tengo` detects `assets.importWasm("@pkg:id")` in tengo sources (regex-based, like the other `import*` calls) and resolves the bytes from each dependency's `package.json` `exports[*].wasm` condition. Subpath `.` maps to id `main`; `./foo` maps to id `foo`.
  - `@platforma-sdk/workflow-tengo`'s `assets` lib gains `importWasm(name)`, a thin wrapper over the new `plapi.loadWasm` host builtin. Returns the component's WIT-interface map directly — block authors index by canonical WIT interface name and JSON-marshal arguments / results at the call site. No SDK-side wrapper per consumer; the consuming file mentions the package id directly (same pattern as `importSoftware` / `importAsset`).
  - `BlockPackMeta` gains `requiredCapabilities?: string[]` — Desktop matches it
    against the backend's `serverInfo.capabilities` at install time. Forward-
    compatible with old Desktops (Zod's `z.object` strips unknown keys).
  - `pl-client`'s `MaintenanceAPI.Ping.Response` exposes the new `capabilities` field added in pl backend (proto field 9).
  - `pl-middle-layer` exposes a `serverCapabilities` getter alongside the existing `serverPlatform`.
  - `pl-tengo` enforces two build-time size guards that mirror backend ingest caps: each `.wasm` file must be ≤ 2 MiB raw (the backend stores it as a value resource, capped at 3 MiB after base64+JSON marshal), and each gzipped template pack must be ≤ ~3.4 MiB (backend `TemplatePackSizeLimit` is 3.5 MiB). Failures point at the offending artefact and, for over-large packs, list each WASM in the tree by size — so block authors see the cause at build time instead of getting an opaque "resource too large" error at publish or render.
  - `pl-client`'s `TestHelpers.getTestClient` JWT cache now keys on the live backend `instanceId` in addition to address / user / password / expiration. Prevents a stale JWT issued by a previous backend run (rotated `instanceId`) being handed to the first authenticated call after a restart — the test fixture re-logs in instead of surfacing `failed to authenticate request using any of available methods`.

### Patch Changes

- Updated dependencies [0a3af02]
  - @milaboratories/pl-model-backend@1.4.0
  - @milaboratories/pl-model-middle-layer@1.25.0

## 2.9.4

### Patch Changes

- Updated dependencies [7a8aeea]
  - @milaboratories/pl-model-middle-layer@1.24.0

## 2.9.3

### Patch Changes

- Updated dependencies [a5bc059]
  - @milaboratories/pl-model-middle-layer@1.23.0

## 2.9.2

### Patch Changes

- @milaboratories/pl-model-backend@1.3.5

## 2.9.1

### Patch Changes

- @milaboratories/pl-model-backend@1.3.4

## 2.9.0

### Minor Changes

- d9ede09: Decouple Zod from TypeScript types in the block-meta / block-tools-v2 layer:

  - Domain types in `pl-model-middle-layer/block_meta` are now canonical TS
    declarations (with a single `Content` discriminated-union as the source of
    truth for content shapes). Schemas that survive are pegged to TS types via
    `satisfies z.ZodType<T>`; transform-bearing boundary schemas use
    `satisfies z.ZodType<T, z.ZodTypeDef, any>`.
  - The `Workflow<>` and `BlockComponents<>` Zod factories in
    `pl-model-middle-layer` are replaced by plain TS generics (`Workflow<T>`,
    `BlockComponents<W, U>`) plus a concrete `BlockComponentsDescriptionRaw`
    boundary schema with a normalizing `string → {type:"workflow-v1", main:...}`
    coercion for `package.json` authoring.
  - In `@platforma-sdk/block-tools/v2`, every `.transform(...)`/`.pipe(...)`
    pipeline becomes a named async function: `resolveBlockPackDescription`,
    `consolidateBlockPackDescription`, `embedBlockPackMetaAbsoluteBase64`,
    `embedBlockPackMetaAbsoluteBytes`, `embedBlockPackMetaBytes`,
    `blockComponentsManifestToAbsoluteUrl`, `addRelativePathPrefix`,
    `parseGlobalOverviewReg`. The unused `BlockDescriptionToExplicitBinaryBytes`,
    `GlobalOverviewToExplicitBinaryBytes`, `GlobalOverviewToExplicitBinaryBase64`
    Zod factories are deleted.
  - The `BlockComponentsAbsoluteUrl` Zod factory that lived in
    `pl-model-middle-layer/block_components.ts` (input: `ContentRelativeBinary`)
    is removed — it was unreachable from any caller. The block-tools variant
    is replaced by `blockComponentsManifestToAbsoluteUrl(manifest, prefix)`.

  All exported TS type names and shapes are preserved; downstream consumers
  (`@milaboratories/pl-middle-layer`, blocks) keep compiling without source
  changes beyond the `@platforma-sdk/block-tools` import-name updates already
  applied in this PR.

### Patch Changes

- Updated dependencies [d9ede09]
  - @milaboratories/pl-model-middle-layer@1.22.0

## 2.8.4

### Patch Changes

- Updated dependencies [62e11be]
  - @milaboratories/pl-model-middle-layer@1.21.0

## 2.8.3

### Patch Changes

- @milaboratories/pl-model-backend@1.3.3

## 2.8.2

### Patch Changes

- @milaboratories/pl-model-backend@1.3.2

## 2.8.1

### Patch Changes

- @milaboratories/pl-model-backend@1.3.1

## 2.8.0

### Minor Changes

- 030e8c2: MILAB-6145: tengo-builder learns a `wasm` artefact type; declare WASM runtime requirement on packed blocks.

  - `pl-tengo` detects `assets.importWasm("@pkg:id")` in tengo sources (regex-based, like the other `import*` calls) and resolves the bytes from each dependency's `package.json` `exports[*].wasm` condition. Subpath `.` maps to id `main`; `./foo` maps to id `foo`.
  - `@platforma-sdk/workflow-tengo` ships a new opt-in lib `:pframes-rs` that wraps `assets.importWasm("@milaboratories/pframes-rs-wasip2:main")`. Blocks that import `:pframes-rs` automatically pull the 1.7 MB pframes-rs wasm into their templates' packs; blocks that don't stay lean.
  - `BlockPackMeta` gains `requiredCapabilities?: string[]` — Desktop matches it
    against the backend's `serverInfo.capabilities` at install time. Forward-
    compatible with old Desktops (Zod's `z.object` strips unknown keys).
  - `pl-client`'s `MaintenanceAPI.Ping.Response` exposes the new `capabilities` field added in pl backend (proto field 9).
  - `pl-middle-layer` exposes a `serverCapabilities` getter alongside the existing `serverPlatform`.
  - `pl-tengo` enforces two build-time size guards that mirror backend ingest caps: each `.wasm` file must be ≤ 2 MiB raw (the backend stores it as a value resource, capped at 3 MiB after base64+JSON marshal), and each gzipped template pack must be ≤ ~3.4 MiB (backend `TemplatePackSizeLimit` is 3.5 MiB). Failures point at the offending artefact and, for over-large packs, list each WASM in the tree by size — so block authors see the cause at build time instead of getting an opaque "resource too large" error at publish or render.

### Patch Changes

- Updated dependencies [030e8c2]
  - @milaboratories/pl-model-backend@1.3.0
  - @milaboratories/pl-model-middle-layer@1.20.0

## 2.7.25

### Patch Changes

- Updated dependencies [2b928af]
  - @milaboratories/pl-model-common@1.42.0
  - @milaboratories/pl-model-middle-layer@1.19.4

## 2.7.24

### Patch Changes

- d93d296: Support AbortSignal

## 2.7.23

### Patch Changes

- Updated dependencies [641c845]
  - @milaboratories/pl-model-common@1.41.2
  - @milaboratories/pl-model-middle-layer@1.19.3

## 2.7.22

### Patch Changes

- @milaboratories/pl-model-common@1.41.1
- @milaboratories/pl-model-middle-layer@1.19.2
- @milaboratories/ts-helpers@1.8.2
- @milaboratories/ts-helpers-oclif@1.1.41

## 2.7.21

### Patch Changes

- Updated dependencies [cb9e0ba]
  - @milaboratories/pl-model-common@1.41.0
  - @milaboratories/pl-model-middle-layer@1.19.1

## 2.7.20

### Patch Changes

- Updated dependencies [72a9e61]
  - @milaboratories/pl-model-middle-layer@1.19.0
  - @milaboratories/pl-model-common@1.40.0
  - @milaboratories/pl-http@1.2.4
  - @milaboratories/ts-helpers@1.8.1
  - @milaboratories/ts-helpers-oclif@1.1.40
  - @platforma-sdk/blocks-deps-updater@2.2.0

## 2.7.19

### Patch Changes

- Updated dependencies [731ab44]
  - @milaboratories/pl-model-common@1.39.0
  - @milaboratories/pl-model-middle-layer@1.18.10

## 2.7.18

### Patch Changes

- Updated dependencies [6369956]
  - @milaboratories/pl-model-common@1.38.0
  - @milaboratories/pl-model-middle-layer@1.18.9

## 2.7.17

### Patch Changes

- Updated dependencies [a40505e]
  - @milaboratories/pl-model-common@1.37.0
  - @milaboratories/pl-model-middle-layer@1.18.8

## 2.7.16

### Patch Changes

- @milaboratories/pl-model-common@1.36.2
- @milaboratories/pl-model-middle-layer@1.18.7

## 2.7.15

### Patch Changes

- Updated dependencies [e5596f5]
  - @milaboratories/pl-model-common@1.36.1
  - @milaboratories/pl-model-middle-layer@1.18.6

## 2.7.14

### Patch Changes

- Updated dependencies [5420fea]
- Updated dependencies [5420fea]
- Updated dependencies [5420fea]
  - @milaboratories/pl-model-common@1.36.0
  - @milaboratories/pl-model-middle-layer@1.18.5

## 2.7.13

### Patch Changes

- Updated dependencies [10eec21]
  - @milaboratories/pl-model-common@1.35.0
  - @milaboratories/pl-model-middle-layer@1.18.4

## 2.7.12

### Patch Changes

- Updated dependencies [a2304be]
  - @milaboratories/pl-model-common@1.34.1
  - @milaboratories/pl-model-middle-layer@1.18.3

## 2.7.11

### Patch Changes

- Updated dependencies [8eb112a]
- Updated dependencies [8eb112a]
  - @milaboratories/pl-model-common@1.34.0
  - @milaboratories/pl-model-middle-layer@1.18.2

## 2.7.10

### Patch Changes

- Updated dependencies [1411dea]
  - @milaboratories/pl-model-common@1.33.0
  - @milaboratories/pl-model-middle-layer@1.18.1

## 2.7.9

### Patch Changes

- Updated dependencies [49485fd]
  - @milaboratories/pl-model-middle-layer@1.18.0
  - @milaboratories/pl-model-common@1.32.1

## 2.7.8

### Patch Changes

- Updated dependencies [436d4a9]
  - @milaboratories/pl-model-common@1.32.0
  - @milaboratories/pl-model-middle-layer@1.17.0

## 2.7.7

### Patch Changes

- Updated dependencies [9c3b6c2]
  - @milaboratories/pl-model-common@1.31.2
  - @milaboratories/pl-model-middle-layer@1.16.4

## 2.7.6

### Patch Changes

- cad9688: Fix "go to definition" + update build deps
  - @milaboratories/pl-model-common@1.31.1
  - @milaboratories/pl-model-middle-layer@1.16.3
  - @milaboratories/pl-http@1.2.4
  - @milaboratories/resolve-helper@1.1.3
  - @milaboratories/ts-helpers@1.8.1
  - @milaboratories/ts-helpers-oclif@1.1.40
  - @platforma-sdk/blocks-deps-updater@2.2.0

## 2.7.5

### Patch Changes

- Updated dependencies [6dc9e0d]
  - @milaboratories/ts-helpers@1.8.1
  - @milaboratories/pl-model-common@1.31.1
  - @milaboratories/pl-model-middle-layer@1.16.3
  - @milaboratories/ts-helpers-oclif@1.1.40

## 2.7.4

### Patch Changes

- Updated dependencies [5becf87]
  - @milaboratories/pl-model-common@1.31.0
  - @milaboratories/pl-model-middle-layer@1.16.2

## 2.7.3

### Patch Changes

- Updated dependencies [74a2ffa]
  - @milaboratories/pl-model-common@1.30.0
  - @milaboratories/ts-helpers@1.8.0
  - @milaboratories/pl-model-middle-layer@1.16.1
  - @milaboratories/ts-helpers-oclif@1.1.39

## 2.7.2

### Patch Changes

- Updated dependencies [cfee265]
  - @milaboratories/pl-model-common@1.29.0
  - @milaboratories/pl-model-middle-layer@1.16.0

## 2.7.1

### Patch Changes

- Updated dependencies [e1d62fe]
  - @milaboratories/pl-model-common@1.28.0
  - @milaboratories/pl-model-middle-layer@1.15.0

## 2.7.0

### Minor Changes

- d59f5fe: New collection columns implementation

### Patch Changes

- Updated dependencies [d59f5fe]
  - @platforma-sdk/blocks-deps-updater@2.2.0
  - @milaboratories/pl-model-middle-layer@1.14.0
  - @milaboratories/pl-model-common@1.27.0

## 2.6.70

### Patch Changes

- Updated dependencies [227002e]
  - @milaboratories/pl-model-common@1.26.1
  - @milaboratories/pl-model-middle-layer@1.13.1

## 2.6.69

### Patch Changes

- Updated dependencies [b4036fb]
  - @milaboratories/pl-model-common@1.26.0
  - @milaboratories/pl-model-middle-layer@1.13.0

## 2.6.68

### Patch Changes

- Updated dependencies [15959f8]
  - @milaboratories/pl-model-common@1.25.3
  - @milaboratories/pl-model-middle-layer@1.12.12

## 2.6.67

### Patch Changes

- 4f3a521: Rewrite blocks-deps-updater as a TypeScript package with vite build, add ag-grid version pinning to ~34.1.2, and update block-tools to import directly instead of spawning a subprocess.
- Updated dependencies [4f3a521]
  - @platforma-sdk/blocks-deps-updater@2.1.0

## 2.6.66

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.12.11

## 2.6.65

### Patch Changes

- 79156bc: fix dense axis
- Updated dependencies [79156bc]
  - @milaboratories/pl-model-common@1.25.2
  - @milaboratories/pl-model-middle-layer@1.12.10
  - @milaboratories/pl-http@1.2.4
  - @milaboratories/resolve-helper@1.1.3
  - @milaboratories/ts-helpers@1.7.3
  - @milaboratories/ts-helpers-oclif@1.1.38
  - @platforma-sdk/blocks-deps-updater@2.0.2

## 2.6.64

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.12.9

## 2.6.63

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.12.8

## 2.6.62

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.12.7

## 2.6.61

### Patch Changes

- Updated dependencies [523a59f]
  - @milaboratories/pl-model-common@1.25.1
  - @milaboratories/pl-model-middle-layer@1.12.6

## 2.6.60

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.12.5

## 2.6.59

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.12.4

## 2.6.58

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.12.3

## 2.6.57

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.12.2

## 2.6.56

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.12.1

## 2.6.55

### Patch Changes

- Updated dependencies [2ad9783]
  - @milaboratories/pl-model-middle-layer@1.12.0

## 2.6.54

### Patch Changes

- Updated dependencies [01d0b52]
  - @milaboratories/pl-model-common@1.25.0
  - @milaboratories/pl-model-middle-layer@1.11.14

## 2.6.53

### Patch Changes

- Updated dependencies [cb28fde]
  - @milaboratories/pl-model-common@1.24.11
  - @milaboratories/pl-model-middle-layer@1.11.13

## 2.6.52

### Patch Changes

- Updated dependencies [866a323]
  - @milaboratories/pl-model-common@1.24.10
  - @milaboratories/pl-model-middle-layer@1.11.12

## 2.6.51

### Patch Changes

- Updated dependencies [a3659cd]
  - @milaboratories/pl-model-common@1.24.9
  - @milaboratories/pl-model-middle-layer@1.11.11

## 2.6.50

### Patch Changes

- Updated dependencies [4f04561]
  - @milaboratories/pl-model-common@1.24.8
  - @milaboratories/pl-model-middle-layer@1.11.10

## 2.6.49

### Patch Changes

- 0ae1854: createPTableV2 + Advanced filter in AgTable
- Updated dependencies [0ae1854]
  - @milaboratories/pl-model-middle-layer@1.11.9
  - @milaboratories/pl-model-common@1.24.7
  - @milaboratories/pl-http@1.2.3
  - @milaboratories/resolve-helper@1.1.2
  - @milaboratories/ts-helpers@1.7.2
  - @milaboratories/ts-helpers-oclif@1.1.37

## 2.6.48

### Patch Changes

- Updated dependencies [6689b53]
  - @milaboratories/pl-model-middle-layer@1.11.8

## 2.6.47

### Patch Changes

- c620234: remove unused packages
- Updated dependencies [c620234]
  - @milaboratories/pl-model-middle-layer@1.11.7
  - @milaboratories/pl-http@1.2.3
  - @milaboratories/pl-model-common@1.24.6
  - @milaboratories/resolve-helper@1.1.2
  - @milaboratories/ts-helpers@1.7.2
  - @milaboratories/ts-helpers-oclif@1.1.37

## 2.6.46

### Patch Changes

- a6ea24f: silent ci tests
- Updated dependencies [a6ea24f]
  - @milaboratories/pl-model-common@1.24.5
  - @milaboratories/pl-model-middle-layer@1.11.6
  - @milaboratories/pl-http@1.2.2
  - @milaboratories/resolve-helper@1.1.2
  - @milaboratories/ts-helpers@1.7.2
  - @milaboratories/ts-helpers-oclif@1.1.37
  - @platforma-sdk/blocks-deps-updater@2.0.1

## 2.6.45

### Patch Changes

- f89a883: full integration oxc
- Updated dependencies [f89a883]
  - @milaboratories/ts-helpers-oclif@1.1.36
  - @milaboratories/pl-model-middle-layer@1.11.5
  - @milaboratories/ts-helpers@1.7.1
  - @milaboratories/pl-model-common@1.24.4
  - @milaboratories/pl-http@1.2.1
  - @milaboratories/resolve-helper@1.1.1

## 2.6.44

### Patch Changes

- Updated dependencies [77db818]
  - @milaboratories/pl-model-middle-layer@1.11.4

## 2.6.43

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.11.3

## 2.6.42

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.11.2

## 2.6.41

### Patch Changes

- Updated dependencies [b069fbe]
  - @milaboratories/pl-model-middle-layer@1.11.1

## 2.6.40

### Patch Changes

- Updated dependencies [7cca3e8]
  - @milaboratories/pl-model-middle-layer@1.11.0

## 2.6.39

### Patch Changes

- Updated dependencies [db932b2]
  - @milaboratories/pl-model-middle-layer@1.10.8

## 2.6.38

### Patch Changes

- Updated dependencies [0099ff7]
  - @milaboratories/pl-model-common@1.24.3
  - @milaboratories/pl-model-middle-layer@1.10.7

## 2.6.37

### Patch Changes

- Updated dependencies [4713838]
  - @milaboratories/pl-model-common@1.24.2
  - @milaboratories/pl-model-middle-layer@1.10.6

## 2.6.36

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.10.5

## 2.6.35

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.10.4

## 2.6.34

### Patch Changes

- Updated dependencies [a748b92]
  - @milaboratories/pl-model-middle-layer@1.10.3

## 2.6.33

### Patch Changes

- Updated dependencies [f819dfd]
  - @milaboratories/pl-model-common@1.24.1
  - @milaboratories/pl-model-middle-layer@1.10.2

## 2.6.32

### Patch Changes

- Updated dependencies [48e8984]
  - @milaboratories/pl-model-middle-layer@1.10.1

## 2.6.31

### Patch Changes

- Updated dependencies [a267fe8]
  - @milaboratories/ts-helpers@1.7.0
  - @milaboratories/ts-helpers-oclif@1.1.35

## 2.6.30

### Patch Changes

- 1694d1a: Remove obsolete config shape check
- Updated dependencies [1694d1a]
  - @milaboratories/pl-model-middle-layer@1.10.0
  - @milaboratories/ts-helpers@1.6.0
  - @milaboratories/pl-model-common@1.24.0
  - @milaboratories/ts-helpers-oclif@1.1.34

## 2.6.29

### Patch Changes

- Updated dependencies [fc75a16]
  - @milaboratories/pl-model-common@1.23.0
  - @milaboratories/pl-model-middle-layer@1.9.1

## 2.6.28

### Patch Changes

- Updated dependencies [88f33fa]
  - @milaboratories/pl-model-middle-layer@1.9.0
  - @milaboratories/pl-model-common@1.22.0

## 2.6.27

### Patch Changes

- Updated dependencies [5deb79a]
  - @milaboratories/pl-model-common@1.21.10
  - @milaboratories/pl-model-middle-layer@1.8.45

## 2.6.26

### Patch Changes

- 2263e2b: add update deps cmd to block-tools

## 2.6.25

### Patch Changes

- Updated dependencies [bf6fe49]
  - @milaboratories/pl-model-common@1.21.9
  - @milaboratories/pl-model-middle-layer@1.8.44

## 2.6.24

### Patch Changes

- Updated dependencies [4bfd1a7]
  - @milaboratories/pl-model-middle-layer@1.8.43

## 2.6.23

### Patch Changes

- Updated dependencies [2c07d5a]
  - @milaboratories/pl-model-middle-layer@1.8.42
  - @milaboratories/pl-model-common@1.21.8

## 2.6.22

### Patch Changes

- Updated dependencies [d088e83]
  - @milaboratories/pl-model-common@1.21.7
  - @milaboratories/pl-model-middle-layer@1.8.41

## 2.6.21

### Patch Changes

- Updated dependencies [17e5fe7]
  - @milaboratories/pl-model-common@1.21.6
  - @milaboratories/pl-model-middle-layer@1.8.40

## 2.6.20

### Patch Changes

- Updated dependencies [8996bed]
  - @milaboratories/pl-model-middle-layer@1.8.39
  - @milaboratories/ts-helpers@1.5.4
  - @milaboratories/ts-helpers-oclif@1.1.33

## 2.6.19

### Patch Changes

- Updated dependencies [6af87a6]
  - @milaboratories/pl-model-middle-layer@1.8.38
  - @milaboratories/ts-helpers@1.5.3
  - @milaboratories/ts-helpers-oclif@1.1.32

## 2.6.18

### Patch Changes

- Updated dependencies [c3ce3ce]
  - @milaboratories/pl-model-middle-layer@1.8.37

## 2.6.17

### Patch Changes

- Updated dependencies [55b218b]
  - @milaboratories/pl-model-middle-layer@1.8.36
  - @milaboratories/ts-helpers@1.5.2
  - @milaboratories/pl-model-common@1.21.5
  - @milaboratories/ts-helpers-oclif@1.1.31

## 2.6.16

### Patch Changes

- Updated dependencies [38da155]
  - @milaboratories/pl-model-common@1.21.4
  - @milaboratories/pl-model-middle-layer@1.8.35

## 2.6.15

### Patch Changes

- Updated dependencies [bb07805]
  - @milaboratories/pl-model-common@1.21.3
  - @milaboratories/pl-model-middle-layer@1.8.34

## 2.6.14

### Patch Changes

- Updated dependencies [d5a8713]
  - @milaboratories/pl-model-common@1.21.2
  - @milaboratories/pl-model-middle-layer@1.8.33

## 2.6.13

### Patch Changes

- Updated dependencies [e8adc3b]
  - @milaboratories/pl-model-common@1.21.1
  - @milaboratories/pl-model-middle-layer@1.8.32

## 2.6.12

### Patch Changes

- Updated dependencies [ef22c49]
- Updated dependencies [5ecb368]
  - @milaboratories/pl-model-common@1.21.0
  - @milaboratories/pl-model-middle-layer@1.8.31

## 2.6.11

### Patch Changes

- Updated dependencies [a9517a8]
  - @milaboratories/pl-http@1.2.0

## 2.6.10

### Patch Changes

- Updated dependencies [5d4774c]
  - @milaboratories/pl-model-common@1.20.1
  - @milaboratories/pl-model-middle-layer@1.8.30

## 2.6.9

### Patch Changes

- Updated dependencies [25c0fed]
  - @milaboratories/ts-helpers@1.5.1
  - @milaboratories/ts-helpers-oclif@1.1.30

## 2.6.8

### Patch Changes

- Updated dependencies [b979236]
  - @milaboratories/pl-http@1.1.8

## 2.6.7

### Patch Changes

- Updated dependencies [916de57]
  - @milaboratories/ts-helpers@1.5.0
  - @milaboratories/pl-model-common@1.20.0
  - @milaboratories/ts-helpers-oclif@1.1.29
  - @milaboratories/pl-model-middle-layer@1.8.29

## 2.6.6

### Patch Changes

- Updated dependencies [0432c59]
  - @milaboratories/pl-model-middle-layer@1.8.28

## 2.6.5

### Patch Changes

- Updated dependencies [fb57534]
  - @milaboratories/pl-model-middle-layer@1.8.27

## 2.6.4

### Patch Changes

- Updated dependencies [662eee0]
  - @milaboratories/pl-model-middle-layer@1.8.26
  - @milaboratories/pl-model-common@1.19.19

## 2.6.3

### Patch Changes

- Updated dependencies [49160c4]
  - @milaboratories/pl-model-common@1.19.18
  - @milaboratories/pl-model-middle-layer@1.8.25

## 2.6.2

### Patch Changes

- Updated dependencies [6bc20d1]
  - @milaboratories/pl-model-common@1.19.17
  - @milaboratories/pl-model-middle-layer@1.8.24

## 2.6.1

### Patch Changes

- Updated dependencies [3d9638e]
  - @milaboratories/pl-model-middle-layer@1.8.23
  - @milaboratories/ts-helpers@1.4.7
  - @milaboratories/pl-model-common@1.19.16
  - @milaboratories/ts-helpers-oclif@1.1.28

## 2.6.0

### Minor Changes

- 0ff2a1b: **Enhanced force mode to support complete package and version removal**

  Force mode in the registry now properly handles complete removal of manually deleted packages and versions:

  - **Complete rebuild**: Force mode now starts with empty overviews instead of loading existing ones, ensuring overviews exactly match storage contents
  - **Automatic cleanup**: Manually deleted packages/versions are automatically removed from registry overviews during force mode refresh
  - **Pre-write snapshots**: Added safety feature that creates backup snapshots with `-prewrite-` suffix before making any changes in force mode
  - **Comprehensive testing**: Added extensive test coverage for deletion scenarios

  **Breaking changes**: None - this enhancement only affects force mode behavior and maintains backward compatibility for normal mode operations.

  **Use case**: This resolves the issue where manually deleted packages would persist in registry overviews because the previous force mode only updated packages found in storage. Now force mode performs a complete rebuild, guaranteeing consistency between storage and overviews.

- 0ff2a1b: **Registry Overview Snapshots & Enhanced Schema Backward Compatibility**

  Added comprehensive snapshot functionality for registry overviews and improved Zod schema compatibility across the entire codebase.

  ## Registry Snapshots (minor)

  - **Automatic backup creation**: Overview files are automatically backed up during every registry update with gzipped compression
  - **Organized storage structure**: Snapshots stored in `_overview_snapshots_v2/global/` and `per_package/` folders mirroring main hierarchy
  - **Security features**: Millisecond timestamps with random suffixes prevent CDN retrieval attacks
  - **CLI management tools**: Added `list-overview-snapshots` and `restore-overview-from-snapshot` commands with safety confirmations
  - **Configurable behavior**: `skipSnapshotCreation` setting allows disabling snapshots when needed
  - **Comprehensive testing**: Full test coverage ensures reliability

  ## Schema Backward Compatibility (patch)

  - **Strategic schema improvements**: Enhanced Zod schemas to prevent data loss during version transitions
  - **Smart classification**: Applied `.passthrough()` to evolving data structures (overviews, manifests, registries, errors) while maintaining `.strict()` for closed types (content types, identifiers)
  - **Wide compatibility coverage**: Updated schemas across block metadata, registry specifications, error structures, and deployment configurations
  - **Forward compatibility**: Older versions will now preserve unknown fields instead of stripping them during parsing

  These improvements ensure robust registry management with automatic backup capabilities and seamless schema evolution without breaking changes.

### Patch Changes

- Updated dependencies [0ff2a1b]
  - @milaboratories/pl-model-middle-layer@1.8.22
  - @milaboratories/pl-model-common@1.19.15

## 2.5.92

### Patch Changes

- Updated dependencies [f848ca0]
  - @milaboratories/pl-model-middle-layer@1.8.21

## 2.5.91

### Patch Changes

- Updated dependencies [a14b8c8]
  - @milaboratories/pl-model-middle-layer@1.8.20

## 2.5.90

### Patch Changes

- Updated dependencies [f5bcdbe]
  - @milaboratories/pl-model-middle-layer@1.8.19

## 2.5.89

### Patch Changes

- Updated dependencies [9acf386]
  - @milaboratories/pl-model-middle-layer@1.8.18

## 2.5.88

### Patch Changes

- Updated dependencies [ef18158]
  - @milaboratories/pl-model-middle-layer@1.8.17

## 2.5.87

### Patch Changes

- Updated dependencies [2a21be5]
  - @milaboratories/pl-model-common@1.19.14
  - @milaboratories/pl-model-middle-layer@1.8.16

## 2.5.86

### Patch Changes

- Updated dependencies [10a5439]
- Updated dependencies [10a5439]
  - @milaboratories/pl-model-middle-layer@1.8.15
  - @milaboratories/ts-helpers@1.4.6
  - @milaboratories/ts-helpers-oclif@1.1.27

## 2.5.85

### Patch Changes

- Updated dependencies [dc289eb]
  - @milaboratories/pl-model-middle-layer@1.8.14

## 2.5.84

### Patch Changes

- Updated dependencies [9508f78]
  - @milaboratories/pl-model-middle-layer@1.8.13

## 2.5.83

### Patch Changes

- 3f93434: Packages configuration normalization
- Updated dependencies [3f93434]
  - @milaboratories/ts-helpers-oclif@1.1.26
  - @milaboratories/resolve-helper@1.1.1
  - @milaboratories/pl-model-middle-layer@1.8.8
  - @milaboratories/ts-helpers@1.4.4
  - @milaboratories/pl-model-common@1.19.8
  - @milaboratories/pl-http@1.1.6

## 2.5.82

### Patch Changes

- d1b00dc: Added --unstable flag to publish command to control stable channel assignment. When --unstable flag is not set (default behavior), published packages are automatically added to the stable channel. When --unstable flag is set, packages are published without being added to the stable channel. Also added PL_PUBLISH_UNSTABLE environment variable support.

  Added gzipped version of global overview file. The registry now creates both the regular overview.json file and a compressed overview.json.gz file with identical content to improve download performance.

## 2.5.81

### Patch Changes

- Updated dependencies [b8105fb]
  - @milaboratories/pl-model-middle-layer@1.8.7
  - @milaboratories/pl-model-common@1.19.4

## 2.5.80

### Patch Changes

- Updated dependencies [6d6c4ba]
  - @milaboratories/pl-model-common@1.19.3
  - @milaboratories/pl-model-middle-layer@1.8.6

## 2.5.79

### Patch Changes

- Updated dependencies [017a888]
  - @milaboratories/pl-model-common@1.19.2
  - @milaboratories/pl-model-middle-layer@1.8.5

## 2.5.78

### Patch Changes

- Updated dependencies [ff4a709]
  - @milaboratories/ts-helpers@1.4.3
  - @milaboratories/ts-helpers-oclif@1.1.25

## 2.5.77

### Patch Changes

- Updated dependencies [636088d]
- Updated dependencies [636088d]
  - @milaboratories/pl-model-middle-layer@1.8.4
  - @milaboratories/pl-model-common@1.19.1

## 2.5.76

### Patch Changes

- Updated dependencies [98b0ded]
  - @milaboratories/pl-model-common@1.19.0
  - @milaboratories/pl-model-middle-layer@1.8.3

## 2.5.75

### Patch Changes

- Updated dependencies [3271446]
  - @milaboratories/pl-model-common@1.18.0
  - @milaboratories/pl-model-middle-layer@1.8.2

## 2.5.74

### Patch Changes

- Updated dependencies [ef9f418]
  - @milaboratories/pl-model-middle-layer@1.8.1

## 2.5.73

### Patch Changes

- Updated dependencies [188ee1e]
  - @milaboratories/ts-helpers@1.4.2
  - @milaboratories/ts-helpers-oclif@1.1.24

## 2.5.72

### Patch Changes

- 76e485b: Fix stripping block pack manifest fields from newer sdk versions

## 2.5.71

### Patch Changes

- Updated dependencies [e7c0edb]
  - @milaboratories/pl-model-middle-layer@1.8.0
  - @milaboratories/pl-model-common@1.17.0

## 2.5.70

### Patch Changes

- Updated dependencies [9bb26ff]
  - @milaboratories/pl-model-common@1.16.5
  - @milaboratories/pl-model-middle-layer@1.7.52

## 2.5.69

### Patch Changes

- Updated dependencies [c12345a]
  - @milaboratories/pl-model-common@1.16.4
  - @milaboratories/pl-model-middle-layer@1.7.51

## 2.5.68

### Patch Changes

- Updated dependencies [7afc448]
  - @milaboratories/pl-model-middle-layer@1.7.50

## 2.5.67

### Patch Changes

- Updated dependencies [7be8a2b]
  - @milaboratories/pl-model-common@1.16.3
  - @milaboratories/pl-model-middle-layer@1.7.49

## 2.5.66

### Patch Changes

- Updated dependencies [dfb0086]
  - @milaboratories/pl-model-common@1.16.2
  - @milaboratories/pl-model-middle-layer@1.7.48

## 2.5.65

### Patch Changes

- Updated dependencies [d525c60]
  - @milaboratories/pl-model-common@1.16.1
  - @milaboratories/pl-model-middle-layer@1.7.47

## 2.5.64

### Patch Changes

- Updated dependencies [98d48f6]
  - @milaboratories/pl-model-middle-layer@1.7.46

## 2.5.63

### Patch Changes

- Updated dependencies [a0c607a]
  - @milaboratories/pl-model-middle-layer@1.7.45

## 2.5.62

### Patch Changes

- Updated dependencies [3b46d33]
  - @milaboratories/pl-model-common@1.16.0
  - @milaboratories/pl-model-middle-layer@1.7.44

## 2.5.61

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.43

## 2.5.60

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.42

## 2.5.59

### Patch Changes

- 37800c5: Public tools packages
- Updated dependencies [37800c5]
  - @milaboratories/ts-helpers-oclif@1.1.23
  - @milaboratories/pl-model-middle-layer@1.7.41
  - @milaboratories/ts-helpers@1.4.1
  - @milaboratories/pl-http@1.1.4

## 2.5.58

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.40

## 2.5.57

### Patch Changes

- Updated dependencies [2bcc47f]
  - @milaboratories/pl-model-middle-layer@1.7.39

## 2.5.56

### Patch Changes

- Updated dependencies [619f490]
  - @milaboratories/pl-model-middle-layer@1.7.38

## 2.5.55

### Patch Changes

- Updated dependencies [c243d64]
- Updated dependencies [c7894c2]
  - @milaboratories/pl-http@1.1.3
  - @milaboratories/ts-helpers@1.4.0
  - @milaboratories/ts-helpers-oclif@1.1.22

## 2.5.54

### Patch Changes

- Updated dependencies [49cf7ee]
  - @milaboratories/ts-helpers@1.3.3
  - @milaboratories/ts-helpers-oclif@1.1.21
  - @milaboratories/pl-model-middle-layer@1.7.37

## 2.5.53

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.36

## 2.5.52

### Patch Changes

- Updated dependencies [f191f2a]
  - @milaboratories/ts-helpers@1.3.2
  - @milaboratories/ts-helpers-oclif@1.1.20
  - @milaboratories/pl-model-middle-layer@1.7.35

## 2.5.51

### Patch Changes

- Updated dependencies [0f511ff]
  - @milaboratories/ts-helpers@1.3.1
  - @milaboratories/ts-helpers-oclif@1.1.19

## 2.5.50

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.34

## 2.5.49

### Patch Changes

- Updated dependencies [ce87da7]
  - @milaboratories/ts-helpers@1.3.0
  - @milaboratories/ts-helpers-oclif@1.1.18

## 2.5.48

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.33

## 2.5.47

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.32

## 2.5.46

### Patch Changes

- Updated dependencies [94468e0]
  - @milaboratories/pl-model-middle-layer@1.7.31

## 2.5.45

### Patch Changes

- Updated dependencies [8e23a2e]
  - @milaboratories/pl-model-middle-layer@1.7.30

## 2.5.44

### Patch Changes

- Updated dependencies [ab9fefd]
  - @milaboratories/pl-model-middle-layer@1.7.29

## 2.5.43

### Patch Changes

- Updated dependencies [fc7d156]
  - @milaboratories/pl-model-middle-layer@1.7.28

## 2.5.42

### Patch Changes

- Updated dependencies [01a558e]
  - @milaboratories/ts-helpers@1.2.0
  - @milaboratories/pl-model-middle-layer@1.7.27
  - @milaboratories/ts-helpers-oclif@1.1.17

## 2.5.41

### Patch Changes

- Updated dependencies [5240867]
  - @milaboratories/ts-helpers@1.1.7
  - @milaboratories/ts-helpers-oclif@1.1.16

## 2.5.40

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.26

## 2.5.39

### Patch Changes

- Updated dependencies [56d021e]
  - @milaboratories/ts-helpers@1.1.6
  - @milaboratories/ts-helpers-oclif@1.1.15

## 2.5.38

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.25

## 2.5.37

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.24

## 2.5.36

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.23

## 2.5.35

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.22

## 2.5.34

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.21

## 2.5.33

### Patch Changes

- Updated dependencies [962c620]
  - @milaboratories/pl-model-middle-layer@1.7.20

## 2.5.32

### Patch Changes

- Updated dependencies [2490c21]
  - @milaboratories/pl-model-middle-layer@1.7.19

## 2.5.31

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.18

## 2.5.30

### Patch Changes

- Updated dependencies [e82d0b8]
  - @milaboratories/pl-model-middle-layer@1.7.17

## 2.5.29

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.16

## 2.5.28

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.15

## 2.5.27

### Patch Changes

- Updated dependencies [9e9a70f]
  - @milaboratories/ts-helpers-oclif@1.1.14
  - @milaboratories/ts-helpers@1.1.5
  - @milaboratories/pl-http@1.1.2
  - @milaboratories/pl-model-middle-layer@1.7.14

## 2.5.26

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.13

## 2.5.25

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.12

## 2.5.24

### Patch Changes

- a505bdb: Upgrade network and tool dependencies:
  - undici: ~7.4.0 → ~7.5.0
  - @grpc/grpc-js: ~1.12.6 → ~1.13.1
  - @protobuf-ts/plugin: 2.9.5 → 2.9.6
  - @aws-sdk/client-s3: 3.758.0 → 3.775.0
  - lru-cache: ^11.0.2 → ^11.1.0
  - yaml: ^2.6.1 → ^2.7.0
  - remeda: ^2.21.1 → ^2.21.2
  - vite-plugin-dts: ^4.4.0 → ^4.5.3
  - eslint: ^9.22.0 → ^9.23.0
  - @vitejs/plugin-vue: ^5.2.1 → ^5.2.3
- Updated dependencies [a505bdb]
  - @milaboratories/pl-http@1.1.1
  - @milaboratories/pl-model-middle-layer@1.7.11
  - @milaboratories/ts-helpers@1.1.4
  - @milaboratories/ts-helpers-oclif@1.1.13

## 2.5.23

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.10

## 2.5.22

### Patch Changes

- Updated dependencies [af43efe]
  - @milaboratories/resolve-helper@1.1.0

## 2.5.21

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.9

## 2.5.20

### Patch Changes

- Updated dependencies [f4ec096]
  - @milaboratories/pl-model-middle-layer@1.7.8

## 2.5.19

### Patch Changes

- Updated dependencies [624af88]
  - @milaboratories/pl-model-middle-layer@1.7.7

## 2.5.18

### Patch Changes

- Updated dependencies [3bf8838]
  - @milaboratories/pl-http@1.1.0

## 2.5.17

### Patch Changes

- Updated dependencies [e6ad278]
  - @milaboratories/pl-http@1.0.7

## 2.5.16

### Patch Changes

- e06efcd: Pin and standardize dependency versions for network and utility libraries to ensure consistent builds and prevent unexpected behavior from minor version changes. Changes include:

  - Pin `@protobuf-ts/*` packages to version 2.9.4 using YAML anchors
  - Pin AWS SDK packages to version 3.750.0
  - Change `undici` from `^7.2.3` to `~7.2.3` (only patch updates)
  - Change `@grpc/grpc-js` from `^1.12.6` to `~1.12.6` (only patch updates)
  - Change `cacheable-lookup` from `^6.1.0` to `~6.1.0` (only patch updates)
  - Change `canonicalize` from `^2.0.0` to `~2.0.0` (only patch updates)
  - Pin `quickjs-emscripten` to exact version 0.31.0

- Updated dependencies [e06efcd]
  - @milaboratories/pl-http@1.0.6

## 2.5.15

### Patch Changes

- d1f4acf: Network lib upgrade
- Updated dependencies [d1f4acf]
  - @milaboratories/pl-http@1.0.5

## 2.5.14

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.6

## 2.5.13

### Patch Changes

- Updated dependencies [23dd55f]
  - @milaboratories/pl-model-middle-layer@1.7.5

## 2.5.12

### Patch Changes

- Updated dependencies [1789f1e]
  - @milaboratories/pl-model-middle-layer@1.7.4

## 2.5.11

### Patch Changes

- Updated dependencies [aee59da]
  - @milaboratories/pl-model-middle-layer@1.7.3

## 2.5.10

### Patch Changes

- a77b40a: add `any` everywhere, ssh: persistent connection; upload: dynamic part chooser
- Updated dependencies [a77b40a]
  - @milaboratories/ts-helpers@1.1.4
  - @milaboratories/ts-helpers-oclif@1.1.13

## 2.5.9

### Patch Changes

- Updated dependencies [8e92e78]
  - @milaboratories/pl-http@1.0.4

## 2.5.8

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.2

## 2.5.7

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.1

## 2.5.6

### Patch Changes

- Updated dependencies [02860e7]
  - @milaboratories/pl-http@1.0.3

## 2.5.5

### Patch Changes

- c4dd069: Fix for getUpdateSuggestions method with changel === "any"

## 2.5.4

### Patch Changes

- Updated dependencies [3da2292]
  - @milaboratories/pl-model-middle-layer@1.7.0

## 2.5.3

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.6.11

## 2.5.2

### Patch Changes

- Updated dependencies [c2161da]
  - @milaboratories/pl-model-middle-layer@1.6.10

## 2.5.1

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.6.9

## 2.5.0

### Minor Changes

- 69b15fe: Multiple for block registry reader

## 2.4.12

### Patch Changes

- 8903a30: Dependency upgrade
- Updated dependencies [8903a30]
  - @milaboratories/pl-model-middle-layer@1.6.8
  - @milaboratories/pl-http@1.0.2

## 2.4.11

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.6.7

## 2.4.10

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.6.6

## 2.4.9

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.6.5

## 2.4.8

### Patch Changes

- dac7e27: Additional retry logic in registry v2 reader
- Updated dependencies [93a363a]
- Updated dependencies [dac7e27]
  - @milaboratories/pl-http@1.0.1
  - @milaboratories/ts-helpers@1.1.3
  - @milaboratories/ts-helpers-oclif@1.1.12

## 2.4.7

### Patch Changes

- ed6b79c: Channel argument added to getSpecificOverview in RegistryReaderV2

## 2.4.6

### Patch Changes

- Updated dependencies [7cf4db8]
  - @milaboratories/pl-model-middle-layer@1.6.4

## 2.4.5

### Patch Changes

- Updated dependencies [5692733]
  - @milaboratories/pl-model-middle-layer@1.6.3

## 2.4.4

### Patch Changes

- Updated dependencies [7be05ec]
  - @milaboratories/pl-model-middle-layer@1.6.2

## 2.4.3

### Patch Changes

- 32c3157: - fix: S3 storage empty folder listing
  - new `refresh-registry` action in `block-tools` with dry-run support

## 2.4.2

### Patch Changes

- Updated dependencies [6240ac0]
  - @milaboratories/pl-model-middle-layer@1.6.1

## 2.4.1

### Patch Changes

- Updated dependencies [3dd3a5c]
  - @milaboratories/ts-helpers@1.1.2
  - @milaboratories/ts-helpers-oclif@1.1.11

## 2.4.0

### Minor Changes

- 3b138a4: Block registry now supports channels

### Patch Changes

- Updated dependencies [3b138a4]
  - @milaboratories/pl-model-middle-layer@1.6.0

## 2.3.30

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.5.13

## 2.3.29

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.5.12

## 2.3.28

### Patch Changes

- Updated dependencies [cd9ca74]
  - @milaboratories/resolve-helper@1.0.2

## 2.3.27

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.5.11

## 2.3.26

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.5.10

## 2.3.25

### Patch Changes

- Updated dependencies [b04a78a]
  - @milaboratories/pl-model-middle-layer@1.5.9

## 2.3.24

### Patch Changes

- Updated dependencies [be7caff]
  - @milaboratories/pl-model-middle-layer@1.5.8

## 2.3.23

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.5.7

## 2.3.22

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.5.6

## 2.3.21

### Patch Changes

- Updated dependencies [75b1646]
  - @milaboratories/ts-helpers@1.1.1
  - @milaboratories/ts-helpers-oclif@1.1.10

## 2.3.20

### Patch Changes

- 50f7459: Dep upgrade, vitest in particular

## 2.3.19

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.5.5

## 2.3.18

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.5.4

## 2.3.17

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.5.3

## 2.3.16

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.5.2

## 2.3.15

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.5.1

## 2.3.14

### Patch Changes

- Updated dependencies [9e6e912]
- Updated dependencies [9e6e912]
  - @milaboratories/ts-helpers@1.1.0
  - @milaboratories/pl-model-middle-layer@1.5.0
  - @milaboratories/ts-helpers-oclif@1.1.9

## 2.3.13

### Patch Changes

- Updated dependencies [4a6e11f]
  - @milaboratories/pl-model-middle-layer@1.4.5

## 2.3.12

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.4.4

## 2.3.11

### Patch Changes

- Updated dependencies [7a04201]
  - @milaboratories/ts-helpers@1.0.30
  - @milaboratories/ts-helpers-oclif@1.1.8

## 2.3.10

### Patch Changes

- Updated dependencies [1e10161]
  - @milaboratories/ts-helpers@1.0.29
  - @milaboratories/ts-helpers-oclif@1.1.7

## 2.3.9

### Patch Changes

- bfd40b4: Additional logging and fixes for block watcher & poll pool

## 2.3.8

### Patch Changes

- 05cd19b: Use oclif-index script to build index file with commands

## 2.3.7

### Patch Changes

- Updated dependencies [094fbf7]
  - @milaboratories/pl-model-middle-layer@1.4.3

## 2.3.6

### Patch Changes

- 86c8d0f: multilayer caching of results in V2 registry reader

## 2.3.5

### Patch Changes

- Updated dependencies [e65f21d]
  - @milaboratories/ts-helpers@1.0.28
  - @milaboratories/ts-helpers-oclif@1.1.6

## 2.3.4

### Patch Changes

- 1654819: fix for absolute path in ui tgz file

## 2.3.3

### Patch Changes

- Updated dependencies [7f86668]
  - @milaboratories/pl-model-middle-layer@1.4.2

## 2.3.2

### Patch Changes

- 314e9ed: fix for relative path resolution in V2 registry reader

## 2.3.1

### Patch Changes

- 2ea865e: final implementation for registry v2 reader and block materializer
- Updated dependencies [2ea865e]
  - @milaboratories/pl-model-middle-layer@1.4.1

## 2.3.0

### Minor Changes

- fa6d0f2: V2 Registry API

### Patch Changes

- Updated dependencies [fa6d0f2]
  - @milaboratories/pl-model-middle-layer@1.4.0
  - @milaboratories/ts-helpers@1.0.27
  - @milaboratories/ts-helpers-oclif@1.1.5

## 2.2.0

### Minor Changes

- 81aa0c7: initial implementation of publish command for V2 block registry

### Patch Changes

- Updated dependencies [81aa0c7]
  - @milaboratories/pl-model-middle-layer@1.3.0

## 2.1.11

### Patch Changes

- fcbc2df: fixes for proper bundling and require/import compatibility
- 41b10cd: another set of fixes for ESM / CJS compatibility
- Updated dependencies [fcbc2df]
- Updated dependencies [41b10cd]
  - @milaboratories/ts-helpers@1.0.26
  - @milaboratories/resolve-helper@1.0.1
  - @milaboratories/ts-helpers-oclif@1.1.4

## 2.1.10

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.2.20

## 2.1.9

### Patch Changes

- da1e029: add isolatedModules true to the root tsonfig
- Updated dependencies [da1e029]
  - @milaboratories/pl-model-middle-layer@1.2.19
  - @milaboratories/ts-helpers@1.0.25
  - @milaboratories/ts-helpers-oclif@1.1.3

## 2.1.8

### Patch Changes

- e019b36: semver moved to dev deps

## 2.1.7

### Patch Changes

- 0f3f25f: fallback "types", "main" and "module" in package.json
- Updated dependencies [0f3f25f]
  - @milaboratories/ts-helpers-oclif@1.1.2
  - @milaboratories/pl-model-middle-layer@1.2.18
  - @milaboratories/ts-helpers@1.0.24

## 2.1.6

### Patch Changes

- 244e3dc: Migration to vite-based build & downgrading lib packages to commonjs package.json type
- Updated dependencies [244e3dc]
  - @milaboratories/ts-helpers-oclif@1.1.1
  - @milaboratories/pl-model-middle-layer@1.2.17
  - @milaboratories/ts-helpers@1.0.23
