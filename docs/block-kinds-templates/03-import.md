# Track 3 — Import / Apply

**Status: preamble + high-level TODO.** Dependency ordering and grounded entry points,
not a per-file implementation path.

Authoritative design: `docs/text/work/projects/block-kind-and-templates/decisions.md`,
section *Template engine and Desktop* (`decisions.md:125-152`).

## Goal

Apply a hand-authored or exported `template-v1` YAML into a **new** project: parse,
validate, resolve each entry's kind, create the project, add blocks in file order,
navigate to the result.

## In scope

- **Fixed native YAML lambda** — the degenerate orchestrator hardcoded in TypeScript;
  no QuickJS sandbox in v1 (`decisions.md:127`).
- **Add-block / state API** — designed and used as the injected-lambda contract even
  though the only v1 caller is native; the lambda reaches construction only through it
  (`decisions.md:129`). Deriving this API is a hard requirement.
- **Kind resolution** — resolve each entry's `kind@selector` off the per-kind
  `overview.json` projection (single read + client-side semver; depends on track 1).
  Selectors: `@X.Y.Z` / `~X.Y.Z` / `^X.Y.Z`. `allow-unstable` switches from the `stable`
  set to the derived `any` set for the whole apply (`A-0034`, `A-0039`).
- **Reference resolution** — engine maps each template-local `id` → fresh project-local
  UUID and rewrites references to concrete *before* params reach a block's init lambda;
  the block never sees an unresolved reference (`decisions.md:137,141`).
- **Desktop command** — "Create Project from Template file…", headless apply, single
  `allow-unstable` checkbox (default off) (`decisions.md:147`).
- **Validation failures** — surfaced per stage, each identifying the failing entry and
  cause; taxonomy/presentation left open (`decisions.md:150`).

## Depends on

- Track 1 kind resolution (per-kind `overview.json` projection, `~`/`^` selectors,
  derived `any` channel) — **landed** in `2c2c15b3d`, see "Where the Adapter Actually
  Stands".
- The `template-v1` schema shared with export (track 2).

## Out of scope

- QuickJS sandbox host and template-delivered custom lambdas (`decisions.md:127-131`).
- Applying into an **existing** project (`decisions.md:147`).
- Guided wizard and settings modal (`decisions.md:145`).

## High-Level TODO

Dependency-ordered. Use `[~]`/`[x]` as work lands, matching the tracker convention in
`01-kind-and-lifecycle.md` and `02-export.md`. Every path:line below was read, not
inferred.

**Contracts first (these two gate everything else)**

- [~] **Params → initial storage (facade callback #8)** — landed as
      `__pl_storage_initialFromParams`, a **new** callback rather than a widened
      `StorageInitial`, wired end to end: `DataModel.getDataFromParams` →
      `createInitialStorageFromParams` → registration in `BlockModelV3.done()` →
      `ProjectHelper.getInitialStorageFromParamsInVM`. See "The Missing Half" below for what
      was missing and why the shape came out this way. `Q-0009` — validating those params
      against the kind — is now answered too; see "Params Against Their Kind"
- [~] **Add-block / state API** — landed as `TemplateApplyApi` in
      `lib/node/pl-middle-layer/src/model/template_apply.ts`, together with the fixed
      orchestrator `applyProjectTemplateV1` that drives construction through it and nothing
      else. See "The Construction Contract" below: it came out at **one method**, and the
      reasons for that are the answer to the first open question. Remaining: the
      implementation backed by a real project, which belongs with the engine

**Kind resolution — consumed from track 1**

- [~] **Resolve `kind@selector` → block pack spec** — the import side landed as
      `resolveTemplateEntries` in `lib/node/pl-middle-layer/src/model/template_resolve.ts`,
      against the `BlockPackProvider` port. Import owns the per-apply `allowUnstable` flag
      and turning the three failure reasons into messages, both done and tested against a
      fake provider. **Correction to an earlier entry here, which claimed nothing from
      track 1 had landed:** `2c2c15b3d` (2026-07-24, "prototype the block-kind subsystem")
      landed §5 and §6 — `RegistryV2Reader.getKindOverview` / `resolveKind`, the pure
      `resolveKind` + `KindResolutionError` in
      `tools/block-tools/src/v2/registry/kind_resolver.ts`, and the
      `BlockPackRegistry.resolveKind` / `getOverview` facade
      (`src/block_registry/registry.ts:292-323`). Remaining: the adapter, which is now
      unblocked — see "Where the Adapter Actually Stands"
- [~] **Honor the entry's `block` override** — same module, converging on the same
      `BlockPackSpec` as the kind path (`decisions.md:118`). Includes the npm-name →
      `{organization, name}` split the schema left to import (`project_template_v1.ts:52-56`),
      as `parseBlockPackName`

**Engine — parse, validate, construct**

- [x] **YAML text → document** — `parseProjectTemplateV1Yaml` in
      `lib/node/pl-middle-layer/src/model/template_parser.ts`, mirroring
      `template_serializer.ts` on the other side. Most of the work turned out to be
      diagnostics rather than parsing — see "Reading a File Someone Wrote By Hand"
- [~] **Validate before the project exists** — `validateTemplateV1ForApply` in
      `lib/node/pl-middle-layer/src/model/template_validate.ts`: reference consistency plus
      the foreign-id guard, grouped by entry in file order. Entry shape, both grammars and
      id uniqueness are already the parser's (`project_template_v1.ts:188-200`). Params
      against their kind is `Q-0009`, now **resolved and implemented** — see "Params
      Against Their Kind". The single report every stage feeds is `TemplateApplyReport`,
      assembled by the driver
- [x] **Reject params carrying a foreign block id** — same module (operator decision,
      2026-08-03), using `inferAllReferencedBlocks` (`model/args.ts`), the detector export's
      guard uses. **Correction to this plan:** it runs on the file-form params *before* any
      rewrite, not after. In file form a legitimate reference is `{ block, output }`, which
      the detector does not recognize at all, so everything it finds is foreign by
      construction — nothing to subtract, and the check lands before the project exists,
      where the plan says validation belongs. See "Stale Ids in Strings"
- [x] **Id map + reference rewrite** — `createTemplateIdMap` in
      `lib/node/pl-middle-layer/src/model/template_ids.ts`: assign a fresh UUID per entry,
      then `fromTemplateForm(params, resolve)` (`template_form.ts:65`, already implemented
      and tested) before params reach the block. Single forward pass, as planned — file
      order is instantiation order and forward references are already rejected, so every
      upstream id is mapped by the time it is needed. Assignment and publication came out
      as two steps rather than one; see "Two Steps, Not One"
- [x] **Construction loop** — `createTemplateApplyApi` in
      `lib/node/pl-middle-layer/src/mutator/template_construct.ts` is the in-transaction
      half, `MiddleLayer.applyTemplateToProject(id, document, provider, options)` the
      driver. Both decisions the plan left open are resolved, and neither the way it
      guessed: **one** transaction rather than N, because the construction contract already
      committed to a synchronous API and `Project.addBlock` is async end to end; and
      `NewBlockSpec.fromModel` gained an optional `initialStorage` rather than a third arm,
      because seeding from params produces exactly the storage the block would have written
      itself. See "Four Stages, and Where the Project Appears"
- [x] **Failure policy — keep the partial project and report** (operator decision,
      2026-08-03). Wired: the three stages before construction create nothing, so a bad
      file leaves the project untouched, and a failure inside construction commits the
      blocks that landed and reports the entry that stopped it. **Correction to this plan:**
      apply does *not* create the project — the caller does, which is what makes the first
      three stages free of cleanup. Deleting the project was never on the table for the
      same reason it was rejected here: the blocks that landed are valid and the report is
      the only record of how far it got

**Desktop**

- [x] **"Create Project from Template file…"** — `CreateProjectFromTemplate` in
      `platforma-desktop-app/packages/main/src/tasks/`, over a `createProjectFromTemplate`
      worker method. Asks for the file first (the reverse of export, which must render
      before it can offer a path), parses before creating anything, then navigates to the
      result. The root block pack the existing `CreateProject` auto-adds
      (`tasks/CreateProject.ts:41-52`) is deliberately absent — the template supplies every
      block. `allow-unstable` is a task option, default off, with no control yet: the
      checkbox belongs with the dialog that does not exist. See "The Desktop Command"
- [x] **Entry point placement** — a ghost button beside "Create New Project" on the
      projects list, where the create flow already lives; import creates a project, so it
      has no card to hang off. UX deferred as export's was: a button and a native alert,
      no dedicated dialog

**Validation**

- [ ] **Apply the golden fixtures** — the five files under
      `lib/node/pl-middle-layer/test_fixtures/template-v1/` are ready-made inputs, and
      `scalar-quoting.yaml` covers the scalar hazards a hand-authored file brings. Needs a
      stub kind resolver plus a stub block-pack preparer to run without a registry
- [ ] **Round-trip** — export → import → equivalent project. The north-star acceptance
      criterion and the last open checkbox in `02-export.md`. Defining "equivalent" is
      part of the work: structure order, per-block derived args, not resource ids

## The Missing Half — Params → Initial Storage

Export's callback #7 turns a block's stored data into params. Apply needs the inverse, and
**it does not exist at runtime today** — verified end to end:

- The type channel is already there: `DataCreateFn<T, Params> = (args: { params?: Params })
  => T` (`sdk/model/src/block_migrations.ts:13`), and a kind's `Params` "flows into
  `.init()`" through `DataModelBuilder` (`:542-555`).
- Nothing ever fills it. `DataModel.initialData()` and `getDefaultData()` both call
  `initialDataFn({})` (`:667`, `:675`), so `params` is always `undefined`.
- The facade callback takes no arguments — `StorageInitial: () => StringifiedJson`
  (`sdk/model/src/block_storage_facade.ts:192`) — and neither does its middle-layer
  invoker, `ProjectHelper.getInitialStorageInVM(blockConfig)`
  (`model/project_helper.ts:250`). Its three callers are new-block creation
  (`mutator/project.ts:1221`, the `fromModel` arm of `initializeNewBlock` — the exact seam
  apply needs), `resetToInitialStorage` (`:857`) and `migrateBlockPack` (`:1541`).

### What Landed

A params-carrying variant at every one of those layers, mirroring what export added for #7:

| Layer | Added |
|-------|-------|
| `sdk/model/src/block_migrations.ts` | `DataModel.getDataFromParams(params)` beside `getDefaultData()` |
| `sdk/model/src/block_storage_callbacks.ts` | `createInitialStorageFromParams`, sharing `assembleStorage` with `createInitialStorage` |
| `sdk/model/src/block_storage_facade.ts` | `StorageInitialFromParams: "__pl_storage_initialFromParams"` and its signature |
| `sdk/model/src/block_model.ts` | registration in `done()` |
| `lib/node/pl-middle-layer/src/model/project_helper.ts` | `getInitialStorageFromParamsInVM(blockConfig, params)` |

Pinned by `sdk/model/src/template_init.test.ts` (11) and
`lib/node/pl-middle-layer/src/model/project_helper_params_init.test.ts` (7). The middle-layer
tests drive a hand-written model bundle, which is what lets every failure branch be
exercised on purpose — and needs neither a built block nor a backend.

**A new callback, not a widened `StorageInitial`** — the one decision worth recording. A
widened callback is the smaller surface, but a block bundled with an older SDK would still
accept the call and ignore the extra argument, producing a default-initialized block that
looks like a successful apply. A separate callback is simply absent from such a block, so the
middle layer sees it missing and says so. That asymmetry between *cannot* and *silently did
not* is the whole argument, and it matches the facade's own rule that new callbacks are the
compatible way to extend it (`block_storage_facade.ts:25-32`).

Consequences worth knowing:

- **The params-less path is untouched.** An entry with no `params` goes through the existing
  `StorageInitial`, so such an entry applies even to a block whose model predates the new
  callback. Not to one predating the storage facade itself, though — construction refuses
  those outright, for a reason that has nothing to do with params; see "Four Stages, and
  Where the Project Appears".
- **Params cross as text, references already resolved.** `undefined` is normalized to `{}` at
  the boundary, because `JSON.stringify(undefined)` is not a string and the callback would be
  handed nothing.
- **A block's init factory decides what is valid.** A factory that throws is reported as a
  per-entry problem, not propagated — the same collect-everything shape export uses.
- **`Q-0009` was answered at this seam.** It is the only place a hand-authored file's params
  meet the kind that types them, and that is where the check landed — see "Params Against
  Their Kind".

## The Construction Contract

`TemplateApplyApi` is one method — `addBlock({ id, params? }) → { ok, blockId } | { ok, error }`
— and the fixed orchestrator that drives it is a dozen lines. That is the design, not an
unfinished draft: everything an orchestrator does not decide was pushed to the
implementation, because every one of those decisions is either unsafe or duplicated work if
an orchestrator makes it.

What is deliberately **not** in the request, and why:

| Absent | Why |
|--------|-----|
| block pack / kind / version | The entry is named by its template-local `id` and the implementation looks up what it already resolved for it, so no orchestrator can substitute an implementation the document was never validated against |
| the project-local id | Assigned by the implementation, which keeps the id map in the one place that needs it to rewrite references |
| a label | A template names no block instances, so the label is the implementation's to choose — the block package's own title once the provider returns it, the entry's id until then |
| resolved references | Params cross **in file form**, references still naming entries; rewriting them is the implementation's job, since only it knows the assigned ids. An orchestrator that rewrote them would need the id map, and every orchestrator would own a copy of the same logic |

Two properties follow from this being the contract a sandboxed orchestrator will receive,
and both constrain the eventual implementation:

- **Plain data only.** Arguments and results are JSON values — hence failures as strings in
  a result rather than throws.
- **Synchronous.** Everything slow must already be in hand before the orchestrator runs:
  kinds resolved, block packs fetched, project created. What remains is in-memory work
  inside a single transaction, so no async bridge is needed for the sandbox and an apply
  cannot be interrupted mid-way by a network call. This also settled the transaction question
  in the construction-loop item before it was asked: prepare all entries up front, add them
  in one mutator pass, rather than one transaction per block as `Project.addBlock` does.

**Stop at the first failure** — the refinement of the keep-and-report policy. Entries after
the failure may reference it, so continuing would place blocks whose upstream is missing:
a project wired to nothing in the middle is worse than one short a tail. What already
landed is kept and returned, paired file-id to assigned-id, so the caller can say how far
it got.

Pinned by `template_apply.test.ts` (9), driven against a recording fake. That the tests need
no project, backend or registry is itself the check that the contract is narrow enough to
hand to a sandbox.

## Reading a File Someone Wrote By Hand

`parseProjectTemplateV1Yaml(text)` is two library calls — `YAML.parse` then the shared
`parseProjectTemplateV1` — wrapped in the diagnostics that make the difference between a
file someone can fix and one they can only re-generate. Export's reader was always our own
output; this one's input is a person's.

Failures return one message rather than per-entry problems: until the document parses there
are no entries to attach anything to. The message is multi-line when the file has several
fixable issues, because fixing it should take one pass.

Cases given their own wording, each replacing something unhelpful:

| Input | Instead of | Says |
|-------|-----------|------|
| empty / blank / comments only | `expected object, received null` | "The file is empty." |
| top-level scalar or list | `expected object, received array` | what a template's top level looks like |
| `schema: template-v2`, or no `schema` | `Invalid literal value, expected "template-v1"` | that this is not a template-v1 file, and what it claims to be |
| YAML syntax error, repeated key, tab indent | the library's code frame | the same message trimmed to `at line L, column C` |
| schema issues | `blocks.0.kind` | `blocks[0].kind`, counted and listed together |

Two behaviours worth knowing, both pinned by tests:

- **Read as YAML 1.2**, while export quotes as if for 1.1. Deliberate on both ends: quoting
  against the stricter ruleset makes a file we write mean one thing to every reader, and
  reading with the looser one keeps a hand-written bare `yes` or `1:30` the string it looks
  like instead of `true` or `90`.
- **Repeated keys are an error**, not last-wins. A copied entry with a field left unchanged
  would otherwise apply, wrongly and silently.

Pinned by `template_parser.test.ts` (18), which also parses every golden export fixture and
round-trips document → text → document, so the two text layers are checked against each
other and not only against files.

## Params Against Their Kind — `Q-0009` Resolved

**A kind may ship a runtime check for its params** (operator decision, 2026-08-03, chosen
to spend build-time effort instead of debugging time later). `defineBlockKind` gains an
optional `parseTemplateParams: (value: unknown) => BlockParams`; the SDK applies it wherever
params arrive untyped, and the middle layer can ask for it alone as a pre-flight.

This narrows track 1's "`BlockParams` is a pure TS type" decision rather than reversing it:
the type stays the contract, `parseTemplateParams` is optional, and a kind that omits it
behaves exactly as before.

### Why it was worth doing

Measured on `enter-numbers` (kind params `{ numbers?: number[] }`) before the check existed
— params straight from a file, through init, to derived args:

| YAML | Was | Now |
|------|-----|-----|
| `numbers: [3,1,2]` | `args={numbers:[1,2,3]}` | accepted |
| `number: [3,1,2]` (typo) | block created empty, later "Numbers are required!" | `Unrecognized key(s) in object: 'number'` |
| `numbers: ["3","1","2"]` | **silently** `args={numbers:["1","2","3"]}` — numeric sort became lexicographic | `numbers[0]: Expected number, received string; …` |
| `numbers: "1,2,3"` | `args() threw: not a function` | `numbers: Expected array, received string` |
| `numbers: [1], colour: red` | extra key silently dropped | `Unrecognized key(s) in object: 'colour'` |
| `numbers: null` | block created empty, later "Numbers are required!" | `numbers: Expected array, received null` |

The third row is the one that mattered: no error anywhere, and a wrong scientific result.

### Shape of it

- **The kind owns the check, not the block.** Many block versions implement one kind; a
  per-block check could drift between them and from the type.
- **`.strict()` is where most of the value is.** Two of the six rows above are a
  misspelled or stray key — invisible to any type-shaped check that only looks at what it
  knows about.
- **The parser returns the params to use**, so it can strip and coerce; its output is what
  reaches the block's `init`.
- **TypeScript keeps schema and type in step**: the parser must return `BlockParams`, so a
  schema missing a declared field does not compile. A schema *looser* than the type is not
  caught — the honest limit.
- **Two call sites, one function.** Facade callback #9 `__pl_templateParams_validate` is
  the pre-flight (`ProjectHelper.validateTemplateParamsInVM`) — nothing is created, so a bad
  file is reported entry by entry with no project to half-build. Callback #8 re-checks
  anyway, so the factory can never be handed params the kind refused, whichever path got
  there.
- **`checked: false` is not a failure.** It reports that the kind declares no check. A
  block whose model predates the callback is treated the same way: the pre-flight creates
  nothing, so proceeding costs nothing, and the entry still fails clearly when applied.
- **Rejections are rendered, not dumped.** A zod error's own `message` is its whole issue
  array as JSON; the SDK duck-types `{ issues: [{ path, message }] }` and renders
  `numbers[0]: Expected number, received string`, matching how the file is written. No
  schema library is prescribed or depended on.

### Cost, measured — and the build change it forced

Declaring the schema first grew `enter-numbers`' model bundle **382 kB → 501 kB**: zod was
bundled *inside* the kind's own `dist/kind.js` (that build inlines everything) and so arrived
as a second copy alongside the model's own zod. Not a static cost —
`executeSingleLambda` evaluates the whole model bundle on **every** callback invocation, so a
duplicated dependency is paid per call.

**Fixed by building a kind twice, the way a model already is** (operator direction):

| Artifact | Dependencies | Who consumes it |
|----------|--------------|-----------------|
| `dist/index.js` / `index.cjs` | external | blocks importing the kind |
| `dist/kind.js` | inlined | the registry, and `build-kind-manifest`'s hash |

`createRolldownBlockKindConfig` now prepends the standard node config, and the structurer's
`kind-package-json` rule points `main`/`module`/`types`/`exports` at the externalized pair
(all three of `import`/`require`/`default` spelled out, since `build-model` reaches a kind
through `require`). The self-contained bundle stays on disk for the registry and is no longer
an entry point.

Result: **382 kB → 401 kB**, one copy of zod in the bundle (verified), i.e. ~19 kB for the
schema itself instead of ~119 kB for the schema plus a duplicate library. A kind that
declares no check still pays nothing.

## Validation: Two Checks, One Report

`validateTemplateV1ForApply(document)` holds everything knowable from the document alone —
no registry, no project. That placement is the substance of the check: the same findings
made one stage later would have to be reported against a half-built project.

- **References name an earlier entry.** Detection is shared with export
  (`findProjectTemplateV1ReferenceProblems`); the wording is not. Export tells a developer
  their project cannot be written out; this tells a reader which edit fixes their file —
  "move 'b' above this entry", not "blocks order is the instantiation order". The shared
  finding is structured (`reason` is a discriminant) precisely so each direction can word
  it for its own reader.
- **No params carry a block id from another project.** The mirror of export's guard, and
  the reason it is cheap: in file form a legitimate reference is `{ block, output }`, a
  shape `inferAllReferencedBlocks` does not recognize, so anything it finds is foreign with
  nothing to subtract. Caught in an object, in a canonicalized string, and through repeated
  `JSON.stringify` nesting — the enrichment case that started this.

Problems are grouped by entry in file order, so the report reads alongside the file and an
entry's problems appear together. Everything is collected: three mistakes, one pass.

Params against their kind are checked separately, and one stage later: that check needs each
entry's block config, which only exists once resolution has fetched it. See "Params Against
Their Kind".

Pinned by `template_validate.test.ts` (14). Two of them exist to keep the guard from
over-reaching: a `{ block, output }` reference must not be mistaken for a foreign id, and a
uuid that is merely *data* in params — a sample id, a note — must be left alone.

## Resolution, and What It Left Open

`resolveTemplateEntries(document, provider, { allowUnstable })` is the first stage of an
apply and the only one that touches the network. It runs before the project exists, which
is what makes "no block for this entry" a message about a file rather than a half-built
project — and, since it hoists all the slow work, it is also what lets the construction API
be synchronous.

Both of an entry's routes to an implementation go through `BlockPackProvider` and come back
as the same `BlockPackSpec`, so nothing downstream cares which route an entry took:

| Route | Port method | When |
|-------|-------------|------|
| kind selector | `byKind(kind, { allowUnstable })` | the normal case |
| pinned version | `byExactVersion(id)` | the entry carries a `block` override |

Import owns the messages, and each of the resolver's three failure reasons has a different
way out — which is the reason they stay distinct rather than collapsing into "not found":
the selector matches no published kind version (the file or the registry is wrong), the kind
version exists but nothing implements it (nothing can be installed yet), or implementations
exist but none is stable (**import again with unstable allowed** — the only one the reader
can clear without editing the file, and the reason the checkbox exists). Every entry is
attempted and every failure collected, so an unapplicable file takes one pass to fix.
`resolved` shorter than the document is the signal not to apply it.

`allowUnstable` is per apply, never per entry: a file that resolved some entries to stable
blocks and others to pre-releases would be unreproducible in a way the file itself does not
record.

**Open — which registry.** A template names no registry, and both routes need one. The port
keeps that on the far side deliberately (it is a property of the environment, not the file),
but the adapter has to answer it: the primary registry only, or every configured one in
order, with a policy for a name that exists in two. Worth settling before the adapter, since
it also decides what "not found" means in a multi-registry setup.

## Where the Adapter Actually Stands

This tracker said for three entries that nothing from track 1 had landed. That was wrong,
and it made the adapter look blocked when it is not. `2c2c15b3d` (2026-07-24) landed the kind
subsystem prototype, including everything the port needs:

| Port method | What already exists |
|-------------|---------------------|
| `byKind` | `BlockPackRegistry.resolveKind(registryId, ref, { allowUnstable })` (`block_registry/registry.ts:314`) → `RegistryV2Reader.resolveKind` → `getKindOverview` + the pure `resolveKind` in `block-tools/src/v2/registry/kind_resolver.ts` |
| `byExactVersion` | `BlockPackRegistry.getOverview(registryId, id, channel)` → `RegistryV2Reader.getSpecificOverview`, which returns `{ id, meta, spec }` |

The reader's own `KindResolution` carries **exactly** the three reasons this port declares —
`no-matching-kind-version`, `no-implementation`, `no-stable-implementation` — because the port
was written against it. The one shape difference is real and unchanged: the reader *throws*
`KindResolutionError` where the port returns a union, so the adapter's `byKind` is a
try/catch that reads `e.reason`.

What is still genuinely open is the registry question below, plus `registryId`: both facade
methods take one, while a resolved spec carries a `registryUrl`. The adapter picks the
registry, so it has the id in hand — but that is the same decision as "which registry", not a
separate one.

## The Label, and Why It Is the Registry's

A block created from a template is placed under the block package's published title, which
resolution carries as `ResolvedEntry.title`. The first implementation used the entry's own id
instead, which is wrong in a way worth recording, because the reasoning that produced it was
plausible:

- **An exported template names its entries by the source project's block ids**
  (`template_export.ts:19-22`), which the golden fixtures show as
  `aaaaaaaa-0000-4000-8000-000000000001`. So "the id is what the file called this block" holds
  only for hand-written files — on the export → import path it is a UUID.
- **That UUID would be visible.** `project_overview.ts:288` computes `label: title ??
  defaultLabel`, where `title` comes from the model's own `title` lambda and `defaultLabel` is
  the structure's `label`. Nine of the 63 blocks in `blocks/*` declare no `title` lambda —
  `graph-maker`, `table`, `differential-expression`, `blast`, `makeblastdb`, `gene-browser`,
  `immuno-match`, `import-bulk-count-matrix`, `xsv-import` — and the desktop renders
  `overview.title`, so for those the label *is* the name in the sidebar.
- **`Block.label` is `@deprecated` but not optional**, and there is no replacement field to
  write instead: `title`/`subtitle` are render lambdas in the block's config, not project
  state. So the question was never whether to write it, only what to write.
- **The middle layer has no other source, by construction.** `Project.addBlock` takes the
  label as an argument precisely because of that, and both desktop callers pass
  `pack.meta.title` off a registry listing they already fetched for display
  (`AddBlockModal/components/DetailedCard.vue:123`, `main/src/tasks/CreateProject.ts:50`). A
  prepared block pack carries the model, the workflow and the frontend; none of them names the
  block. The update watcher returns specs, not meta.

Hence `title` on the port, required rather than optional: an adapter always has one — it reads
the manifest — and every fallback a caller downstream could invent is worse than asking.

**Cost, and a cheaper follow-up.** On the pinned route it is free: `getSpecificOverview`
already returns `meta`. On the kind route the adapter needs one extra manifest read after
`resolveKind`. Note that `prepare` *already* reads that manifest — `getComponents`
(`registry_reader.ts:250-265`) parses all of it and keeps only the component URLs in its LRU.
Widening that cache to retain `description.meta` would make the title free on both routes; it
touches block-tools' caching, so it is a follow-up rather than part of this.

## What Import Gets For Free

Track 2 left more than the schema behind. Already implemented and tested, consumed by
import unchanged: `parseProjectTemplateV1` (shape, grammars, id uniqueness),
`findProjectTemplateV1ReferenceProblems` (self / unknown / forward, structured),
`fromTemplateForm` (the apply half of the params codec), the selector grammar in
`kind_selector.ts` (`~`/`^`/exact, which track 1's `selectorToRange` translates to semver
ranges), and five golden `template-v1` files.

## Open questions

- ~~[TODO: concrete add-block API shape — add-by-kind vs add-by-exact-version,
  inter-block reference resolution order (`decisions.md:133`).]~~ **Answered** — see "The
  Construction Contract". Neither: an orchestrator adds by *entry*, and which
  implementation that entry resolved to is not its to choose. Reference order is the single
  forward pass, and the rewrite itself never crosses the API.
- [TODO: concrete type for a template-local reference — distinct unresolved type vs
  reused reference shape (`decisions.md:143`).] **Answered by track 2**: a distinct type,
  `TemplateLocalRef`, recognized structurally by the reserved `{ block, output }` shape.
  Confirm rather than re-decide.
- [TODO: validation taxonomy and presentation — blocking dialog vs inline list,
  fail-fast vs collect-all.] **Fail-fast vs collect-all is settled**, and by stage rather
  than by taste: everything that creates nothing collects every problem, placement stops at
  the first. One report shape carries both (`TemplateApplyReport`). Presentation is still
  open, and is the desktop's.
- ~~**`Q-0009`** — apply-time validation of untyped YAML params.~~ **Resolved** (operator
  decision, 2026-08-03): a kind may declare `parseTemplateParams`, optional, applied wherever
  params arrive untyped. See "Params Against Their Kind" — including the bundle-size cost,
  which is the one part still open.
- ~~References inside a `PObjectId` string are invisible to the structural rewrite —
  decide whether apply rejects them.~~ **Decided: apply rejects** (operator decision,
  2026-08-03). See "Stale Ids in Strings" and the guard in the validation stage.

## Stale Ids in Strings

Why the guard above exists, since the case is easy to miss. An ordinary inter-block
reference is an object, so the rewrite sees it:

```ts
{ __isRef: true, blockId: "aaaaaaaa-…-0001", name: "clonotypes" }
```

An enrichment reference carries the same object *inside a string*: `EnrichmentRef.hit` and
`EnrichmentStep.linker` are `PObjectId`s in global form, i.e. `canonicalize` of exactly that
object (`lib/model/common/src/ref.ts:139-151`):

```yaml
params:
  enrichment:
    __isEnrichment: v1
    hit: '{"__isRef":true,"blockId":"aaaaaaaa-0000-4000-8000-000000000001","name":"clonotypes"}'
```

`mapTemplateRefs` reaches `hit`, finds a string, and returns it untouched. On apply the
entry's own id is remapped to a fresh UUID and every `{ block, output }` is rewritten, while
this string keeps pointing at a UUID from the project the file was written in — a block that
does not exist here. Nothing throws: the shape is valid, the schema is valid, the params
merely name nothing. That silence is the reason to reject rather than warn.

Rewriting inside the string was rejected instead: it would require matching the escape
depth on both sides, and no block is known to put an enrichment reference in its params.

## Two Steps, Not One

`createTemplateIdMap` is the whole of the id map: `assign` hands an entry a project-local
UUID, `record` publishes it as a reference target, and `liveParams` rewrites one entry's
params from file form into live form. It lives with the `TemplateApplyApi` implementation
rather than with the orchestrator, because an orchestrator that knew the map would also own
the rewrite, and every orchestrator would then carry a copy of it.

The plan said "assign a fresh UUID per entry, then rewrite" — one step. It came out as two,
and the split is the only design content in the module. An id is generated when a block is
about to be created, but only becomes resolvable once the block exists, so the window
between the two is where a per-entry pass rewrites that entry's params. Two things fall out
of it, both for free:

- **An entry cannot reference itself.** Its own id is still unpublished while its params are
  being rewritten, so a self-reference is reported instead of silently connecting a block to
  its own output.
- **Params are never wired to a block that failed to be created.** Which matters
  specifically here: a failed apply keeps the blocks that already landed, so there is no
  unwind to hide a bad mapping.

Both are already rejected by validation. The point is not to check twice — it is that the
map's ordering makes the failures unreachable rather than trusting an earlier stage, and if
one does arrive it comes back as a reported problem rather than a throw. That direction is
forced: by the time params are rewritten, earlier blocks are in the project, and the failure
policy is to keep them and say how far the apply got. A duplicate `assign` is the one thing
that does throw — entry ids are unique by the schema, so a second assignment for the same
entry means the document never went through the parser, and the first block would be
silently orphaned.

Id generation is injectable, defaulting to the `randomUUID` that `Project.addBlock` would
have used itself. That is what lets `template_ids.test.ts` (15) run the forward pass —
assign, rewrite, create, record over a three-entry chain — with named ids and no project.

## Four Stages, and Where the Project Appears

`MiddleLayer.applyTemplateToProject(id, document, provider, options)` is the driver, and
`createTemplateApplyApi` is what it hands the orchestrator inside the transaction. The
stages, in order:

| Stage | Creates | On failure |
|-------|---------|------------|
| check the document | nothing | every problem at once, project untouched |
| resolve every entry | nothing | every problem at once, project untouched |
| prepare every block | nothing in the project | every problem at once, project untouched |
| place the blocks | the blocks | stops at the entry, keeps what landed |

The ordering is the whole failure policy. Three stages that create nothing means almost
every way a template can be wrong is reported with nothing to clean up, and the one stage
that does create is left with only in-memory work — which is what lets it be a single
transaction, and what made the synchronous construction contract implementable.

**The project is the caller's.** The plan said apply creates it; it does not. Applying a
template is a property of the stored project rather than of a session with it — the same
reasoning `exportProjectAsTemplate` uses — so the entry point takes a project id, and
"Create Project from Template file…" is `createProject` followed by this. That also removes
the awkward case the plan carried: a document that fails validation would otherwise have
left an empty project behind.

Two plan questions resolved, neither the way it framed them:

- **N transactions or a batch?** Neither was open, in the end. The construction contract
  fixed a synchronous `addBlock`, and `Project.addBlock` is async end to end — prepare, cache,
  transaction, refresh — so it cannot be called from one. Everything slow is hoisted into
  stage 3 and the transaction is entered once. The mutator's own `addBlock` is called N times
  inside it, which is in-memory work.
- **`NewBlockSpec`: extend `fromModel` or add a third arm?** Extended, with an optional
  `initialStorage`. What comes back from the block's params initializer is the same storage
  that block would have written itself, so args derivation downstream is untouched — this is
  `fromModel` with one input supplied, not a new mode. Passing it in rather than having the
  mutator call the VM is also what keeps the rejection *outside* the mutation: params a block
  declines are a reported problem, and the mutator gains no failure path it did not have.

Two smaller things the implementation settled:

- **A block too old for the facade is refused**, even with no params to ignore. Every entry
  names a kind and a block predating the facade implements none, so creating one would honour
  the entry's pinned version while contradicting the kind it claims. Kind resolution cannot
  produce this; a `block` override can.
- **The pre-flight params check runs on the live shape with the file's own ids**
  (`liveParamsForCheck`). Checking the file form directly would fail every entry that carries
  a reference: a kind describing a param as a reference sees `{ block, output }` and rejects
  it. Feeding it `PlRef`s whose `blockId` is still a template-local id asks the only question
  this stage can answer — are the params the right shape — and leaves what they point at to
  validation, which already owns it.

The label is the block package's published title, carried from resolution. It went in as the
entry's own id first, which would have put UUIDs in the sidebar — see "The Label, and Why It
Is the Registry's".

Pinned by `template_construct.test.ts` (13), which fakes the one mutator method construction
uses and keeps everything else real: a real `ProjectHelper`, a real model VM, real block code.
The driver itself is not covered — it needs a backend — which is why nothing but sequencing
lives in it.

## The Desktop Command

`CreateProjectFromTemplate` (main) over `createProjectFromTemplate` (worker), with a ghost
button beside "Create New Project". The flow, and the two decisions in it:

1. Ask for the file. **First**, unlike export, which has to render the document before it
   can offer a save path — here the file is the input, so there is nothing to compute
   before asking.
2. Read it, derive the project's label from the file name, deduplicate against existing
   labels (`Name (2)`, the shape `DuplicateProject` already uses).
3. Parse. A file that is not a template creates nothing.
4. `createProject`, then `applyTemplateToProject`.
5. Navigate to the project.

**The label comes from the file name, not a prompt.** Export names its file after the
project's label (`My-Study.template.yaml`), so stripping the two suffixes recovers it and
the round trip keeps the name. It also keeps the command at one dialog, which is the whole
UX budget this step has.

**Landing nothing drops the project again.** The middle layer's stages that create nothing
run *inside* `applyTemplateToProject`, so the worker has to create the project before it can
learn that, say, resolution failed — and then it holds an empty project the user never
asked for. So: zero blocks added and at least one problem → delete it and report. An empty
project is not a partial result, it is litter, and it is seconds old. One or more blocks
added → keep, navigate, and say what is missing, since a project short a few blocks looks
exactly like a complete one.

`allow-unstable` is a task option defaulting to off, with nothing wired to it yet. The
checkbox the plan calls for belongs with the import dialog, and the dialog is the deferred
part; the resolution path already honours the flag, and it is one argument away.

**Not exercised end to end, and cannot be yet.** `byKind` asks a registry for a kind
projection, and no published block declares a kind — `sdk/block-kind` exists only on this
branch. Until a kind is published, the only template that can apply against a real registry
is one whose entries carry a `block` override, which takes the `byExactVersion` route. That
is the check to run first once a kind ships.
