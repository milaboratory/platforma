---
"@milaboratories/helpers": minor
---

Publish the `getField` export. The function was added to the source in #1564 and consumed by `@platforma-sdk/model@1.75.0`, but that PR's changeset bumped only `model`, `uikit`, and `ui-vue`, leaving `helpers` unreleased. Result: `model@1.75.0` shipped with `"@milaboratories/helpers": "1.14.1"`, a version that does not export `getField`, causing `SyntaxError: The requested module '@milaboratories/helpers' does not provide an export named 'getField'` at runtime in any consumer that resolves model 1.75.0 (e.g. transitively via `pl-middle-layer >= 1.59.1`). Bumping `helpers` cascades a patch bump to `model` via `updateInternalDependencies`, which republishes model with a working `helpers` dep.
