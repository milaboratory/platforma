# Track 1 — Kind + Lifecycle: Implementation Path

**Status: implementation-path draft.** *Where* in the codebase to hook in, with pseudocode — not final code, and not the design. Companion to [`01-kind-and-lifecycle.md`](./01-kind-and-lifecycle.md) (the preamble; scope + open questions).

**Authoritative design:** the `docs/text/work/projects/block-kind-and-templates/` mispec corpus — the **PR #198 rework** ("kind publishes with the facade", branch `feat/kind-publish-with-facade`, not yet on main). Produced by an adversarial multi-agent path-finding pass (2 architects + a judge per concern). Every entry point is cited as `path:line` — treat line numbers as anchors, they shift.

> **Naming convention (reconciled in this doc):** `parseKindRef`/`formatKindRef` are the `{name}@{version}` **reference** codec — one home, `block_kind_ref.ts` (§3), imported by §4. `npmNameToKindPath` is the separate **npm-name → `{org,name}` path** helper — one home, `schema_kinds.ts` (§5), imported by §6. Two distinct functions; never one name for both.

## Scope

This document maps the **correct codebase entry points** for iteration-1 of the block-kind spec — the KIND subsystem end to end: **define** (`@platforma-sdk/block-kind` + `defineBlockKind`) → **build/bake reference** (kind build/pack target; bake the reference into `model.json` and the block manifest) → **publish + version-match** (kind-first publish flow with the pre-publish version gate) → **registry projection** (`kinds/` S3 tree + `overview.json` via the block reconciler) → **resolution** (middle-layer kind → concrete block resolution). The template engine (apply/export, `templateEntry`, the fixed native YAML lambda, and the add-block API) is a deliberate **follow-up document** and is not designed here. This is a **path-finding doc** — grounded entry points (`path:line`) plus pseudocode showing the shape to build — not a line-by-line implementation, and it does **not** decide final code. Every concern section carries its own "Risks & open" list; the cross-cutting and open-questions sections at the end collect what the whole path depends on. Grounded against the spec at `docs/text/work/projects/block-kind-and-templates/decisions.md` and `.../implementation.md`.

## Dependency-Ordered Overview

The six concerns form a mostly linear pipeline; each depends on the artifact the previous one produces.

```
1. sdk-kind          @platforma-sdk/block-kind + defineBlockKind
                     → produces the compiled kind object (org/name/version + phantom BlockParams type)
                          │
2. kind-build        ts-builder "block-kind" target + block-tools build-kind-manifest
                     → bundles the kind, bakes org/name/version, computes src/ sourceHash, writes manifest.json
                          │  (reads the compiled kind export shape from #1)
                          │
3. model-wiring      DataModelBuilder(kind) + BlockModelV3.create({dataModel, kind})
                     → bakes the {name}@X.Y.Z reference into model.json (container level) and the block manifest
                          │  (consumes the kind object from #1; shares the reference type/codecs)
                          │
4. publish-flow      publishBlock() orchestrator: version-match gate → publishKind (kind-first) → publishPackage
                     → hard-fails on a model↔facade kind-version mismatch before any S3 write
                          │  (reads the model's baked kindRef from #3's manifest field; calls publishKind from #5)
                          │  (source hash + manifest shape from #2)
                          │
5. registry-projection  publishKind (kinds/ tree, source-hash guard) + reconciler overview.json projection
                     → derives per-kind overview.json (resolvable versions × implementing blocks by channel)
                          │  (projection derived from the block manifest kind field from #3; ticket rides the block ticket)
                          │
6. resolution        pl-middle-layer resolveKind facade → block-tools kind_resolver (pure semver core)
                     → reads one overview.json (from #5), resolves selector → newest kind version → newest impl block
                        → emits a from-registry-v2 spec the existing add-block path consumes
```

Key cross-links:
- **#1 → #2, #3**: the compiled kind object's runtime shape (`organization`/`name`/`version`) is the contract both the build target and the model wiring read. This shape is gated by **Q-0005** and is the single largest open dependency across the path.
- **#3 → #4, #5**: the reference type and its `{name}@X.Y.Z` string form live in one shared module (`block_kind_ref.ts`); the publish gate and the reconciler both read the baked reference (from `model.json`/manifest), never re-derive it.
- **#5 → #6**: the `kinds/{org}/{name}/overview.json` schema is **co-designed** — the reconciler (#5) is the sole writer, the resolver (#6) the sole reader; they must stay in lockstep.
- **#2, #4, #5** all share the **source-hash convention** (one sha256 over the sorted `src/` tree) and the **manifest-written-last commit-marker** pattern; the case convention (`.toUpperCase()`) is a live correctness seam across them.

---

## 1. Define — `@platforma-sdk/block-kind` + `defineBlockKind`

**Entry points** — grounded path:line, what to add/modify at each.

- `core/platforma/sdk/block-kind/package.json` **(NEW)** — mirror `sdk/test/package.json:1-46` (verified: `name`, `files:["dist/**/*"]`, `main`/`module`/`types` + single-arm `exports` map `types|require|import → dist/index.{d.ts,cjs,js}`, full ts-builder script block `build/watch/check/formatter:check/linter:check/types:check/do-pack/fmt`). Runtime `dependencies`: **exactly one** — `@milaboratories/pl-model-common: workspace:*`. `devDependencies`: `@milaboratories/build-configs`, `@milaboratories/ts-builder`, `@milaboratories/ts-configs` (workspace:*), `typescript`, `@types/node`, plus `vitest` + `@vitest/coverage-istanbul` (catalog:) for the type-level test. **Explicitly omit** `@platforma-sdk/model`, `@milaboratories/pl-middle-layer`, `pl-client`, `pl-tree`, `computable` — every heavy dep `sdk/test` carries.
- `core/platforma/sdk/block-kind/tsconfig.json` **(NEW)** — copy `sdk/test/tsconfig.json` verbatim (verified: extends `@milaboratories/ts-configs/tsconfig.node.json`, `outDir ./dist`, `rootDir ./src`, `include:["src"]`).
- `core/platforma/sdk/block-kind/src/descriptor.ts` **(NEW)** — the compiled type surface: `unique symbol` phantom brand, `CompiledBlockKind<BlockParams>` discriminated-union envelope (`kindSchema:"v1"` + runtime `organization`/`name`/`version` + contravariant phantom slot), `InferBlockParams<K>` extractor.
- `core/platforma/sdk/block-kind/src/index.ts` **(NEW)** — public surface: `defineBlockKind`, the `CompiledBlockKind`/`InferBlockParams` types, and `export type { PlRef } from "@milaboratories/pl-model-common"`. (PlRef grounded at `lib/model/common/src/ref.ts:5,26`, surfaced from that package's `index.ts:15` — verified.)
- `core/platforma/sdk/block-kind/src/index.test.ts` **(NEW)** — type-level test locking `InferBlockParams`.
- `core/platforma/pnpm-workspace.yaml:62` — add `- sdk/block-kind` immediately after `- sdk/eslint-config` (verified: sdk block is lines 58-62). The **only** edit to a pre-existing file.

**Chosen path** — **Hybrid, leaning Proposal 2 on the type surface, Proposal 1 on file economy.**

Both proposals are structurally identical (new `sdk/block-kind` sibling, trimmed-to-one-dep `sdk/test` skeleton, type-only PlRef re-export, phantom-generic descriptor, explicit `meta` args deferring Q-0005, one workspace-list line). I adopt:

- **Proposal 2's contravariant phantom brand** (`readonly [BLOCK_PARAMS]?: (p: BlockParams) => void`) over Proposal 1's covariant `[BLOCK_PARAMS]?: BlockParams`. The function-parameter slot makes `BlockParams` contravariant under `strictFunctionTypes`, so a kind typed for `{ ref: PlRef; k: number }` is **not** silently assignable to one typed for `{ ref: PlRef }`. Zero runtime cost, strictly more type-safe. `InferBlockParams<K>` still recovers the declared params (single inference candidate).
- **Proposal 2's discriminated-union envelope** (`kindSchema:"v1"`). The tag is one string field at near-zero cost and is the exact hook the deferred template-engine / sandbox phases use: they add a `CompiledBlockKindV2` union arm and consumers narrow on `kindSchema`, so v1 kinds keep compiling untouched. This reuses the schema-versioning pattern the code map flags for the workflow envelope.
- **Proposal 1's file economy** over Proposal 2's four-file split. `refs.ts` holding a single `export type` line is pointless indirection. Land it as `descriptor.ts` (type surface + version union) + `index.ts` (`defineBlockKind` + re-exports). Two files, not four.
- **Explicit `meta` argument** (both proposals) — `defineBlockKind` takes `{ organization, name, version }`. This makes the package build, test, and ship **today**, fully independent of Q-0005 (baking metadata from package.json). A later ts-builder target can synthesize the argument without changing the public type contract.

**Decisive rejection of the "inline PlRef" fork** that Proposal 1 floats as its main open con: do **not** inline the ~20-line PlRef type for a zero-dep package. That would fork the reference type and violate the spec's explicit "introduces no reference type of its own / reuse the existing PlRef." Keep `@milaboratories/pl-model-common` as the single runtime dependency, consumed **type-only** — see Risks for why "one dependency" holds despite its transitive tree.

**Pseudocode**

`src/descriptor.ts` (NEW):
```ts
// Phantom brand — declared, never assigned at runtime.
declare const BLOCK_PARAMS: unique symbol;

// Discriminated-union envelope. Future phases add a `"v2"` arm; consumers
// narrow on `kindSchema`, so v1 descriptors never break.
export interface CompiledBlockKindV1<BlockParams> {
  readonly kindSchema: "v1";
  readonly organization: string;
  readonly name: string;
  readonly version: string;
  // Contravariant phantom: carries BlockParams as a TYPE only, no runtime bytes,
  // and blocks structural widening between kinds of different param shapes.
  readonly [BLOCK_PARAMS]?: (p: BlockParams) => void;
}

export type CompiledBlockKind<BlockParams> = CompiledBlockKindV1<BlockParams>;

// The contract the deferred DataModelBuilder.init / BlockModelV3.create
// consumers use to pull BlockParams off a kind object.
export type InferBlockParams<K> =
  K extends CompiledBlockKind<infer P> ? P : never;
```

`src/index.ts` (NEW):
```ts
import type { CompiledBlockKind } from "./descriptor";
export type { CompiledBlockKind, InferBlockParams } from "./descriptor";

// Reuse the canonical reference type from its lightest owner — no new ref type.
export type { PlRef } from "@milaboratories/pl-model-common";

export function defineBlockKind<BlockParams>(meta: {
  organization: string;
  name: string;
  version: string;
}): CompiledBlockKind<BlockParams> {
  // Frozen, serializable v1 descriptor. Phantom slot is never assigned.
  return Object.freeze({
    kindSchema: "v1" as const,
    organization: meta.organization,
    name: meta.name,
    version: meta.version,
  });
}
```

`src/index.test.ts` (NEW):
```ts
import { expectTypeOf } from "vitest";
import { defineBlockKind, type InferBlockParams, type PlRef } from "./index";

const k = defineBlockKind<{ ref: PlRef; n: number }>({
  organization: "milab", name: "demo", version: "1.0.0",
});
// Locks the contract the future init/create wiring relies on.
expectTypeOf<InferBlockParams<typeof k>>().toEqualTypeOf<{ ref: PlRef; n: number }>();
```

`package.json` (NEW, runtime-dep shape — the load-bearing part):
```jsonc
{
  "name": "@platforma-sdk/block-kind",
  "dependencies": { "@milaboratories/pl-model-common": "workspace:*" }, // exactly one
  // heavy sdk/test deps deliberately absent: @platforma-sdk/model, pl-middle-layer, ...
}
```

`pnpm-workspace.yaml` (edit at line 62):
```yaml
- sdk/eslint-config
- sdk/block-kind      # ADD
```

**Why this over the alternatives**

- **vs. inlining PlRef for a true zero-dep package** (Proposal 1's floated alternative): rejected — forks the reference type and directly violates the spec's "reuse the existing PlRef, introduce no reference type of its own." The single-source-of-truth requirement outranks a literal-zero-dependency reading.
- **vs. Proposal 1's covariant phantom** (`?: BlockParams`): rejected — allows silent widening between kinds. The contravariant function-slot form is strictly safer at zero cost.
- **vs. Proposal 2's four-file split**: rejected — a one-line `refs.ts` is dead indirection for a package this small. Two files carry the same forward-compat structure (version union lives in `descriptor.ts`).
- **vs. adding `defineBlockKind` to `@platforma-sdk/model`**: rejected on blast radius and the hard constraint — it would pull the full SDK into every kind author. Grounded: `defineBlockKind`/`block-kind` exist nowhere (grep empty), so this is pure addition with zero regression surface in model/middle-layer. The only pre-existing-file change is one workspace line — fully reversible.

Blast radius: 4 new files + 1 workspace line. Nothing existing changes behavior.

**Risks & open**

- **"One dependency" — literal vs. transitive.** `@milaboratories/pl-model-common` brings a moderate transitive tree (verified: `helpers`, `pl-error-like`, `canonicalize`, `es-toolkit`, `zod`) but **crucially not** `@platforma-sdk/model` or `pl-middle-layer`. Because PlRef is consumed via `export type`, ts-builder erases it — the emitted `dist/index.js`/`.cjs` import **nothing** external, so the runtime footprint is just the `defineBlockKind` factory. The dependency must stay a real `dependencies` entry (not `devDependencies`) because PlRef appears in block-kind's public `.d.ts`, so downstream consumers need it for type resolution. "Never pulls in the full SDK" holds structurally; "one dependency" holds as one direct runtime dep with zero emitted runtime imports.
- **Type-only contract is convention, not enforced.** A careless future edit could `import { PlRef }` (value) and silently pull `zod`/`es-toolkit` into runtime. Mitigation: rely on `verbatimModuleSyntax` (from the shared `ts-configs`) + an `@typescript-eslint/consistent-type-imports` lint rule. **Open:** confirm the shared `ts-configs.node.json` / eslint-config already enforces type-only imports before treating this as guaranteed rather than conventional.
- **Kind-reference string format is unverified.** Whether the recorded reference is `{name}@X.Y.Z` or `{organization}/{name}@X.Y.Z` is not settled against the model.json / manifest schema. Deliberately kept `organization`/`name`/`version` as three separate source-of-truth fields; the formatter belongs to the `BlockModelV3.create` / manifest wiring concern, not here. Do not guess it in this package.
- **Q-0005 (kind build mechanism) stays open.** How org/name/version get baked (from package.json?) and the exact ts-builder target that emits a hand-readable `.d.ts` are deferred. The explicit-`meta` baseline ships on stock `ts-builder build --target node` (verified as the sdk-wide toolchain) with no new tooling; auto-baking is a later, additive ts-builder target that leaves the public type contract unchanged.
- **Phantom is compile-time only.** No runtime guarantee that declared `BlockParams` matches actual usage — the `index.test.ts` type-level assertion is the guard that locks `InferBlockParams` inference against regression.

---

## 2. Build/Bake — Kind Build/Pack Target

Verdict: **hybrid**. Take Proposal 1's minimal ts-builder half and its verified `hashDirSync` reuse; graft on Proposal 2's one real improvement — a commander-free core (`buildKindDist`) so the deferred publish-time guard reuses the exact hash + manifest shape. Reject Proposal 2's `hashDirSync` port and its `entries[]` parameterization (both refuted below).

**Entry points** — grounded path:line, what to modify or add.

- `core/platforma/tools/ts-builder/src/commands/utils/config-manager.ts:4` — add `"block-kind"` to the `TargetType` union (currently ends at line 11).
- `config-manager.ts:39` — add a `block-kind` row to `TARGET_CONFIG_MAP` immediately after the `block-facade` row (36-39): `{ filename: "rolldown.block-kind.config.js", outputPath: "./build.block-kind.config.js" }`. (Naming convention confirmed: `rolldown.<target>.config.js` prefix + flat filename.)
- `config-manager.ts:51` — add `"block-kind": "tsconfig.block-kind.json"` to `TSCONFIG_MAP`.
- `config-manager.ts:182` — add `"block-kind": "node"` to `TARGET_TO_OXLINT_MAP` (reuse the `node` preset exactly as `block-facade` does at line 182). `OXLINT_CONFIG_MAP` needs **no** change — `node` already exists.
- `core/platforma/tools/ts-builder/src/configs/utils/createRolldownBlockKindConfig.ts` — NEW. Copy of `createRolldownBlockFacadeConfig.ts` (which is already factored with an internal `entry()` helper + `props.output`) but returning a **single** entry `entry("kind", "src/index.ts")`. Keep `external: () => false` and `dts({ tsconfig: "tsconfig.json", emitDtsOnly: false, sourcemap: true })`. Emits `kind.js` + self-contained `kind.d.ts`.
- `core/platforma/tools/ts-builder/src/configs/rolldown/block-kind.config.ts` — NEW. `export default defineConfig(createRolldownBlockKindConfig())` (sibling of `block-facade.config.ts`).
- `core/platforma/tools/ts-builder/src/configs/tsconfig.block-kind.json` — NEW. Mirror `tsconfig.block-facade.json`.
- `core/platforma/tools/ts-builder/src/commands/build.ts:36` — NO change. `block-kind` is not a vite target, so it falls through to `buildWithRolldown` automatically. Verify only.
- `core/platforma/tools/block-tools/src/v2/build_kind_dist.ts` — NEW. Commander-free `buildKindDist(opts)` core: dynamic-`import()` the compiled kind export, read `org/name/version`, compute one sha256 over `src/` via the **reused** `util.hashDirSync`, assemble the manifest, write `manifest.json` **last** (build_dist.ts:82-90 commit-marker pattern). Beside `build_dist.ts`.
- `core/platforma/tools/block-tools/src/cmd/build-kind-manifest.ts` — NEW. Thin commander wrapper (build-model.ts shape) delegating to `buildKindDist`.
- `core/platforma/tools/block-tools/src/cli.ts:27` — import and `program.addCommand(buildKindManifestCommand())` alongside `buildModelCommand`/`packCommand`.
- `core/platforma/tools/block-tools/src/structure/rules/block-package-json.ts:79` — **GATED on Q-0004** (is kind a discovered block component?). When it lands, assert `build: "ts-builder build --target block-kind && block-tools build-kind-manifest"`, `check: "ts-builder type-check --target block-kind"`, plus a `blockComponents` mapping. Do not touch until then — keep this concern build-only.

**Chosen path** — prose.

The ts-builder half is Proposal 1 verbatim: a near-copy of the `block-facade` rows across the single closed registry (`config-manager.ts`), a single-entry `createRolldownBlockKindConfig.ts`, its thin config file, and a tsconfig template. No dispatch change. The facade's two-pass `index`/`AGENTS` split exists only because it has two entries; the kind has one, so the split is dropped and the code is strictly simpler.

The block-tools half reuses `hashDirSync` from `@platforma-sdk/package-builder-lib` (confirmed already a `workspace:*` dependency at block-tools/package.json:46; exported as `util.hashDirSync` via index.ts:4) — **no port, no new dependency, no drift risk**. But the manifest logic is structured as Proposal 2 argued: a commander-free `buildKindDist()` core plus a thin `build-kind-manifest` command wrapper, because the deferred publish-time source-hash guard (a separate concern) must recompute and compare this exact hash and read this exact manifest shape. Embedding it in the command action (build-model.ts style) would force that concern to duplicate the logic; a commander-free core (build_dist.ts style) lets it `import` directly.

Metadata is baked by reading `org/name/version` off the **compiled kind export** (build-model.ts:31-36 single-source-of-truth pattern), not from package.json — with a deliberate deviation: the kind bundle is ESM (`format: "es"`), so use `await import()`, not `require()`. The src-tree hash is written **upper-case** (`hashDirSync(src).digest("hex").toUpperCase()`) to match block-tools' `calculateSha256` convention (util.ts:33) so the future publish-side comparator never fails on a case mismatch.

**Pseudocode.**

```ts
// config-manager.ts
type TargetType = ... | "block-facade" | "block-kind" | ...;
TARGET_CONFIG_MAP["block-kind"]   = { filename: "rolldown.block-kind.config.js",
                                      outputPath: "./build.block-kind.config.js" };
TSCONFIG_MAP["block-kind"]        = "tsconfig.block-kind.json";
TARGET_TO_OXLINT_MAP["block-kind"] = "node";   // same preset block-facade uses
```

```ts
// createRolldownBlockKindConfig.ts  (facade clone, single entry)
export function createRolldownBlockKindConfig(props?): RolldownOptions[] {
  const output = props?.output ?? "dist";
  return [{
    input: { kind: "src/index.ts" },
    external: () => false,                                   // force-inline -> self-contained kind.d.ts
    plugins: [dts({ tsconfig: "tsconfig.json", emitDtsOnly: false, sourcemap: true })],
    output: { dir: output, format: "es", entryFileNames: "[name].js", sourcemap: true },
    transform: { target: "ES2022" },
  }];                                                        // emits kind.js + kind.d.ts
}
```

```ts
// block-tools/src/configs/rolldown/block-kind.config.ts
export default defineConfig(createRolldownBlockKindConfig());
```

```ts
// block-tools/src/v2/build_kind_dist.ts  (commander-free core)
import { util } from "@platforma-sdk/package-builder-lib";   // hashDirSync already available
export async function buildKindDist({ modulePath = ".", srcDir = "src", dst = "dist" }) {
  const mod = await import(resolveCompiledEntry(modulePath));  // ESM => import(), not require()
  const kind = mod.kind ?? mod.default;
  if (!kind?.org || !kind?.name || !kind?.version)            // shape is Q-0005-dependent (see risks)
    throw new Error('kind export missing org/name/version');
  const sourceHash = util.hashDirSync(srcDir).digest("hex").toUpperCase();  // match calculateSha256 case
  const manifest = { schema, kind: { org: kind.org, name: kind.name, version: kind.version },
                     sourceHash, timestamp: Date.now() };
  // ... (optionally per-artifact sha256 of kind.js/kind.d.ts via calculateSha256) ...
  await writeFile(join(dst, "manifest.json"), JSON.stringify(manifest));    // LAST = commit marker
}
```

```ts
// block-tools/src/cmd/build-kind-manifest.ts  (thin wrapper)
export function buildKindManifestCommand() {
  return new Command("build-kind-manifest")
    .option("-i, --modulePath <path>", "kind package dir", ".")
    .action((flags) => buildKindDist({ modulePath: flags.modulePath }));
}
// cli.ts: program.addCommand(buildKindManifestCommand());
```

**Why this over the alternatives.**

- **Reject Proposal 2's `hashDirSync` port.** Its stated rationale — "block-tools is a low-level published tool; depending on package-builder-lib inverts layering" — is refuted by block-tools/package.json:46: the dependency **already exists**. There is no layering to invert. Porting therefore only creates a second copy of a 30-line security-relevant algorithm that must be kept bit-identical to the canonical one (the publish-time guard compares against it), guarded by a "shared test vector + doc comment" maintenance obligation that reuse eliminates outright. Proposal 1's reuse is strictly lower blast radius and zero drift risk.
- **Reject Proposal 2's `entries[]` parameterization.** Its claim that parameterizing avoids "re-opening the target registry" for deferred phases is false: the registry maps target -> config filename; adding entrypoints later means editing `createRolldownBlockKindConfig.ts`'s returned array, never the registry, regardless of whether an `entries` param exists. Nothing calls the factory with a custom entry set today, so the param is pure YAGNI. The facade itself hardcodes its entries — following that established pattern (hardcode, extend by editing the factory) is the lower-surface choice.
- **Adopt Proposal 2's commander-free core.** This is its one substantive win. `buildBlockPackDist` (build_dist.ts) already establishes the commander-free-core precedent in this very package, and the deferred publish-time guard genuinely needs to reuse the hash computation and manifest shape without CLI coupling. Splitting `buildKindDist` (core) from `build-kind-manifest` (wrapper) costs one extra file and pays off directly at the next phase.
- **Both proposals' shared choices are correct and kept:** single closed-registry edit (reviewable in one diff), no `build.ts` dispatch branch (non-vite -> rolldown fallback confirmed), `external:()=>false` + `dts({emitDtsOnly:false})` for the self-contained `kind.d.ts`, manifest-written-last commit marker, structurer gated behind Q-0004.

**Risks & open.**

- **Q-0005 (kind build mechanism / metadata injection) — the field layout of the compiled kind export does not exist yet.** `grep` for `defineBlockKind` / `kind/` returns nothing in tools or sdk. The `kind.org/name/version` read in `buildKindDist` is written against an assumed shape (modelled on `model.config`). Direction is settled (rolldown + rolldown-plugin-dts, bake org/name/version, emit readable `kind.d.ts`); the exact export shape is a hard prerequisite this concern consumes but does not define. Treat the metadata-read block as a decision point pinned to whenever `defineBlockKind` lands. **Note the shape mismatch to reconcile:** concern #1's descriptor uses `organization`/`name`/`version`; this concern's pseudocode reads `org`/`name`/`version`. The field name must be unified when Q-0005 is settled.
- **Case convention is a live correctness seam.** `hashDirSync(...).digest("hex")` is lowercase; block-tools' `calculateSha256` is upper-case (util.ts:33). If the publish-time comparator (separate concern) hashes with one convention and compares against the other, the guard reports "different" on every run. Mitigation baked in: `.toUpperCase()` at the manifest-write site, documented there.
- **Compiled-config filename mapping unverified end-to-end.** `TARGET_CONFIG_MAP` expects the flat `rolldown.block-kind.config.js`, but the source lives at `configs/rolldown/block-kind.config.ts`. The facade's identical convention works, so this is low-risk, but verify the ts-builder self-build emits the flat name before relying on it (`getConfigPath(filename)` resolution).
- **ESM `require()` -> `import()` deviation.** `build-model` uses `require(modulePath)` on a package dir (resolves via package.json main). The kind bundle is ESM; `require()` on a pure-ESM main fails. `buildKindDist` must dynamic-`import()` the compiled entry and handle the async path + its own error handling — not a verbatim `build-model` copy.
- **Scope boundary (honored):** this concern produces the bundle, `kind.d.ts`, and `manifest.json` with its computed hash. The publish-time source-hash comparison (absent->store / equal->no-op / differ->hard-fail) and the S3 upload are the publication-lifecycle concern; the commander-free `buildKindDist` is shaped so that concern imports the hash + manifest shape without duplicating logic.

---

## 3. Bake Reference — Model→Kind Wiring, `model.json` + Block Manifest

**Entry points** — grounded path:line, what to modify or add.

- `core/platforma/lib/model/common/src/bmodel/block_kind_ref.ts` **(NEW)** — single shared home for the reference type + codecs: `BlockKindReference` (branded string, the on-wire form), `formatKindRef(kind) → "{name}@{version}"`, `parseKindRef(ref) → { name, version }`, and a `z.string()` schema. Export from the bmodel index. Every reader (model.json runtime path, manifest reconciler, future template engine) imports from here — the one place that decides whether the name segment is org-qualified.
- `core/platforma/sdk/model/src/block_model.ts` (new local type) — `BlockKind<Params> = { reference: BlockKindReference; readonly __params?: Params }`. Minimal interface the SDK consumes so nothing here depends on the unbuilt `@platforma-sdk/block-kind` package (Q-0005).
- `core/platforma/sdk/model/src/block_migrations.ts:5` — `DataCreateFn<T> = () => T` → `DataCreateFn<T, Params = never> = (args: { params?: Params }) => T`. Object-arg so future fields (services, resolved refs) extend without a signature break.
- `core/platforma/sdk/model/src/block_migrations.ts:181` (`MigrationChainBase.init`) — parameter becomes `DataCreateFn<Current, Params>`; thread a third `Params` generic through `MigrationChainBase` and its two subclasses + `DataModelInitialChain` (the same mechanism that already carries `Current`/`Transfers`).
- `core/platforma/sdk/model/src/block_migrations.ts:498` (`DataModelBuilder`) — add `<Params>` generic + `constructor(kind: BlockKind<Params>)`. Store `kind.reference` on the builder; `from<T>()` seeds `Params` into the chain. Update the two JSDoc examples.
- `core/platforma/sdk/model/src/block_migrations.ts` (`DataModel`, ~:530) — add a `Params` type generic AND a private `kindRef?: BlockKindReference` set via `FROM_BUILDER`, with an `@internal` getter. The type generic lets `create()` constrain its `kind` at compile time; the runtime field powers the value cross-check.
- `core/platforma/sdk/model/src/block_model.ts:106` (`BlockModelV3Config`) — add `kind: BlockKindReference`.
- `core/platforma/sdk/model/src/block_model.ts:170` (`BlockModelV3.create`) — positional → `create({ dataModel, kind })`; set `config.kind = kind.reference`; assert `kind.reference === dataModel.kindRef`. Constrain the type: `kind: BlockKind<Params>` where `Params` comes from `DataModel<Data, Params, Transfers>`.
- `core/platforma/sdk/model/src/block_model.ts:607` (`done()`, non-UI branch) — set `kind: this.config.kind` at the **container** level of `blockConfig`, alongside `code` (NOT inside `v4`). Rides into model.json via the existing `JSON.stringify(config)` in build-model.ts — no write-path change.
- `core/platforma/lib/model/common/src/bmodel/container.ts:6` (`BlockConfigContainer`) — add `readonly kind?: BlockKindReference;` next to `code`.
- `core/platforma/tools/block-tools/src/v2/build_dist.ts:44` — add `modelKindReference(descriptionRelative, dst)`, a near-copy of `workflowRequiredCapabilities` (:22): read the model component's `model.json`, pull `container.kind`, fail-safe `undefined`. Set it on the description before `BlockPackManifest.parse` (:82).
- `core/platforma/lib/model/middle-layer/src/block_meta/block_description.ts:15,36` — add `kind?: BlockKindReference` to the `BlockPackDescription` type and a `kind: z.string().optional()` to `CreateBlockPackDescriptionSchema`, mirroring `featureFlags` (:45).
- `core/platforma/tools/block-tools/src/cmd/build-model.ts` — **no code change**; verify `kind` lands at container level in `dist/model.json`.
- `blocks/clonotype-browser/model/src/dataModel.ts:38` and `.../index.ts:52` — migrate call sites to `new DataModelBuilder(kind)` + params-carrying init, and `BlockModelV3.create({ dataModel, kind })`.

**Chosen path** — Hybrid, anchored on Proposal 2, with three corrections pulled from Proposal 1 / the code.

Proposal 2 wins the two architecture decisions that matter for a spec with deferred phases, and both are grounded in the code, not preference:

1. **Container-level bake, not `v4`.** `BlockConfigContainer` already carries version-independent payload at the container level — `code` (container.ts:12) lives beside `v4`/`v3`, orthogonal to the render envelope. Kind identity is the exact analogue of `code`: needed regardless of which config version renders, and a future `v5` inherits it for free. Placing it in `v4` (Proposal 1) forces `build_dist.ts` to reach into `config.v4.kind` — coupling to the render-envelope layout that Proposal 1 itself lists as a con. Container-level placement *removes* that coupling; the reader does `config.kind`.

2. **One shared reference type + codecs, not an inline string in two files.** Both readers (runtime templateEntry, manifest reconciler) and the deferred template engine must agree on the reference shape. A shared `block_kind_ref.ts` is the single source of truth; `.passthrough()` on the description schemas is a tolerance, not a home.

Three corrections to Proposal 2:

- **Keep the wire form a string, faithful to the spec's `{name}@{version}`** (Proposal 1's shape), rather than storing structured `{name, version}` at rest. Readers overwhelmingly need identity equality (does block X implement kind Y?), for which an opaque canonical string is ideal and avoids premature version-aware logic. `formatKindRef`/`parseKindRef` in the shared module give parts to any reader that needs them, and localize the one open decision (is the name segment org-qualified?) to a single function.
- **Make the divergence guard both compile-time and runtime.** Thread `Params` onto `DataModel` as a real type generic so `create({ dataModel, kind })` can constrain `kind: BlockKind<Params>` — a type mismatch between the builder's kind and create's kind fails at compile time. The runtime `kindRef` cross-check (Proposal 2) then catches value-level mismatch of two kind objects with the same param type. The builder is handed the object anyway (spec target `new DataModelBuilder(kind)`), so capturing its reference is nearly free.
- **`Params = never`** (Proposal 2) over `unknown` (Proposal 1): stricter, and `{ params?: never }` correctly says "this block reads no params yet."

**Pseudocode**

```ts
// NEW: lib/model/common/src/bmodel/block_kind_ref.ts
export type BlockKindReference = string & { readonly __kindRef: unique symbol };
export const BlockKindReferenceSchema = z.string();
// single place that decides org-qualification of the name segment (see Q-0005)
export const formatKindRef = (k: { name: string; version: string }) =>
  `${k.name}@${k.version}` as BlockKindReference;
export const parseKindRef = (r: BlockKindReference) => {
  const at = r.lastIndexOf("@");
  return { name: r.slice(0, at), version: r.slice(at + 1) };
};
```

```ts
// sdk/model/src/block_migrations.ts
export type DataCreateFn<T, Params = never> = (args: { params?: Params }) => T;

class DataModelBuilder<Params = never> {
  readonly #kindRef: BlockKindReference;
  constructor(kind: BlockKind<Params>) { this.#kindRef = kind.reference; }
  from<T>(v: string): DataModelInitialChain<T, {}, Params> {
    return chain.seed({ kindRef: this.#kindRef /* value */ }); // Params flows via the type
  }
}

// MigrationChainBase<Current, Transfers, Params>
init(initialData: DataCreateFn<Current, Params>): DataModel<Current, Params, Transfers> {
  return DataModel[FROM_BUILDER](initialData, this.transfers, this.kindRef);
}
```

```ts
// sdk/model/src/block_model.ts
type BlockKind<Params> = { reference: BlockKindReference; readonly __params?: Params };

interface BlockModelV3Config</*...*/> { /* ... */ kind: BlockKindReference; }

static create<Data extends Record<string, unknown>, Params = never, Transfers = {}>(
  args: { dataModel: DataModel<Data, Params, Transfers>; kind: BlockKind<Params> },
): BlockModelV3</*...*/> {
  const { dataModel, kind } = args;
  // runtime guard: builder-kind vs create-kind value identity
  if (dataModel.kindRef && dataModel.kindRef !== kind.reference)
    throw new Error(`kind mismatch: model ${dataModel.kindRef} vs ${kind.reference}`);
  return new BlockModelV3({ /* ...defaults */, dataModel, kind: kind.reference });
}

// done(), non-UI branch — container level, beside `code`
const blockConfig: BlockConfigContainer = {
  v4: { configVersion: 4, /* unchanged */ },
  kind: this.config.kind,        // <-- baked into model.json via JSON.stringify(config)
  sdkVersion: PlatformaSDKVersion, renderingMode: /*...*/, sections: /*...*/, outputs: /*...*/,
};
```

```ts
// tools/block-tools/src/v2/build_dist.ts  (near-copy of workflowRequiredCapabilities)
async function modelKindReference(desc, dst): Promise<BlockKindReference | undefined> {
  const model = desc.components.model;              // relative path into dst (block_components.ts:72)
  try {
    const cfg = JSON.parse(await fsp.readFile(path.resolve(dst, model.path), "utf-8"));
    return cfg.config?.kind ?? undefined;           // container-level, fail-safe
  } catch { return undefined; }
}
// inside buildBlockPackDist, before BlockPackManifest.parse:
const kindRef = await modelKindReference(descriptionRelative, dst);
if (kindRef) descriptionRelative.kind = kindRef;    // top-level, like featureFlags
```

```ts
// block_description.ts — mirror featureFlags
export type BlockPackDescription<C, M> = { id; components: C; meta: M; featureFlags?; kind?: BlockKindReference };
// schema:  kind: BlockKindReferenceSchema.optional(),
```

```ts
// blocks/clonotype-browser/model — migrated call sites
export const blockDataModel = new DataModelBuilder(kind)
  .from<StoredV1>("v1")
  .init(({ params }) => params ?? { /* defaults */ });
export const platforma = BlockModelV3.create({ dataModel: blockDataModel, kind }).args(/*...*/).done();
```

**Why this over the alternatives**

- **Rejected Proposal 1's `v4`-level bake.** It couples `build_dist.ts` to the render-envelope layout (a con Proposal 1 states), and it conflates block identity with render versioning. `code` at container level (container.ts:12) is the grounded precedent for the opposite. Blast radius is identical; container placement is strictly cleaner.
- **Rejected Proposal 2's structured-at-rest reference.** The spec names the reference `{name}@{version}` — a string. Readers need equality/grouping, not arithmetic on version parts. Structured storage invites premature version logic and multiplies the shape across the wire. A shared type + `format`/`parse` codecs captures the single-source-of-truth benefit at the string form the spec asks for.
- **Rejected the "drop the second kind param, derive create's ref from dataModel" purist option.** It diverges from the spec target `create({ dataModel, kind })`. Instead the double-pass is turned from a footgun into a compile-time constraint (`kind: BlockKind<Params>`) plus a runtime assert.
- Both proposals correctly reuse the `workflowRequiredCapabilities` mirror precedent (build_dist.ts:22-72) and the `featureFlags` optional-field precedent (block_description.ts:45); the manifest path is low-novelty either way.

**Risks & open**

- **Q-0005 (kind build mechanism / kind object shape).** This concern assumes the compiled kind object exposes runtime `{ name, version }` (the code map notes also mention `organization`) plus a phantom `Params` type. If the reference must be org-qualified for global uniqueness, a bare `{name}@{version}` string drops `organization`. Mitigation: `formatKindRef` is the single function that composes the reference, so qualifying the name segment is a one-line change once Q-0005 lands. **Do not lock the string format until then.**
- **Runtime reader coupling — NEEDS VERIFICATION.** Container-level placement assumes the runtime reader (templateEntry / `extractConfigGeneric`) can read `config.kind` off the container. If that reader is hard-wired to descend into `v4`, fall back to `BlockConfigV4Generic.kind` (Proposal 1's location). Verify before implementing; it decides one line in two files.
- **Migration sequencing.** Making `DataModelBuilder`'s constructor kind **required** breaks every existing V3 block at once (create's object-destructure is likewise breaking). Options: (a) required + one codemod sweep across all V3 blocks; (b) a transition window with `constructor(kind?)` and fail-safe `undefined` reference (reconciler simply can't project kind-less blocks yet, matching the workflowCapabilities fail-safe). Legacy V1 blocks (block_model_legacy.ts) must reach V3 first — prerequisite, out of scope (see Cross-Cutting).
- **Generic threading needs a compile check, not just a read.** Adding `Params` across `MigrationChainBase`, both subclasses, `DataModelInitialChain`, `DataModel`, and `create` must be verified to infer through `.from().migrate().transfer().init()` end to end.
- **Two copies cannot actually drift** in the current build: `build_dist` reads the manifest reference *out of* the already-baked `model.json`, so there is one value source (done()'s container.kind). The cross-check guards the distinct risk of a block author passing two different kind objects (builder vs create), not copy divergence.
- Out of scope (respected): PlRef / template-local→concrete rewrite of init params (template engine); the `@platforma-sdk/block-kind` package itself (Q-0005); facade↔kind direct dependency (Q-0004).

---

## 4. Publish + Version-Match — Kind-First Publish Flow

**Entry points** — grounded path:line, what to modify or add at each.

- `core/platforma/tools/block-tools/src/cmd/publish.ts:93` — MODIFY. Replace the single `await registry.publishPackage(manifest, fileReader)` call with `await publishBlock(registry, manifest, manifestRoot, fileReader)`. `manifestRoot` (already resolved at :84) is the facade cwd — the read root for the facade's declared kind dep. The channel marker (:97-100), coords write (:106-111) and refresh (:113) tail stays UNCHANGED and still runs only after `publishBlock` resolves. The action shrinks to flag-parse + adapter.
- `core/platforma/tools/block-tools/src/v2/publish-block.ts` — NEW. Orchestrator `publishBlock(registry, manifest, facadeDir, fileReader)`: (1) resolve both refs, (2) run pure gate — throws before any I/O, (3) `registry.publishKind(...)` — S3 `kinds/` tree, idempotent, (4) `registry.publishPackage(...)` — facade, unchanged. This is the single forward-compat seam the deferred phases extend.
- `core/platforma/tools/block-tools/src/v2/kind/version-match.ts` — NEW. Pure `checkKindVersionMatch(modelKindRef, facadeKindDep): void` throwing a typed `KindVersionMismatchError`; it **imports** `parseKindRef` (the `{name}@{version}` codec, §3) rather than redefining it. No I/O. Directly unit-tested with the `exitOverride`/`mkdtemp` harness already in `publish.test.ts` — and, being pure, tested with zero registry I/O.
- `core/platforma/tools/block-tools/src/v2/kind/resolve-refs.ts` — NEW. `readModelCompiledKindRef(manifest)` reads `manifest.description.components.model`'s recorded kind ref (the field the record-kind-ref concern adds; no `model.json` re-read — same field the reconciler consumes). `readFacadeKindDependency(facadeDir)` reads the facade-side kind dep from `package.json`. This module is the sole quarantine for OPEN Q-0004.
- `core/platforma/tools/block-tools/src/v2/registry/registry.ts:474` — DEPENDENCY (owned by the S3-kinds concern, not authored here). `publishPackage` stays byte-for-byte unchanged. A sibling `publishKind(kindManifest, fileReader)` mirrors the content-first / manifest-last / `marchChanged` pattern PLUS a source-hash guard modeled on `addPackageToChannel:397-408` read-then-decide (absent → write; equal `sourceHash` → idempotent no-op; different → throw for immutability). This concern only CALLS it, kind-first.
- `core/platforma/tools/block-tools/src/v2/registry/schema_public.ts:22` + `src/util.ts:28` — DEPENDENCY (S3-kinds concern). `kinds/` path-helper analogs of `packageContentPrefix`/`packageUpdateSeedPath`, and `hashSourceTree(srcDir)` folding one `calculateSha256` over the sorted src tree. Consumed by `publishKind`, not written here.

**Chosen path** — Proposal 2 wins, with one blast-radius trim. The three-layer split (pure gate + Q-0004 resolver + orchestrator seam) is adopted because the two things that actually hurt here are (a) an OPEN question about where the facade's kind dep lives, and (b) a spec with deferred phases that will add more publishable artifacts and more pre-publish gates. Proposal 2 quarantines (a) in one function and gives (b) a seam that is not a commander action. Proposal 1's inline approach couples the gate to the command harness and buries the Q-0004 resolution inside `cmd.action`, making the load-bearing check testable only through a full command build.

The trim vs. literal Proposal 2: `publishBlock` sequences only the two publishes and the gate. The channel marker, coords write and refresh tail stay in `publish.ts` unchanged — Proposal 2 folded them into the orchestrator, which is needless churn on code unrelated to kinds. `publishBlock` takes no `opts` bag yet (YAGNI — add parameters when a deferred phase needs one).

Deliberate, confirmed-acceptable deviation from the literal spec wording: the gate runs before `publishKind`, i.e. before ANY S3 write, not merely before `publishPackage`. Both gate inputs are local reads (parsed manifest + facade `package.json` in cwd), so a mismatch leaves the registry byte-identical. This is a strict superset of "abort before facade" and still honors kind-before-facade on the write path.

**Pseudocode**

`publish.ts` (at :93, replacing the lone publishPackage call):
```ts
// was: await registry.publishPackage(manifest, (file) => read(manifestRoot, file));
await publishBlock(
  registry,
  manifest,
  manifestRoot,                       // facade cwd — prepublishOnly runs here
  async (file) => Buffer.from(await fs.promises.readFile(path.resolve(manifestRoot, file))),
);
// unchanged tail: stable-channel marker, published.json coords, refresh
```

`publish-block.ts` (NEW):
```ts
export async function publishBlock(registry, manifest, facadeDir, fileReader) {
  // 1. resolve both refs (Q-0004 hidden inside resolve-refs)
  const modelKindRef  = readModelCompiledKindRef(manifest);        // components.model field
  const facadeKindDep = readFacadeKindDependency(facadeDir);       // facade package.json

  // 2. pure gate — hard-fail before ANY I/O
  checkKindVersionMatch(modelKindRef, facadeKindDep);              // throws KindVersionMismatchError

  // 3. kind FIRST — idempotent S3 kinds/ tree (source-hash guard inside publishKind)
  await registry.publishKind(buildKindManifest(manifest), fileReader);

  // 4. facade — unchanged behavior
  await registry.publishPackage(manifest, fileReader);
}
```

`version-match.ts` (NEW):
```ts
export class KindVersionMismatchError extends Error {}

// reuse the SINGLE {name}@{version} codec from block_kind_ref.ts (§3) — do not fork it.
// (that shared parseKindRef must guard a malformed ref: lastIndexOf("@") <= 0 -> throw.)
import { parseKindRef } from "@milaboratories/pl-model-common"; // "{name}@X.Y.Z" -> { name, version }

export function checkKindVersionMatch(modelKindRef, facadeKindDep) {
  const m = parseKindRef(modelKindRef);
  const f = parseKindRef(facadeKindDep);
  if (m.name !== f.name || m.version !== f.version)   // exact match, no semver range
    throw new KindVersionMismatchError(
      `Kind version mismatch: model compiled against ${modelKindRef}, ` +
      `facade declares ${facadeKindDep}. Rebuild the model against the declared kind.`,
    );
  // no soft path, no return value — success is "did not throw"
}
```

`resolve-refs.ts` (NEW — Q-0004 quarantine):
```ts
export function readModelCompiledKindRef(manifest) {
  const ref = manifest.description.components.model?.kindRef;   // field from record-kind-ref concern
  if (!ref) throw new Error("model component carries no compiled-against kind ref");
  return ref;                                                    // "{name}@X.Y.Z"
}

export function readFacadeKindDependency(facadeDir) {
  const pkg = JSON.parse(read(path.join(facadeDir, "package.json")));
  // Q-0004: if kind is NOT a direct facade dep, resolve transitively via model/package.json.
  // Single edit site if the authoritative location flips.
  const dep = pkg.dependencies?.[KIND_PACKAGE_NAME] /* ?? transitiveFromModel(...) */;
  if (!dep) throw new Error("facade declares no kind dependency");
  return `${KIND_PACKAGE_NAME}@${normalizeRange(dep)}`;
}
```

`registry.ts` `publishKind` (DEPENDENCY — shown for the contract this concern relies on):
```ts
public async publishKind(kindManifest, fileReader) {
  const prefix = kindContentPrefix(kindManifest.id);            // kinds/{org}/{name}/{version}/
  const existing = await this.storage.getFile(`${prefix}/${ManifestFileName}`);
  if (existing !== undefined) {
    const prev = parse(existing);
    if (prev.sourceHash === kindManifest.sourceHash) return;    // idempotent no-op
    throw new Error(`Immutable kind version republished with different content: ${prefix}`);
  }
  // ... content-first upload with per-file sha256 verify (copy of publishPackage:480-495)
  await this.storage.putFile(`${prefix}/${ManifestFileName}`, ...);  // commit-marker LAST
  await this.marchChanged(/* kinds-tree id */);                       // reconcile ticket
}
```

**Why this over the alternatives** — Rejected Proposal 1 (inline into `cmd.action`) on two counts. Testability: it claims coverage via the `publish.test.ts` harness, but that forces the load-bearing version comparison through a full commander build + `mkdtemp` + a synthesized facade `package.json` — the pure `checkKindVersionMatch` is a far cleaner and cheaper test target, and the comparison is exactly the part most worth isolating. Change-locality under an OPEN question: Proposal 1's `resolveFacadeKindDep` lives inside the action; when Q-0004 resolves (direct dep vs. transitive through `model/package.json`), Proposal 2 changes one quarantined function while gate and orchestrator do not move. Proposal 1's only genuine win — fewer files — is marginal: the net-new logic (gate, resolver, orchestrator call) is nearly identical LOC either way; Proposal 2 just files it behind seams. Blast radius is equivalent for the risky part: both leave `publishPackage` untouched, both delegate `publishKind`/source-hash/`hashSourceTree`/`kinds/` path helpers to the S3-kinds concern. On correctness both are equal — linear `await` ordering gives kind-before-facade, a plain `throw` gives hard-fail, purity gives idempotency for the gate. The tie-breakers (isolable pure gate, quarantined open question, non-command forward-compat seam matching the spec's deferred phases) all favor Proposal 2.

**Risks & open**
- **Q-0004 (facade↔kind direct dependency) — OPEN and blocking the comparison.** The facade's `dependencies` is empty today (model/ui/workflow sit under `devDependencies`, confirmed in `clonotype-browser/block/package.json`). Until it is confirmed whether the authoritative facade-side kind dep is a direct facade dep or resolves transitively through `model/package.json`, `readFacadeKindDependency` cannot be finalized. Quarantining it in `resolve-refs.ts` bounds the fallout to one function, but the comparison string cannot be written before the answer lands.
- **Hard dependency on the record-kind-ref concern (#3).** `readModelCompiledKindRef` reads `manifest.description.components.model.kindRef`, a field that does not exist yet (added by the build-model.ts / build_dist.ts record-kind-ref concern). This concern cannot land until that field is present; the gate has nothing to read otherwise.
- **Hard dependency on the S3-kinds concern (#5).** `registry.publishKind`, the `kinds/` path helpers, the source-hash guard, and `hashSourceTree` are owned there. This concern owns only: (a) kind-before-facade call order, (b) the gate throwing before any write, (c) plain hard-fail, (d) idempotency delegated to `publishKind`'s guard.
- **Q-0005 (kind build mechanism) — OPEN.** How the kind package's `src/` tree is produced/built determines what `hashSourceTree` folds over and what the npm half publishes. npm publish of the kind rides `pnpm -r publish` topological order over the workspace (a new workspace package), NOT block-tools — block-tools owns only the S3 `kinds/` tree side. If the kind build shape shifts under Q-0005, the source-hash input (owned by the sibling concern) shifts with it; the gate and orchestrator are unaffected.
- **Facade same-version overwrite remains unguarded.** `publishPackage:474-503` still does plain `PutObject` with no immutability guard. Only the `kinds/` tree gets the source-hash guard here; a reader expecting full block immutability from this concern will be surprised. Out of scope, flagged.
- **Exact-match vs. range.** `checkKindVersionMatch` assumes both refs are pinned `{name}@X.Y.Z`. If the facade dep is a semver range (npm norm), `readFacadeKindDependency` must normalize/resolve to the concrete version before the exact-equality gate — otherwise a legitimate range would spuriously hard-fail. Tied to how Q-0004 exposes the dep.

---

## 5. Registry Projection — `kinds/` Tree + `overview.json` via the Reconciler

**Entry points** — grounded path:line, what to modify or add at each.

- `core/platforma/tools/block-tools/src/v2/registry/registry.ts:474` — NEW `publishKind(kindManifest, fileReader)`, cloned from `publishPackage` (474-503): per-file size + sha256 verify (480-495), upload files, write `kind.d.ts`, write `kinds/{org}/{name}/{version}/manifest.json` LAST as the commit marker (mirrors 498-500). ADD a source-hash guard before writing (net-new — no same-version overwrite guard exists today). DO NOT call `marchChanged` (387).
- `core/platforma/tools/block-tools/src/v2/registry/registry.ts:247` — inside the existing `newVersions` build (both required inputs already in hand: parsed manifest at 249, channels at 239-245), read `description.kind` and, when present, push `{blockId, version, kindVersion, channels}` into a `touchedKinds` accumulator keyed by `kindOverviewPath`. Zero extra manifest reads.
- `core/platforma/tools/block-tools/src/v2/registry/registry.ts:162-172` — in the force branch only, after the existing v2/ block scan, LIST `kinds/*/*/overview.json` and seed each into `touchedKinds` with an empty entry set. The block scan already re-enumerates every kind ref (refs live *inside* block manifests), so this LIST exists solely to reset kinds orphaned by migration/removal.
- `core/platforma/tools/block-tools/src/v2/registry/registry.ts:316` — NEW post-loop step (before the global-overview write at 319): for each touched kind, RMW `kinds/{org}/{name}/overview.json` — load existing (skip load in force mode), filter out the `(blockId, version)` entries updated this pass, re-add fresh ones bucketed by declared kind version, recompute `{stable, any}` per kind version by mirroring the `latestByChannel` + derived `AnyChannel` computation (301-315), write back (delete when the result is empty).
- `core/platforma/tools/block-tools/src/v2/registry/schema_kinds.ts` (NEW) — `KindsPrefix='kinds/'`, `kindContentPrefix(org,name,version)`, `kindOverviewPath(org,name)`, `npmNameToKindPath` (strip trailing `.kind`, split dotted name → org/name), plus zod `KindManifest` (files + `sourceHash` + `firstUploadTimestamp`, `.passthrough()`) and `KindOverview` (kind versions × implementing block versions grouped `{stable, any}`, `.passthrough()`). Separate file, not sprinkled into `schema_public.ts:11/32`.
- `core/platforma/lib/model/middle-layer/src/block_meta/block_description.ts:36` — add optional `kind: KindRef.optional()` to `CreateBlockPackDescriptionSchema` so the read at `registry.ts:249` is typed. `.passthrough()` already carries it; explicit declaration is the seam the reconciler depends on. Optional ⇒ kind-less blocks unaffected.
- `core/platforma/lib/model/middle-layer/src/block_registry/overview.ts:27` — reuse `AnyChannel`/`StableChannel`/`VersionWithChannels`; define `KindRef {name, version}`. No new channel names.
- `core/platforma/tools/block-tools/src/v2/registry/registry_reader.ts:66` — NEW `getKindOverview(kindNpmName)`: single read of `kinds/{org}/{name}/overview.json` (one-file, no-LIST), then client-side semver resolution (newest kind version satisfying the specifier → newest implementing block on stable-or-any). NOTE: `relativeReader` is rooted at `MainPrefix='v2/'` (74); `kinds/` is a sibling, so this needs an absolute read or a second kinds-rooted reader — verify at implementation time.
- `core/platforma/tools/block-tools/src/cmd/publish.ts:88-113` — wire a kind-first publish step (construct registry, `publishKind`) ahead of the facade block publish. Kinds take no channel, so no `addPackageToChannel` call. (This is the same wiring concern #4 owns; the two concerns co-design the `publishKind` contract.)

**Chosen path** — Hybrid, taking Proposal 2 ("Dedicated kinds/ module") as the base with one hardening decision made explicit.

Both proposals converge on the same load-bearing mechanism, which I accept: the projection is derived from block manifests inside the *single existing* `updateRegistry` pass, via read-modify-write against each touched `kinds/{org}/{name}/overview.json` — no second reconciler, no `_updates_kinds`, no implementations marker tree. Normal mode is incremental-additive; force mode is the full-consistency backstop. This inherits the exact normal-incremental / force-full contract the package overview already runs on (222-265 for RMW, 301-315 for grouping).

I pick Proposal 2 over Proposal 1 on two decisive points and one soft one:

1. **Force mode as a *true* reconciler (correctness).** Proposal 1 says force mode "starts each touched kind empty" and relies on the block rescan to rebuild. But a kind that has lost *all* implementers is never touched by any block and was never seeded — so its stale `overview.json` survives even a force run. Proposal 2's force-mode `kinds/` LIST seeds every existing kind overview empty, so orphaned kinds are rewritten/deleted. That closes the one hole in the full-rebuild path for the cost of a single force-only LIST.

2. **Correcting the map's KindManifestPattern claim (blast radius).** The code map lists a `KindManifestPattern` force-scan as required. Proposal 2 correctly observes it is *not* — kind refs live inside block manifests, so the pre-existing v2/ scan (162-172) already enumerates every ref. Dropping that pattern removes surface. I adopt this.

3. **`schema_kinds.ts` (fit / forward-compat).** A genuinely new registry tree, plus the deferred template-engine/sandbox phases, justify a cohesive module over mirroring into `schema_public.ts`. Soft call; low stakes either way.

Everything else is common to both and accepted verbatim: `publishKind` drops no ticket (projection rides the block ticket via `marchChanged`, honoring "no `_updates_kinds`"); the source-hash guard is net-new; the `kind` field is optional; backend has no part.

**Pseudocode**

`publishKind` (registry.ts:474, cloned from `publishPackage`):
```ts
async publishKind(kindManifest, fileReader) {
  const { org, name } = npmNameToKindPath(kindManifest.name); // strip .kind, split dotted
  const base = kindContentPrefix(org, name, kindManifest.version);

  // NET-NEW source-hash guard (no same-version overwrite guard exists in publishPackage)
  const existing = await this.tryReadKindManifest(base); // read manifest.json if present
  if (existing) {
    if (existing.sourceHash === kindManifest.sourceHash) return;          // no-op
    throw new Error(`kind ${name}@${version} immutability violation`);     // hard-fail
  }
  // absent → proceed

  for (const f of kindManifest.files) {          // e.g. kind.d.ts
    const bytes = await fileReader(f.name);
    assert(bytes.length === f.size);
    assert(calculateSha256(bytes) === f.sha256); // per-file, as publishPackage
    await this.upload(`${base}/${f.name}`, bytes);
  }
  // manifest LAST = commit marker; stamp firstUploadTimestamp when absent
  await this.upload(`${base}/manifest.json`,
                    KindManifest.parse({ ...kindManifest, firstUploadTimestamp: Date.now() }));
  // NO marchChanged — projection is derived from BLOCK manifests, rides the block ticket
}
```

Accumulate inside the existing pass (registry.ts:247, within `newVersions` build):
```ts
const desc = BlockPackManifest.parse(manifestBytes).description; // line 249, already parsed
const channels = listedChannels;                                  // 239-245, already listed
if (desc.kind) {
  const { org, name } = npmNameToKindPath(desc.kind.name);
  const path = kindOverviewPath(org, name);
  const acc = touchedKinds.get(path) ?? { touched: new Set(), add: [] };
  acc.touched.add(`${blockId}@${version}`);
  acc.add.push({ blockId, version, kindVersion: desc.kind.version, channels });
  touchedKinds.set(path, acc);
}
```

Force-only orphan seed (registry.ts:162-172, force branch, after the v2/ block scan):
```ts
if (force) {
  for (const p of await this.list(`${KindsPrefix}`)) {   // kinds/*/*/overview.json
    if (isKindOverviewPath(p)) touchedKinds.set(p, { touched: null, add: [] }); // seed empty
  }
}
```

Post-loop write (registry.ts:316, before global-overview write at 319):
```ts
for (const [path, acc] of touchedKinds) {
  const current = force ? emptyKindOverview() : (await this.readKindOverview(path) ?? emptyKindOverview());
  // RMW, mirroring per-package filter+re-add (222-265)
  const kept = acc.touched === null
    ? []                                                    // force: full rebuild from scan
    : current.entries.filter(e => !acc.touched.has(`${e.blockId}@${e.version}`));
  const merged = [...kept, ...acc.add];

  // bucket by kind version, then {stable, any} per bucket mirroring 301-315
  const byKindVersion = groupBy(merged, e => e.kindVersion);
  const kindVersions = Object.entries(byKindVersion)
    .map(([kv, impls]) => ({
      kindVersion: kv,
      latestByChannel: newestPerChannel(impls),             // StableChannel slot
      [AnyChannel]: newestRegardlessOfChannel(impls),       // derived any slot
    }))
    .sort((a, b) => compareSemver(a.kindVersion, b.kindVersion));

  if (kindVersions.length === 0) await this.delete(path);   // orphaned → remove file
  else await this.upload(path, KindOverview.parse({ kindVersions }));
}
```

`getKindOverview` (registry_reader.ts:66):
```ts
async getKindOverview(kindNpmName, kindSpecifier) {
  const { org, name } = npmNameToKindPath(kindNpmName);
  const ov = await this.readAbsolute(kindOverviewPath(org, name)); // sibling of v2/, not via relativeReader
  const kv = newestSatisfying(ov.kindVersions, kindSpecifier);     // client-side semver
  return kv?.[AnyChannel] ?? kv?.latestByChannel[StableChannel];   // newest impl, stable-or-any
}
```

**Why this over the alternatives**

- **Rejected Proposal 1's force-empty-touched-only rebuild** — it leaves fully-orphaned kind overviews stale even after a force run, because an orphaned kind is touched by no block and was never seeded. The force-mode `kinds/` LIST (Proposal 2) is the minimal fix and turns force into a real reconciler. Cost: one LIST, force-path only.
- **Rejected the map's `KindManifestPattern` force scan** — unnecessary surface. Kind refs live in block manifests; the existing v2/ scan enumerates them for free. Adding a parallel kind-manifest scan would duplicate work and invite the two enumerations to disagree.
- **Rejected a separate kind reconciler / `_updates_kinds` ticket prefix** — the spec forbids it and it is genuinely unneeded: the projection's only inputs (kind ref + channels) are already in hand mid-pass, and block publish/channel ops already drop the ticket via `marchChanged`. Kind content publish stays inert (no ticket) by design.
- **Rejected recomputing the source hash in `publishKind`** — the registry lacks `src/` at publish time; the guard trusts the build-time sorted-tree digest carried on the manifest. This is a dependency, not a defect, but it caps the guarantee (see risks).
- **Chose `schema_kinds.ts` over mirroring into `schema_public.ts`** — a new tree plus deferred phases warrant a cohesive import surface. Reviewers expecting the in-place mirror may push back; the deviation is deliberate and cheap to reverse.

**Risks & open**

- **RMW correctness rests on block-version immutability of the kind ref.** Blocks have no same-version overwrite guard today (`publishPackage` 474-503). A same-version block republish that changes or drops its kind ref orphans the old kind's entry until a force reconcile. Mitigation adopted: force-mode LIST + full rebuild self-heals. Stronger fix (out of scope here, sibling concern): add a same-version block guard mirroring the new `publishKind` sourceHash guard.
- **Normal-mode staleness window** for kindA→kindB switches / dropped refs is inherent to no-LIST incremental derivation. How often the force backstop runs is governed by **Q-0008 (overview-refresh trigger, implementation.md:354)** — settle with the operator; it directly sets the staleness bound.
- **Source-hash guard stability depends on the kind build mechanism (Q-0005).** The guard's equal / differ / absent decision is only well-defined once the sorted-tree digest over `src/` is pinned (spec is explicit it is NOT the per-file `calculateSha256` at util.ts:28). Until Q-0005 lands, the guard is coded but its comparand is unspecified.
- **Kind is invisible until it has an implementer** — `publishKind` drops no ticket, so `getKindOverview` 404s (no `overview.json`) for a kind with zero implementing blocks. Correct per the block-derived projection model, but confirm it is intended UX.
- **Reader rooting unverified** — `registry_reader` is rooted at `MainPrefix='v2/'` (74); `kinds/` is a sibling. `getKindOverview` needs an absolute read or a second kinds-rooted reader. Quick check at implementation time.
- **Empty vs delete on orphan** — pseudocode deletes the overview when no implementers remain (cleanest for the no-LIST reader: 404 ⇒ unresolvable). Writing an empty file is the alternative. Low-stakes; confirm preference.
- **`npmNameToKindPath` convention** (strip trailing `.kind`, split dotted name → org/name) is net-new and unverified; a wrong split silently misfiles both content and projection. Pin it against the actual kind npm-naming convention (implementation.md:131) before shipping.

---

## 6. Resolution — Middle-Layer Kind → Concrete Block

Verdict: **Proposal 2 wins (pure resolver core), with one graft from Proposal 1** — keep P2's IO-free `kind_resolver.ts` module, but lift the selector→range translation into a small named `selectorToRange` helper (P1) rather than folding it silently into `resolveKindVersion`, because the `@`→exact translation and the pre-1.0 caret / prerelease edges each deserve a testable seam. The two proposals are 90% identical (same files, same reuse, same output spec, same "distinct error cases"); the only real fork is *where the net-new version-math lives*. Since the code map flags this concern as **net-new, correctness-critical logic** (there is no existing range resolver to extend), isolating it as a pure, literal-testable unit is the deciding factor.

### Entry points — grounded path:line, action

- `core/platforma/tools/block-tools/src/v2/registry/schema_public.ts:11` — **ADD** `KindsPrefix = "kinds/"` beside `MainPrefix`.
- `schema_public.ts:22,49` — **ADD** `kindOverviewPath({org,name})` = `kinds/{org}/{name}/overview.json` beside `packageOverviewPathInsideV2`. Reuse `npmNameToKindPath(npmName)` (npm-name → `{org,name}`, strips a trailing `.kind`, implementation.md:131) — defined **once** in §5's `schema_kinds.ts`; do not redefine it here, and do not conflate it with the `{name}@{version}` reference codec `parseKindRef` (§3).
- `schema_public.ts:77-181` — **ADD** `KindOverviewRawSchema` + `parseKindOverviewReg` + `normalizeKindOverviewEntry`, cloning the `.passthrough()` + post-parse-normalize pattern of `GlobalOverviewEntryRawSchema`/`parseGlobalOverviewReg`. Derive the `any` channel slot once at parse time (union of stable+unstable per kind version).
- `core/platforma/tools/block-tools/src/v2/registry/kind_resolver.ts:NEW` — **ADD** pure, IO-free module: `selectorToRange(selector)`, `resolveKindVersion(overview, range)` (`semver.maxSatisfying`), `pickImplementingBlock(entry, {allowUnstable})`. Returns a discriminated `Result` union (see error cases below). No FolderReader, no cache, no `semver` beyond range math — everything a caller can feed with a literal.
- `registry_reader.ts:116` (after `listBlockPacks`) — **ADD** `readKindOverview(ref, {signal})` mirroring `listBlockPacks`' exact IO shape (verified: `readFile → Buffer→JSON.parse → parse*Reg`, retry `Retry2TimesWithDelay`, list-cache + stale-on-error at 124-183). Reuse the same cache/retry treatment.
- `registry_reader.ts:215` (beside `getSpecificOverview`) — **ADD** `resolveKind(ref, {allowUnstable})` = `readKindOverview` → `kind_resolver` → return the **byte-identical** `from-registry-v2` spec shape at lines 232-237 (`{type:"from-registry-v2", id, registryUrl: this.registryReader.rootUrl.toString(), channel}`). Do **not** reuse `inferUpdateSuggestions` (tier logic, not range satisfaction).
- `core/platforma/lib/node/pl-middle-layer/src/block_registry/registry.ts:290` — **ADD** facade `resolveKind(registryId, ref, {allowUnstable})` cloned from `getOverview` (resolve `registryId` → assert `remote-v2` → `v2Provider.getRegistry(url).resolveKind(...)`).
- `registry-v2-provider.ts:9` — **NO CHANGE** (kind + impls co-reside per decisions.md:69; cached reader serves both).
- `mutator/block-pack/block_pack.ts:123` — **NO CHANGE** (`from-registry-v2` output is already what `getComponents`/`prepareBlockPack` consume).

### Chosen path (prose)

A kind reference `{name}@{selector}` is resolved with **one projection read + client-side semver, then the existing v2/ fetch** — the spec's literal recipe. `readKindOverview` performs exactly one `readFile` against `kinds/{org}/{name}/overview.json`, cache/retry-wrapped identically to the block projection read. The parsed, normalized overview (kind versions × implementing blocks grouped by channel, with `any` derived) is handed to the pure `kind_resolver`. There, `selectorToRange` maps `@X.Y.Z`→`=X.Y.Z`, `~X.Y.Z`→`~X.Y.Z`, `^X.Y.Z`→`^X.Y.Z` (valid semver ranges — the spec redefines tier *meaning*, not range arithmetic, implementation.md:141); `resolveKindVersion` picks the newest in-range kind version via `semver.maxSatisfying`; `pickImplementingBlock` selects the target channel (`StableChannel` default, `AnyChannel` when the apply-time `allowUnstable` flag is set) and takes the newest block version there. The result is a `BlockPackId` wrapped into a `from-registry-v2` spec, which `prepareBlockPack` materializes through the unchanged add-block path via `getComponents`. No cross-registry intersection: kind and its blocks share one registry, so one cached reader answers both reads.

Logic lives in `@platforma-sdk/block-tools`; only the thin facade lands in `pl-middle-layer` — consistent with the no-backend decision (decisions.md:15).

### Pseudocode

```ts
// schema_public.ts
export const KindsPrefix = "kinds/";
export const kindOverviewPath = (loc: { org: string; name: string }) =>
  `${KindsPrefix}${loc.org}/${loc.name}/overview.json`;
// npm-name -> {org,name} is npmNameToKindPath, defined ONCE in schema_kinds.ts (§5). Import it.
// It is NOT parseKindRef: parseKindRef parses the "{name}@{version}" reference string (§3).
import { npmNameToKindPath } from "./schema_kinds"; // "@org/x.y.kind" -> { org, name }
export const KindOverviewRawSchema = z.object({
  versions: z.array(z.object({
    version: z.string(),
    implementingBlocks: z.object({
      // channel -> newest block id per channel; "any" DERIVED at normalize
      stable: z.array(BlockRef).optional(),
      // ...other channels passthrough
    }).passthrough(),
  }).passthrough()),
}).passthrough();
export function parseKindOverviewReg(raw): KindOverview { /* parse + normalize + derive `any` */ }
```

```ts
// kind_resolver.ts  (PURE — no IO, unit-tested with literals)
export type KindResolution =
  | { ok: true; blockId: BlockPackId; channel: string }
  | { ok: false; reason: "no-matching-kind-version" }   // maxSatisfying === null
  | { ok: false; reason: "no-implementation" }          // version exists, zero impls
  | { ok: false; reason: "no-stable-implementation" };  // impls exist, none stable, !allowUnstable

export function selectorToRange(sel: Selector): string {
  switch (sel.op) {
    case "exact": return `=${sel.version}`;   // @  -> exact
    case "patch": return `~${sel.version}`;   // ~  -> patch floor
    case "minor": return `^${sel.version}`;   // ^  -> minor floor
  }
}

export function resolveKind(ov: KindOverview, sel: Selector, opt: {allowUnstable: boolean}): KindResolution {
  const versions = ov.versions.map(v => v.version);
  const picked = semver.maxSatisfying(versions, selectorToRange(sel)); // prerelease policy: see risks
  if (!picked) return { ok: false, reason: "no-matching-kind-version" };
  const entry = ov.versions.find(v => v.version === picked)!;
  const channel = opt.allowUnstable ? AnyChannel : StableChannel;
  const blocks = entry.implementingBlocks[channel] ?? [];
  if (channel === StableChannel && blocks.length === 0) {
    return (entry.implementingBlocks[AnyChannel]?.length ?? 0) > 0
      ? { ok: false, reason: "no-stable-implementation" }
      : { ok: false, reason: "no-implementation" };
  }
  if (blocks.length === 0) return { ok: false, reason: "no-implementation" };
  const newest = blocks.reduce((a, b) => semver.gt(b.version, a.version) ? b : a);
  return { ok: true, blockId: newest.id, channel };
}
```

```ts
// registry_reader.ts — thin IO adapter
public async readKindOverview(ref, {signal} = {}) {
  // mirror listBlockPacks 124-183: cache-check → retry(async () => parseKindOverviewReg(
  //   JSON.parse(Buffer.from(await v2RootFolderReader.readFile(kindOverviewPath(ref), {signal}))))) → cache → stale-on-error
}
public async resolveKind(ref, {allowUnstable}) {
  const ov = await this.readKindOverview(ref);
  const r = resolveKind(ov, ref.selector, {allowUnstable});
  if (!r.ok) throw new KindResolutionError(r.reason, ref);   // typed; caller maps to spec errors
  return {                                                    // === getSpecificOverview shape (232-237)
    type: "from-registry-v2",
    id: r.blockId,
    registryUrl: this.registryReader.rootUrl.toString(),
    channel: r.channel,
  };
}
```

```ts
// registry.ts — facade, cloned from getOverview 290-303
public async resolveKind(registryId, ref, {allowUnstable}) {
  const reg = this.getRegistryEntry(registryId).spec;
  if (reg.type !== "remote-v2") throw new Error("kind resolution requires remote-v2 registry");
  return this.v2Provider.getRegistry(reg.url).resolveKind(ref, {allowUnstable});
}
```

### Why this over the alternatives

- **Rejected P1 (inline methods on `RegistryV2Reader`)** on *fit + testability*, not blast radius (both touch the same files). The version-math + channel-selection is the net-new, error-prone core (`^0.x` semver quirk, prerelease inclusion, `@`→exact translation, three empty outcomes). P1 buries it inside a class method that needs FolderReader/LRUCache mocks to exercise; P2 makes it a pure function tested with a KindOverview literal — the highest-value test surface for genuinely new logic. P1's own con concedes `RegistryV2Reader` is already a large multi-responsibility class; adding resolution logic muddies its reader identity further. The verified codebase convention reinforces P2: `inferUpdateSuggestions` is a **top-level pure function**, not a method — pure version-math helpers already live at module scope here.
- **Rejected P1's "smallest surface" framing** as decisive: one new file + a couple exports is trivial and fully reversible, and both proposals equally expand the `@platforma-sdk/block-tools` public API (both export `readKindOverview`/`resolveKind`). The surface delta is noise.
- **Rejected P2's over-claim** that the template-engine batch loop (implementation.md:216) is a P2-only win — the LRU/list-cache on `readKindOverview` already dedupes repeated reads, so P1 would batch acceptably too. I did not weight this. P2 still wins on the pure-core testability alone.
- **Grafted from P1**: the named `selectorToRange` helper (P2 folded it into `resolveKindVersion`). Naming it isolates the two correctness edges below.
- **Added beyond both**: a *third* error outcome `no-matching-kind-version` (selector satisfies zero kind versions — `maxSatisfying` returns `null`). Both proposals modeled only the two block-implementation empty cases (implementation.md:145) and silently assumed a kind version always resolves. It may not.

### Risks & open

- **Pre-1.0 caret/tilde quirk (correctness, not raised by either proposal):** `semver` treats `^0.2.3` as `>=0.2.3 <0.3.0` (caret behaves like tilde below 1.0) and `~0.2.3` as `>=0.2.3 <0.3.0` as well — so for `0.x` kinds, `^` and `~` collapse to the same range. If the spec's "minor floats" tier must span `0.2 → 0.3` for pre-1.0 kinds, stock semver ranges will **not** deliver it. **Verify against the spec whether kinds are guaranteed `>=1.0.0`;** if not, `selectorToRange` needs an explicit range for the `0.x` minor case rather than `^`.
- **Prerelease policy (open):** `semver.maxSatisfying` excludes prereleases (e.g. `1.2.0-rc.1`) from `^`/`~` ranges unless `{includePrerelease:true}`. Decide whether prerelease kind versions are eligible; wire the option in `selectorToRange`/`resolveKindVersion` accordingly. Default (exclude) is the safe assumption pending confirmation.
- **Schema authored blind (co-design):** the `KindOverview` shape is *produced* by the block-overview reconciler/writer (concern #5, `tools/block-tools/src/v2/registry/registry.ts` ~line 250). `.passthrough()`+normalize tolerates additive drift but **not field renames**. Lock the reader schema against the reconciler's emitted JSON (or the spec's canonical example at implementation.md:116-131) before finalizing field names; reader and writer must stay in lockstep.
- **Q-0005 (kind build mechanism):** the projection this concern reads only exists once kinds are built/registered and the reconciler emits `kinds/{org}/{name}/overview.json`. If Q-0005 changes *how* kinds are built (and thus what a "kind version" and its "implementing blocks" grouping mean), the `KindOverview` schema and the channel-grouping assumption in `pickImplementingBlock` are the first things to move. This resolver is a pure *consumer* of that shape — cheap to re-point, but its correctness is downstream of Q-0005 being settled.
- **Deferred-phase reuse (unverified benefit):** the sandbox phase reusing the pure core unchanged is asserted, not proven; treat as a nice-to-have, not a design constraint.

---

## Cross-Cutting Concerns

### Naming and paths

- **New SDK package:** `@platforma-sdk/block-kind` at `core/platforma/sdk/block-kind/` (sibling of `sdk/test`, `sdk/model`, `sdk/eslint-config`). Registered in `pnpm-workspace.yaml:62`.
- **Shared reference type:** `BlockKindReference` + `formatKindRef`/`parseKindRef` codecs live once in `core/platforma/lib/model/common/src/bmodel/block_kind_ref.ts` and are imported by the model wiring (#3), the publish gate (#4), the reconciler (#5), and the resolver (#6). This is the single place that decides whether the reference's name segment is org-qualified — do not fork it.
- **On-wire reference form:** `{name}@X.Y.Z` string (spec `decisions.md:23`, `implementation.md:181`), recorded at the **container level** of `model.json` (beside `code`) and surfaced into the block manifest (`v2/{org}/{name}/{version}/manifest.json`).
- **Registry tree:** `kinds/{org}/{name}/` parallel to `v2/` in the **same** registry (`implementation.md:113-121`). Per-version content at `kinds/{org}/{name}/{version}/` (`manifest.json` + `kind.d.ts`); the reconciler-maintained projection at `kinds/{org}/{name}/overview.json`.
- **npm-name → path convention:** `@platforma-open/milaboratories.mixcr-clonotyping.kind` → dotted name `milaboratories.mixcr-clonotyping.kind`; first segment = org, middle = block name, strip trailing `.kind` → `kinds/milaboratories/mixcr-clonotyping/{version}/` (`implementation.md:131`). Encapsulated in `npmNameToKindPath` (distinct from the `{name}@{version}` reference codec `parseKindRef`); **unverified** — pin before shipping.
- **Build target name:** `block-kind` in the ts-builder `TargetType` registry (parallel to `block-facade`); config files `rolldown.block-kind.config.js` / `tsconfig.block-kind.json`.
- **Field-name mismatch to reconcile:** concern #1's descriptor exposes `organization`/`name`/`version`; concerns #2's build read uses `org`/`name`/`version`. Unify when Q-0005 fixes the compiled kind export shape.

### Versioning of `@platforma-sdk/block-kind`

The spec requires the package be **additive-only** — new exports may be added, existing ones never change or disappear — which is what lets a kind published long ago keep compiling against it (`implementation.md:39`). The path enforces this structurally via the `kindSchema:"v1"` discriminated-union envelope (#1): future template-engine / sandbox phases add a `CompiledBlockKindV2` union arm and consumers narrow on `kindSchema`, so v1 kinds keep compiling untouched. The package follows the standard changesets-gated `pnpm -r publish` release path like every other SDK package; there is no bespoke versioning machinery. The kind *content* published to the S3 `kinds/` tree is a separate, immutable, source-hash-guarded artifact — do not conflate the npm package version of `@platforma-sdk/block-kind` (the tooling) with a kind's own `{name}@X.Y.Z` version (the contract).

### V1 → V3 block-model migration prerequisite

A block must be on **`BlockModelV3` + `DataModelBuilder`** to carry a kind: the kind object is threaded through `new DataModelBuilder(kind)` and `BlockModelV3.create({ dataModel, kind })`, and the init lambda is typed against the kind's `BlockParams` (`decisions.md:55`, `implementation.md:63`). Legacy `BlockModel` (V1) blocks (`block_model_legacy.ts`) have no such surface and **must migrate to V3 first**. This is a hard prerequisite that sits *outside* the kind subsystem — the kind wiring (#3) does not build the V1→V3 migration. Making `DataModelBuilder`'s constructor kind **required** (#3) is a breaking change to every existing V3 block simultaneously; the two migration-sequencing options are (a) required-kind + one codemod sweep across all V3 blocks, or (b) a transition window with `constructor(kind?)` and a fail-safe `undefined` reference (the reconciler simply can't project kind-less blocks yet, matching the `workflowCapabilities` fail-safe precedent). Choose the sequencing before landing #3.

### Consistency with the mispec spec

The path is grounded against `docs/text/work/projects/block-kind-and-templates/decisions.md` and `.../implementation.md`. Key alignments:

- **TypeScript-only, no backend** (`decisions.md:15`, `implementation.md:7`) — every concern lands in the SDK / block-tools / middle-layer; `core/pl` is untouched. The resolver facade (#6) is the deepest the path reaches into the middle layer, and it is thin (`decisions.md:15`).
- **Kind recorded in the model, not a fourth component** (`decisions.md:19-33`) — #3 bakes the reference at container level and surfaces it into the manifest; whether the facade depends on the kind directly is **Q-0004**, quarantined in #4's `resolve-refs.ts`.
- **Kind-first publish, version-match gate, hard-fail** (`decisions.md:57-83`) — #4 sequences `checkKindVersionMatch` → `publishKind` → `publishPackage`, with the gate before *any* S3 write (a confirmed-acceptable strict superset of "abort before facade").
- **Source-hash guard: one sha256 over the sorted `src/` tree, stored in the kind manifest, `absent→store / equal→no-op / differ→hard-fail`** (`decisions.md:73-83`, `implementation.md:273-283`) — computed at build (#2), enforced at publish (#4/#5). Explicitly **not** npm `dist.integrity`, `npm pack` bytes, or the Turbo hash.
- **Projection is derived from block manifests, single source of truth, no `_updates_kinds`, no kind-side markers** (`decisions.md:103-107`, `implementation.md:123-129`) — #5 rides the block ticket via `marchChanged`; `publishKind` drops no ticket.
- **Three version selectors with redefined-semver tiers** (`decisions.md:87-95`, `implementation.md:135-141`) — #6's `selectorToRange` maps `@/~/^` to exact/patch-floor/minor-floor; the spec redefines tier *meaning* (major=params-break, minor=behavior, patch=additive), not range arithmetic.
- **Resolution reads one file, client-side semver, stable-by-default / allow-unstable, distinct error cases** (`decisions.md:99`, `implementation.md:145`) — #6 reads one `overview.json`, resolves with `semver.maxSatisfying`, and models the empty cases as a discriminated result union (extended with a third `no-matching-kind-version` case).

---

## Open Risks and Spec Open-Question Dependencies

The path's correctness is gated on several **decided-to-be-undecided** open questions (`implementation.md:345-354`). Ordered by how much of the path each blocks:

- **Q-0005 (kind build mechanism)** — *blocks the most.* The concrete build that compiles a kind package: target, `package.json` fields, and how org/name/version metadata is injected. Every concern that reads the compiled kind export shape (#2's `buildKindDist` metadata read, #3's `BlockKind<Params>` object shape) or the source-hash input (#4/#5's `hashSourceTree`) is downstream of it. Direction is **settled** (rolldown + rolldown-plugin-dts; bake org/name/version; emit readable `kind.d.ts`); the exact export field layout and the src-tree digest input are the hard prerequisites. Concern #1 ships **today** on stock `ts-builder` with an explicit `meta` argument, deliberately independent of Q-0005 — the auto-baking target is additive and leaves the public type contract unchanged. The `organization` vs `org` field-name mismatch between #1 and #2 is reconciled here.
- **Q-0004 (facade↔kind direct dependency)** — *blocks the version-match comparison (#4).* Whether the published facade depends on the kind directly (kind as a fourth block component) or receives it through the model. The facade's `dependencies` is empty today. Quarantined in #4's `readFacadeKindDependency` (`resolve-refs.ts`) and gates #2's structurer rule (`block-package-json.ts`, kept untouched until Q-0004 lands). Spec guidance: make the link direct if easy; otherwise the model carries it.
- **Q-0008 (overview-refresh trigger)** — *sets the staleness bound on #5.* How the kind overview refresh is triggered in production (cron / on-publish / manual). The reconciler's normal mode is incremental-additive; kindA→kindB switches and dropped refs self-heal only on a force run, so the refresh cadence directly bounds the projection's staleness window. Settle with the operator.
- **Q-0007 (engine add-block API)** — *does not block this path; it is the entry point of the deferred template-engine document.* The resolver (#6) emits a `from-registry-v2` spec that the existing add-block path (`prepareBlockPack`/`getComponents`) consumes unchanged; how the fixed native YAML lambda then threads params and resolved references through to the init lambda is engine detail resolved in the template doc, not here.
- **Q-0009 (apply-time params validation)** — *deferred to the template document.* A block's init is compile-time typed against its kind, but a hand-authored YAML's `params` are untyped; what validates them at apply time is a template-engine concern, out of scope for the KIND subsystem.

Standing cross-cutting risks independent of the open questions:

- **Source-hash case convention** (`hashDirSync` lowercase vs `calculateSha256` uppercase) is a live correctness seam across #2/#4/#5; mitigated by `.toUpperCase()` at the manifest-write site. Any comparator on the publish side must use the same convention or the guard reports "different" on every run.
- **`npmNameToKindPath` / `parseKindRef` split convention** is net-new and unverified; a wrong split silently misfiles both content and projection (#5) and misroutes resolution reads (#6). Pin against the real kind npm-naming convention before shipping.
- **Reader rooting** — the v2 `registry_reader` is rooted at `MainPrefix='v2/'`; `kinds/` is a sibling, so the kind-overview read (#5/#6) needs an absolute read or a second kinds-rooted reader. Quick verification at implementation time.
- **Pre-1.0 semver quirk** (#6) — `^0.x` and `~0.x` collapse to the same range under stock semver; if kinds are not guaranteed `>=1.0.0`, `selectorToRange` needs an explicit range for the `0.x` minor case.
- **Facade same-version overwrite remains unguarded** — only the `kinds/` tree gets the source-hash immutability guard in iteration 1; full block immutability is out of scope and flagged.
