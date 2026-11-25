---
"@platforma-sdk/block-tools": minor
---

Blocks publish `@platforma-open` to npm.platforma.bio by default. A full `structure refresh` now adds `npm-own-registry-scopes: '@platforma-open'` to the generated `.github/workflows/build.yaml` unless the block's `.structure` has `"ownNpmRegistry": false` (opt-out, keeps the block on npmjs). `pnpm update-sdk` (`--update-deps-only`) does not rewrite `build.yaml`, so a block moves only on a full refresh. An explicit `"ownNpmRegistry": true` from the opt-in period is dropped from `.structure` on refresh; the block stays on the own registry. SDK-internal blocks (`etc/blocks`) are not affected.
