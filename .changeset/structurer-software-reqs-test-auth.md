---
"@platforma-sdk/block-tools": patch
---

Structurer: restore the `software:reqs` turbo task and ignore `.test_auth.json`
in the test-scope oxfmt config.

Two regressions hit structurer-migrated Python-software blocks:

- The `fixed` root `turbo.json` template dropped the `software:reqs` task, so
  every `upgrade-sdk` (structure refresh) removed it. Blocks still carry the
  `software:reqs` root script and a `requirements-sync` CI job that run
  `turbo run software:reqs`, so CI failed with "Could not find task
  `software:reqs` in project" (e.g. `feature-integration`). Restored the task
  (`{ cache: false, outputs: ["./src/requirements.txt"] }`); harmless no-op for
  blocks without a software package.
- The live test lane writes `.test_auth.json` into `test/`, which the
  pre-publish `ts-builder check --target block-test` oxfmt pass then tried to
  format-check and failed on. Added `.test_auth.json` to the test-scope
  `.oxfmtrc.json` `ignorePatterns` (already git-ignored).
