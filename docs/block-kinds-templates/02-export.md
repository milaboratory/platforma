# Track 2 — Export (Preamble)

**Status: preamble only.** Scope and open questions, not a plan.

Authoritative design: the `docs/text/work/projects/block-kind-and-templates/` mispec
corpus (PR #198 rework). Citations use atom IDs (`A-00NN`).

## Goal

Turn the active project into a `template-v1` YAML file that re-applies to an equivalent
project — the export half of the round-trip north-star.

## In scope

- **Serialize** the project's blocks in dependency order, reading each block's
  template-descriptor output (`decisions.md:148`).
- **Template-local ids** — each block's project-local UUID is used directly as its
  template-local `id`; references already stored in params carry those same ids, so
  export reuses them verbatim, no remap (`decisions.md:139`).
- **Desktop command** — "Export Project as Template…" writes the file
  (`decisions.md:148`).
- **`template-v1` schema** — shared with import; export must emit exactly what import
  parses (see README "Schema shared across tracks").

## Why export can start early

Export only needs the kind **reference** (`{name}@X.Y.Z`) recorded in `model.json` — read
back at runtime for the exported template entry (`A-0013`) — plus a block's
template-descriptor output. It does not need kind _resolution_ or the template-engine
apply lambda, so it can be built and tested against fixtures ahead of import.

## High-Level TODO

Dependency-ordered. Use `[~]`/`[x]` as work lands, matching the tracker convention in
`01-kind-and-lifecycle.md`.

**Contracts first (these two gate everything below)**

- [~] **Pin the `template-v1` schema** — prototyped in `pl-model-common` under
      `lib/model/common/src/template/`: `project_template_v1.ts` (file envelope, `schema:
      template-v1` marker, entry shape, `TemplateLocalRef`, zod boundary parsers,
      reference validation) and `kind_selector.ts` (the `{name}@{selector}` grammar with
      its three tiers). One definition, both tracks import it. Still to do: agreement with
      import (track 3) and sign-off on five decisions — see "Schema Prototype" below
- [~] **Define the template-descriptor contract** — prototyped as
      `.templateParams((data) => params)` on `BlockModelV3` (`A-0041`, renamed — see below),
      plus facade callback #7 (`__pl_templateParams_derive`). A block exposes only its
      params, typed as its kind's `Params`; references go out as ordinary `PlRef`s and the
      SDK rewrites them. See "Template-Descriptor Contract" below for the audit and what it
      leaves open

**Serialization**

- [~] **Read the kind reference back at runtime** — audited end to end and pinned by
      `sdk/model/src/kind_reference.test.ts`; **no production code was needed**, the read
      already works. See "Kind Reference Read-Back" below for the audit, why no helper
      landed, and the one open decision it surfaced (kind-less blocks)
- [~] **Dependency-order walk** — `walkProjectForTemplateExport` in
      `lib/node/pl-middle-layer/src/model/template_export.ts`, plus the ML-side invoker
      `ProjectHelper.deriveTemplateParamsFromStorage` for facade callback #7. **No
      topological sort was needed** — see "Dependency-Order Walk" below. Remaining: the
      provider that reads real project state, which belongs with the serializer
- [ ] **Template-local ids** — emit each block's project-local UUID verbatim as its
      template-local `id`; references stored in params already carry those ids, so no
      remap step (`decisions.md:139`).
- [ ] **Emit `template-v1` YAML** — serializer producing exactly what import parses.

**Desktop**

- [ ] **"Export Project as Template…" command** — menu/action entry, file-save dialog,
      write the YAML (`decisions.md:148`).

**Validation**

- [ ] **Fixture-based tests** — golden project fixtures → expected YAML, runnable ahead
      of import (no kind resolution, no apply lambda required).
- [ ] **Round-trip check once import exists** — export → import → equivalent project;
      the north-star acceptance criterion, deferred to track 3 landing.

## Schema Prototype

`lib/model/common/src/template/` — `A-0036`'s document as types plus zod boundary
parsers, with `project_template_v1.test.ts` parsing the atom's example verbatim. Exported
surface: `ProjectTemplateV1`, `ProjectTemplateV1Entry`, `ProjectTemplateV1Schema`,
`parseProjectTemplateV1`, `TemplateLocalRef`, `BlockPackReference`,
`BlockKindSelectorReference`, `collectTemplateLocalRefs`,
`validateProjectTemplateV1References`, and the params codec `TemplateForm` /
`toTemplateForm` / `fromTemplateForm`.

**Decisions awaiting sign-off**

1. **Home and boundary** — `pl-model-common` owns the *document* (JS value ↔ types) and
   takes no `yaml` dependency, since it ships in every block-model and UI bundle. The YAML
   text layer belongs to `pl-middle-layer`, which already has `yaml`.
2. **Naming** — `ProjectTemplateV1*`, not `TemplateV1*`: `PlTemplateV1` already names the
   unrelated backend workflow-template resource (`lib/model/backend/src/`
   `template_resources_v1.ts:90`).
3. **Reservation rule** (load-bearing) — a plain object with *exactly* the two string keys
   `block` and `output` is reserved as a template-local reference anywhere inside an entry's
   opaque `params`. This is what lets the engine rewrite references generically on apply
   (`A-0038`) instead of every kind shipping a params codec. Reference resolvability is kept
   out of the parser (`validateProjectTemplateV1References` is separate) so the parser stays
   sound if the rule is rejected. Those two fields are the whole reference: `PlRef`'s
   `requireEnrichments` is dropped on export, since enrichments are out of scope for
   templates (operator decision, 2026-07-30).
4. **Strict selector grammar** — `X.Y.Z`, `~X.Y.Z`, `^X.Y.Z` only; `>=1.0.0`, `1.x` and
   `latest` throw at parse. Deliberate divergence from `tools/block-tools`'s
   `parseSelector`, which additionally tolerates a leading `@` as exact.
5. **Zod peg** — `satisfies BoundaryParser<T>` (`z.ZodType<T, z.ZodTypeDef, unknown>`)
   rather than the repo's `satisfies z.ZodType<T>`: the branded string fields need a
   `.transform`, whose input is a plain `string`, which the two-parameter form rejects.

Known gap, not schema-specific: `expectTypeOf` assertions in `*.test.ts` are unenforced
repo-wide — `createVitestConfig` sets no `typecheck` and `tsconfig.base.json` excludes
test files. The template test was verified by hand against a tsconfig that includes tests.

## Template-Descriptor Contract

What a block exposes is one optional builder method, the mirror image of the data model's
`init`. **Named `templateParams`, not `templateEntry`** (operator decision, 2026-07-30): the
lambda returns only params — the engine assembles the entry around them — so naming it after
the entry oversells what a block controls. `A-0041` and `01-kind-and-lifecycle-\
implementation-path.md` still say `templateEntry`; the atom needs a version bump to match.

```typescript
BlockModelV3.create({ dataModel, kind })
  .args((data) => ({ … }))
  .templateParams((data) => ({ sources: data.sources })) // → the kind's Params
  .done();
```

- **Return type is the kind's `Params`.** `BlockModelV3` now carries a seventh type
  parameter threaded from `create({ dataModel, kind })`, so a projection that drifts from
  the block's own init contract fails to compile. Kind-less `create(dataModel)` leaves it
  `unknown`, which makes `.templateParams` untyped there — one more reason the deprecated
  overload should go.
- **References stay live in the lambda.** The block returns ordinary `PlRef`s;
  `toTemplateForm` (pl-model-common) rewrites them to `{ block, output }` on the way out,
  and `fromTemplateForm` reverses it on apply. That is the generic engine-side rewrite the
  reservation rule buys, and it means no block ships a params codec — the answer to "does
  the lambda or the engine rewrite references".
- **Omitting the method is legal**, and means "re-initialize from the kind's defaults" —
  correct for a block like `pool-explorer` whose params are empty by construction. Note
  `undefined` params and `{}` params are NOT interchangeable: `{}` is written out and used
  as-is by `init`.
- **Facade callback #7**, `__pl_templateParams_derive`, is registered by every V3 block
  whether or not it declares the method; a block without it answers `{ value: undefined }`.
  Additive per the facade's compatibility rules, and `BlockStorageFacadeHandles` picks it
  up automatically.

**Does every block already produce it?** No — nothing does yet, and the ceiling is set by
kind coverage, not by this method:

| Population | Count | Can carry `.templateParams` |
| --- | --- | --- |
| `etc/blocks/*` (SDK test blocks) | 13 | Yes — all V3, all `create({ dataModel, kind })` |
| `blocks/*` on `BlockModelV3` | 26 | Not yet — 0 have a `kind/` package |
| `blocks/*` on legacy `BlockModel` (V1) | 37 | No — needs V1 → V3 first, then a kind |
| `blocks/*` with no `model/src` | 3 | N/A (`MMseqs2`, `pseudobulk-generation`, `synthetic-repertoire-profiler`) |

Migration path, in order: V1 → V3 (37 blocks), add a `kind/` package (63 blocks), then add
`.templateParams` per block. Only the third step is this track's; the first two are track 1
and the blocks repo. Two of the SDK test blocks (`sum-numbers`, `table-test`) now declare
the method as worked examples.

**Open — needs a decision**

- **Extra fields are not rejected.** TypeScript applies no excess-property check to an
  object literal returned from a contextually-typed arrow, so a lambda can return fields
  the kind never declared and they land in the file. There is no runtime backstop either: a
  kind carries `Params` as a type only (`A-0019`), so nothing exists to strip against.
  Options: accept it, have the kind also carry a runtime schema, or strip against a
  key list. Pinned by a test in `sdk/model/src/template_entry.test.ts`.
- **References inside a `PObjectId` are invisible to the rewrite.** `EnrichmentRef.hit` and
  `EnrichmentStep.linker` are canonicalized-JSON *strings* holding a block UUID, so a
  structural walk cannot see them and the UUID survives export to go stale on apply.
  Whether such a reference reaches persisted params is unverified.

## Kind Reference Read-Back

The TODO's wording ("read the kind reference back at runtime") suggests missing plumbing.
There is none. Every hop is a verbatim passthrough, audited on disk:

| Hop | Where | Behavior |
| --- | --- | --- |
| Bake | `sdk/model/src/block_model.ts:218,233,739` | `formatKindRef` → container-level `kind` |
| Write | `tools/block-tools/src/cmd/build-model.ts` | `JSON.stringify(config)`, no whitelist |
| model.json | `etc/blocks/*/model/dist/model.json` | `kind` at **top level**; 13/13 carry it |
| Manifest lift | `tools/block-tools/src/v2/build_dist.ts:55-70` | `modelKindReference`, fail-safe |
| Parse | `.../mutator/block-pack/block_pack.ts:43-55` | open record + cast, preserves it |
| Store | `.../mutator/block-pack/block_pack.ts:353` | `{ config: spec.config, source }` |
| Read | `.../middle_layer/util.ts:35` | hands every caller the whole `info` |

The single loss is `extractConfigGeneric` (`lib/model/common/src/bmodel/normalization.ts`),
which drops `kind` in all four arms — deliberately: it normalizes the *render envelope*,
and `kind` is container-level. So `getBlockPackInfo(...).cfg` is kind-blind by construction
and the read point is `getBlockPackInfo(...).info.config.kind`.

**Why no helper landed.** `BlockConfigContainer.kind` is already declared
`readonly kind?: BlockKindReference` (`container.ts:21`), so that property access already
yields `BlockKindReference | undefined` — an `extractKindRef(cfg)` wrapper would narrow
nothing, parse nothing, and resolve nothing, while becoming permanent block-author-facing
API (`pl-model-common` is re-exported wholesale by `@platforma-sdk/model`). The middle-layer
read is one expression at the serializer's own call site, and that call site does not exist
yet. What was missing was not code but *proof the path holds*, so this step landed the
test instead.

**What the test pins** (`sdk/model/src/kind_reference.test.ts`, 6 cases, no backend):
`done()` bakes the kind at container level; the normalized config does **not** carry it
(fails loudly if anyone later routes it through the normalizer, creating two sources of
truth); a kind-less block reads back `undefined` rather than throwing; the reference widens
to the exact tier with the string unchanged; the org-scoped name survives the last-`@`
split; and the widened reference is accepted by `ProjectTemplateV1EntrySchema` as an
entry's `kind`.

**One correction to the TODO's framing.** "No kind _resolution_ needed" is right, but a
brand *widen* is mandatory and was understated: an entry's `kind` is typed
`BlockKindSelectorReference`, so the exact reference goes through
`kindReferenceToSelectorReference`. `A-0041` fixes the tier — "the exact version the block
implements, `{name}@X.Y.Z`, read from the model's embedded kind reference" — and also
settles that export never emits a `block` override. Widening happens at the **serializer**,
not the read point, because it validates and therefore throws; every read site sits inside
a `Computable` re-evaluated on project-overview recompute, so a malformed stored reference
must not be able to break the overview of unrelated blocks.

**Open — needs a decision**

- **What does export do with a kind-less block?** A genuine spec contradiction, not a code
  problem: an entry's `kind` is **required** (`A-0036`, `project_template_v1.ts:95` — "it
  carries the params contract the entry is typed against") while a block's `kind` is
  **optional** for backward compatibility (`container.ts:19-21`). For such a block there is
  no legal entry to write, and no atom in the corpus decides between: (a) fail the export
  and name every offending block; (b) skip the block with a warning — but downstream entries'
  params may hold `TemplateLocalRef`s to it, producing a file that fails
  `validateProjectTemplateV1References`; (c) emit an entry without `kind`, i.e. an invalid
  file. Recommendation: **(a)**. This is not an edge case — every block published before
  kinds existed, and every block still on the deprecated `create(dataModel)` overload, is
  kind-less, so it is what most existing projects will hit until blocks are republished.
  Gates the serializer step, not this one.

## Dependency-Order Walk

**The project structure is already stored in topological order, so there is no sort.** That
is not an assumption — it is enforced. `productionGraph` iterates `allBlocks(structure)` and
passes the set of blocks seen *so far* as the `allowed` set to `inferAllReferencedBlocks`
(`lib/node/pl-middle-layer/src/model/project_model_util.ts:136-143`, `args.ts:107-110`), so a
reference to a block not already above is recorded as `missingReferences` rather than as an
upstream; the upstream scan then stops at the current block (`:155-156`). `BlockGraph`
documents the same invariant on its node map ("Nodes are stored in the map in topological
order", `:40`). A block can therefore only legally reference blocks earlier in the sequence
— which is exactly `A-0036`'s ordering rule ("every block must appear after the blocks it
references") and `A-0041`'s "the engine emits entries upstream-first". Emitting in structure
order satisfies both for free. Groups are flattened in order, so cross-group order is the
structure's too.

The walk deliberately does **not** reorder to repair a structure that violates the rule:
reordering would change which references are even legal, and the resulting file is caught by
`validateProjectTemplateV1References` anyway. Pinned by a test.

**What landed**

- `walkProjectForTemplateExport(structure, paramsProvider)` →
  `{ entries, problems }`. Pure over plain data, 13 unit tests, no backend. It owns the four
  distinctions that are easy to get wrong: structure order is the answer; `undefined` params
  (block declares no `templateParams`) is legal and **not** the same as `{}`; a failed
  derivation is a per-block problem rather than an abort, so every offending block is
  reported in one pass; and non-object params are rejected — an entry's `params` is a mapping
  (`A-0036`), but a kind carries `Params` as a type only (`A-0019`), so this walk is the only
  place that can catch a lambda returning a primitive or an array.
- `ProjectHelper.deriveTemplateParamsFromStorage` — the middle layer's invoker for
  `__pl_templateParams_derive`, mirroring `deriveArgsFromStorage`. This did not exist; the
  callback had been registered by every V3 block since the previous step with nothing on the
  ML side calling it. Unlike `derivePrerunArgsFromStorage`, it surfaces failures instead of
  swallowing them: a prerun that cannot derive args just skips a block in staging, whereas an
  export that silently drops one produces a template that does not describe the project.
- A block whose state cannot be read at all is a **problem**, not a silent skip — the
  opposite of `productionGraph`, which skips such blocks by design. Deliberate divergence:
  surviving entries may hold `TemplateLocalRef`s to the omitted block.

**What is left, and why it is the serializer's**

The provider that supplies real project state. Per-block storage is only reachable from
`ProjectMutator`'s batched round-trip loader (`mutator/project.ts:1870-1899`) or from inside
a Computable, and an export is a one-shot user action rather than part of the render loop —
so where that read lives depends on the desktop surface, and adding it to that
performance-tuned batching routine now would be guesswork. Note the same loader does
`info.blockConfig = extractConfig(bpInfo.config)` (`:1897`), so it is kind-blind like every
other extracted config: an exporter reading from `BlockInfoState` must take
`bpInfo.config.kind`, not `info.blockConfig`.

## Out of scope

- Import / apply (track 3).
- Publishing or browsing templates in-app (`decisions.md:152`).

## Open questions

- Both original open questions are answered above. The live ones are the sign-off items
  under "Schema Prototype", the two decisions under "Template-Descriptor Contract", and the
  kind-less-block export decision under "Kind Reference Read-Back" — the last of these
  gates the serializer.
