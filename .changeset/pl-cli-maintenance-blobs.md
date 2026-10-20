---
"@milaboratories/pl-client": minor
"@platforma-sdk/pl-cli": minor
---

pl-client: add `PlTransaction.listResourcesByType` (admin and controller roles only).

pl-cli: add the `maintenance` command group to repair server state after storage loss:

- `maintenance list-resources --type <name:version> [--limit <n>] [--after <resource-id>] [--load-fields] [--load-kv]` lists resources of one type as JSON lines, in ascending order of resource ID.
- `maintenance set-resource-error <resource-id...>` puts an error on one or more resources in a single transaction. Resources that already have an error are skipped. With `--skip-missing`, resources that do not exist are skipped too.
