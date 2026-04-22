---
"@milaboratories/pl-errors": minor
"@milaboratories/pl-mcp-server": patch
---

Publish the `ModelAPIVersionMismatchError` class from `pl-errors`, which was added in #1563 but missed in that PR's changeset. `pl-mcp-server@2.1.0` imports the class (`src/tools/block-state.ts`), so downstream bundling against `pl-errors@1.2.8` (the version pinned by the current release) fails with `MISSING_EXPORT`. Bumping `pl-errors` publishes the class; the `pl-mcp-server` patch bump re-resolves its `workspace:*` dep so the next release pins the fixed `pl-errors`.
