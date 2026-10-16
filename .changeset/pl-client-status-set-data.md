---
"@milaboratories/pl-client": minor
"@milaboratories/pl-middle-layer": minor
---

Create the status context of a heavy block render. The middle layer creates a `StatusContext` resource with `name`, `block-pack`, `block-id` and a new random `run-id` in the transaction that creates the render, points the render's `status` field to it, and keeps it in the `prodStatus`/`stagingStatus` block fields, because the render is garbage collected once its outputs resolve. `PlTransaction.status(rid)` reports block status (`recordTransition`, `setAttr`); it sends nothing unless the backend advertises `statusApi:v1`, so older backends are not affected.
