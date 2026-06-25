---
"@platforma-sdk/tengo-builder": patch
---

Migrate the tengo-builder (`pl-tengo`) CLI framework from oclif to commander.
CLI-only, internal change — the full command surface (`build`, `check`, `test`,
`dump artifacts`, `dump software`), all flags (`--log-level`, `--generate-tags`,
`--tags-file`, `--tags-additional-args`, `-t/--type`), their defaults/choices,
and variadic path args for `check`/`test` are preserved. Drops `@oclif/core`,
`@milaboratories/oclif-index`, and the generated command index.
