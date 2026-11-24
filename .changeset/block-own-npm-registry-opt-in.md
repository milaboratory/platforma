---
"@platforma-sdk/block-tools": minor
---

Block CI can publish `@platforma-open` to npm.platforma.bio: set `"ownNpmRegistry": true` in the block's `.structure` and run `structure refresh` (`pnpm update-sdk`). The generated `.github/workflows/build.yaml` then passes `npm-own-registry-scopes: '@platforma-open'` to the shared CI. Without the setting the workflow is unchanged, byte for byte.
