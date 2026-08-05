---
"@milaboratories/ts-configs": minor
---

Allow `.ts` extension imports in all targets, and not only in the browser target

`allowImportingTsExtensions` moves from `tsconfig.browser.json` to
`tsconfig.base.json`. Therefore node projects and isomorphic projects can also
write `import … from "./sibling.ts"`. The browser config no longer needs its own
copy of the flag, so this change removes it. This change also removes
`emitDeclarationOnly: false` from `blocks/tsconfig.facade.json`. Both files now
inherit the same value from the base config.

`blocks/tsconfig.facade.json` also drops `noEmit: false`. Nothing used that
setting. `rolldown-plugin-dts` makes the facade's declarations, and `ts-builder
type-check` passes `--noEmit` explicitly. The setting would also conflict with
the newly inherited `allowImportingTsExtensions`. TypeScript permits that flag
only for projects that do not emit. Editors and a direct `tsc -p` run would
therefore report TS5096 for every block's facade package, while the CLI
continued to pass.
