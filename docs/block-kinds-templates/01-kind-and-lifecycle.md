# Track 1 — Kind + Lifecycle (Preamble)

**Status: preamble only.** Scope and open questions, not a plan.

Authoritative design: the `docs/text/work/projects/block-kind-and-templates/` mispec
corpus. This document reflects the **PR #198 rework** ("kind publishes with the facade",
branch `feat/kind-publish-with-facade`, not yet on main), which replaced the earlier
read-back/address-verify and `implementations.json` model. Citations use **atom IDs**
(e.g. `A-0011`) because rendered line numbers shift.

## Goal

A block kind can be declared, wired into a block's model, published as part of the
block's publish flow, and resolved from the registry — entirely in the TypeScript layer.

## In scope

- **Kind package shape — a fourth component (tetrad).** `kind/` is a first-class block
  component alongside `model/`/`workflow/`/`ui/`, declaring `BlockParams` + its own
  version; scaffold generates it. The facade declares it directly in
  `package.json`'s `block.components: { kind, model, workflow, ui }`, so the facade↔kind
  link does not route through the model. **Decided: variant B (`Q-0004`).** Note the
  model *still imports* the kind for its **types** (`DataModelBuilder({ kind })` needs
  `BlockParams`) — B decouples the *component/publish* linkage, not the compile-time
  type dependency.
- **Model wiring** — `DataModelBuilder<Data>({ kind })` and
  `BlockModelV3.create({ dataModel, kind })` take the compiled kind object via an
  object-style argument (consistent with the object-style `init`); init lambda typed
  against `BlockParams`; compile-time conformance check (`decisions.md:19-55`). Target
  signatures, not current code — a block must be on `BlockModelV3` + `DataModelBuilder`
  first. These are **breaking SDK signature changes**: `DataModelBuilder` currently has
  an empty constructor and `BlockModelV3.create` takes a single positional `dataModel`.
- **Reference carrier — facade component, with a `model.json` copy.** Under variant B
  the authoritative kind **reference** `{name}@X.Y.Z` lives in the facade's
  `block.components.kind` and flows into the block `manifest.json` (the reconciler reads
  it there, without loading the model). No address is stored — the registry path is
  deterministic from the reference. `model.json` still carries **its own copy** of the
  reference (the version the model was compiled against), used for the version-match
  check and read at runtime for export (`A-0013`). So the copy in `model.json` is no
  longer what *publish* consumes — it is the counterpart the check validates against.
- **Publish flow — kind-first, one version-match check** — the kind publishes as an
  ordered first step of the block's publish flow (kind-first, reading the reference from
  the facade component list); the *kind-before-block* invariant holds **by construction**
  of that ordering (publish kind → if it fails, abort → then facade). The single
  publish-time check is a **version match**: the kind version `model.json` was compiled
  against must equal the kind version the facade declares as a component — mismatch →
  hard abort. **No stored address, no existence check, no address read-back/verify**
  (this replaced the earlier read-back model); under B publish is also **decoupled from
  `model.json`** as the reference source. A publish failure is a plain hard abort
  (`A-0011`, `A-0012`).
- **Source-hash guard** — one `sha256` over the `kind/src/` tree, stored in the
  per-version kind `manifest.json`; publishing the same version from a different source
  → hard abort. Orthogonal to the address (`A-0031`).
- **Registry layout + resolution** — `kinds/{org}/{name}/` holds immutable per-version
  content (`{version}/manifest.json` with sourceHash + first-upload ts, and `kind.d.ts`)
  plus a per-kind **`overview.json` projection**. There is **no `implementations/` tree
  and no kind-side reconciler**: the kind→implementing-blocks map (with channel) is a
  **projection of block-overview reconciliation**, derived by the existing block
  reconciler from block manifests + channel markers. Resolution = **one projection read
  + client-side semver** → newest **stable** by default, or the derived **`any`** when
  apply-time allow-unstable is set → fetch the block from `v2/`. No cross-registry
  intersection (`A-0031`, `A-0050`, `A-0051`).
- **Version selectors** — `@X.Y.Z` (exact), `~X.Y.Z` (patch floor — behavior frozen),
  `^X.Y.Z` (minor floor — behavior floats). The `.x` forms are **replaced**. Redefined
  semver: major = params-break, minor = behavior, patch = added-optional-param (`A-0034`).
- **Channels** — one real marker `stable` (added on release); `--unstable` writes no
  marker, so "unstable" = its absence; `any` = derived newest-regardless (`A-0051`).

### Kind artifact (decided)

- `BlockParams` is a **pure TypeScript type — no zod**; params conformance is a
  compile-time check only. (Runtime validation of untyped YAML params at apply time is a
  separate concern — `Q-0009`, track 3.)
- The kind descriptor is exposed via a **named export — no default export**.
- The descriptor carries the **reference** (`{org}/{name}@version`); the registry
  address is **derived deterministically** from it and never stored (aligns with
  `A-0013`). Source-hash is a separate integrity field in the manifest, not part of the
  address.
- Published per-version registry content is `manifest.json` (sourceHash + first-upload
  ts) + `kind.d.ts`. The concrete kind build mechanism (under rolldown) is open —
  `Q-0005`.

## Testing strategy

The lifecycle assumes a registry that does not yet contain any kind. This once read as
the track's central risk ("how do we test before the first release?"). It is **resolved**:
the whole loop — build → publish → reconcile → resolve — runs locally, headless, with no
CI and no AWS, on a plain temp directory. Grounding: `BlockRegistryV2` writes through a
driver interface (`RegistryStorage`, `tools/block-tools/src/io/storage.ts`); `storageByUrl`
picks `FSStorage` for a `file:` URL and `S3Storage` for `s3:`. The reader
(`RegistryV2Reader` / `folderReaderByUrl`) supports `file:` and `http(s):`. A full local
loop is already proven by `tests/block-repo/src/simple.test.ts`.

### Publish without CI

CI runs each block facade's generated `prepublishOnly` = `block-tools publish -r s3://… …`.
Locally it is the **same command with a `file:` target** — no AWS credentials, `FSStorage`
is selected:

```
block-tools pack                                        # → block-pack/manifest.json
block-tools publish -r file:/tmp/reg --registry-serve-url file:/tmp/reg
```

The new **kind-first** step (publish kind → **version-match check** → then facade) lives
in `cmd/publish.ts` and writes to the same `file:` registry (kind and block share one
registry, by construction of the single `block-tools` run). A small script/Make target
(`publish-etc-local`) runs build → pack → publish for each block in `etc/`, republishing
all kinds + facades to a throwaway registry in one command.

### No cron needed, and no separate kind reconciler

In production the registry is append-only plain files, and a CronJob reconciler sweeps
block manifests + channel markers into the `overview.json` projections. Two things
matter here:

- The cron is only a **scheduler** around a reconciler function that already exists:
  `BlockRegistryV2.updateIfNeeded` / `updateRegistry`, exposed as `block-tools
  refresh-registry` and run inline by `block-tools publish` (`--refresh`, default on).
- The per-kind `overview.json` projection is produced by that **same block reconciler
  pass** — there is **no separate kind-side reconciler** (`A-0050`). The kind→blocks map
  falls out of block-overview reconciliation.

Locally we invoke the reconciler directly — a **testing advantage**: no eventual
consistency, we control exactly when the projection rebuilds, and can assert both the
pre-refresh (no projection) and post-refresh (projection present) states. Production's
refresh-trigger cadence is a separate open question (`Q-0008`).

### The loop, step by step

| # | Step | Exercises | Invasiveness |
|---|------|-----------|--------------|
| 1 | Add a `kind/` package to an existing `etc/` block | package shape, workspace wiring | ~zero (new folder + workspace entry) |
| 2 | Build locally | `model.json` records the kind **reference** `{name}@X.Y.Z`; `BlockParams` types flow into `init` and type-check | **medium** — the breaking `DataModelBuilder({ kind })` / `create({ dataModel, kind })` signature change; only `etc/` fixtures updated, not the 47 bio blocks |
| 3 | `block-tools publish -r file:/tmp/reg` | the new kind-first publish + **version-match check** | low — a step added to `cmd/publish.ts`; storage layer untouched (already driver-based) |
| 4 | Headless tests read the `file:` registry back (vitest, modeled on `simple.test.ts`) | **core of the mechanism**: source-hash guard (same version + different `kind/src/` → hard fail), idempotent republish, resolution (single per-kind `overview.json` projection read + client-side semver → newest `stable`, or `any`), version selectors `@X.Y.Z` / `~X.Y.Z` / `^X.Y.Z` | ~zero (new test files) |
| 5 | Point a local desktop build at the registry via a small static HTTP server + one dev `config.json` line | block still installs and materializes after the kind package + kind-first publish were added | ~zero (config only, no code) |

### Test layers

- **L1 — Lifecycle unit tests on a `file:` registry (primary bed).** Steps 3–4. Where
  lifecycle correctness lives; needs no desktop, no CI, no AWS.
- **L2 — Build-time wiring (compile, no publish).** Step 2. `etc/` blocks gain sibling
  `kind/` packages via the pnpm workspace; `DataModelBuilder({ kind })` type-checks and
  `block-tools build-model` records the kind reference. No registry involved.
- **L3 — Desktop end-to-end.** Step 5. **Lighter for track 1 than it looks** — full kind
  *resolution* (projection read + client-side semver, newest-block selection) is a
  template engine / import concern (track 3). Track 1's L3 mainly proves a single block
  still installs/materializes (it reads the kind reference from `model.json`). Do not
  over-invest here for track 1.
- **L4 — Templates (export/import).** Tracks 2 and 3, later.

### Desktop wiring detail

The desktop assembles its registry list in `platforma-desktop-app/packages/worker/src/registry.ts`
(`buildRegistryEntries(appSettings)`) from `AppSettings`
(`packages/core/src/validation.ts`, persisted as `config.json` — `./config.json` at the
repo root in DEV). Three relevant knobs, all on the always-visible Settings page (no
dev-mode gate):

- `devBlocksPaths` → `local-dev` registries — served straight from `dist/`, **bypasses
  publish** (good for model/UI iteration, does not exercise the lifecycle).
- `additionalRegistriesV2: ["http://localhost:PORT/"]` → `remote-v2` via `HttpFolderReader`
  — the **recommended L3 route**: matches the production http path, passes `z.string().url()`,
  zero code changes.
- `file:///abs/path/` in the same field → `remote-v2` via `FSFolderReader` — valid
  zero-infra fallback (no static server), but not the production http branch.

## Out of scope for this track

- bump-validator, lockfile, yank/deprecation, server-assigned patch numbers, cross-major
  lineage — pushed onto author discipline + AI-harness CI checks.
- The template engine and export/import (tracks 2 and 3).

## Open questions

Carried from the spec (atom IDs), plus track-local ones:

- **`Q-0004` — DECIDED: variant B (tetrad).** kind is a fourth sibling component; the
  facade declares it in `block.components` and publish reads the reference there, not
  through `model.json`. Implication: `kind` must be added to the middle-layer schemas
  `block_components.ts` (`BlockComponents`, `BlockComponentsDescriptionRaw`),
  `block_description.ts`, and `block_manifest.ts` (`BlockPackManifest`).
- **`Q-0005`** — concrete kind build mechanism under rolldown (how `manifest.json` +
  `kind.d.ts` are produced; the shape of the compiled descriptor).
- **`Q-0008`** — production trigger/cadence for the overview-projection refresh (now
  tied to the block reconciler's schedule).
- [TODO: migration path for legacy `BlockModel` (V1) blocks that must move to
  `BlockModelV3` before they can carry a kind.]
- [TODO: backward-compat for the breaking `create()` / `DataModelBuilder` signature —
  overload vs. atomic migration of all V3 blocks.]
