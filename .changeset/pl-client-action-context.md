---
"@milaboratories/pl-client": minor
"@milaboratories/pl-middle-layer": minor
---

Create the action context of a heavy block render. The middle layer creates an `ActionContext` resource with `name`, `block-pack`, `block-id` and a new random `run-id` in the transaction that creates the render, points the render's optional `actionContext` service field to it, and keeps it in the `prodActionContext`/`stagingActionContext` block fields, because the render is garbage collected once its outputs resolve. It does this only when the backend advertises `optionalServiceField:v1`, so older backends are not affected. `PlTransaction.hasCapability` tells which capabilities the backend of a transaction advertises.
