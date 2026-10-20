---
"@milaboratories/pl-client": minor
"@platforma-sdk/pl-cli": minor
---

pl-client: add `PlTransaction.listResourcesByType` (admin and controller roles only).

pl-cli: add the `maintenance` command group to repair server state after storage loss:

- `maintenance list-blobs --storage <id> [--limit <n>] [--after <resource-id>]` lists blobs of one storage as JSON lines, in ascending order of resource ID, with the blob hash and the path of its file inside the storage.
- `maintenance set-resource-error <resource-id...>` puts an error on one or more resources in a single transaction. Resources that already have an error are skipped. With `--skip-missing`, resources that do not exist are skipped too.
