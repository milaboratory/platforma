---
"@milaboratories/pl-client": minor
"@milaboratories/pl-middle-layer": minor
---

Create the status context of a heavy block render. The middle layer calls `tx.status(render).create()` and sets `name`, `block-pack` and `block-id` in the transaction that creates the render. The project keeps the context in `prodStatus`/`stagingStatus` block fields, which reference the render's `status` field, because the render is garbage collected once its outputs resolve. `PlTransaction.status()` sends nothing unless the backend advertises `statusApi:v1`, so older backends are not affected.
