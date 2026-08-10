# Block Kinds & Templates — Implementation Breakdown

Working notes for turning the spec into shippable pieces. **This is a decomposition
document, not a spec.** The authoritative design lives in the
`docs/text/work/projects/block-kind-and-templates/` mispec corpus (workspace repo),
currently as the **PR #198 rework** ("kind publishes with the facade", branch
`feat/kind-publish-with-facade`, not yet on main). When this document and the spec
disagree, the spec wins — flag the drift here. Citations use **atom IDs** (`A-00NN`)
since rendered line numbers shift.

Status: draft. The three implementation documents below are **preambles only** — scope
and open questions, not detailed plans.

## What we are building (one paragraph)

A **block kind** is a separately-versioned npm package that declares a typed
`BlockParams` contract; many block versions implement one kind version. On top of kinds
sits a **template engine**: a project can be *exported* to a YAML template, and a
hand-authored or exported template can be *imported* (applied) into a fresh project. All
of it lives in the TypeScript layer — SDK, Middle Layer, Desktop. The backend
(`core/pl`) has no part.

## Why three tracks

The work splits along the natural seams in the spec, ordered by dependency:

| # | Track | Depends on | Document |
|---|-------|-----------|----------|
| 1 | **Kind + lifecycle** | — (foundational) | [`01-kind-and-lifecycle.md`](./01-kind-and-lifecycle.md) |
| 2 | **Export** (project → template YAML) | kind reference in `model.json` | [`02-export.md`](./02-export.md) |
| 3 | **Import** (template YAML → new project) | kind resolution + template engine | [`03-import.md`](./03-import.md) |

- **Kind + lifecycle is the foundation.** Nothing above it works until a kind can be
  declared, wired into a block's model, published, and resolved from a registry.
- **Export and import are inverses** (`decisions.md:139`) and share the `template-v1`
  YAML schema, so they must agree on that schema even though they ship as separate
  streams. Export is the simpler half (serialize what already exists); import carries
  kind resolution and the template-engine lambda.
- Import depends on kind resolution being real; export only needs the kind reference
  recorded in `model.json`, so it can start earlier / against stubs.

## Testing before the first release — resolved

Kind publication is a release-time step (kind-first inside the block's publish flow).
That once read as the central risk: how do we exercise the full lifecycle — publish,
version-match check, source-hash guard, resolution — before any kind has been released?

**Resolved.** The whole loop runs locally, headless, with no CI and no AWS, against a
plain temp directory: `block-tools`'s registry storage is driver-based (`file:` →
`FSStorage`, `s3:` → `S3Storage`) and the reader supports `file:`/`http(s):`. See
`01-kind-and-lifecycle.md` → **Testing strategy** for the step-by-step loop, layers
L1–L4, and desktop wiring.

## Schema shared across tracks

`template-v1` YAML is the contract between export and import. It must be pinned down
once and referenced by both. Open: where the canonical schema definition lives, and
whether it is a shared package both tracks import.

## Out of scope (iteration 1)

Per `decisions.md:11`: settings modal and guided wizard UI; template-delivered custom UI
pages and lambdas; applying a template into an existing project; in-app template
browsing / publishing / drag-and-drop.
