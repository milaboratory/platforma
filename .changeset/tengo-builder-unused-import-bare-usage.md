---
"@platforma-sdk/tengo-builder": patch
---

`pl-tengo imports` no longer reports an import whose alias is called or passed as a value

`findUnusedImports` counted an import as used only when its alias was followed by a dot.
A lib exporting a bare function and called directly — `calculateExportSpecs(x)` rather than
`lib.calculateExportSpecs(x)` — never matched, so `pl-tengo imports` deleted the import line
and the `pl-tengo check` that follows it failed to compile the file it had just edited.

An alias now counts as used wherever it appears as a name of its own: dereferenced, called,
or passed as a value. Only a longer name ending with the alias (`xtext`) and a declaration
that shadows it (`text := ...`) are excluded. The predicate is wider than the previous one at
every point, so this release can only report fewer unused imports, never more — verified as a
differential over 560 `.tengo` files across the block repositories: 0 newly reported, 14 files
no longer reported.
