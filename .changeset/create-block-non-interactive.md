---
"@platforma-sdk/bootstrap": minor
---

`create-block` takes `--npm-org`, `--org`, `--block-name` and `--software` flags and asks only for what is missing. New `@platforma-sdk/bootstrap/block` export with `createBlockFromOptions(options, targetDir, logger)` for non-interactive use. Fixes `create-block` returning before the boilerplate was fully renamed.
