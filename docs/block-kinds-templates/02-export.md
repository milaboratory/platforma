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
back at runtime for the exported `templateEntry` (`A-0013`) — plus a block's
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
- [ ] **Define the template-descriptor contract** — what each block must expose for
      export, and whether every block type already produces it. Blocks that don't need a
      migration path.

**Serialization**

- [ ] **Read the kind reference back at runtime** — `{name}@X.Y.Z` from `model.json` into
      the exported `templateEntry` (`A-0013`). No kind _resolution_ needed.
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
`validateProjectTemplateV1References`.

**Decisions awaiting sign-off**

1. **Home and boundary** — `pl-model-common` owns the *document* (JS value ↔ types) and
   takes no `yaml` dependency, since it ships in every block-model and UI bundle. The YAML
   text layer belongs to `pl-middle-layer`, which already has `yaml`.
2. **Naming** — `ProjectTemplateV1*`, not `TemplateV1*`: `PlTemplateV1` already names the
   unrelated backend workflow-template resource (`lib/model/backend/src/`
   `template_resources_v1.ts:90`).
3. **Reservation rule** (load-bearing) — a plain object with *exactly* the two string keys
   `block` and `output` is reserved as a template-local reference anywhere inside an
   entry's opaque `params`. This is what lets the engine rewrite references generically on
   apply (`A-0038`) instead of every kind shipping a params codec. Reference resolvability
   is kept out of the parser (`validateProjectTemplateV1References` is separate) so the
   parser stays sound if the rule is rejected.
4. **Strict selector grammar** — `X.Y.Z`, `~X.Y.Z`, `^X.Y.Z` only; `>=1.0.0`, `1.x` and
   `latest` throw at parse. Deliberate divergence from `tools/block-tools`'s
   `parseSelector`, which additionally tolerates a leading `@` as exact.
5. **Zod peg** — `satisfies BoundaryParser<T>` (`z.ZodType<T, z.ZodTypeDef, unknown>`)
   rather than the repo's `satisfies z.ZodType<T>`: the branded string fields need a
   `.transform`, whose input is a plain `string`, which the two-parameter form rejects.

Known gap, not schema-specific: `expectTypeOf` assertions in `*.test.ts` are unenforced
repo-wide — `createVitestConfig` sets no `typecheck` and `tsconfig.base.json` excludes
test files. The template test was verified by hand against a tsconfig that includes tests.

## Out of scope

- Import / apply (track 3).
- Publishing or browsing templates in-app (`decisions.md:152`).

## Open questions

- [TODO: what "template-descriptor output" each block must expose, and whether every
  block type already produces it.]
