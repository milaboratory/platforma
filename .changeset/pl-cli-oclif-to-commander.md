---
"@platforma-sdk/pl-cli": patch
---

Migrate the pl-cli (`pl-cli`) CLI framework from oclif to commander. CLI-only,
internal change — the full command surface (`project list|info|duplicate|rename|delete`,
`admin copy-project`), all flags (`-a/--address`, `-f/--format`, `-u/--user`,
`-p/--password`, `--admin-user`, `--admin-password`, `--target-user`,
`-n/--name`, `--auto-rename`/`--no-auto-rename`, `--force`, `--source-user`,
`--source-project`), their env-var bindings, required/choice constraints, and the
`project` ID positional argument are preserved. The oclif base-command class
becomes plain `connect()`/`connectClient()` helpers; the library exports
(`src/lib.ts`) are unchanged. Drops `@oclif/core`, `@milaboratories/oclif-index`,
and the generated command index.
