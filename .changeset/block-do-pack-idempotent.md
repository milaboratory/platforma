---
"@platforma-sdk/block-tools": patch
---

Make the generated block `do-pack` script idempotent: it now removes any prior `package.tgz` before packing. Re-running `do-pack`, or running it on a dirty working tree, no longer fails with `mv: dest is not a directory (too many sources)`.
