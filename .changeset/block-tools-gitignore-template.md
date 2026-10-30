---
"@platforma-sdk/block-tools": patch
---

Fix `structure init`, which failed in 2.17.0 with `ENOENT` on `templates/static/root/.gitignore`. pnpm 11+ leaves every `.gitignore` file out of a packed package, so 2.17.0 was published without this template. The template is now named `gitignore` (no dot). `structure init` still writes `.gitignore` in the new block.
