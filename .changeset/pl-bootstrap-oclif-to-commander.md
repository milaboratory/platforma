---
"@platforma-sdk/bootstrap": patch
---

Migrate the pl-bootstrap (`pl-dev`) CLI framework from oclif to commander.
CLI-only, internal change — the full command surface is preserved: `create-block`,
`reset`, `stop`, `start` (+ `start docker [s3]`, `start local [s3]`), and `svc`
(`up`, `down`, `list`, `delete`, `create docker [s3]`, `create local [s3]`),
including all flags, their env-var bindings, choices, defaults, port int parsing,
repeatable `--mount`, and optional instance-name positionals. The `svc create`
commands keep forwarding unknown flags to the backend. Drops `@oclif/core`,
`@milaboratories/oclif-index`, the generated command index, and `ts-node`.
