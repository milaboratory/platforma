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
- [~] **Template-local ids** — verbatim reuse confirmed end to end, and the one thing it
      depends on is now enforced: `walkProjectForTemplateExport` rejects params that still
      carry an un-rewritten project-local id. See "Template-Local Ids" below — it resolves
      one of the open questions above and leaves the dangling-reference check to the
      serializer
- [~] **Emit `template-v1` YAML** — `lib/node/pl-middle-layer/src/model/template_serializer.ts`:
      `assembleProjectTemplateV1` → `stringifyProjectTemplateV1` → `exportProjectAsTemplateV1`.
      Round-trip pinned against the import-side parser. See "Serializer" below — it
      **implements a decision that is still awaiting sign-off** (kind-less blocks fail the
      export). Remaining: the provider that reads real project state, which needs the
      desktop surface

**Desktop**

- [~] **"Export Project as Template…" command** — wired end to end across both repos:
      `MiddleLayer.exportProjectAsTemplate(id)` here, and the ProjectCard context-menu
      item, save dialog and write in `platforma-desktop-app` on branch
      `MILAB-6648_export-project-as-template` (off `origin/main`). See "Desktop Command"
      below. Confirmed working against a live backend; the failure path was exercised, the
      success path needs a project of kind-bearing blocks

**Validation**

- [~] **Fixture-based tests** — five golden `.yaml` files under
      `lib/node/pl-middle-layer/test_fixtures/template-v1/`, driven by
      `template_serializer_fixtures.test.ts`. Turned up a real interop bug in the emitter
      — see "Golden Fixtures" below. Still open: fixtures of a *real* project (through
      `ProjectMutator`), which need a backend
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

What a block exposes is one **required** builder method, the mirror image of the data model's
`init`. **Named `templateParams`, not `templateEntry`** (operator decision, 2026-07-30): the
lambda returns only params — the engine assembles the entry around them — so naming it after
the entry oversells what a block controls. `A-0041 v2.0.0` carries both the name and the
requirement; `01-kind-and-lifecycle-implementation-path.md` still says `templateEntry`.

**Required, not optional** (operator decision, 2026-08-04 — `A-0056`): `done()` throws
without it, at the same gate that rejects a model with no `.args`. An optional projection
bought no expressiveness — an absent `params` and `params: {}` reach the same init factory
and produce the same storage (`block_migrations.ts:721` vs `:739`) — while costing fidelity
silently: a block with no projection exported an entry with no params, which applied as a
default-initialized block that looked restored. A block whose state carries nothing worth
restoring returns `{}`.

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

- **Extra fields are not rejected on the way out.** TypeScript applies no excess-property
  check to an object literal returned from a contextually-typed arrow, so a lambda can return
  fields the kind never declared and they land in the file. The kind's parser is no backstop
  here — it runs on params coming IN, and nothing runs on what the projection hands back. The
  asymmetry is now the interesting part: such a file is written happily and then rejected on
  re-import by the same kind that would have caught it, so the round trip fails at the far
  end rather than at the source. Options: accept it, run the kind's parser over the
  projection's output too, or strip against a key list. Pinned by a test in
  `sdk/model/src/template_params.test.ts`.
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

## Template-Local Ids

**There is no id namespace to translate into, so there is nothing to remap.** Both sides
of the id draw from the same source:

| What | Where | Becomes |
| --- | --- | --- |
| `Block.id` in the structure | `project_model.ts` | the entry's `id`, verbatim |
| `PlRef.blockId` inside params | `ref.ts:9` | `TemplateLocalRef.block` via `toTemplateForm` |

`toTemplateForm` copies `ref.blockId` straight into the reference
(`template_form.ts:49`), so an entry id and every reference naming it are the *same
string* — pinned by a test asserting exactly that identity. Nothing generates, maps, or
counts ids.

Two framing corrections to the TODO's wording:

- **"UUID" is the common case, not a constraint.** `addBlock` and `duplicateBlock` only
  *default* the id to `randomUUID()`; both accept an explicit one
  (`middle_layer/project.ts:217,288`), and the workspace test blocks use ids like
  `block1`. An entry `id` is `z.string().min(1)`, so this is fine — but code and docs
  should not promise UUID shape.
- **Verbatim reuse is only sound if the rewrite is complete**, and that is the real work
  this step turned up.

**What landed: a detection-parity guard.** The two walks disagree about what carries a
block id, and the export path sat on the wrong side of the gap:

| Walk | Recognizes a `PlRef` object | Recognizes a `PlRef` serialized into a string |
| --- | --- | --- |
| `toTemplateForm` (`mapRefs`, `template_form.ts:74`) | yes | **no** |
| `inferAllReferencedBlocks` (`args.ts:40-99`) | yes | yes, peeling N `stringify` passes |

The second is the project's own reference detector — the block dependency graph is built
from it — so it is the authority on what carries a block id. `walkProjectForTemplateExport`
now runs it over the already-template-form params and reports any id it still finds as a
per-block problem. Correct template form has none: a rewritten reference is
`{ block, output }` with no `__isRef` marker, invisible to the detector. It sits in the
walk rather than in `toTemplateForm` because the detector is middle-layer code while the
codec ships in every block-model and UI bundle.

**This resolves the second open question under "Template-Descriptor Contract."** It was
recorded as "whether such a reference reaches persisted params is unverified". The carrier
is now verified real and precisely located: `EnrichmentRef.hit` and `EnrichmentStep.linker`
are declared as global-form `PObjectId`s, i.e. `canonicalize({ __isRef: true, blockId,
name })` (`ref.ts:139-149`) — and `args.ts`'s string-unwrapping branch exists *because*
that form occurs in real args. So this was never hypothetical, and export was silently
writing a project-local UUID into a file with no way to resolve it. It is now a named
error naming the offending block and id. Still open, and now a smaller question:
whether to *support* the case by rewriting inside the string (the apply side would have to
re-canonicalize with a matching escape depth) rather than rejecting it. Rejecting is the
right default until a block is shown to need it.

**What is deliberately not here: the dangling-reference check.** Verbatim reuse can emit a
reference to a block that is not in the file, and this is ordinary rather than exotic:
`deleteBlock` only splices the structure (`mutator/project.ts:1420-1432`) and does not
rewrite downstream args, which is exactly why `BlockGraphNode` carries a
`missingReferences` flag. A project in that state exports entries whose params name a
block with no entry. `validateProjectTemplateV1References` already reports precisely this,
with the offending entry named in the message, and it needs the whole document — so the
serializer calls it once instead of the walk approximating it per block.

**Noted, not fixed: duplicate ids are possible upstream.** `updateStructure` diffs
`stagingGraph`s, which key blocks by id in a `Map` (`mutator/project.ts:1282-1304`), so
adding a block with an id that already exists collapses in the diff — the new-block
initializer never fires (`:1371-1374`) and the structure ends up with two blocks of the
same id. Export would then emit two entries with the same `id`. Not export's hole to fix,
and `ProjectTemplateV1Schema` rejects duplicate ids at parse, so the exported file cannot
pass validation silently.

## Serializer

`lib/node/pl-middle-layer/src/model/template_serializer.ts`, three layers so each can be
tested and reused separately:

| Function | Does |
| --- | --- |
| `assembleProjectTemplateV1(walk, kindProvider)` | walk output + kind refs → `{ document, problems }` |
| `stringifyProjectTemplateV1(document)` | document → YAML text, `lineWidth: 0` |
| `exportProjectAsTemplateV1(structure, paramsProvider, kindProvider)` | the whole thing, all-or-nothing |

Assembly is dull by design — an entry is the block's id, its widened kind reference, and
the params the walk already collected. `block` is never emitted: the override exists to pin
an implementation against a kind version *range*, and export writes the exact version
(`A-0041`), so it has nothing left to pin.

**The round-trip is asserted on every export, not only in tests.** `exportProjectAsTemplateV1`
runs the import-side `parseProjectTemplateV1` over the document before rendering it. That
is the cheapest possible proof of "export emits exactly what import parses", and it is a
throw rather than a problem: by then the kind grammar was checked by the widening, params
by the walk, and references by the assembler, so a failure means an assembler bug — with
the one known exception of the upstream duplicate-id hole noted under "Template-Local Ids".

**Decision taken, still needs sign-off: kind-less blocks fail the export (option (a)).**
The recommendation under "Kind Reference Read-Back" is implemented, naming every offending
block, and nothing partial is written. Rationale for choosing rather than blocking: (a) is
the only reversible option — relaxing it later is a one-line change, whereas a shipped
export that writes invalid files or silently drops blocks cannot be un-shipped. The other
two remain available; if you want (b), the change is to demote the problem to a warning and
let `findProjectTemplateV1ReferenceProblems` catch whatever the dropped block leaves
dangling.

**Also landed, in `pl-model-common`:** `findProjectTemplateV1ReferenceProblems` returns
`{ entryId, ref, reason, message }` per problem, and `validateProjectTemplateV1References`
is now `.map(p => p.message)` over it. Export needs per-block attribution to report which
block to fix, and the alternative was either parsing the message back apart or duplicating
the traversal. Same messages, so no caller changes.

**What is left, and it is the same blocker as before:** the two providers. `paramsProvider`
and `kindProvider` are both plain functions over a block id, deliberately — the serializer
is pure and fixture-testable — but wiring them to a real project means reading per-block
storage and `bpInfo.config.kind`, which is reachable only from `ProjectMutator`'s batched
loader or inside a Computable. Which one is right depends on the desktop surface, so it
belongs with the desktop command.

## Desktop Command

Spans two repos. Nothing here is verified at runtime — see "What is not proven" below.

**This repo — the providers, which were the standing blocker.** The serializer takes two
plain functions over a block id; supplying them for a real project needs per-block storage
and the container-level kind, and both are only reachable from inside `ProjectMutator`:

| Piece | Where |
| --- | --- |
| `BlockInfo.kind` | carried through the batched loader, `mutator/project.ts` |
| `ProjectMutator.exportAsTemplateV1()` | assembles both providers, calls the serializer |
| `MiddleLayer.exportProjectAsTemplate(id)` | `resolveProjectId` → `withProject`, the entry point |

**The entry point takes a project id, not an open `Project`** (operator decision,
2026-08-03: the command belongs on a project card, not in the File menu). Exporting is a
property of the stored project rather than of a session with it, and from a card the
project is usually closed — `withOpenedProject` would simply throw. Opening one to read it
would spin up trees and watchers for a one-shot read and then have to decide whether to
close them again. This matches how the other card-scoped actions work: `duplicateProject`
and `copyProjectToUser` also go through the middle layer by id. Modelled on
`setProjectMeta` — `resolveProjectId` then `withProject`.

An earlier `Project.exportAsTemplate()` on the open-project object was removed rather than
kept alongside: the id-based method covers the open case too, and two entry points where
one is a strict subset of the other is worse than one.

The kind needed one line in the loader: `bpInfo.config.kind` is read off the container
right where `extractConfig` already runs, so it costs no extra round-trip. This is what the
earlier note about "adding a read to that performance-tuned batching routine would be
guesswork" was worried about, and the worry turned out not to apply — nothing new is
fetched, a value already in hand is kept. `BlockInfo` now carries it alongside `config`,
which cannot: `extractConfig` normalizes the render envelope, one level below the kind.

`exportAsTemplate` is a one-shot `withProject` read, deliberately **not** a `Computable`.
An export is a user action with an answer, not project state to watch, and deriving every
block's params in the VM is far too much to redo on each overview recompute. The mutator
touches no field, so `wasModified` is false and the transaction is never committed.

**`platforma-desktop-app`, branch `MILAB-6648_export-project-as-template`** (branched from
`origin/main`; note `origin/main` carries a change to the same `workerApi.ts`, which does not
overlap these edits):

| Piece | Where |
| --- | --- |
| `ExportProjectAsTemplateResult` | `packages/core/src/types/contract.ts` |
| `exportProjectAsTemplate` worker method | `packages/worker/src/workerApi.ts` |
| `ExportProjectAsTemplate(projectId)` task | `packages/main/src/tasks/` + `tasks/index.ts` |
| "Export as Template..." context-menu item | `packages/renderer/src/start/ProjectCard.vue` |

The command sits in the project card's context menu, next to Share and above Delete — not
in the OS File menu, where an earlier draft put it. The File menu is `setApplicationMenu`,
i.e. the macOS menu bar, which this app's users never look at: the in-app menu is a
separate popup fed by `createMainMenuTemplate`. Unlike Duplicate, the export does not gate
the context menu while it runs, since it only reads.

Three things there are worth knowing:

- **The catalog lags.** The desktop's committed config pins `pl-middle-layer` 1.66.9;
  `exportAsTemplate` is in unreleased 1.66.10. Handled with a *catalog-lag adapter*, the
  convention that file already uses for two other methods — a narrow cast plus a comment
  saying to delete it after the bump. Unlike those two, a missing method here cannot default
  to empty, so it surfaces as "not supported by this version of the platform". Note a
  developer whose working tree activates the local `file:../platforma/...tgz` overrides gets
  1.66.10 and the method in the typings directly, making the adapter redundant *there* — but
  it is what keeps the committed code compiling against the catalog.
- **Render first, ask for a path second.** The opposite order shows a save dialog and only
  then discovers the project cannot be exported — and with kind-less blocks failing, that is
  currently the common outcome, not the rare one.
- **The document does not cross the thread boundary.** The middle layer returns both the
  YAML and the parsed document; the worker rebuilds only `{ ok, yaml }` / `{ ok, problems }`,
  since the text carries the same information and the caller only writes text.

**What is not proven.** Type-checked, linted and formatted in all five touched packages
(three here, three there), and the desktop's `packages/main` suite still passes 31/31. But:

- `ProjectMutator.exportAsTemplateV1` has **no unit test**. Every test that reaches a
  mutator goes through `withTempRoot`, which needs a live backend (`PL_ADDRESS`), so those
  suites do not run locally at all — they are the backend CI monorepo tests. The pure layers
  below it are covered: 20 walk tests, 17 serializer tests, all backend-free.
- The Electron half cannot be exercised without a built app, so "the menu item appears,
  is greyed out with no project open, and the dialog writes the file" is unverified.

## Golden Fixtures

`lib/node/pl-middle-layer/test_fixtures/template-v1/` — five expected `.yaml` files,
driven by `src/model/template_serializer_fixtures.test.ts`. Input side stays in TypeScript
(typed, so a fixture cannot drift from `ProjectStructure`); expected side is a file on
disk, which is the artifact a reviewer reads.

| Fixture | Pins |
| --- | --- |
| `empty-project.yaml` | `blocks: []`, not a bare `blocks:` that parses as null |
| `minimal.yaml` | schema marker first; no `params` key at all when none were derived |
| `linear-chain.yaml` | the canonical shape — three blocks wired up, ids verbatim |
| `nested-params.yaml` | objects in arrays, refs at depth, `{}` and `[]` and `null` |
| `scalar-quoting.yaml` | strings a YAML reader would otherwise turn into something else |

**Plain files, not snapshots** (operator decision, 2026-08-03). There is no snapshot
infrastructure in this repo to fit into — zero `toMatchSnapshot`, zero `__snapshots__` —
and a snapshot comes with `-u`, which rewrites the expectation without anyone reading it.
For a file format promised to a second implementation, changing the expectation should be
a deliberate edit visible in review. Each fixture is also parsed back with the import-side
parser, so a golden file can never be updated to something import cannot read. They live
outside `src/` because this package publishes `src/**/*`.

**They immediately earned their keep: the emitter had an interop bug.** YAML 1.2 dropped
`yes`/`no`/`on`/`off`/`y`/`n` as booleans and dropped sexagesimal integers, so the `yaml`
package — 1.2 by default — was emitting a params value of `"yes"` as bare `yes` and
`"1:30"` as bare `1:30`. Our own parser reads those back as strings, so the round-trip
assertion was green and the field-by-field tests could not see it at all. But PyYAML's
default and Go's `yaml.v2` are **1.1**, where they are `true` and `90`.

Fixed by emitting with `version: "1.1"` while still parsing as 1.2: quote against the
stricter ruleset, read with the looser one, since a quoted scalar means the same thing
under both. It adds no `%YAML` directive — only more quotes. Pinned by a test that asserts
each hazard is quoted, which is the only kind of test that can catch this, precisely
because a self-round-trip cannot.

**What is left here.** Fixtures of a *real* project, i.e. driven through `ProjectMutator`
rather than through the pure serializer. These would catch a provider bug — the current
fixtures verify the format contract, not that reading a real project produces it. They
need a backend, so they belong with the monorepo CI suite.

## Out of scope

- Import / apply (track 3).
- Publishing or browsing templates in-app (`decisions.md:152`).

## Open questions

- Both original open questions are answered above. The live ones are the sign-off items
  under "Schema Prototype", the extra-fields decision under "Template-Descriptor Contract",
  and the kind-less-block decision under "Kind Reference Read-Back" — that last one is now
  **implemented as (a)** rather than blocking, and needs confirming rather than deciding
  (see "Serializer").
- A note on code comments: source comments in this track carry no `A-00NN` citations or
  paths back into these documents — they state the fact inline instead (operator decision,
  2026-08-03). Citations live here, in the tracker.
