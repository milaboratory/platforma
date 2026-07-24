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
template-descriptor output. It does not need kind *resolution* or the template-engine
apply lambda, so it can be built and tested against fixtures ahead of import.

## Out of scope

- Import / apply (track 3).
- Publishing or browsing templates in-app (`decisions.md:152`).

## Open questions

- [TODO: exact `template-v1` schema — entry shape (`kind@selector`, optional `block`
  override, params, references), pinned jointly with import.]
- [TODO: what "template-descriptor output" each block must expose, and whether every
  block type already produces it.]
