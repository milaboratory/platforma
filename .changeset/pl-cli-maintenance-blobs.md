---
"@milaboratories/pl-client": minor
"@platforma-sdk/pl-cli": minor
---

pl-client: add `PlTransaction.listResourcesByType` (admin and controller roles only).

pl-cli: add the `maintenance` command group to repair server state after storage loss:

- `maintenance list-blobs --storage <id>` lists all blobs of one storage as JSON lines, with the blob hash and the path of its file inside the storage.
- `maintenance set-resource-error <resource-id...>` puts an error on one or more resources in a single transaction. Resources that already have an error are skipped.
