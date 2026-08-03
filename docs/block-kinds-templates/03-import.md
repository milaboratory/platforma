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
  derived `any` channel).
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
      was missing and why the shape came out this way. Remaining: `Q-0009` (nothing
      validates params against the kind at this seam yet)
- [~] **Add-block / state API** — landed as `TemplateApplyApi` in
      `lib/node/pl-middle-layer/src/model/template_apply.ts`, together with the fixed
      orchestrator `applyProjectTemplateV1` that drives construction through it and nothing
      else. See "The Construction Contract" below: it came out at **one method**, and the
      reasons for that are the answer to the first open question. Remaining: the
      implementation backed by a real project, which belongs with the engine

**Kind resolution — consumed from track 1**

- [ ] **Resolve `kind@selector` → block pack spec** — owned by track 1 §5 (reconciler
      emits `kinds/{org}/{name}/overview.json`) and §6 (`resolveKind` facade at
      `lib/node/pl-middle-layer/src/block_registry/registry.ts`). **Nothing from track 1
      has landed** — `01-kind-and-lifecycle-implementation-path.md` is a plan with no
      tracker. Import consumes the facade and owns only the per-apply `allowUnstable`
      flag and the mapping of the resolver's three failure reasons to user-facing
      problems. Behind a stub resolver the whole engine below can be built and tested
      first, which is what keeps this track off track 1's critical path
- [ ] **Honor the entry's `block` override** — bypasses resolution entirely
      (`decisions.md:118`); the schema already carries it as `BlockPackReference` with
      `parseBlockPackReference` (`project_template_v1.ts:57,65`). Both paths must converge
      on one prepared-spec seam so construction has a single input

**Engine — parse, validate, construct**

- [ ] **YAML text → document** — `YAML.parse` then the existing `parseProjectTemplateV1`.
      Lives in `pl-middle-layer` beside `template_serializer.ts`, mirroring it: the text
      layer is deliberately out of `pl-model-common` (schema decision #1 in
      `02-export.md`)
- [ ] **Validate before the project exists** — nothing may be created until the whole file
      is known good. Already done by shared code: entry shape, both reference grammars and
      id uniqueness in the parser (`project_template_v1.ts:188-200`), and
      dangling/self/forward references in `findProjectTemplateV1ReferenceProblems`
      (`:279`). Still to add: kind-resolution failures, `Q-0009` params validation, and the
      stale-id guard below — collected into one report rather than a first-failure throw,
      the shape export settled on
- [ ] **Reject params carrying a foreign block id** — the mirror of export's parity guard,
      run over the *input* file (operator decision, 2026-08-03). A reference hidden inside a
      canonicalized-JSON string is invisible to the structural rewrite, so it would survive
      apply naming a UUID from whatever project the file was written in — a valid-looking
      params object wired to nothing. Our own export cannot emit one (`template_export.ts`
      fails the export instead), but a hand-authored file can, and the user cannot see it.
      The detector already exists: `inferAllReferencedBlocks` (`model/args.ts`) recognizes a
      reference both as an object and inside N `JSON.stringify` passes. Run it on each
      entry's params *after* the template-local rewrite — anything it still reports is a
      foreign id, and the file is rejected naming the entry. See "Stale Ids in Strings"
- [ ] **Id map + reference rewrite** — assign a fresh UUID per entry, then
      `fromTemplateForm(params, resolve)` (`template_form.ts:65`, already implemented and
      tested) before params reach the block. Single forward pass: file order is
      instantiation order and forward references are already rejected, so every upstream
      id is mapped by the time it is needed
- [ ] **Construction loop** — create the project, then add entries in file order. Two
      decisions here, both about existing code: `Project.addBlock` does one block-pack
      prepare, one authored transaction and one `refreshState` per call
      (`middle_layer/project.ts:219-269`), so an N-entry template is N transactions —
      acceptable or worth a mutator-level batch pass; and `NewBlockSpec` has exactly two
      arms today, `fromModel` and `legacy` (`mutator/project.ts:317-319`), so seeding from
      params either extends `fromModel` or adds a third
- [ ] **Failure policy — decided: keep the partial project and report** (operator decision,
      2026-08-03). Apply creates the project first, so a failure at entry *k* leaves *k-1*
      blocks behind; unlike export, all-or-nothing is not free here. Deleting the project
      would destroy the only evidence of how far the apply got, and the blocks that did
      land are valid — the user can finish by hand. The report must name the entry that
      failed and how many landed, so a partial project is never mistaken for a complete
      one. Pre-validation above narrows this to genuine runtime failures (backend,
      block-pack fetch)

**Desktop**

- [ ] **"Create Project from Template file…"** — a `TaskCommand` in
      `platforma-desktop-app/packages/main/src/tasks/`, following the shape of the export
      command already on branch `MILAB-6648_export-project-as-template`. Uses the existing
      open-dialog helper (`packages/main/src/dialogs/index.ts:3`), offers the single
      `allow-unstable` checkbox (default off), applies headless, navigates to the result.
      Note: the existing `CreateProject` task also auto-adds the root block pack
      (`tasks/CreateProject.ts:41-52`) — apply must not, the template supplies every block
- [ ] **Entry point placement** — export hangs off the ProjectCard context menu; import
      has no card to hang off, so it belongs on the projects-list surface. Treat UX as
      deferred, as export did

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
  `StorageInitial`, so such an entry applies even to a block built before any of this.
- **Params cross as text, references already resolved.** `undefined` is normalized to `{}` at
  the boundary, because `JSON.stringify(undefined)` is not a string and the callback would be
  handed nothing.
- **A block's init factory decides what is valid.** A factory that throws is reported as a
  per-entry problem, not propagated — the same collect-everything shape export uses.
- **`Q-0009` is still open, and its seam is now fixed.** This is the only place a
  hand-authored file's params meet the kind that types them, so validation, if it happens,
  happens here. Nothing validates today: params reach the factory as-is.

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
| a label | A template names no block instances, so the label comes from the block package's own metadata |
| resolved references | Params cross **in file form**, references still naming entries; rewriting them is the implementation's job, since only it knows the assigned ids. An orchestrator that rewrote them would need the id map, and every orchestrator would own a copy of the same logic |

Two properties follow from this being the contract a sandboxed orchestrator will receive,
and both constrain the eventual implementation:

- **Plain data only.** Arguments and results are JSON values — hence failures as strings in
  a result rather than throws.
- **Synchronous.** Everything slow must already be in hand before the orchestrator runs:
  kinds resolved, block packs fetched, project created. What remains is in-memory work
  inside a single transaction, so no async bridge is needed for the sandbox and an apply
  cannot be interrupted mid-way by a network call. This also settles the transaction
  question in the construction-loop item: prepare all entries up front, add them in one
  mutator pass, rather than one transaction per block as `Project.addBlock` does today.

**Stop at the first failure** — the refinement of the keep-and-report policy. Entries after
the failure may reference it, so continuing would place blocks whose upstream is missing:
a project wired to nothing in the middle is worse than one short a tail. What already
landed is kept and returned, paired file-id to assigned-id, so the caller can say how far
it got.

Pinned by `template_apply.test.ts` (9), driven against a recording fake. That the tests need
no project, backend or registry is itself the check that the contract is narrow enough to
hand to a sandbox.

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
  fail-fast vs collect-all.] The collect-all half is settled by precedent — export reports
  every problem at once; presentation is still open.
- **`Q-0009`** — apply-time validation of untyped YAML params. Since `BlockParams` is a
  pure TS type with no zod (track 1 decision), a hand-authored YAML's params are untyped
  at runtime; how/whether they are validated against the kind on apply is open. The seam
  it would live at is now identified — see "The Missing Half".
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
