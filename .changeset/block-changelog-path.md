---
"@platforma-sdk/block-tools": patch
---

`structure refresh` sets `block.meta.changelog` to `file:CHANGELOG.md` and creates a header-only `block/CHANGELOG.md` when the file is missing. Blocks that pointed the field at the repository-root `CHANGELOG.md` showed a changelog that never changed, because changesets writes release notes to `block/CHANGELOG.md`.
