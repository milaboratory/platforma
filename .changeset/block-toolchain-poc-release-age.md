---
"@platforma-sdk/block-tools": patch
---

Block `pnpm-workspace.yaml` excludes `@milaboratories-poc/*` from `minimumReleaseAge`, as the SDK monorepo does: blocks get the quickjs-emscripten fork through `@platforma-sdk/test`.
