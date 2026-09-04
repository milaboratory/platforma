---
"@platforma-sdk/block-tools": patch
---

`structure refresh` now bootstraps a missing `kind/` package instead of failing.

A block written before kinds existed has no `kind/` on disk, so DISCOVERY found no
kind module, every kind rule fanned out over nothing, and the facade rule threw
`declares no kind` before touching a file. The only way forward was to hand-craft
`kind/package.json` first so discovery could see it.

DISCOVERY now synthesises the kind module when the package is absent, the same way
`init` does, so a plain refresh writes `kind/package.json`, its three configs, and
`kind/src/index.ts`, and adds `kind` to `packages:`. The entry point moved from
`seed` (init-only) to `scaffold` (create-if-missing in every mode) — otherwise the
bootstrapped package would have no entry point at all. Once the file exists nothing
touches it again: the params contract belongs to the block author.

Run the block's `upgrade-sdk` rather than a bare refresh. The bootstrapped
`kind/package.json` requires `@platforma-sdk/block-kind` as `catalog:`, and the
catalog key is seeded by `refresh --update-deps-only`, which `upgrade-sdk` runs first.
