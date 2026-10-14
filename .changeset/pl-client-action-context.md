---
"@milaboratories/pl-client": minor
"@milaboratories/pl-middle-layer": minor
---

Create the action context of a heavy block render. The middle layer calls `tx.actionContext(render).create()` and sets `name`, `block-pack`, `block-id` and a new random `run-id` in the transaction that creates the render. The project keeps the context in `prodActionContext`/`stagingActionContext` block fields, which reference the render's `actionContext` field, because the render is garbage collected once its outputs resolve. `PlTransaction.actionContext()` sends nothing unless the backend advertises `actionContextApi:v1`, so older backends are not affected.
