---
"@milaboratories/pl-client": minor
"@milaboratories/pl-middle-layer": minor
---

Create the action context of a heavy block render. The middle layer creates an `ActionContext` resource with `name`, `block-pack`, `block-id` and a new random `run-id` in the transaction that creates the render, points the render's `actionContext` field to it, and keeps it in the `prodActionContext`/`stagingActionContext` block fields, because the render is garbage collected once its outputs resolve. `PlTransaction.actionContext(rid)` reports action transitions and readings (`recordTransition`, `setReading`); it sends nothing unless the backend advertises `actionContextApi:v1`, so older backends are not affected.
