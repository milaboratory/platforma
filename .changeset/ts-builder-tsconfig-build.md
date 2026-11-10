---
"@milaboratories/ts-builder": minor
---

Read `tsconfig.build.json` when a package has one: declaration output (`build`), `type-check` and `check` use it instead of `tsconfig.json`, so `tsconfig.json` can cover tests for editors and language servers while test files stay out of `dist`.
