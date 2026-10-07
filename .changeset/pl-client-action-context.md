---
"@milaboratories/pl-client": minor
"@milaboratories/pl-middle-layer": minor
---

Create the action context of a heavy block render. The middle layer calls `tx.actionContext(render).create()` and sets `name`, `block-pack` and `block-id` in the transaction that creates the render. `PlTransaction.actionContext()` sends nothing unless the backend advertises `actionContextApi:v1`, so older backends are not affected.
