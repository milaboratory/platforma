---
"@platforma-sdk/block-tools": patch
---

Structurer: the generated block CI (`build.yaml`) now sets `require-package-path-bump: true`, so a block PR must bump the published `block` package with a changeset (an empty changeset or the `skip-changelog` label waives it). Requires the `require-package-path-bump` input to be live on the pinned `@v4` reusable workflow before blocks are refreshed.
