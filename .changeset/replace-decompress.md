---
"@milaboratories/ts-helpers": minor
"@milaboratories/pl-deployments": patch
"@milaboratories/pl-drivers": patch
"@milaboratories/pl-middle-layer": patch
"@platforma-sdk/bootstrap": patch
"@platforma-sdk/test": patch
---

Replace `decompress` (path traversal advisories, no fixed release) with `yauzl` for zip archives and `tar` for the block boilerplate. Zip extraction now fails on entries and symlinks that lead outside the target folder, on entries written through a symlink, and on duplicate entries.
