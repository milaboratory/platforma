# Track 3 — Import / Apply (Preamble)

**Status: preamble only.** Scope and open questions, not a plan.

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

## Open questions

- [TODO: concrete add-block API shape — add-by-kind vs add-by-exact-version,
  inter-block reference resolution order (`decisions.md:133`).]
- [TODO: concrete type for a template-local reference — distinct unresolved type vs
  reused reference shape (`decisions.md:143`).]
- [TODO: validation taxonomy and presentation — blocking dialog vs inline list,
  fail-fast vs collect-all.]
- **`Q-0009`** — apply-time validation of untyped YAML params. Since `BlockParams` is a
  pure TS type with no zod (track 1 decision), a hand-authored YAML's params are untyped
  at runtime; how/whether they are validated against the kind on apply is open.
