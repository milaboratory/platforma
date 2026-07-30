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

- [ ] **Read the kind reference back at runtime** — `{name}@X.Y.Z` from `model.json` into
      the exported template entry (`A-0013`). No kind _resolution_ needed.
- [ ] **Dependency-order walk** of the project's blocks, collecting each block's
      template-descriptor output (`decisions.md:148`).
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

## Out of scope

- Import / apply (track 3).
- Publishing or browsing templates in-app (`decisions.md:152`).

## Open questions

- Both original open questions are answered above. The live ones are the sign-off items
  under "Schema Prototype" and the two decisions under "Template-Descriptor Contract".
