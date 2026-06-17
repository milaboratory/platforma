# structurer — mental model

A declarative reconciler for a block's scaffolding. `rules/` DECLARE the
canonical end-state of every non-source file in a block (package.json, configs,
tsconfig, scripts, catalog); `engine/` reconciles any block toward that state.
To change what "canonical" means, edit `rules/`; the engine is block-agnostic.

## Boundaries

- `engine/` — generic reconciliation primitives, module discovery, IR. Knows nothing about blocks.
- `rules/` — the only home of block-specific layout knowledge. `templates/` holds the verbatim file bodies the rules reference.
- Owns: the shape of a block's scaffolding. Is NOT a build tool, and NOT the author of a block's source — seeded/scaffolded files become author-owned once written.

## Reading posture

- Each `rules/*` file pairs a generator (init: full initial content) with a body (refresh: drift-correcting assertions). Read as "what the file should be" + "how to nudge an existing file there", not as sequential logic.
- The primitive choice IS the design: `fixed` (overwrite verbatim, engine-owned), `managed` (reconcile named fields, author keeps the rest), `scaffold` (write-once default, author may tune), `seed` (written once at init, author owns forever), `remove` (one-way). Wrong primitive is the main design error — `fixed` on an author-tunable file clobbers their work; `seed` on engine-owned content lets drift accumulate.

## Invariants

- Fixpoint: `refresh` on an already-canonical block makes zero changes. Every rule must converge.
- Generators emit oxfmt-clean output (the `enforce*` calls mirror oxfmt's order), so build→check passes with no prior `fmt`.
- sdk-internal blocks (`etc/blocks/*`) skip root-scope and standalone test wiring — the monorepo owns that infra; the structurer must neither impose nor strip it.

## Gotchas

- A rule change also changes the canonical for `etc/blocks/*`: refresh them in the SAME PR (`pnpm run check-blocks`) or CI fails.
- Dep/peer changes need a `pnpm i` lockfile sync — pnpm records peers and per-importer deps in pnpm-lock.yaml; frozen-install CI fails otherwise.
