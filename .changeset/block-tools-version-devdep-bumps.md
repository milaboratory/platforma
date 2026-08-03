---
"@platforma-sdk/block-tools": minor
---

Add `block-tools version` — a drop-in for `changeset version` that additionally bumps any package whose released sibling is reached through a `workspace:` `devDependency`. This fixes blocks not getting a version bump when their private `model`/`ui`/`workflow`/`software` siblings change (stock changesets ignores devDependency-only dependents). The injected bump mirrors the highest triggering sibling, floored at `updateInternalDependencies` and capped at minor (never auto-major; a major sibling warns). Requires `@changesets/cli` present in the block; does not support `commit: true`.
