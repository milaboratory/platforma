---
"@milaboratories/pl-client": minor
"@milaboratories/pl-model-middle-layer": minor
"@milaboratories/pl-middle-layer": minor
---

`MiddleLayer.instanceStats` reads the backend's instance statistics context (allocated CPU and RAM out of capacity, running and queued jobs) every 10s, only when the backend advertises `instanceStats:v1`. `PlClient.listSharedResourcesByType` lists the resources of a type shared with the user.
