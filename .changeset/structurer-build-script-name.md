---
"@platforma-sdk/block-tools": patch
---

Fix the generated build workflow calling a removed script. The root
`package.json` rules deliberately drop the bare `build` script (a developer
must pick a scenario flavor), but the `build.tpl.yaml` workflow template still
invoked `build-script-name: 'build'`, so refreshed blocks failed CI with
`ERR_PNPM_NO_SCRIPT: Missing script: build`.

Point the two build legs at the right flavors: PR/merge-queue validation uses
`build:dev-local`, and the publish leg uses `build:release` via
`build-before-publish-script-name`.
