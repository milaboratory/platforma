---
"@platforma-sdk/block-tools": patch
---

Structurer: make `turbo.json` a managed file and ignore `.test_auth.json` in
the test-scope oxfmt config.

Two regressions hit structurer-migrated Python-software blocks:

- The root `turbo.json` was a `fixed` template, fully overwritten on every
  `upgrade-sdk`. Migrated blocks carry a `software:reqs` task (a
  `requirements-sync` CI job runs `turbo run software:reqs`), so refresh wiped
  it and CI failed with "Could not find task `software:reqs` in project" (e.g.
  `feature-integration`). `turbo.json` is now `managed`: the engine re-asserts
  its own tasks (`ensureFieldEntries("tasks", …)`) but leaves author-added
  tasks like `software:reqs` untouched. Output stays oxfmt-clean and idempotent.
  Also drops the dead `build:dev` turbo task (superseded by the
  env-parameterised `build` task + `build:dev-*` scripts), matching the root
  package.json rule that already drops the `build:dev` script.
- The live test lane writes `.test_auth.json` into `test/`, which the
  pre-publish `ts-builder check --target block-test` oxfmt pass then failed on.
  Added `.test_auth.json` to the test-scope `.oxfmtrc.json` `ignorePatterns`
  (already git-ignored).
